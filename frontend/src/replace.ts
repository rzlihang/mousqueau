// Counts what Replace All would change, the way Go's project.Replace finds
// it: literal text, in each speaker's line of a cue that has several.
type CueLike = { text: string; lines?: { text: string }[] | null };

export function countMatches(
  cues: CueLike[],
  find: string,
  matchCase: boolean,
): { matches: number; cues: number } {
  const found = { matches: 0, cues: 0 };
  if (!find) return found;
  const pattern = new RegExp(
    find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    matchCase ? "gu" : "giu",
  );
  for (const cue of cues) {
    const texts =
      cue.lines && cue.lines.length > 1
        ? cue.lines.map((l) => l.text)
        : [cue.text];
    const n = texts.reduce((sum, s) => sum + (s.match(pattern)?.length ?? 0), 0);
    found.matches += n;
    if (n) found.cues++;
  }
  return found;
}
