// Subtitle quality checks. They are derived from the cues on every render and
// never stored, so a project file and its SRT export stay as they were.

export type QualityIssue =
  | "overlap"
  | "short"
  | "long"
  | "fast"
  | "wide"
  | "lines";

type Limits = { rate: number; line: number };
// Common streaming-service limits: Chinese, Japanese and Korean text is
// counted in full-width characters, anything else in characters.
export const QUALITY = {
  minDuration: 0.833,
  maxDuration: 7,
  maxLines: 2,
  cjk: { rate: 9, line: 16 } as Limits,
  other: { rate: 20, line: 42 } as Limits,
};

const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
const WIDE = /[　-ヿ㐀-鿿가-힯豈-﫿＀-｠￠-￦]/;

export function limitsFor(text: string): Limits {
  return CJK.test(text) ? QUALITY.cjk : QUALITY.other;
}

// The length of one line: in text with CJK, a half-width character is half a
// character.
function lineLength(line: string, cjk: boolean): number {
  let length = 0;
  for (const ch of line) length += !cjk || WIDE.test(ch) ? 1 : 0.5;
  return length;
}

const rows = (text: string) =>
  text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

/** Characters read per second, line breaks left out. */
export function readingRate(text: string, start: number, end: number): number {
  const cjk = CJK.test(text);
  const length = rows(text).reduce((sum, row) => sum + lineLength(row, cjk), 0);
  return length / Math.max(0.001, end - start);
}

type CueLike = { id: string; start: number; end: number; text: string };

/** The issues of one cue; `previous` is the cue before it in the list. */
export function cueIssues(cue: CueLike, previous?: CueLike): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const duration = cue.end - cue.start;
  // Half a millisecond absorbs the rounding of SRT timestamps.
  if (previous && cue.start < previous.end - 0.0005) issues.push("overlap");
  if (duration < QUALITY.minDuration - 0.0005) issues.push("short");
  if (duration > QUALITY.maxDuration + 0.0005) issues.push("long");
  const lines = rows(cue.text);
  if (!lines.length) return issues;
  const limits = limitsFor(cue.text);
  const cjk = limits === QUALITY.cjk;
  if (readingRate(cue.text, cue.start, cue.end) > limits.rate)
    issues.push("fast");
  if (lines.some((line) => lineLength(line, cjk) > limits.line))
    issues.push("wide");
  if (lines.length > QUALITY.maxLines) issues.push("lines");
  return issues;
}

/** Issues by cue ID, for the cues that have any. */
export function qualityIssues(cues: CueLike[]): Map<string, QualityIssue[]> {
  const found = new Map<string, QualityIssue[]>();
  cues.forEach((cue, i) => {
    const issues = cueIssues(cue, cues[i - 1]);
    if (issues.length) found.set(cue.id, issues);
  });
  return found;
}

/** The limit an issue was measured against, as shown to the user. */
export function issueLimit(issue: QualityIssue, text: string): string {
  const limits = limitsFor(text);
  switch (issue) {
    case "short":
      return QUALITY.minDuration.toFixed(2);
    case "long":
      return String(QUALITY.maxDuration);
    case "fast":
      return String(limits.rate);
    case "wide":
      return String(limits.line);
    case "lines":
      return String(QUALITY.maxLines);
    default:
      return "";
  }
}
