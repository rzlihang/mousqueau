//go:build darwin && !server && cgo

package main

/*
#cgo CFLAGS: -x objective-c -mmacosx-version-min=10.13
#cgo LDFLAGS: -framework Cocoa -framework WebKit

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

// Wails' SetBackgroundColour only paints the NSWindow. WKWebView stays an
// opaque white until the page composites, and that white is what the user
// sees for the first few frames. underPageBackgroundColor is the public
// macOS 12 colour behind the page; WebKit's backgroundColor key is what the
// view itself draws before that composite. Wails calls the key only from
// private_mac_apis, and never from SetBackgroundColour.
static void paintSubviewGround(NSView *view, NSColor *colour) {
	if (view == nil) {
		return;
	}
	if ([view isKindOfClass:[WKWebView class]]) {
		WKWebView *web = (WKWebView *)view;
		if (@available(macOS 12.0, *)) {
			web.underPageBackgroundColor = colour;
		}
		web.wantsLayer = YES;
		if (web.layer != nil) {
			web.layer.backgroundColor = colour.CGColor;
		}
		@try {
			[web setValue:colour forKey:@"backgroundColor"];
		} @catch (NSException *exception) {
			(void)exception;
		}
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
		NSColor *colour = [NSColor colorWithSRGBRed:r / 255.0
		                                       green:g / 255.0
		                                        blue:b / 255.0
		                                       alpha:1.0];
		if (@available(macOS 10.14, *)) {
			NSAppearanceName name = dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua;
			window.appearance = [NSAppearance appearanceNamed:name];
		}
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
