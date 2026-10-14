//go:build darwin && !server && cgo

package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.13
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <stdint.h>

extern void completeWebViewGround(uintptr_t token);

// Wails' Env.IsDarkMode returns false until app.Run creates its platform
// implementation. Read the same preference before constructing the windows.
static int systemDarkBeforeRun(void) {
	@autoreleasepool {
		NSString *style = [[NSUserDefaults standardUserDefaults] stringForKey:@"AppleInterfaceStyle"];
		return [style isEqualToString:@"Dark"];
	}
}

// setBackgroundColour only paints the NSWindow. webviewSetBackgroundColour
// exists and is never called from there, so the WKWebView stays white in
// front of the themed window. This is that function's public body
// (mac_public_api_darwin.go): this binary is not built with
// private_mac_apis, and MacBackdropTransparent would clear the window.
static void paintWebViewColour(WKWebView *view, NSColor *colour) {
	if (view == nil) {
		return;
	}
#if MAC_OS_X_VERSION_MAX_ALLOWED >= 120000
	if (@available(macOS 12.0, *)) {
		view.underPageBackgroundColor = colour;
		return;
	}
#endif
	view.wantsLayer = YES;
	view.layer.backgroundColor = colour.CGColor;
}

static void paintSubviewGround(NSView *view, NSColor *colour) {
	if (view == nil) {
		return;
	}
	if ([view isKindOfClass:[WKWebView class]]) {
		paintWebViewColour((WKWebView *)view, colour);
	}
	for (NSView *sub in view.subviews) {
		paintSubviewGround(sub, colour);
	}
}

static void setWebViewGround(void *nsWindow, int r, int g, int b, int dark) {
	if (nsWindow == NULL) {
		return;
	}
	if (![NSThread isMainThread]) {
		dispatch_sync(dispatch_get_main_queue(), ^{
			setWebViewGround(nsWindow, r, g, b, dark);
		});
		return;
	}
	@autoreleasepool {
		NSWindow *window = (NSWindow *)nsWindow;
		NSColor *colour = [NSColor colorWithRed:r / 255.0
		                                    green:g / 255.0
		                                     blue:b / 255.0
		                                    alpha:1.0];
		if (@available(macOS 10.14, *)) {
			NSAppearanceName name = dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua;
			window.appearance = [NSAppearance appearanceNamed:name];
		}
		// Opaque window, themed colour. Not windowSetTransparent.
		[window setOpaque:YES];
		window.backgroundColor = colour;
		paintSubviewGround(window.contentView, colour);
	}
}

static WKWebView *findWebView(NSView *view) {
	if ([view isKindOfClass:[WKWebView class]]) {
		return (WKWebView *)view;
	}
	for (NSView *sub in view.subviews) {
		WKWebView *web = findWebView(sub);
		if (web != nil) {
			return web;
		}
	}
	return nil;
}

// didFinishNavigation says the document loaded, not that its new colours
// have reached WebKit's compositor. A snapshot after pending screen updates
// provides that rendering barrier even while the native window is hidden.
static void awaitWebViewGround(void *nsWindow, uintptr_t token) {
	NSWindow *window = (NSWindow *)nsWindow;
	WKWebView *web = findWebView(window.contentView);
	if (web == nil) {
		completeWebViewGround(token);
		return;
	}
	WKSnapshotConfiguration *configuration = [[WKSnapshotConfiguration alloc] init];
	if (@available(macOS 10.15, *)) {
		configuration.afterScreenUpdates = YES;
	}
	[web takeSnapshotWithConfiguration:configuration completionHandler:^(NSImage *image, NSError *error) {
		// On a navigation failure, still show the themed native window.
		completeWebViewGround(token);
	}];
	[configuration release];
}
*/
import "C"
import (
	"runtime/cgo"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func deferShowForWebViewGround() bool { return true }

func systemDarkTheme(_ *application.App) bool { return C.systemDarkBeforeRun() != 0 }

func windowSystemTheme(app *application.App) string {
	if systemDarkTheme(app) {
		return "dark"
	}
	return "light"
}

func paintWebViewGround(window application.Window, colour application.RGBA) {
	web, ok := window.(*application.WebviewWindow)
	if !ok || web == nil {
		return
	}
	application.InvokeSync(func() {
		ptr := web.NativeWindow()
		if ptr == nil {
			return
		}
		dark := 0
		if colour == ground(true) {
			dark = 1
		}
		C.setWebViewGround(unsafe.Pointer(ptr), C.int(colour.Red), C.int(colour.Green), C.int(colour.Blue), C.int(dark))
	})
}

// afterWebViewGround waits for the page and native colour to reach WebKit's
// compositor. The callback also runs on failure so an offline dev server does
// not leave the app permanently hidden.
func afterWebViewGround(window application.Window, ready func()) {
	application.InvokeSync(func() {
		ptr := window.NativeWindow()
		if ptr == nil {
			ready()
			return
		}
		token := cgo.NewHandle(ready)
		C.awaitWebViewGround(unsafe.Pointer(ptr), C.uintptr_t(token))
	})
}

// revealDarwinGround paints the web view, waits for that paint, and only then
// shows the window. All macOS windows, including settings, use this path.
func revealDarwinGround(s *EditorService, window application.Window, show bool) {
	if window == nil {
		return
	}
	reveal := groundedReveal(func(ready func()) {
		paintWebViewGround(window, s.groundColour())
		afterWebViewGround(window, ready)
	}, func() {
		if !show {
			return
		}
		application.InvokeSync(func() {
			s.mu.Lock()
			closing := s.closing
			s.mu.Unlock()
			if !closing && window.NativeWindow() != nil {
				window.Show()
			}
		})
	})
	// Paint as soon as the web view exists, not only when navigation finishes.
	// setBackgroundColour has already run by then and did not colour the view.
	go func() {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			ready := false
			application.InvokeSync(func() {
				web, ok := window.(*application.WebviewWindow)
				ready = ok && web != nil && web.NativeWindow() != nil
			})
			if ready {
				paintWebViewGround(window, s.groundColour())
				return
			}
			time.Sleep(2 * time.Millisecond)
		}
	}()
	window.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, func(*application.WindowEvent) {
		paintWebViewGround(window, s.groundColour())
	})
	stopReady := s.app.Event.On("window-ready", func(event *application.CustomEvent) {
		if windowReadyForGround(window.Name(), s.darkTheme(), event.Sender, event.Data) {
			reveal()
		}
	})
	window.RegisterHook(events.Common.WindowClosing, func(*application.WindowEvent) { stopReady() })
	if show {
		// Navigation can fail. Still paint and show rather than leave a window hidden.
		// Skip the attempt until the native window exists, so an early Show does not
		// consume the one-shot before Wails has created it.
		go func() {
			time.Sleep(10 * time.Second)
			application.InvokeSync(func() {
				web, ok := window.(*application.WebviewWindow)
				if !ok || web == nil || web.NativeWindow() == nil {
					return
				}
				reveal()
			})
		}()
	}
}
