import { type UIEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  AutoComplete,
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
import type {
  ProviderView,
  SettingsView,
  ToolStatus,
} from "../bindings/mousqueau/models";
import { LANGUAGE_NAMES, errorText, matchLocale, useT } from "./i18n";
import {
  IconApi,
  IconRefresh,
  IconSettings,
  IconTool,
} from "@tabler/icons-react";
import { decorative, statusIcon, useAntApp } from "./icons";
import {
  FONT_PRESETS,
  SECTIONS,
  type SectionId,
  fontStack,
  formatChecked,
  languageChoice,
  languageOptions,
  matchSettings,
  providerCaution,
  themeChoice,
  themeOptions,
  toolLabel,
} from "./preferences";
import {
  customChrome,
  isMac,
  keyStore,
  keyStoreName,
  osName,
  toolSearch,
} from "./useSettings";
import WindowControls from "./WindowControls";

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

function ProviderCard({
  provider,
  inUse,
  keychainAvailable,
  apply,
}: {
  provider: ProviderView;
  inUse: boolean;
  keychainAvailable: boolean;
  apply: Apply;
}) {
  const { message } = useAntApp();
  const t = useT();
  const credentials = provider.credentials ?? [];
  const envVars = provider.envVars ?? [];
  const [parts, setParts] = useState(() => credentials.map(() => ""));
  const [model, setModel] = useState(provider.model);
  const [endpoint, setEndpoint] = useState(provider.endpoint);
  const [saving, setSaving] = useState(false);
  useEffect(() => setModel(provider.model), [provider.model]);
  useEffect(() => setEndpoint(provider.endpoint), [provider.endpoint]);
  const caution = providerCaution(provider, t);
  const filled = parts.every((v) => v.trim());
  const commitOptions = (nextModel = model) => {
    if (
      nextModel.trim() === provider.model &&
      endpoint.trim() === provider.endpoint
    )
      return;
    void apply(() =>
      Editor.SetProviderOptions(provider.id, nextModel, endpoint),
    ).then((ok) => {
      if (!ok) {
        setModel(provider.model);
        setEndpoint(provider.endpoint);
      }
    });
  };
  async function save() {
    setSaving(true);
    if (await apply(() => Editor.SaveProviderKey(provider.id, parts))) {
      setParts(credentials.map(() => ""));
      void message.success(t.settings.keySaved(keyStore(t)));
    }
    setSaving(false);
  }
  const envList = (
    <>
      {envVars.map((name, i) => (
        <span key={name}>
          {i > 0 && " + "}
          <span className="mono">{name}</span>
        </span>
      ))}
    </>
  );
  return (
    <div className="set-card">
      <div className="set-row set-line">
        <strong>{provider.name}</strong>
        {provider.region !== "international" && (
          <Tag color={provider.region === "china" ? "orange" : "default"}>
            {provider.region === "china"
              ? t.settings.regionChina
              : t.settings.regionCustom}
          </Tag>
        )}
        {inUse ? (
          <span className="set-hint">{t.settings.inUse}</span>
        ) : (
          <Button
            size="small"
            type="link"
            onClick={() => void apply(() => Editor.SetProvider(provider.id))}
          >
            {t.settings.useProvider}
          </Button>
        )}
        <div className="spacer" />
        <Tag color={provider.ready ? "green" : "default"}>
          {provider.ready ? t.common.configured : t.common.notConfigured}
        </Tag>
      </div>
      {caution && (
        <div className="set-row">
          <Alert
            type="warning"
            showIcon
            icon={statusIcon.warning}
            title={caution}
          />
        </div>
      )}
      {provider.needsEndpoint && (
        <div className="set-row set-field">
          <label>
            {t.settings.endpoint}
            <Input
              size="small"
              className="mono-input"
              placeholder="https://api.example.com/v1"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              onBlur={() => commitOptions()}
              onPressEnter={() => commitOptions()}
            />
          </label>
          <span className="set-hint">{t.settings.endpointHint}</span>
        </div>
      )}
      <div className="set-row">
        <div className="set-label">
          <span>{t.settings.model}</span>
          {!provider.diarization && (
            <span className="set-hint">{t.settings.noDiarization}</span>
          )}
        </div>
        <AutoComplete
          size="small"
          allowClear
          aria-label={t.settings.model}
          placeholder={t.settings.modelDefault(provider.defaultModel)}
          value={model}
          options={(provider.models ?? []).map((value) => ({ value }))}
          onChange={setModel}
          onSelect={(value: string) => commitOptions(value)}
          onClear={() => commitOptions("")}
          onBlur={() => commitOptions()}
          onKeyDown={(e) => e.key === "Enter" && commitOptions()}
          style={{ width: 200 }}
        />
      </div>
      <div className="set-row">
        <span>{t.settings.keySource}</span>
        <span className="set-hint">
          {provider.keySource === "env" ? (
            <>
              {t.settings.envVar} {envList}
            </>
          ) : provider.keySource === "keychain" ? (
            keyStoreName(t)
          ) : (
            t.common.offlineOnly
          )}
        </span>
      </div>
      <div className="set-row set-field">
        {credentials.map((c, i) => (
          <label key={c}>
            {provider.keyStored && credentials.length === 1
              ? t.settings.replaceKey
              : (t.settings.credentialLabels[
                  c as keyof typeof t.settings.credentialLabels
                ] ?? c)}
            {provider.keyOptional && ` (${t.common.optional})`}
            <Input.Password
              size="small"
              placeholder={provider.id === "openai" ? "sk-…" : undefined}
              autoComplete="off"
              disabled={!keychainAvailable || saving}
              value={parts[i]}
              onChange={(e) =>
                setParts((p) => p.map((v, k) => (k === i ? e.target.value : v)))
              }
              onPressEnter={() => filled && void save()}
            />
          </label>
        ))}
        <div className="set-line end">
          <Button
            size="small"
            disabled={!keychainAvailable || saving || !filled}
            onClick={() => void save()}
          >
            {t.settings.saveTo(keyStore(t))}
          </Button>
        </div>
        {envVars.length > 0 && (
          <span className="set-hint">
            {keychainAvailable ? (
              <>
                {t.settings.envWins[0]} {envList} {t.settings.envWins[1]}
              </>
            ) : (
              <>
                {t.settings.noKeychain[0]} {envList} {t.settings.noKeychain[1]}
              </>
            )}
          </span>
        )}
      </div>
      <div className="set-row">
        <span className="set-hint">{t.settings.removeHint}</span>
        <div className="set-line">
          <Popconfirm
            icon={statusIcon.warning}
            title={t.settings.removeConfirm(keyStore(t))}
            okText={t.settings.remove}
            cancelText={t.common.cancel}
            onConfirm={() =>
              void apply(() => Editor.RemoveProviderKey(provider.id))
            }
          >
            <Button size="small" disabled={!provider.keyStored}>
              {t.settings.removeKey}
            </Button>
          </Popconfirm>
          <Popconfirm
            icon={statusIcon.warning}
            title={t.settings.removeProviderConfirm(provider.name)}
            okText={t.settings.remove}
            cancelText={t.common.cancel}
            onConfirm={() =>
              void apply(() => Editor.RemoveProvider(provider.id))
            }
          >
            <Button size="small" danger>
              {t.settings.removeProvider}
            </Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}

// Mixed scripts so a font's coverage of each shows at a glance.
const FONT_SAMPLE = "字幕預覽 字幕预览 Subtitle 0123";

function FontRow({ font, apply }: { font: string; apply: Apply }) {
  const t = useT();
  const [draft, setDraft] = useState(font);
  useEffect(() => setDraft(font), [font]);
  const commit = (value: string) => {
    if (value.trim() !== font)
      void apply(() => Editor.SetSubtitleFont(value)).then(
        (ok) => ok || setDraft(font),
      );
  };
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{t.settings.subtitleFont}</span>
        <span className="set-hint">{t.settings.subtitleFontHint}</span>
        <span
          className="font-preview"
          style={{ fontFamily: fontStack(draft) }}
          aria-hidden="true"
        >
          {FONT_SAMPLE}
        </span>
        <span className="set-hint">{t.settings.fontMissing}</span>
      </div>
      <AutoComplete
        size="small"
        allowClear
        aria-label={t.settings.subtitleFont}
        placeholder={t.settings.fontDefault}
        value={draft}
        options={FONT_PRESETS.map((name) => ({
          value: name,
          label: <span style={{ fontFamily: fontStack(name) }}>{name}</span>,
        }))}
        filterOption={(input, option) =>
          String(option?.value).toLowerCase().includes(input.toLowerCase())
        }
        onChange={setDraft}
        onSelect={(value: string) => commit(value)}
        onClear={() => commit("")}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => e.key === "Enter" && commit(draft)}
        style={{ width: 180 }}
      />
    </div>
  );
}

const SECTION_ICONS: Record<SectionId, typeof IconSettings> = {
  general: IconSettings,
  tools: IconTool,
  providers: IconApi,
  updates: IconRefresh,
};

export default function SettingsWindow({
  settings,
  onChange,
  dark,
  systemDark,
}: Props) {
  const { message, modal } = useAntApp();
  const t = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>("general");
  const [adding, setAdding] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { rows, sections, any } = matchSettings(query);
  const theme = themeChoice(settings.theme);
  const language = languageChoice(settings.language);
  const locale = matchLocale(settings.locale);
  const providers = settings.providers ?? [];
  const added = providers.filter((p) => p.added);
  const addable = providers.filter((p) => !p.added);
  const os = osName;

  const apply: Apply = async (action) => {
    try {
      onChange(await action());
      return true;
    } catch (e) {
      void message.error(errorText(e));
      return false;
    }
  };
  // While a sidebar click scrolls the page, the sections it passes over must
  // not light up in turn; the lock lifts once the scrolling has settled.
  const jumping = useRef<number>(undefined);
  const settle = () => {
    window.clearTimeout(jumping.current);
    jumping.current = window.setTimeout(() => {
      jumping.current = undefined;
    }, 150);
  };
  const release = () => {
    window.clearTimeout(jumping.current);
    jumping.current = undefined;
  };
  useEffect(() => release, []);
  // Keep the sidebar in step with whichever section heading reached the top.
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (jumping.current !== undefined) return settle();
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
    if (box && target) {
      settle();
      box.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    }
    setActive(id);
  };
  // Adding a provider under mainland Chinese law, or a custom endpoint,
  // first says what uploading to it means.
  function addProvider(id: string) {
    const provider = providers.find((p) => p.id === id);
    if (!provider) return;
    const perform = async () => {
      if (await apply(() => Editor.AddProvider(id))) setAdding(undefined);
    };
    const caution = providerCaution(provider, t);
    if (caution)
      modal.confirm({
        title: t.settings.addCautionTitle(provider.name),
        content: caution,
        okText: t.settings.addCautionOk,
        cancelText: t.common.cancel,
        onOk: perform,
      });
    else void perform();
  }
  async function checkUpdate() {
    setChecking(true);
    setJustChecked(await apply(Editor.CheckForUpdates));
    setChecking(false);
  }

  return (
    <div
      className={`panel-window settings${isMac ? " mac" : ""}${customChrome ? " custom-chrome" : ""}`}
    >
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
          const SectionIcon = SECTION_ICONS[id];
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
              <SectionIcon size={16} {...decorative} />
              {t.settings.sections[id]}
            </a>
          );
        })}
      </nav>

      <main className="set-main">
        <div className="set-head">
          <h1>{t.settings.title}</h1>
          {customChrome && <WindowControls />}
        </div>
        <div
          className="set-scroll"
          ref={scroller}
          onScroll={onScroll}
          onWheel={release}
          onTouchStart={release}
          onKeyDown={release}
        >
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
                {rows.font && (
                  <FontRow font={settings.subtitleFont} apply={apply} />
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
                  hint={t.settings.ffmpegHint(toolSearch(t))}
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
                        {added.length
                          ? t.settings.analysisProviderHint
                          : t.settings.noProviders}
                      </span>
                    </div>
                    <Select
                      size="small"
                      aria-label={t.settings.analysisProviderLabel}
                      value={settings.provider || undefined}
                      disabled={!added.length}
                      options={added.map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                      onChange={(v) => void apply(() => Editor.SetProvider(v))}
                      style={{ width: 200 }}
                    />
                  </div>
                </div>
              )}
              {rows.provList &&
                added.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    inUse={p.id === settings.provider}
                    keychainAvailable={settings.keychainAvailable}
                    apply={apply}
                  />
                ))}
              {rows.provAdd && addable.length > 0 && (
                <div className="set-card dashed">
                  <div className="set-row">
                    <span className="set-hint">
                      {t.settings.addProviderHint}
                    </span>
                    <div className="set-line">
                      <Select
                        size="small"
                        aria-label={t.settings.addProviderPlaceholder}
                        placeholder={t.settings.addProviderPlaceholder}
                        value={adding}
                        onChange={setAdding}
                        options={addable.map((p) => ({
                          value: p.id,
                          label:
                            p.region === "international"
                              ? p.name
                              : `${p.name} · ${p.region === "china" ? t.settings.regionChina : t.settings.regionCustom}`,
                        }))}
                        style={{ width: 220 }}
                      />
                      <Button
                        size="small"
                        disabled={!adding}
                        onClick={() => adding && addProvider(adding)}
                      >
                        {t.settings.addProvider}
                      </Button>
                    </div>
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
