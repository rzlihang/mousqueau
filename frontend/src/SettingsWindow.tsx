import { type UIEvent, useEffect, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Spin,
  Switch,
  Tag,
} from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { SettingsView, ToolStatus } from "../bindings/mousqueau/models";
import { LANGUAGE_NAMES, errorText, matchLocale, useT } from "./i18n";
import { ICON_PATHS, PathIcon } from "./icons";
import {
  SECTIONS,
  type SectionId,
  formatChecked,
  languageChoice,
  languageOptions,
  matchSettings,
  themeChoice,
  themeOptions,
  toolLabel,
} from "./preferences";
import { isMac, osName } from "./useSettings";

type Props = {
  settings: SettingsView;
  onChange: (view: SettingsView) => void;
  dark: boolean;
  systemDark: boolean;
};
type Apply = (action: () => Promise<SettingsView>) => Promise<boolean>;

function ToolCard({
  name,
  label,
  need,
  hint,
  tool,
  apply,
}: {
  name: string;
  label: string;
  need: string;
  hint: string;
  tool: ToolStatus;
  apply: Apply;
}) {
  const t = useT();
  const [draft, setDraft] = useState(tool.path);
  useEffect(() => setDraft(tool.path), [tool.path]);
  const commit = () => {
    if (draft.trim() !== tool.path)
      void apply(() => Editor.SetToolPath(name, draft.trim()));
  };
  return (
    <div className="set-card set-tool">
      <div className="set-line">
        <strong>{label}</strong>
        <span className="set-hint">{need}</span>
        <div className="spacer" />
        <Tag color={tool.ready ? "green" : "orange"}>{toolLabel(tool, t)}</Tag>
      </div>
      <div className="set-line">
        <Input
          size="small"
          className="mono-input"
          aria-label={t.settings.toolLocation(label)}
          placeholder={t.settings.autoFind}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onPressEnter={commit}
        />
        <Button
          size="small"
          onClick={() => void apply(() => Editor.ChooseToolPath(name))}
        >
          {t.common.choose}
        </Button>
        <Button
          size="small"
          onClick={() => void apply(() => Editor.SetToolPath(name, ""))}
        >
          {t.settings.autoDetect}
        </Button>
      </div>
      <span className="set-hint">{hint}</span>
    </div>
  );
}

export default function SettingsWindow({
  settings,
  onChange,
  dark,
  systemDark,
}: Props) {
  const { message } = AntApp.useApp();
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>("general");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { rows, sections, any } = matchSettings(query);
  const theme = themeChoice(settings.theme);
  const language = languageChoice(settings.language);
  const locale = matchLocale(settings.locale);
  const configured = settings.keySource !== "";
  const os = osName(t);

  const apply: Apply = async (action) => {
    try {
      onChange(await action());
      return true;
    } catch (e) {
      void message.error(errorText(e));
      return false;
    }
  };
  // Keep the sidebar in step with whichever section heading reached the top.
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const box = e.currentTarget;
    let current: string | undefined;
    for (const sec of box.querySelectorAll<HTMLElement>("[data-sec]")) {
      current ??= sec.dataset.sec;
      if (sec.offsetTop - box.scrollTop <= 40) current = sec.dataset.sec;
    }
    if (current && current !== active) setActive(current as SectionId);
  };
  const jump = (id: SectionId) => {
    const box = scroller.current;
    const target = box?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (box && target)
      box.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    setActive(id);
  };
  async function saveKey() {
    setSaving(true);
    if (await apply(() => Editor.SaveAPIKey(apiKey))) {
      setApiKey("");
      void message.success(t.settings.keySaved);
    }
    setSaving(false);
  }
  async function checkUpdate() {
    setChecking(true);
    setJustChecked(await apply(Editor.CheckForUpdates));
    setChecking(false);
  }

  return (
    <div className={`panel-window settings${isMac ? " mac" : ""}`}>
      <nav className="set-side" aria-label={t.settings.nav}>
        <div className="panel-drag" />
        <Input
          size="small"
          allowClear
          placeholder={t.settings.search}
          aria-label={t.settings.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {SECTIONS.map((id) => {
          const on = id === active && sections[id];
          return (
            <a
              key={id}
              href={`#sec-${id}`}
              className={`side-item${on ? " on" : ""}${sections[id] ? "" : " dim"}`}
              aria-current={on ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                jump(id);
              }}
            >
              <PathIcon d={ICON_PATHS[id]} />
              {t.settings.sections[id]}
            </a>
          );
        })}
      </nav>

      <main className="set-main">
        <div className="set-head">
          <h1>{t.settings.title}</h1>
        </div>
        <div className="set-scroll" ref={scroller} onScroll={onScroll}>
          {!any && <div className="set-empty">{t.settings.noMatch(query)}</div>}

          {sections.general && (
            <section id="sec-general" data-sec="general">
              <h2>{t.settings.sections.general}</h2>
              <div className="set-card">
                {rows.theme && (
                  <div className="set-row">
                    <div className="set-label">
                      <span>{t.theme.label}</span>
                      <span className="set-hint">
                        {theme === "system"
                          ? t.settings.themeFollows(
                              os,
                              systemDark ? t.theme.dark : t.theme.light,
                            )
                          : t.settings.themeFixed(
                              dark ? t.theme.dark : t.theme.light,
                              os,
                            )}
                      </span>
                    </div>
                    <Segmented
                      size="small"
                      options={themeOptions(t)}
                      value={theme}
                      onChange={(v) => void apply(() => Editor.SetTheme(v))}
                    />
                  </div>
                )}
                {rows.language && (
                  <div className="set-row">
                    <div className="set-label">
                      <span>{t.language.label}</span>
                      <span className="set-hint">
                        {language === "system" && locale
                          ? t.language.current(LANGUAGE_NAMES[locale])
                          : t.language.hint}
                      </span>
                    </div>
                    <Select
                      size="small"
                      aria-label={t.language.label}
                      value={language}
                      options={languageOptions(t)}
                      onChange={(v) => void apply(() => Editor.SetLanguage(v))}
                      style={{ width: 128 }}
                    />
                  </div>
                )}
                {rows.startup && (
                  <div className="set-row">
                    <span>{t.settings.openLast}</span>
                    <Switch
                      size="small"
                      aria-label={t.settings.openLast}
                      checked={settings.openLastProject}
                      onChange={(v) =>
                        void apply(() => Editor.SetOpenLastProject(v))
                      }
                    />
                  </div>
                )}
                {rows.setup && (
                  <div className="set-row">
                    <div className="set-label">
                      <span>{t.settings.setup}</span>
                      <span className="set-hint">{t.settings.setupHint}</span>
                    </div>
                    <Button
                      size="small"
                      onClick={() => void Editor.OpenWelcome()}
                    >
                      {t.settings.rerunSetup}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {sections.tools && (
            <section id="sec-tools" data-sec="tools">
              <h2>{t.settings.sections.tools}</h2>
              {rows.ffmpeg && (
                <ToolCard
                  name="ffmpeg"
                  label="FFmpeg"
                  need={t.common.required}
                  hint={t.settings.ffmpegHint}
                  tool={settings.ffmpeg}
                  apply={apply}
                />
              )}
              {rows.ytdlp && (
                <ToolCard
                  name="yt-dlp"
                  label="yt-dlp"
                  need={t.common.optional}
                  hint={t.settings.ytdlpHint}
                  tool={settings.ytdlp}
                  apply={apply}
                />
              )}
            </section>
          )}

          {sections.providers && (
            <section id="sec-providers" data-sec="providers">
              <h2>{t.settings.sections.providers}</h2>
              {rows.provDefault && (
                <div className="set-card">
                  <div className="set-row">
                    <div className="set-label">
                      <span>{t.settings.analysisProvider}</span>
                      <span className="set-hint">
                        {t.settings.analysisProviderHint}
                      </span>
                    </div>
                    <Select
                      size="small"
                      aria-label={t.settings.analysisProviderLabel}
                      value="openai"
                      options={[{ value: "openai", label: "OpenAI" }]}
                      style={{ width: 128 }}
                    />
                  </div>
                </div>
              )}
              {rows.provOpenai && (
                <div className="set-card">
                  <div className="set-row set-line">
                    <strong>OpenAI</strong>
                    <span className="set-hint">{t.settings.inUse}</span>
                    <div className="spacer" />
                    <Tag color={configured ? "green" : "default"}>
                      {configured
                        ? t.common.configured
                        : t.common.notConfigured}
                    </Tag>
                  </div>
                  <div className="set-row">
                    <span>{t.settings.keySource}</span>
                    <span className="set-hint">
                      {settings.keySource === "env" ? (
                        <>
                          {t.settings.envVar}{" "}
                          <span className="mono">OPENAI_API_KEY</span>
                        </>
                      ) : settings.keySource === "keychain" ? (
                        t.settings.keychain
                      ) : (
                        t.common.offlineOnly
                      )}
                    </span>
                  </div>
                  <div className="set-row set-field">
                    <label>
                      {settings.keyStored
                        ? t.settings.replaceKey
                        : t.settings.apiKey}
                      <div className="set-line">
                        <Input.Password
                          size="small"
                          placeholder="sk-…"
                          autoComplete="off"
                          disabled={!settings.keychainAvailable || saving}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          onPressEnter={() => apiKey.trim() && void saveKey()}
                        />
                        <Button
                          size="small"
                          disabled={
                            !settings.keychainAvailable ||
                            saving ||
                            !apiKey.trim()
                          }
                          onClick={() => void saveKey()}
                        >
                          {t.settings.saveToKeychain}
                        </Button>
                      </div>
                    </label>
                    <span className="set-hint">
                      {settings.keychainAvailable ? (
                        <>
                          {t.settings.envWins[0]}{" "}
                          <span className="mono">OPENAI_API_KEY</span>{" "}
                          {t.settings.envWins[1]}
                        </>
                      ) : (
                        <>
                          {t.settings.noKeychain[0]}{" "}
                          <span className="mono">OPENAI_API_KEY</span>{" "}
                          {t.settings.noKeychain[1]}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="set-row">
                    <span className="set-hint">{t.settings.removeHint}</span>
                    <Popconfirm
                      title={t.settings.removeConfirm}
                      okText={t.settings.remove}
                      cancelText={t.common.cancel}
                      onConfirm={() => void apply(Editor.RemoveAPIKey)}
                    >
                      <Button size="small" disabled={!settings.keyStored}>
                        {t.settings.removeKey}
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              )}
              {rows.provAdd && (
                <div className="set-card dashed">
                  <div className="set-row">
                    <span className="set-hint">{t.settings.onlyOpenai}</span>
                    <Button size="small" disabled>
                      {t.settings.addProvider}
                    </Button>
                  </div>
                </div>
              )}
              <span className="set-hint">{t.settings.uploadNote}</span>
            </section>
          )}

          {sections.updates && (
            <section id="sec-updates" data-sec="updates">
              <h2>{t.settings.sections.updates}</h2>
              <div className="set-card">
                <div className="set-row">
                  <div className="set-label">
                    <span>
                      {t.settings.currentVersion}{" "}
                      <span className="mono">{settings.version}</span>
                    </span>
                    <span className="set-hint set-status">
                      {checking ? (
                        <>
                          <Spin size="small" />
                          {t.settings.checking}
                        </>
                      ) : settings.updateVersion ? (
                        <>
                          <Tag color="blue">
                            {t.settings.newVersion(settings.updateVersion)}
                          </Tag>
                          <Button
                            type="link"
                            size="small"
                            onClick={() =>
                              void Editor.OpenReleasePage().catch((e) =>
                                message.error(errorText(e)),
                              )
                            }
                          >
                            {t.settings.openDownload}
                          </Button>
                        </>
                      ) : justChecked ? (
                        <>
                          <Tag color="green">{t.settings.upToDate}</Tag>
                          {t.settings.justChecked}
                        </>
                      ) : (
                        formatChecked(settings.lastUpdateCheck, t)
                      )}
                    </span>
                  </div>
                  <Button
                    size="small"
                    disabled={checking}
                    onClick={() => void checkUpdate()}
                  >
                    {t.settings.checkNow}
                  </Button>
                </div>
                <div className="set-row">
                  <span>{t.settings.autoUpdate}</span>
                  <Switch
                    size="small"
                    aria-label={t.settings.autoUpdate}
                    checked={settings.autoUpdate}
                    onChange={(v) => void apply(() => Editor.SetAutoUpdate(v))}
                  />
                </div>
                <div className="set-row">
                  <div className="set-label">
                    <span>{t.settings.beta}</span>
                    <span className="set-hint">{t.settings.betaHint}</span>
                  </div>
                  <Switch
                    size="small"
                    aria-label={t.settings.beta}
                    checked={settings.beta}
                    onChange={(v) => void apply(() => Editor.SetBeta(v))}
                  />
                </div>
              </div>
              <span className="set-hint">{t.settings.updatesNote}</span>
            </section>
          )}

          {/* lets the last section scroll to the top */}
          <div aria-hidden="true" style={{ height: query.trim() ? 24 : 230 }} />
        </div>
      </main>
    </div>
  );
}
