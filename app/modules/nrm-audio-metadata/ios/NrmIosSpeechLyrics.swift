import AVFoundation
import Foundation
import Speech

enum NrmIosSpeechLyrics {
  static func transcribe(path: String) async throws -> String {
    let segments = try await recognize(path: path, lang: "ko-KR")
    if segments.isEmpty {
      return formatLrc(try await recognize(path: path, lang: "en-US"))
    }
    return formatLrc(segments)
  }

  static func align(path: String, plain: String, lang: String) async throws -> String {
    let lines = plain
      .split(whereSeparator: \.isNewline)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
    if lines.isEmpty { return "" }
    let locale = lang.lowercased().hasPrefix("en") ? "en-US" : "ko-KR"
    let segments = (try? await recognize(path: path, lang: locale)) ?? []
    let start = segments.first?.time ?? 0
    let end = segments.last.map { $0.time + $0.duration } ?? max(start + Double(lines.count), 1)
    let span = max(0.4, end - start)
    return lines.enumerated().map { index, line in
      let t = start + span * (Double(index) / Double(max(lines.count, 1)))
      return "\(stamp(t))\(line)"
    }.joined(separator: "\n")
  }

  private struct Piece {
    let time: TimeInterval
    let duration: TimeInterval
    let text: String
  }

  private static func formatLrc(_ pieces: [Piece]) -> String {
    pieces
      .filter { !$0.text.isEmpty }
      .map { "\(stamp($0.time))\($0.text)" }
      .joined(separator: "\n")
  }

  private static func stamp(_ seconds: TimeInterval) -> String {
    let safe = max(0, seconds)
    let minutes = Int(safe) / 60
    let rest = safe - Double(minutes * 60)
    return String(format: "[%02d:%05.2f]", minutes, rest)
  }

  private static func recognize(path: String, lang: String) async throws -> [Piece] {
    let auth = await withCheckedContinuation { (cont: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
      SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
    }
    guard auth == .authorized else {
      throw NrmIosSpeechError.denied
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)), recognizer.isAvailable else {
      return []
    }
    let url = URL(fileURLWithPath: strip(path))
    let asset = AVURLAsset(url: url)
    let duration = CMTimeGetSeconds(asset.duration)
    if !duration.isFinite || duration <= 0 { return [] }
    if duration <= 55 {
      return try await recognizeFile(url: url, recognizer: recognizer, offset: 0)
    }
    var pieces: [Piece] = []
    var cursor: TimeInterval = 0
    while cursor < duration && pieces.count < 400 {
      let length = min(50, duration - cursor)
      let chunk = try await exportChunk(asset: asset, start: cursor, length: length)
      let part = try await recognizeFile(url: chunk, recognizer: recognizer, offset: cursor)
      pieces.append(contentsOf: part)
      try? FileManager.default.removeItem(at: chunk)
      cursor += length
    }
    return pieces
  }

  private static func recognizeFile(
    url: URL,
    recognizer: SFSpeechRecognizer,
    offset: TimeInterval,
  ) async throws -> [Piece] {
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }
    let result: SFSpeechRecognitionResult? = try await withCheckedThrowingContinuation { cont in
      var resumed = false
      recognizer.recognitionTask(with: request) { value, error in
        if resumed { return }
        if let value, value.isFinal {
          resumed = true
          cont.resume(returning: value)
          return
        }
        if error != nil {
          resumed = true
          cont.resume(returning: nil)
        }
      }
    }
    guard let result else { return [] }
    return result.bestTranscription.segments.map { segment in
      Piece(
        time: offset + segment.timestamp,
        duration: segment.duration,
        text: segment.substring.trimmingCharacters(in: .whitespacesAndNewlines),
      )
    }
  }

  private static func exportChunk(asset: AVURLAsset, start: TimeInterval, length: TimeInterval) async throws -> URL {
    let out = FileManager.default.temporaryDirectory
      .appendingPathComponent("nrm-speech-\(UUID().uuidString).m4a")
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
      throw NrmIosSpeechError.export
    }
    session.outputURL = out
    session.outputFileType = .m4a
    let startTime = CMTime(seconds: start, preferredTimescale: 600)
    let dur = CMTime(seconds: length, preferredTimescale: 600)
    session.timeRange = CMTimeRange(start: startTime, duration: dur)
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      session.exportAsynchronously {
        if session.status == .completed {
          cont.resume()
        } else {
          cont.resume(throwing: session.error ?? NrmIosSpeechError.export)
        }
      }
    }
    return out
  }

  private static func strip(_ path: String) -> String {
    path.hasPrefix("file://") ? String(path.dropFirst("file://".count)) : path
  }
}

private enum NrmIosSpeechError: Error {
  case denied
  case export
}
