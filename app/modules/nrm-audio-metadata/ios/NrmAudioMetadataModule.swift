import AVFoundation
import ExpoModulesCore
import Foundation

public class NrmAudioMetadataModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NrmAudioMetadata")

    AsyncFunction("applyMetadata") { (inputPath: String, metadata: [String: Any]) -> [String: Any] in
      try await MetadataApplier.apply(inputPath: inputPath, metadata: metadata)
    }
  }
}

private enum MetadataApplier {
  static func apply(inputPath: String, metadata: [String: Any]) async throws -> [String: Any] {
    let path = stripFilePrefix(inputPath)
    let inputURL = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
      throw MetadataError.missingInput
    }

    let artist = stringValue(metadata["artist"])
    let title = stringValue(metadata["title"])
    let album = stringValue(metadata["album"])
    let genre = stringValue(metadata["genre"])
    let releaseDate = stringValue(metadata["releaseDate"])
    let coverUrl = stringValue(metadata["coverUrl"])
    var albumArtist = stringValue(metadata["albumArtist"])
    if albumArtist.isEmpty && !artist.isEmpty { albumArtist = artist }
    let trackNumber = stringValue(metadata["trackNumber"])
    let website = stringValue(metadata["website"])

    let hasText =
      !artist.isEmpty || !title.isEmpty || !album.isEmpty || !genre.isEmpty || !releaseDate.isEmpty
      || !albumArtist.isEmpty || !trackNumber.isEmpty || !website.isEmpty
    let coverData = coverUrl.isEmpty ? nil : await downloadCover(urlString: coverUrl)

    if !hasText && coverData == nil {
      return ["path": path, "coverEmbedded": false]
    }

    var items: [AVMetadataItem] = []
    if !artist.isEmpty { items.append(makeItem(.commonIdentifierArtist, value: artist)) }
    if !albumArtist.isEmpty {
      items.append(makeItem(.commonIdentifierAlbumArtist, value: albumArtist))
    }
    if !title.isEmpty { items.append(makeItem(.commonIdentifierTitle, value: title)) }
    if !album.isEmpty { items.append(makeItem(.commonIdentifierAlbumName, value: album)) }
    if !genre.isEmpty { items.append(makeItem(.iTunesMetadataGenre, value: genre)) }
    if !releaseDate.isEmpty { items.append(makeItem(.commonIdentifierCreationDate, value: releaseDate)) }
    if !trackNumber.isEmpty { items.append(makeItem(.iTunesMetadataTrackNumber, value: trackNumber)) }
    if !website.isEmpty { items.append(makeItem(.commonIdentifierURL, value: website)) }
    if let coverData {
      let art = AVMutableMetadataItem()
      art.identifier = .commonIdentifierArtwork
      art.value = coverData as NSData
      art.dataType = coverMimeType(for: coverData)
      items.append(art)
    }

    let ext = inputURL.pathExtension.lowercased()
    let presets: [String] = exportPresets(forExtension: ext)

    var lastError: Error?
    for preset in presets {
      let outURL = inputURL.deletingLastPathComponent().appendingPathComponent(
        "nrm-meta-\(Int(Date().timeIntervalSince1970 * 1000))-\(inputURL.lastPathComponent)",
      )
      try? FileManager.default.removeItem(at: outURL)

      do {
        try await export(assetURL: inputURL, outputURL: outURL, metadata: items, preset: preset, ext: ext)
        guard
          FileManager.default.fileExists(atPath: outURL.path),
          let size = try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? NSNumber,
          size.int64Value > 0
        else {
          throw MetadataError.emptyOutput
        }

        try FileManager.default.removeItem(at: inputURL)
        try FileManager.default.moveItem(at: outURL, to: inputURL)

        return [
          "path": inputURL.path,
          "coverEmbedded": coverData != nil,
        ]
      } catch {
        lastError = error
        try? FileManager.default.removeItem(at: outURL)
      }
    }

    if let lastError {
      throw lastError
    }
    return ["path": path, "coverEmbedded": false]
  }

  private static func exportPresets(forExtension ext: String) -> [String] {
    switch ext {
    case "m4a", "mp4", "aac":
      return [AVAssetExportPresetPassthrough, AVAssetExportPresetAppleM4A]
    case "mp3", "wav", "flac", "ogg", "opus", "webm":
      return [AVAssetExportPresetPassthrough, AVAssetExportPresetAppleM4A]
    default:
      return [AVAssetExportPresetPassthrough, AVAssetExportPresetAppleM4A]
    }
  }

  private static func export(
    assetURL: URL,
    outputURL: URL,
    metadata: [AVMetadataItem],
    preset: String,
    ext: String,
  ) async throws {
    let asset = AVURLAsset(url: assetURL)
    guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
      throw MetadataError.exportSession
    }

    session.outputURL = outputURL
    session.metadata = metadata
    session.shouldOptimizeForNetworkUse = false

    if let fileType = outputFileType(forExtension: ext, preset: preset) {
      session.outputFileType = fileType
    } else if preset == AVAssetExportPresetAppleM4A {
      session.outputFileType = .m4a
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      session.exportAsynchronously {
        switch session.status {
        case .completed:
          continuation.resume()
        case .failed:
          continuation.resume(throwing: session.error ?? MetadataError.exportFailed)
        case .cancelled:
          continuation.resume(throwing: MetadataError.exportCancelled)
        default:
          continuation.resume(throwing: MetadataError.exportFailed)
        }
      }
    }
  }

  private static func outputFileType(forExtension ext: String, preset: String) -> AVFileType? {
    if preset == AVAssetExportPresetAppleM4A {
      return .m4a
    }
    switch ext {
    case "m4a", "mp4":
      return .m4a
    case "mp3":
      return nil
    case "wav":
      return .wav
    case "caf":
      return .caf
    default:
      return .m4a
    }
  }

  private static func makeItem(_ identifier: AVMetadataIdentifier, value: String) -> AVMutableMetadataItem {
    let item = AVMutableMetadataItem()
    item.identifier = identifier
    item.value = value as NSString
    item.extendedLanguageTag = "und"
    return item
  }

  private static func coverMimeType(for data: Data) -> String {
    if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
      return kCMMetadataBaseDataType_PNG as String
    }
    return kCMMetadataBaseDataType_JPEG as String
  }

  private static func downloadCover(urlString: String) async -> Data? {
    if urlString.isEmpty { return nil }

    // data: data:image/png;base64,AAAA...
    if urlString.hasPrefix("data:") {
      guard let comma = urlString.firstIndex(of: ",") else { return nil }
      let b64 = String(urlString[urlString.index(after: comma)...])
      return Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
    }

    // file://...
    if urlString.hasPrefix("file://") {
      let path = String(urlString.dropFirst("file://".count))
      let url = URL(fileURLWithPath: path)
      return try? Data(contentsOf: url)
    }

    let https =
      urlString.hasPrefix("http://")
      ? "https://" + urlString.dropFirst("http://".count)
      : urlString
    guard let url = URL(string: https) else { return nil }

    var request = URLRequest(url: url)
    request.timeoutInterval = 30
    request.setValue(NrmBrand.userAgent(version: "1.0"), forHTTPHeaderField: "User-Agent")
    request.setValue("image/*", forHTTPHeaderField: "Accept")

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
        return nil
      }
      return data.count >= 256 ? data : nil
    } catch {
      return nil
    }
  }

  private static func stringValue(_ value: Any?) -> String {
    guard let value else { return "" }
    if let s = value as? String { return s.trimmingCharacters(in: .whitespacesAndNewlines) }
    return String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func stripFilePrefix(_ path: String) -> String {
    if path.hasPrefix("file://") {
      return String(path.dropFirst("file://".count))
    }
    return path
  }
}

private enum MetadataError: LocalizedError {
  case missingInput
  case exportSession
  case exportFailed
  case exportCancelled
  case emptyOutput

  var errorDescription: String? {
    switch self {
    case .missingInput:
      return "입력 파일이 없습니다."
    case .exportSession:
      return "메타데이터보내기 세션을 만들 수 없습니다."
    case .exportFailed:
      return "메타데이터 적용에 실패했습니다."
    case .exportCancelled:
      return "메타데이터 적용이 취소되었습니다."
    case .emptyOutput:
      return "메타데이터 적용 결과 파일이 비어 있습니다."
    }
  }
}
