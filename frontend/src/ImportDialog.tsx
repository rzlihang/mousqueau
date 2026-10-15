import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Progress,
  Segmented,
  Select,
} from "antd";
import { IconBadgeCc, IconMovie } from "@tabler/icons-react";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { Status, WebImport } from "../bindings/mousqueau/models";
import type { WebInfo } from "../bindings/mousqueau/internal/media/models";
import { useT } from "./i18n";
import { decorative, statusIcon } from "./icons";

export type ImportTab = "local" | "web";
type MediaKind = "" | "audio" | "video";

type Props = {
  open: boolean;
  tab: ImportTab;
  onTab: (tab: ImportTab) => void;
  onClose: () => void;
  busy: boolean;
  status: Status | null;
  // Media cannot be replaced while a cue edit is unapplied.
  draftDirty: boolean;
  // Each resolves true when something was imported, so the dialog closes;
  // false leaves it open (a cancelled file picker, an error).
  onImportMedia: () => Promise<boolean>;
  onImportSrt: () => Promise<boolean>;
  onImportWeb: (url: string, req: WebImport) => Promise<boolean>;
  onDiscover: (url: string) => Promise<WebInfo | undefined>;
};

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// One place for every import: local media and SRT, or a video page through
// yt-dlp. Only × and Esc close it, so a stray click keeps a typed link.
export default function ImportDialog(props: Props) {
  const t = useT();
  const { busy, status, draftDirty } = props;
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<WebInfo | null>(null);
  const [track, setTrack] = useState<number>();
  const [subs, setSubs] = useState(true);
  const [media, setMedia] = useState<MediaKind>("video");
  const [authorized, setAuthorized] = useState(false);

  const captions = info?.captions ?? [];
  const wantSubs = subs && track !== undefined;
  const missing = !status?.ytdlp;
  const importOff =
    busy ||
    !info ||
    missing ||
    !status?.ffmpeg ||
    (!wantSubs && !media) ||
    (!!media && (!authorized || draftDirty));

  const discover = async () => {
    const result = await props.onDiscover(url);
    if (!result) return;
    setInfo(result);
    setTrack((result.captions ?? []).length ? 0 : undefined);
    setSubs(true);
  };
  const importWeb = async () => {
    if (!info) return;
    const caption = wantSubs ? captions[track!] : undefined;
    const done = await props.onImportWeb(url, {
      title: info.title,
      language: caption?.language ?? "",
      automatic: caption?.automatic ?? false,
      media,
      authorized: !!media && authorized,
    });
    if (done) props.onClose();
  };
  const hint = {
    "": t.importer.hintNone,
    audio: t.importer.hintAudio,
    video: t.importer.hintVideo,
  }[media];
  const site = [info?.site, info?.duration ? formatDuration(info.duration) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      title={t.importer.title}
      open={props.open}
      onCancel={props.onClose}
      footer={null}
      width={600}
      className="import-dialog"
    >
      <Segmented<ImportTab>
        block
        value={props.tab}
        onChange={props.onTab}
        options={[
          { value: "local", label: t.importer.local },
          { value: "web", label: t.importer.web },
        ]}
      />
      {props.tab === "local" ? (
        <div className="import-body">
          <div className="import-card">
            <span className="import-glyph" aria-hidden="true">
              <IconMovie size={20} {...decorative} />
            </span>
            <div className="import-text">
              <strong>{t.importer.mediaTitle}</strong>
              <span className="muted">{t.importer.mediaBody}</span>
              <span className="muted mono">{t.importer.mediaFormats}</span>
            </div>
            <Button
              disabled={busy || draftDirty}
              aria-label={`${t.importer.chooseFile} ${t.importer.mediaTitle}`}
              onClick={() =>
                void props.onImportMedia().then((done) => {
                  if (done) props.onClose();
                })
              }
            >
              {t.importer.chooseFile}
            </Button>
          </div>
          <div className="import-card">
            <span className="import-glyph" aria-hidden="true">
              <IconBadgeCc size={20} {...decorative} />
            </span>
            <div className="import-text">
              <strong>{t.importer.srtTitle}</strong>
              <span className="muted">{t.importer.srtBody}</span>
              <span className="muted mono">SRT</span>
            </div>
            <Button
              disabled={busy}
              aria-label={`${t.importer.chooseFile} ${t.importer.srtTitle}`}
              onClick={() =>
                void props.onImportSrt().then((done) => {
                  if (done) props.onClose();
                })
              }
            >
              {t.importer.chooseFile}
            </Button>
          </div>
          <p className="muted">{t.importer.localNote}</p>
        </div>
      ) : (
        <div className="import-body">
          <p className="muted">{t.importer.webIntro}</p>
          {missing && (
            <Alert
              type="warning"
              showIcon
              icon={statusIcon.warning}
              title={t.importer.needsYtdlp}
            />
          )}
          <form
            className="import-url"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void discover();
            }}
          >
            <Input
              value={url}
              disabled={busy || missing}
              placeholder="https://…"
              aria-label={t.importer.urlLabel}
              onChange={(e) => {
                setUrl(e.target.value);
                setInfo(null);
                setTrack(undefined);
                setAuthorized(false);
              }}
            />
            <Button htmlType="submit" disabled={busy || missing || !url.trim()}>
              {t.importer.find}
            </Button>
          </form>
          {info && (
            <div className="import-result">
              <div className="import-result-head">
                <strong title={info.title}>{info.title}</strong>
                {site && <span className="muted">{site}</span>}
              </div>
              <div className="import-row">
                <Checkbox
                  className="import-label"
                  checked={wantSubs}
                  disabled={busy || !captions.length}
                  onChange={(e) => setSubs(e.target.checked)}
                >
                  {t.importer.subtitles}
                </Checkbox>
                {captions.length ? (
                  <Select
                    className="import-grow"
                    value={track}
                    disabled={busy || !subs}
                    aria-label={t.importer.trackLabel}
                    options={captions.map((c, i) => ({
                      value: i,
                      label: `${c.language} · ${c.automatic ? t.importer.automatic : t.importer.manual}`,
                    }))}
                    onChange={setTrack}
                  />
                ) : (
                  <span className="muted">{t.importer.noCaptions}</span>
                )}
              </div>
              <div className="import-row import-media">
                <span className="import-label">{t.importer.media}</span>
                <div className="import-grow stack">
                  <Segmented<MediaKind>
                    value={media}
                    disabled={busy}
                    onChange={setMedia}
                    options={[
                      { value: "", label: t.importer.mediaNone },
                      { value: "audio", label: t.importer.mediaAudio },
                      { value: "video", label: t.importer.mediaVideo },
                    ]}
                  />
                  <span className="muted">
                    {draftDirty && media ? t.importer.applyFirst : hint}
                  </span>
                  {!!media && (
                    <Checkbox
                      checked={authorized}
                      disabled={busy}
                      onChange={(e) => setAuthorized(e.target.checked)}
                    >
                      {t.importer.authorized}
                    </Checkbox>
                  )}
                </div>
              </div>
            </div>
          )}
          {status?.busy && (
            <div className="import-progress" role="status">
              <div className="import-grow">
                <span>{status.phase}</span>
                {status.progress >= 0 && (
                  <Progress
                    percent={Math.round(status.progress * 100)}
                    showInfo={false}
                    size="small"
                  />
                )}
              </div>
              <Button
                danger
                size="small"
                type="text"
                onClick={() => void Editor.Cancel()}
              >
                {t.status.cancel}
              </Button>
            </div>
          )}
          <div className="import-foot">
            <span className="muted">{t.importer.noUpload}</span>
            <Button
              type="primary"
              disabled={importOff}
              onClick={() => void importWeb()}
            >
              {t.importer.import}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
