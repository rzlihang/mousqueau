import type { Cue } from "../bindings/mousqueau/internal/subtitle/models";
import type { CueLine } from "./cueLines";
import { formatTime } from "./editor";

// The fields of the selected cue as they are being edited, before Apply.
export type Draft = {
  text: string;
  start: string;
  end: string;
  speakerIds: string[];
  review: boolean;
  // Overlapping speech: one line per row of text, each with its speakers.
  lines: CueLine[] | null;
};
export const EMPTY_DRAFT: Draft = {
  text: "",
  start: "",
  end: "",
  speakerIds: [],
  review: false,
  lines: null,
};
export function draftOf(cue: Cue): Draft {
  return {
    text: cue.text,
    start: formatTime(cue.start),
    end: formatTime(cue.end),
    speakerIds: cue.speakerIds ?? [],
    review: cue.review,
    lines:
      cue.lines && cue.lines.length > 1
        ? cue.lines.map((l) => ({ text: l.text, speakerIds: l.speakerIds ?? [] }))
        : null,
  };
}
// The inspector's tabs.
export type Tab = "edit" | "speakers" | "suggestions";
