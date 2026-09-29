import AVFoundation
import CryptoKit
import Foundation
import Network
import UIKit
import WebKit

enum NrmIosDeviceIdentity {
  static func sha256Hex() -> String {
    guard let raw = UIDevice.current.identifierForVendor?.uuidString, !raw.isEmpty else {
      return ""
    }
    let digest = SHA256.hash(data: Data(raw.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}

enum NrmIosWifi {
  static func isWifiOrEthernet() async -> Bool {
    await withCheckedContinuation { cont in
      let monitor = NWPathMonitor()
      let queue = DispatchQueue(label: "nrm.ios.wifi")
      var resumed = false
      monitor.pathUpdateHandler = { path in
        guard !resumed else { return }
        resumed = true
        monitor.cancel()
        let ok = path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet)
        cont.resume(returning: ok)
      }
      monitor.start(queue: queue)
    }
  }
}

enum NrmIosMelonCookies {
  static func header() async -> String {
    let cookies = await NrmIosSpotifyCookies.allCookies()
    return cookies
      .filter { $0.domain.lowercased().contains("melon") }
      .map { "\($0.name)=\($0.value)" }
      .joined(separator: "; ")
  }

  static func clear() async {
    let store = WKWebsiteDataStore.default().httpCookieStore
    let cookies = await NrmIosSpotifyCookies.allCookies()
    for cookie in cookies where cookie.domain.lowercased().contains("melon") {
      await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
        store.delete(cookie) { cont.resume() }
      }
    }
  }
}

enum NrmIosSpotifyCookies {
  static func readSpDc() async -> String {
    let cookies = await allCookies()
    let hit = cookies.first { cookie in
      cookie.name == "sp_dc" && cookie.domain.lowercased().contains("spotify")
    }
    return hit?.value ?? ""
  }

  static func clearSpotify() async {
    let store = WKWebsiteDataStore.default().httpCookieStore
    let cookies = await allCookies()
    for cookie in cookies where cookie.domain.lowercased().contains("spotify") {
      await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
        store.delete(cookie) { cont.resume() }
      }
    }
  }

  static func allCookies() async -> [HTTPCookie] {
    await withCheckedContinuation { cont in
      WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
        cont.resume(returning: cookies)
      }
    }
  }
}

enum NrmIosLyricsEmbed {
  static func embed(inputPath: String, lyrics: String) async throws {
    let path = inputPath.hasPrefix("file://")
      ? String(inputPath.dropFirst("file://".count))
      : inputPath
    let inputURL = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
      throw NrmIosLyricsError.missing
    }
    let asset = AVURLAsset(url: inputURL)
    var items: [AVMetadataItem] = asset.commonMetadata.compactMap { item in
      guard item.identifier != .commonIdentifierLyrics else { return nil }
      let copy = AVMutableMetadataItem()
      copy.identifier = item.identifier
      copy.value = item.value
      copy.extendedLanguageTag = item.extendedLanguageTag
      return copy
    }
    let text = lyrics.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      let lyric = AVMutableMetadataItem()
      lyric.identifier = .commonIdentifierLyrics
      lyric.value = text as NSString
      lyric.extendedLanguageTag = "und"
      items.append(lyric)
    }

    let outURL = inputURL.deletingLastPathComponent().appendingPathComponent(
      "nrm-lyr-\(Int(Date().timeIntervalSince1970 * 1000))-\(inputURL.lastPathComponent)",
    )
    try? FileManager.default.removeItem(at: outURL)
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
      throw NrmIosLyricsError.session
    }
    session.outputURL = outURL
    session.metadata = items
    let ext = inputURL.pathExtension.lowercased()
    if ext == "wav" {
      session.outputFileType = .wav
    } else if ext != "mp3" {
      session.outputFileType = .m4a
    }

    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      session.exportAsynchronously {
        if session.status == .completed {
          cont.resume()
        } else {
          cont.resume(throwing: session.error ?? NrmIosLyricsError.failed)
        }
      }
    }
    try FileManager.default.removeItem(at: inputURL)
    try FileManager.default.moveItem(at: outURL, to: inputURL)
  }
}

private enum NrmIosLyricsError: LocalizedError {
  case missing
  case session
  case failed

  var errorDescription: String? {
    switch self {
    case .missing:
      return "입력 파일이 없습니다."
    case .session:
      return "가사 내장 세션을 만들 수 없습니다."
    case .failed:
      return "가사 내장에 실패했습니다."
    }
  }
}
