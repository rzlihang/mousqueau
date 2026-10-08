import { diffChars } from "diff";

export function formatTime(value: number): string {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function parseTime(value: string): number {
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,\.](\d{3})$/.exec(value.trim());
  if (!match || +match[2] > 59 || +match[3] > 59)
    throw new Error("请输入 HH:MM:SS,mmm，分与秒须为 00–59。");
  return +match[1] * 3600 + +match[2] * 60 + +match[3] + +match[4] / 1000;
}
export function changedText(original: string, proposed: string) {
  return diffChars(original, proposed);
}
export function activeCue<T extends { start: number; end: number }>(
  cues: T[],
  time: number,
): T | undefined {
  return cues.find((cue) => cue.start <= time && time < cue.end);
}
