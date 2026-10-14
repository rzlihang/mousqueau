//go:build darwin && !server && cgo

package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.13
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

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
*/
import "C"
import (
	"sync"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func deferShowForWebViewGround() bool { return true }

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

// revealDarwinGround paints the web view and only then shows the window, so
// the first frame on screen is already the theme colour.
func revealDarwinGround(s *EditorService, window application.Window, show bool) {
	if window == nil {
		return
	}
	var once sync.Once
	reveal := func() {
		once.Do(func() {
			paintWebViewGround(window, s.groundColour())
			if !show {
				return
			}
			s.mu.Lock()
			closing := s.closing
			s.mu.Unlock()
			if !closing {
				window.Show()
			}
		})
	}
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
	window.OnWindowEvent(events.Mac.WebViewDidFinishNavigation, func(*application.WindowEvent) { reveal() })
	if show {
		// Navigation can fail. Still paint and show rather than leave a window hidden.
		// Skip the attempt until the native window exists, so an early Show does not
		// consume the one-shot before Wails has created it.
		go func() {
			time.Sleep(2 * time.Second)
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
