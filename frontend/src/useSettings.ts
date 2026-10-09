import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { SettingsView } from "../bindings/mousqueau/models";

export const isMac = /Mac/.test(navigator.userAgent);
export const isWindows = /Windows/.test(navigator.userAgent);
export const osName = isMac ? "macOS" : isWindows ? "Windows" : "Linux";
// Where Go keeps the API key: the short name for buttons, the full one for hints.
export const keyStore = isMac ? "钥匙串" : isWindows ? "凭据管理器" : "密钥环";
export const keyStoreName = isMac
  ? "macOS 钥匙串"
  : isWindows
    ? "Windows 凭据管理器"
    : "系统密钥环";
// Where Go looks for FFmpeg and yt-dlp when no location is set, and how to
// install them.
export const toolSearch = isMac
  ? "PATH、Homebrew 与 /usr/local/bin"
  : isWindows
    ? "PATH"
    : "PATH 与 /usr/local/bin";
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
