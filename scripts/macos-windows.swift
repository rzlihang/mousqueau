// Prints how many normal windows the process with the given PID has on
// screen. CGWindowList reports owners and bounds without the Accessibility or
// Screen Recording permissions a hosted CI runner cannot grant.
//
//   swiftc -O scripts/macos-windows.swift -o macos-windows && ./macos-windows <pid>
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2, let pid = Int(CommandLine.arguments[1]) else {
	FileHandle.standardError.write("usage: macos-windows <pid>\n".data(using: .utf8)!)
	exit(2)
}
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let count = windows.filter {
	($0[kCGWindowOwnerPID as String] as? Int) == pid && ($0[kCGWindowLayer as String] as? Int) == 0
}.count
print(count)
