// Lines of overlapping speech inside one cue. While editing, the text is
// what the viewer shows: one row per line, each after a dialogue dash. The
// rows and the lines stay index for index, so speakers follow their row.

export type CueLine = { text: string; speakerIds: string[] };

const DASH = /^[-‐‑–—]\s*/;

export function renderLines(lines: CueLine[]): string {
  return lines.map((l) => `- ${l.text}`).join("\n");
}

function unbroken(ch: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u.test(
    ch,
  );
}

// Joins two pieces of text with a space, or with nothing where CJK meets.
export function joinText(a: string, b: string): string {
  a = a.trimEnd();
  b = b.trimStart();
  if (!a || !b) return a + b;
  const last = Array.from(a).pop() ?? "";
  return unbroken(last) || unbroken(Array.from(b)[0]) ? a + b : `${a} ${b}`;
}

// Rows of an ordinary cue are only wrapping, so they become one line.
function unwrap(text: string): string {
  return text.split("\n").reduce((out, row) => joinText(out, row), "").trim();
}

// Removes [start, end) from text, leaving one space where the cut met
// spaces and none where it fell inside unspaced text. Row breaks are left
// for unwrap to join.
function cut(text: string, start: number, end: number): string {
  const left = text.slice(0, start);
  const right = text.slice(end);
  const spaced = /[ \t]$/.test(left) || /^[ \t]/.test(right);
  return (
    spaced ? `${left.replace(/[ \t]+$/, "")} ${right.replace(/^[ \t]+/, "")}` : left + right
  ).trim();
}

// Re-reads lines after the text was typed in: every row is a line, and a
// line keeps the speakers of the row at its index. Fewer than two rows is
// an ordinary cue again.
export function relines(
  text: string,
  previous: CueLine[],
): CueLine[] | null {
  const rows = text.split("\n").map((r) => r.replace(DASH, "").trim());
  if (rows.length < 2) return null;
  return rows.map((row, i) => ({
    text: row,
    speakerIds: previous[i]?.speakerIds ?? [],
  }));
}

export type Extracted =
  | { lines: CueLine[] }
  | { error: "empty" | "acrossLines" };

// Moves the selected text [start, end) of a cue's viewer text out to a new
// last line for speaker (none: unassigned). The rest of its row stays with
// that row's speakers.
export function extract(
  text: string,
  lines: CueLine[] | null,
  speakerIds: string[],
  start: number,
  end: number,
  speaker?: string,
): Extracted {
  const assigned = speaker ? [speaker] : [];
  if (!lines) {
    const piece = unwrap(text.slice(start, end));
    if (!piece) return { error: "empty" };
    const rest = unwrap(cut(text, start, end));
    return {
      lines: rest
        ? [
            { text: rest, speakerIds: [...speakerIds] },
            { text: piece, speakerIds: assigned },
          ]
        : [{ text: piece, speakerIds: assigned }],
    };
  }
  const rows = text.split("\n");
  let rowStart = 0;
  for (let r = 0; r < rows.length; r++) {
    const rowEnd = rowStart + rows[r].length;
    if (start >= rowStart && start <= rowEnd) {
      if (end > rowEnd) return { error: "acrossLines" };
      const dash = DASH.exec(rows[r])?.[0].length ?? 0;
      const content = rows[r].slice(dash);
      const s = Math.max(0, start - rowStart - dash);
      const e = end - rowStart - dash;
      const piece = e > s ? content.slice(s, e).trim() : "";
      if (!piece) return { error: "empty" };
      const rest = cut(content, s, e);
      const next = lines.flatMap((l, i) =>
        i !== r ? [l] : rest ? [{ ...l, text: rest }] : [],
      );
      next.push({ text: piece, speakerIds: assigned });
      return { lines: next };
    }
    rowStart = rowEnd + 1;
  }
  return { error: "empty" };
}

// Joins line i onto the line before it, which keeps its speakers. Text that
// already separates its words with spaces gets one at the join too.
export function joinUp(lines: CueLine[], i: number): CueLine[] {
  if (i <= 0 || i >= lines.length) return lines;
  const [a, b] = [lines[i - 1].text, lines[i].text];
  const next = lines.slice();
  next.splice(i - 1, 2, {
    text: /\s/.test(a + b) ? `${a.trimEnd()} ${b.trimStart()}` : joinText(a, b),
    speakerIds: lines[i - 1].speakerIds,
  });
  return next;
}

// The speakers of all lines, in order of first appearance.
export function lineSpeakers(lines: CueLine[]): string[] {
  return [...new Set(lines.flatMap((l) => l.speakerIds))];
}
