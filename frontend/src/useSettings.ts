import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { SettingsView } from "../bindings/mousqueau/models";
import type { Messages } from "./i18n";

export const isMac = /Mac/.test(navigator.userAgent);
export const isWindows = /Windows/.test(navigator.userAgent);
export const osName = isMac ? "macOS" : isWindows ? "Windows" : "Linux";
const platform = isMac ? "mac" : isWindows ? "windows" : "linux";
// Where Go keeps the API key: the short name for buttons and sentences, the
// full one where it stands alone.
export const keyStore = (t: Messages) => t.platform.keyStore[platform];
export const keyStoreName = (t: Messages) => t.platform.keyStoreName[platform];
// Where Go looks for FFmpeg and yt-dlp when no location is set, and how to
// install them.
export const toolSearch = (t: Messages) => t.platform.toolSearch[platform];
export function installCommand(name: string): string {
  if (isMac) return `brew install ${name}`;
  if (isWindows)
    return `winget install ${name === "ffmpeg" ? "Gyan.FFmpeg" : "yt-dlp.yt-dlp"}`;
  return name === "ffmpeg" ? "sudo apt install ffmpeg" : "pipx install yt-dlp";
}
// Outside macOS, Go opens frameless windows and asks for drawn window controls.
export const customChrome =
  new URLSearchParams(window.location.search).get("chrome") === "custom";

// Settings live in Go; every window reloads them when any window changes one.
export function useSettings(): [
  SettingsView | null,
  (view: SettingsView) => void,
] {
  const [view, setView] = useState<SettingsView | null>(null);
  useEffect(() => {
    let current = true;
    const load = () =>
      void Editor.GetSettings()
        .then((next) => {
          if (current) setView(next);
        })
        .catch(() => {
          /* runtime may be starting */
        });
    load();
    const off = Events.On("settings", load);
    return () => {
      current = false;
      off();
    };
  }, []);
  return [view, setView];
}

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return dark;
}
