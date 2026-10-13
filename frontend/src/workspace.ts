type CueLike = {
  id: string;
  start: number;
  end: number;
  text: string;
  review: boolean;
  speakerIds: string[] | null;
};
type SuggestionLike = { cueId: string; status: string; review: boolean };

export type CueStatus = "review" | "pending" | null;
export type CueFilter = "all" | "todo" | "unknown";

// A cue needs review when it is flagged or a pending suggestion asks for it;
// any other pending suggestion only awaits a decision.
export function cueStatus(
  cue: CueLike,
  suggestions: SuggestionLike[],
): CueStatus {
  const pending = suggestions.filter(
    (s) => s.cueId === cue.id && s.status === "pending",
  );
  if (cue.review || pending.some((s) => s.review)) return "review";
  return pending.length ? "pending" : null;
}

export function filterCues<T extends CueLike>(
  cues: T[],
  suggestions: SuggestionLike[],
  query: string,
  filter: CueFilter,
): T[] {
  const q = query.trim().toLowerCase();
  return cues.filter((c) => {
    if (q && !c.text.toLowerCase().includes(q)) return false;
    if (filter === "todo") return cueStatus(c, suggestions) !== null;
    if (filter === "unknown") return !c.speakerIds?.length;
    return true;
  });
}

// Whole-second time for analysis ranges and ruler labels.
export function formatSeconds(value: number): string {
  const s = Math.max(0, Math.floor(value));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export const MIN_PPS = 4;
export const MAX_PPS = 200;
// Zoom slider 0–100 maps exponentially to min–200 pixels per second.
export function zoomToPps(zoom: number, min = MIN_PPS): number {
  return min * Math.pow(MAX_PPS / min, Math.min(100, Math.max(0, zoom)) / 100);
}
export function ppsToZoom(pps: number, min = MIN_PPS): number {
  const z = (100 * Math.log(pps / min)) / Math.log(MAX_PPS / min);
  return Math.min(100, Math.max(0, z));
}
// The widest zoom shows the whole duration in width pixels, or MIN_PPS when
// that is already enough.
export function minPps(duration: number, width: number): number {
  return Math.min(MIN_PPS, Math.max(0.05, width / Math.max(1, duration)));
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
// Smallest labelled interval that keeps ruler labels at least minPx apart.
export function majorStep(pps: number, minPx = 80): number {
  return STEPS.find((s) => s * pps >= minPx) ?? STEPS[STEPS.length - 1];
}

// Loudest peak (0–100) between two times.
export function peakBetween(
  peaks: number[],
  rate: number,
  from: number,
  to: number,
): number {
  const a = Math.max(0, Math.floor(from * rate));
  const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(to * rate)));
  let peak = 0;
  for (let i = a; i < b; i++) if (peaks[i] > peak) peak = peaks[i];
  return peak;
}

// Time at which to split a cue: the playhead when it is strictly inside the
// cue, otherwise the given fraction of the cue. Rounded to milliseconds, as SRT.
export function splitTime(
  start: number,
  end: number,
  playhead: number,
  fraction: number,
): number {
  const ms = (t: number) => Math.round(t * 1000);
  const inside = ms(playhead) > ms(start) && ms(playhead) < ms(end);
  return ms(inside ? playhead : start + (end - start) * fraction) / 1000;
}
// Converts a UTF-16 index, as in selectionStart, to Unicode code points, as Go counts.
export function codePointOffset(text: string, index: number): number {
  return Array.from(text.slice(0, index)).length;
}

// Rows [first, last) to render for a list of fixed-height rows.
export function rowWindow(
  scrollTop: number,
  viewHeight: number,
  rowHeight: number,
  count: number,
  overscan = 6,
): [number, number] {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(
    count,
    Math.ceil((scrollTop + viewHeight) / rowHeight) + overscan,
  );
  return [first, Math.max(first, last)];
}
