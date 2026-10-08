// window.Mousqueau — hand-written from frontend/src/App.tsx. Requires React 18 and antd 5 globals.
import type { ReactNode, CSSProperties } from "react";

/** Mirrors the Go Cue model (internal/subtitle). Times are seconds. */
export interface Cue {
  id: string;
  identifier: number;
  start: number;
  end: number;
  text: string;
  speakerIds?: string[];
  review: boolean;
}
export interface Speaker {
  id: string;
  name: string;
  /** One of SPEAKER_COLORS, cycled by index. */
  color: string;
}
export interface Suggestion {
  id: string;
  /** Display number of the cue it targets (the app looks it up from cueId). */
  cueIdentifier: number;
  original: string;
  proposed: string;
  speakerIds?: string[];
  status: "pending" | "accepted" | "rejected";
  /** Multiple speakers, overlap, or a segment crossing a cue/range boundary. */
  review: boolean;
}

export interface ProviderProps {
  /** Force a theme; omit to follow <html data-theme>. */
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}
export interface AppHeaderProps {
  /** Default "Mousqueau". */
  title?: ReactNode;
  /** Default "字幕校正 · 说话人辨识". */
  subtitle?: ReactNode;
  /** antd Buttons, left to right; at most one type="primary". */
  actions?: ReactNode;
  /** Usually a ThemeToggle. */
  children?: ReactNode;
}
export interface ThemeToggleProps {
  checked: boolean;
  onChange?: (dark: boolean) => void;
  /** Default "深色". */
  label?: string;
  style?: CSSProperties;
}
export interface StatusBarProps {
  /** Dependency Tags and small Buttons. */
  children?: ReactNode;
  busy?: boolean;
  /** Current phase from the Go backend; default "处理中…". */
  phase?: string;
  onCancel?: () => void;
}
export interface PanelProps {
  title: ReactNode;
  /** Muted count after the title, e.g. "4 句". */
  count?: ReactNode;
  /** Right side of the heading row (Undo / Redo). */
  extra?: ReactNode;
  /** "media-panel" | "cues-panel" | "review-panel". */
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}
export interface MediaPlaceholderProps {
  description?: ReactNode;
}
export interface TimecodeProps {
  seconds: number;
}
export interface SpeakerTagProps {
  /** Omit for the "Unknown" tag. */
  speaker?: Speaker;
}
export interface CueCardProps {
  cue: Cue;
  speakers?: Speaker[];
  selected?: boolean;
  playing?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
export interface CueEditorProps {
  /** Pass a stable object: a new one resets the draft. */
  cue: Cue;
  speakers?: Speaker[];
  busy?: boolean;
  /** Start in the unapplied state (shows 尚未套用). */
  dirty?: boolean;
  onApply?: (edited: Cue) => void;
}
export interface SpeakerManagerProps {
  speakers: Speaker[];
  busy?: boolean;
  onSave?: (speaker: Speaker) => void;
}
export interface DiffTextProps {
  original: string;
  proposed: string;
  side: "original" | "proposed";
}
export interface SuggestionCardProps {
  suggestion: Suggestion;
  speakers?: Speaker[];
  busy?: boolean;
  /** True while the cue editor has unapplied changes; locks accept / reject. */
  draftDirty?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onLocate?: () => void;
}

export declare function Provider(props: ProviderProps): JSX.Element;
export declare function AppHeader(props: AppHeaderProps): JSX.Element;
export declare function ThemeToggle(props: ThemeToggleProps): JSX.Element;
export declare function StatusBar(props: StatusBarProps): JSX.Element;
export declare function Panel(props: PanelProps): JSX.Element;
export declare function MediaPlaceholder(props: MediaPlaceholderProps): JSX.Element;
export declare function Timecode(props: TimecodeProps): JSX.Element;
export declare function SpeakerTag(props: SpeakerTagProps): JSX.Element;
export declare function CueCard(props: CueCardProps): JSX.Element;
export declare function CueEditor(props: CueEditorProps): JSX.Element;
export declare function SpeakerManager(props: SpeakerManagerProps): JSX.Element;
export declare function DiffText(props: DiffTextProps): JSX.Element;
export declare function SuggestionCard(props: SuggestionCardProps): JSX.Element;

/** The ConfigProvider theme the app uses: colorPrimary #2867c7, borderRadius 6. */
export declare function themeConfig(dark: boolean): object;
/** Seconds → "HH:MM:SS,mmm". */
export declare function formatTime(seconds: number): string;
/** "HH:MM:SS,mmm" (comma or dot) → seconds; throws with the app's message. */
export declare function parseTime(value: string): number;
export declare function diffChars(a: string, b: string): { value: string; added: boolean; removed: boolean }[];
export declare const SPEAKER_COLORS: ["#1677ff", "#52c41a", "#d46b08"];
