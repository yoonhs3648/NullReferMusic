import Foundation
import UIKit
import UniformTypeIdentifiers

enum NrmIosBackgroundWork {
  private static var tasks: [String: UIBackgroundTaskIdentifier] = [:]

  static func begin(token: String) {
    let key = token.trimmingCharacters(in: .whitespacesAndNewlines)
    if key.isEmpty || tasks[key] != nil { return }
    var id: UIBackgroundTaskIdentifier = .invalid
    id = UIApplication.shared.beginBackgroundTask(withName: key) {
      if let current = tasks[key] {
        UIApplication.shared.endBackgroundTask(current)
        tasks[key] = nil
      }
    }
    if id != .invalid {
      tasks[key] = id
    }
  }

  static func end(token: String) {
    let key = token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let id = tasks.removeValue(forKey: key), id != .invalid else { return }
    UIApplication.shared.endBackgroundTask(id)
  }
}

enum NrmIosDocumentPicker {
  static func pick() async -> [String: Any]? {
    await withCheckedContinuation { cont in
      DispatchQueue.main.async {
        guard let presenter = topViewController() else {
          cont.resume(returning: nil)
          return
        }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        let delegate = PickerDelegate { result in
          cont.resume(returning: result)
        }
        picker.delegate = delegate
        objc_setAssociatedObject(picker, &pickerKey, delegate, .OBJC_ASSOCIATION_RETAIN)
        presenter.present(picker, animated: true)
      }
    }
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    let root = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    var current = root
    while let presented = current?.presentedViewController {
      current = presented
    }
    return current
  }
}

private var pickerKey: UInt8 = 0

private final class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  private let done: ([String: Any]?) -> Void
  private var finished = false

  init(done: @escaping ([String: Any]?) -> Void) {
    self.done = done
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }

  private func finish(_ url: URL?) {
    if finished { return }
    finished = true
    guard let url else {
      done(nil)
      return
    }
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .nameKey])
    done([
      "name": values?.name ?? url.lastPathComponent,
      "uri": url.absoluteString,
      "sizeBytes": values?.fileSize ?? 0,
    ])
  }
}
