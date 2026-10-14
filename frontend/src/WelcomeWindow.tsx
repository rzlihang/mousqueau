import { useState } from "react";
import {
  App as AntApp,
  Button,
  Input,
  Radio,
  Segmented,
  Select,
  Steps,
  Tag,
} from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type { SettingsView, ToolStatus } from "../bindings/mousqueau/models";
import { LANGUAGE_NAMES, errorText, matchLocale, useT } from "./i18n";
import { IconCircleCheckFilled } from "@tabler/icons-react";
import { decorative } from "./icons";
import {
  languageChoice,
  languageOptions,
  themeChoice,
  themeOptions,
  toolLabel,
} from "./preferences";
import {
  customChrome,
  installCommand,
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
  systemDark: boolean;
};
type Apply = (action: () => Promise<SettingsView>) => Promise<boolean>;
type KeyChoice = "env" | "key" | "none";

const LAST = 3;

function ToolRow({
  name,
  label,
  need,
  missing,
  tool,
  apply,
}: {
  name: string;
  label: string;
  need: string;
  missing: string;
  tool: ToolStatus;
  apply: Apply;
}) {
  const t = useT();
  const choose = (
    <Button
      size="small"
      onClick={() => void apply(() => Editor.ChooseToolPath(name))}
    >
      {t.common.choose}
    </Button>
  );
  return (
    <div className="welcome-tool">
      <div className="set-line">
        <strong>{label}</strong>
        <span className="set-hint">{need}</span>
        <div className="spacer" />
        <Tag color={tool.ready ? "green" : "orange"}>{toolLabel(tool, t)}</Tag>
      </div>
      {tool.ready ? (
        <div className="set-line">
          <span className="set-hint mono welcome-path">{tool.path}</span>
          {choose}
        </div>
      ) : (
        <>
          <span className="set-hint">
            {tool.custom ? (
              <>
                {t.welcome.notFoundAt[0]}{" "}
                <span className="mono ink">{tool.path}</span>{" "}
                {t.welcome.notFoundAt[1]}
              </>
            ) : (
              <>
                {missing}
                {t.welcome.installWith}
                <span className="mono ink">{installCommand(name)}</span>
              </>
            )}
          </span>
          <div className="set-line end">
            {choose}
            <Button
              size="small"
              onClick={() => void apply(() => Editor.SetToolPath(name, ""))}
            >
              {t.welcome.redetect}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function WelcomeWindow({
  settings,
  onChange,
  systemDark,
}: Props) {
  const { message } = AntApp.useApp();
  const t = useT();
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [apiKey, setApiKey] = useState("");
  // Setup offers OpenAI; other providers are added in Settings.
  const openai = settings.providers?.find((p) => p.id === "openai");
  const hasEnv = openai?.keySource === "env";
  const [choice, setChoice] = useState<KeyChoice>(
    hasEnv ? "env" : settings.keychainAvailable ? "key" : "none",
  );
  const theme = themeChoice(settings.theme);
  const language = languageChoice(settings.language);
  const locale = matchLocale(settings.locale);
  const configured = !!openai?.keySource;

  const apply: Apply = async (action) => {
    try {
      onChange(await action());
      return true;
    } catch (e) {
      void message.error(errorText(e));
      return false;
    }
  };
  async function next() {
    if (step === 2 && choice === "key") {
      if (apiKey.trim()) {
        setWorking(true);
        const saved = await apply(() =>
          Editor.SaveProviderKey("openai", [apiKey]),
        );
        setWorking(false);
        if (!saved) return;
        setApiKey("");
      } else if (!openai?.keyStored) {
        void message.warning(t.welcome.needKey);
        return;
      }
    }
    setStep(Math.min(LAST, step + 1));
  }
  const finish = (action: string) =>
    void Editor.FinishSetup(action).catch((e) => message.error(errorText(e)));

  const summary = [
    {
      label: t.theme.label,
      value: themeOptions(t).find((o) => o.value === theme)!.label,
    },
    {
      label: t.language.label,
      value: locale ? LANGUAGE_NAMES[locale] : "",
    },
    {
      label: "FFmpeg",
      value: toolLabel(settings.ffmpeg, t),
      color: settings.ffmpeg.ready ? "green" : "orange",
    },
    {
      label: "yt-dlp",
      value: toolLabel(settings.ytdlp, t),
      color: settings.ytdlp.ready ? "green" : "orange",
    },
    {
      label: "OpenAI",
      value: configured ? t.common.configured : t.common.offlineOnly,
      color: configured ? "green" : "default",
    },
  ];

  return (
    <div
      className={`panel-window welcome${isMac ? " mac" : ""}${customChrome ? " custom-chrome" : ""}`}
    >
      {customChrome && <WindowControls minimise={false} />}
      <aside className="welcome-side">
        <div className="panel-drag" />
        <div className="welcome-brand">
          <div className="welcome-mark" aria-hidden="true">
            M
          </div>
          <div>
            <strong>Mousqueau</strong>
            <span>{t.welcome.tagline}</span>
          </div>
        </div>
        <Steps
          orientation="vertical"
          size="small"
          current={step}
          items={[
            { title: t.welcome.steps.welcome },
            { title: t.welcome.steps.tools },
            { title: "OpenAI", content: t.common.optional },
            { title: t.welcome.steps.done },
          ]}
        />
      </aside>

      <main className="welcome-main">
        <div className="welcome-body">
          {step === 0 && (
            <>
              <h1>{t.welcome.title}</h1>
              <p>{t.welcome.intro}</p>
              <div className="welcome-facts">
                {t.welcome.facts.map((fact) => (
                  <div key={fact}>
                    <IconCircleCheckFilled size={16} {...decorative} />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
              <div className="welcome-theme">
                <div className="set-label">
                  <strong>{t.language.label}</strong>
                  <span className="set-hint">
                    {language === "system" && locale
                      ? t.language.current(LANGUAGE_NAMES[locale])
                      : t.welcome.changeLater}
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
              <div className="welcome-theme">
                <div className="set-label">
                  <strong>{t.theme.label}</strong>
                  <span className="set-hint">
                    {theme === "system"
                      ? t.welcome.themeFollows(
                          osName,
                          systemDark ? t.theme.dark : t.theme.light,
                        )
                      : t.welcome.changeLater}
                  </span>
                </div>
                <Segmented
                  size="small"
                  options={themeOptions(t)}
                  value={theme}
                  onChange={(v) => void apply(() => Editor.SetTheme(v))}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>{t.welcome.toolsTitle}</h1>
              <p className="set-hint">
                {t.welcome.toolsSearched(toolSearch(t))}
              </p>
              <div className="set-card flat">
                <ToolRow
                  name="ffmpeg"
                  label="FFmpeg"
                  need={t.common.required}
                  missing={t.welcome.ffmpegMissing}
                  tool={settings.ffmpeg}
                  apply={apply}
                />
                <ToolRow
                  name="yt-dlp"
                  label="yt-dlp"
                  need={t.common.optional}
                  missing={t.welcome.ytdlpMissing}
                  tool={settings.ytdlp}
                  apply={apply}
                />
              </div>
              <p className="set-hint">{t.welcome.toolsLater}</p>
            </>
          )}

          {step === 2 && (
            <>
              <h1>{t.welcome.openaiTitle}</h1>
              <p>{t.welcome.openaiIntro}</p>
              <p className="set-hint">{t.welcome.otherProviders}</p>
              <Radio.Group
                vertical
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                options={[
                  {
                    label: t.welcome.useEnv(hasEnv),
                    value: "env",
                    disabled: !hasEnv,
                  },
                  {
                    label: t.welcome.enterKey,
                    value: "key",
                    disabled: !settings.keychainAvailable,
                  },
                  {
                    // Skipping never removes a key that is already in place.
                    label: configured
                      ? t.welcome.keepCurrent
                      : t.welcome.skipKey,
                    value: "none",
                  },
                ]}
              />
              {choice === "key" && (
                <>
                  <label className="field">
                    {t.settings.apiKey}
                    <Input.Password
                      size="small"
                      autoComplete="off"
                      disabled={working}
                      placeholder={
                        openai?.keyStored
                          ? t.welcome.keyKept(keyStore(t))
                          : "sk-…"
                      }
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onPressEnter={() => void next()}
                    />
                  </label>
                  <span className="set-hint">
                    {t.welcome.keyStorage(keyStoreName(t))}
                    {hasEnv && t.welcome.envStillWins}
                  </span>
                </>
              )}
            </>
          )}

          {step === LAST && (
            <>
              <h1>{t.welcome.doneTitle}</h1>
              <div className="set-card flat">
                {summary.map((row) => (
                  <div key={row.label} className="set-row">
                    <span>{row.label}</span>
                    {row.color ? (
                      <Tag color={row.color}>{row.value}</Tag>
                    ) : (
                      <span className="set-hint">{row.value}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="set-hint">
                {t.welcome.changeAnytime(isMac ? "⌘," : "Ctrl+,")}
              </p>
            </>
          )}
        </div>

        <div className="welcome-foot">
          {step < LAST && (
            <Button type="text" size="small" onClick={() => setStep(LAST)}>
              {t.welcome.skip}
            </Button>
          )}
          <div className="spacer" />
          {step > 0 && (
            <Button disabled={working} onClick={() => setStep(step - 1)}>
              {t.welcome.previous}
            </Button>
          )}
          {step < LAST ? (
            <Button
              type="primary"
              disabled={working}
              onClick={() => void next()}
            >
              {t.welcome.next}
            </Button>
          ) : (
            <>
              <Button onClick={() => finish("demo")}>
                {t.common.loadDemo}
              </Button>
              <Button type="primary" onClick={() => finish("srt")}>
                {t.common.importSrt}
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
