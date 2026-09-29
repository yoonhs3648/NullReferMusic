import AVFoundation
import Foundation

enum NrmIosAudioTranscode {
  static func transcode(inputPath: String, format: String, bitrateKbps: Int) async throws -> [String: Any] {
    let input = URL(fileURLWithPath: strip(inputPath))
    let want = format.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
    let have = input.pathExtension.lowercased()
    let kbps = max(64, min(320, bitrateKbps))

    if want == "mp3" {
      if have == "mp3" {
        return ["path": input.path, "format": "mp3"]
      }
      let out = try await encodeAac(input: input, bitrateKbps: kbps)
      return ["path": out.path, "format": "m4a", "fallbackReason": "ios_no_mp3_encoder"]
    }

    if want == "wav" {
      if have == "wav" {
        return ["path": input.path, "format": "wav"]
      }
      let out = try await encodeWav(input: input)
      return ["path": out.path, "format": "wav"]
    }

    if want == "m4a" || want == "aac" || want == "mp4" {
      let out = try await encodeAac(input: input, bitrateKbps: kbps)
      return ["path": out.path, "format": "m4a"]
    }

    return [
      "path": input.path,
      "format": have,
      "fallbackReason": "ios_unsupported_container",
    ]
  }

  private static func encodeAac(input: URL, bitrateKbps: Int) async throws -> URL {
    let asset = AVURLAsset(url: input)
    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw NrmIosTranscodeError.noAudio
    }
    let reader = try AVAssetReader(asset: asset)
    let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ])
    reader.add(readerOutput)
    guard reader.startReading() else { throw reader.error ?? NrmIosTranscodeError.read }

    let out = FileManager.default.temporaryDirectory
      .appendingPathComponent("nrm-aac-\(UUID().uuidString).m4a")
    let writer = try AVAssetWriter(outputURL: out, fileType: .m4a)
    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 2,
      AVEncoderBitRateKey: bitrateKbps * 1000,
    ])
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      let queue = DispatchQueue(label: "nrm.ios.aac")
      writerInput.requestMediaDataWhenReady(on: queue) {
        while writerInput.isReadyForMoreMediaData {
          if let sample = readerOutput.copyNextSampleBuffer() {
            if !writerInput.append(sample) {
              writerInput.markAsFinished()
              writer.cancelWriting()
              cont.resume(throwing: writer.error ?? NrmIosTranscodeError.write)
              return
            }
          } else {
            writerInput.markAsFinished()
            writer.finishWriting {
              if writer.status == .completed {
                cont.resume()
              } else {
                cont.resume(throwing: writer.error ?? NrmIosTranscodeError.write)
              }
            }
            return
          }
        }
      }
    }
    return out
  }

  private static func encodeWav(input: URL) async throws -> URL {
    let asset = AVURLAsset(url: input)
    let out = FileManager.default.temporaryDirectory
      .appendingPathComponent("nrm-wav-\(UUID().uuidString).wav")
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
      throw NrmIosTranscodeError.export
    }
    session.outputURL = out
    session.outputFileType = .wav
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      session.exportAsynchronously {
        if session.status == .completed {
          cont.resume()
        } else {
          cont.resume(throwing: session.error ?? NrmIosTranscodeError.export)
        }
      }
    }
    return out
  }

  private static func strip(_ path: String) -> String {
    path.hasPrefix("file://") ? String(path.dropFirst("file://".count)) : path
  }
}

private enum NrmIosTranscodeError: Error {
  case noAudio
  case read
  case write
  case export
}
