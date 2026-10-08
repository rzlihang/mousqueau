import { useState } from "react";
import {
  App as AntApp,
  Button,
  Input,
  Radio,
  Segmented,
  Steps,
  Tag,
} from "antd";
import * as Editor from "../bindings/mousqueau/editorservice";
import type {
  SettingsView,
  ToolStatus,
} from "../bindings/mousqueau/models";
import { ICON_PATHS, PathIcon } from "./icons";
import { THEME_OPTIONS, themeChoice, toolLabel } from "./preferences";
import { isMac, osName } from "./useSettings";

type Props = {
  settings: SettingsView;
  onChange: (view: SettingsView) => void;
  systemDark: boolean;
};
type Apply = (action: () => Promise<SettingsView>) => Promise<boolean>;
type KeyChoice = "env" | "key" | "none";

const FACTS = [
  "文件保留在本机。",
  "仅在你确认分析时，才上传选定的音频。",
  "未配置 OpenAI 也能离线编辑。",
];
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
  const choose = (
    <Button
      size="small"
      onClick={() => void apply(() => Editor.ChooseToolPath(name))}
    >
      选择…
    </Button>
  );
  return (
    <div className="welcome-tool">
      <div className="set-line">
        <strong>{label}</strong>
        <span className="set-hint">{need}</span>
        <div className="spacer" />
        <Tag color={tool.ready ? "green" : "orange"}>{toolLabel(tool)}</Tag>
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
                在 <span className="mono ink">{tool.path}</span>{" "}
                找不到可执行文件。
              </>
            ) : (
              <>
                {missing}可用 Homebrew 安装：
                <span className="mono ink">brew install {name}</span>
              </>
            )}
          </span>
          <div className="set-line end">
            {choose}
            <Button
              size="small"
              onClick={() => void apply(() => Editor.SetToolPath(name, ""))}
            >
              重新检测
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
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const hasEnv = settings.keySource === "env";
  const [choice, setChoice] = useState<KeyChoice>(
    hasEnv ? "env" : settings.keychainAvailable ? "key" : "none",
  );
  const theme = themeChoice(settings.theme);
  const configured = settings.keySource !== "";

  const apply: Apply = async (action) => {
    try {
      onChange(await action());
      return true;
    } catch (e) {
      void message.error(String(e));
      return false;
    }
  };
  async function next() {
    if (step === 2 && choice === "key") {
      if (apiKey.trim()) {
        setWorking(true);
        const saved = await apply(() => Editor.SaveAPIKey(apiKey));
        setWorking(false);
        if (!saved) return;
        setApiKey("");
      } else if (!settings.keyStored) {
        void message.warning("请输入 API 密钥，或选择暂不配置。");
        return;
      }
    }
    setStep(Math.min(LAST, step + 1));
  }
  const finish = (action: string) =>
    void Editor.FinishSetup(action).catch((e) => message.error(String(e)));

  const summary = [
    {
      label: "主题",
      value: THEME_OPTIONS.find((o) => o.value === theme)!.label,
    },
    {
      label: "FFmpeg",
      value: toolLabel(settings.ffmpeg),
      color: settings.ffmpeg.ready ? "green" : "orange",
    },
    {
      label: "yt-dlp",
      value: toolLabel(settings.ytdlp),
      color: settings.ytdlp.ready ? "green" : "orange",
    },
    {
      label: "OpenAI",
      value: configured ? "已配置" : "未配置 · 可离线编辑",
      color: configured ? "green" : "default",
    },
  ];

  return (
    <div className={`panel-window welcome${isMac ? " mac" : ""}`}>
      <aside className="welcome-side">
        <div className="panel-drag" />
        <div className="welcome-brand">
          <div className="welcome-mark" aria-hidden="true">
            M
          </div>
          <div>
            <strong>Mousqueau</strong>
            <span>字幕校正 · 说话人辨识</span>
          </div>
        </div>
        <Steps
          orientation="vertical"
          size="small"
          current={step}
          items={[
            { title: "欢迎" },
            { title: "外部工具" },
            { title: "OpenAI", content: "可选" },
            { title: "完成" },
          ]}
        />
      </aside>

      <main className="welcome-main">
        <div className="welcome-body">
          {step === 0 && (
            <>
              <h1>开始之前，先做几项设置</h1>
              <p>
                Mousqueau 对照音频校正现有的 SRT
                字幕，并复核说话人。接下来会检查外部工具，并可选配置 OpenAI。
              </p>
              <div className="welcome-facts">
                {FACTS.map((fact) => (
                  <div key={fact}>
                    <PathIcon d={ICON_PATHS.check} />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
              <div className="welcome-theme">
                <div className="set-label">
                  <strong>主题</strong>
                  <span className="set-hint">
                    {theme === "system"
                      ? `跟随 ${osName} 的外观。当前：${systemDark ? "深色" : "浅色"}`
                      : "之后可在设置中更改。"}
                  </span>
                </div>
                <Segmented
                  size="small"
                  options={THEME_OPTIONS}
                  value={theme}
                  onChange={(v) => void apply(() => Editor.SetTheme(v))}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>检查外部工具</h1>
              <p className="set-hint">
                已在 PATH、Homebrew 与 /usr/local/bin 中查找。
              </p>
              <div className="set-card flat">
                <ToolRow
                  name="ffmpeg"
                  label="FFmpeg"
                  need="必需"
                  missing="读取媒体与分析音频需要。"
                  tool={settings.ffmpeg}
                  apply={apply}
                />
                <ToolRow
                  name="yt-dlp"
                  label="yt-dlp"
                  need="可选"
                  missing="仅 YouTube 导入需要。"
                  tool={settings.ytdlp}
                  apply={apply}
                />
              </div>
              <p className="set-hint">之后可在 设置 › 外部工具 中更改位置。</p>
            </>
          )}

          {step === 2 && (
            <>
              <h1>配置 OpenAI（可选）</h1>
              <p>
                用于音频转录建议与说话人分析。仅在你确认分析时，选定的音频会上传到
                OpenAI。
              </p>
              <Radio.Group
                vertical
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                options={[
                  {
                    label: `使用环境变量 OPENAI_API_KEY（${hasEnv ? "已检测到" : "未检测到"}）`,
                    value: "env",
                    disabled: !hasEnv,
                  },
                  {
                    label: "输入 API 密钥",
                    value: "key",
                    disabled: !settings.keychainAvailable,
                  },
                  {
                    // Skipping never removes a key that is already in place.
                    label: configured
                      ? "保持现有配置，不做更改"
                      : "暂不配置，仅离线编辑",
                    value: "none",
                  },
                ]}
              />
              {choice === "key" && (
                <>
                  <label className="field">
                    API 密钥
                    <Input.Password
                      size="small"
                      autoComplete="off"
                      disabled={working}
                      placeholder={
                        settings.keyStored
                          ? "已保存在钥匙串，留空则保持不变"
                          : "sk-…"
                      }
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onPressEnter={() => void next()}
                    />
                  </label>
                  <span className="set-hint">
                    密钥保存在 macOS 钥匙串，不写入项目文件。
                    {hasEnv && "已设置的环境变量仍会优先使用。"}
                  </span>
                </>
              )}
            </>
          )}

          {step === LAST && (
            <>
              <h1>设置完成</h1>
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
                这些设置之后都能在 设置（{isMac ? "⌘," : "Ctrl+,"}）中修改。
              </p>
            </>
          )}
        </div>

        <div className="welcome-foot">
          {step < LAST && (
            <Button type="text" size="small" onClick={() => setStep(LAST)}>
              跳过设置
            </Button>
          )}
          <div className="spacer" />
          {step > 0 && (
            <Button disabled={working} onClick={() => setStep(step - 1)}>
              上一步
            </Button>
          )}
          {step < LAST ? (
            <Button
              type="primary"
              disabled={working}
              onClick={() => void next()}
            >
              继续
            </Button>
          ) : (
            <>
              <Button onClick={() => finish("demo")}>载入示例</Button>
              <Button type="primary" onClick={() => finish("srt")}>
                导入 SRT
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
