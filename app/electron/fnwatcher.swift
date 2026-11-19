// fnwatcher — Fn (keycode 63) veya Option (58/61) üçlü basışı izler,
// olunca stdout'a TRIPLE_xxx yazar. Klavye içeriği okunmaz: yalnızca
// flagsChanged içindeki Fn/Option bayrağının basış kenarı sayılır.
// CGEventTap için Erişilebilirlik izni gerekir.
import Cocoa
import CoreGraphics
import ApplicationServices

func checkAccessibility() -> Bool {
  let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
  return AXIsProcessTrustedWithOptions(opts)
}

var gTap: CFMachPort?
var fnTaps: [Double] = []
var optTaps: [Double] = []
let WINDOW = 1.0
func now() -> Double { Date().timeIntervalSince1970 }
func dbg(_ s: String) { fputs(s + "\n", stderr) }

func eventCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let t = gTap { CGEvent.tapEnable(tap: t, enable: true) }
    return Unmanaged.passRetained(event)
  }
  if type == .flagsChanged {
    let kc = event.getIntegerValueField(.keyboardEventKeycode)
    let flags = event.flags
    if kc == 63 && flags.contains(.maskSecondaryFn) {
      dbg("tap fn")
      let t = now()
      fnTaps.append(t)
      fnTaps = fnTaps.filter { t - $0 < WINDOW }
      if fnTaps.count >= 3 {
        fnTaps.removeAll(); optTaps.removeAll()
        print("TRIPLE_FN")
        fflush(stdout)
      }
    } else if (kc == 58 || kc == 61) && flags.contains(.maskAlternate) {
      dbg("tap opt")
      let t = now()
      optTaps.append(t)
      optTaps = optTaps.filter { t - $0 < WINDOW }
      if optTaps.count >= 3 {
        optTaps.removeAll(); fnTaps.removeAll()
        print("TRIPLE_OPT")
        fflush(stdout)
      }
    }
  }
  return Unmanaged.passRetained(event)
}

_ = checkAccessibility()
let callback: CGEventTapCallBack = { proxy, type, event, refcon in
  eventCallback(proxy: proxy, type: type, event: event, refcon: refcon)
}
guard let tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .defaultTap,
  eventsOfInterest: CGEventMask(1 << CGEventType.flagsChanged.rawValue),
  callback: callback,
  userInfo: nil
) else {
  fputs("fnwatcher: CGEventTap kurulamadı — Sistem Ayarları > Gizlilik ve Güvenlik > Erişilebilirlik izni verip uygulamayı yeniden başlatın.\n", stderr)
  exit(1)
}
gTap = tap
let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), src, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
print("FNWATCHER_READY")
fflush(stdout)
CFRunLoopRun()
