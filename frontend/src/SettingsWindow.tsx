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
import type {
  SettingsView,
  ToolStatus,
} from "../bindings/mousqueau/models";
import { ICON_PATHS, PathIcon } from "./icons";
import {
  SECTIONS,
  type SectionId,
  THEME_OPTIONS,
  formatChecked,
  matchSettings,
  themeChoice,
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
        <Tag color={tool.ready ? "green" : "orange"}>{toolLabel(tool)}</Tag>
      </div>
      <div className="set-line">
        <Input
          size="small"
          className="mono-input"
          aria-label={`${label} 位置`}
          placeholder="自动查找"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onPressEnter={commit}
        />
        <Button
          size="small"
          onClick={() => void apply(() => Editor.ChooseToolPath(name))}
        >
          选择…
        </Button>
        <Button
          size="small"
          onClick={() => void apply(() => Editor.SetToolPath(name, ""))}
        >
          自动检测
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
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>("general");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [justChecked, setJustChecked] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { rows, sections, any } = matchSettings(query);
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
      void message.success(`API 密钥已保存到${keyStore}。`);
    }
    setSaving(false);
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
      <nav className="set-side" aria-label="设置目录">
        <div className="panel-drag" />
        <Input
          size="small"
          allowClear
          placeholder="搜索设置"
          aria-label="搜索设置"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {SECTIONS.map((s) => {
          const on = s.id === active && sections[s.id];
          return (
            <a
              key={s.id}
              href={`#sec-${s.id}`}
              className={`side-item${on ? " on" : ""}${sections[s.id] ? "" : " dim"}`}
              aria-current={on ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                jump(s.id);
              }}
            >
              <PathIcon d={ICON_PATHS[s.id]} />
              {s.label}
            </a>
          );
        })}
      </nav>

      <main className="set-main">
        <div className="set-head">
          <h1>设置</h1>
          {customChrome && <WindowControls />}
        </div>
        <div className="set-scroll" ref={scroller} onScroll={onScroll}>
          {!any && (
            <div className="set-empty">没有与“{query}”匹配的设置。</div>
          )}

          {sections.general && (
            <section id="sec-general" data-sec="general">
              <h2>通用</h2>
              <div className="set-card">
                {rows.theme && (
                  <div className="set-row">
                    <div className="set-label">
                      <span>主题</span>
                      <span className="set-hint">
                        {theme === "system"
                          ? `随 ${osName} 外观自动切换。当前：${systemDark ? "深色" : "浅色"}。`
                          : `始终使用${dark ? "深色" : "浅色"}，不随 ${osName} 切换。`}
                      </span>
                    </div>
                    <Segmented
                      size="small"
                      options={THEME_OPTIONS}
                      value={theme}
                      onChange={(v) => void apply(() => Editor.SetTheme(v))}
                    />
                  </div>
                )}
                {rows.startup && (
                  <div className="set-row">
                    <span>启动时打开上次的项目</span>
                    <Switch
                      size="small"
                      aria-label="启动时打开上次的项目"
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
                      <span>初始设置</span>
                      <span className="set-hint">
                        重新检查外部工具与 OpenAI 配置。
                      </span>
                    </div>
                    <Button
                      size="small"
                      onClick={() => void Editor.OpenWelcome()}
                    >
                      重新运行初始设置
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {sections.tools && (
            <section id="sec-tools" data-sec="tools">
              <h2>外部工具</h2>
              {rows.ffmpeg && (
                <ToolCard
                  name="ffmpeg"
                  label="FFmpeg"
                  need="必需"
                  hint={`用于读取媒体与截取分析音频。留空时在 ${toolSearch} 中查找。`}
                  tool={settings.ffmpeg}
                  apply={apply}
                />
              )}
              {rows.ytdlp && (
                <ToolCard
                  name="yt-dlp"
                  label="yt-dlp"
                  need="可选"
                  hint="仅 YouTube 导入需要。下载不会自动上传到 OpenAI。"
                  tool={settings.ytdlp}
                  apply={apply}
                />
              )}
            </section>
          )}

          {sections.providers && (
            <section id="sec-providers" data-sec="providers">
              <h2>供应商</h2>
              {rows.provDefault && (
                <div className="set-card">
                  <div className="set-row">
                    <div className="set-label">
                      <span>分析使用</span>
                      <span className="set-hint">
                        音频转录建议与说话人分析都发给这里选的供应商。
                      </span>
                    </div>
                    <Select
                      size="small"
                      aria-label="分析使用的供应商"
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
                    <span className="set-hint">当前使用</span>
                    <div className="spacer" />
                    <Tag color={configured ? "green" : "default"}>
                      {configured ? "已配置" : "未配置"}
                    </Tag>
                  </div>
                  <div className="set-row">
                    <span>密钥来源</span>
                    <span className="set-hint">
                      {settings.keySource === "env" ? (
                        <>
                          环境变量 <span className="mono">OPENAI_API_KEY</span>
                        </>
                      ) : settings.keySource === "keychain" ? (
                        keyStoreName
                      ) : (
                        "未配置 · 可离线编辑"
                      )}
                    </span>
                  </div>
                  <div className="set-row set-field">
                    <label>
                      {settings.keyStored ? "替换 API 密钥" : "API 密钥"}
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
                          保存到{keyStore}
                        </Button>
                      </div>
                    </label>
                    <span className="set-hint">
                      {settings.keychainAvailable ? (
                        <>
                          设置了环境变量{" "}
                          <span className="mono">OPENAI_API_KEY</span>{" "}
                          时优先使用它。
                        </>
                      ) : (
                        <>
                          此平台不支持保存密钥；请设置环境变量{" "}
                          <span className="mono">OPENAI_API_KEY</span>。
                        </>
                      )}
                    </span>
                  </div>
                  <div className="set-row">
                    <span className="set-hint">移除后仍可离线编辑。</span>
                    <Popconfirm
                      title={`从${keyStore}移除 API 密钥？`}
                      okText="移除"
                      cancelText="取消"
                      onConfirm={() => void apply(Editor.RemoveAPIKey)}
                    >
                      <Button size="small" disabled={!settings.keyStored}>
                        移除密钥
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              )}
              {rows.provAdd && (
                <div className="set-card dashed">
                  <div className="set-row">
                    <span className="set-hint">目前仅支持 OpenAI。</span>
                    <Button size="small" disabled>
                      添加供应商
                    </Button>
                  </div>
                </div>
              )}
              <span className="set-hint">
                仅在你确认分析时，选定的音频会上传到所选供应商。
              </span>
            </section>
          )}

          {sections.updates && (
            <section id="sec-updates" data-sec="updates">
              <h2>更新</h2>
              <div className="set-card">
                <div className="set-row">
                  <div className="set-label">
                    <span>
                      当前版本 <span className="mono">{settings.version}</span>
                    </span>
                    <span className="set-hint set-status">
                      {checking ? (
                        <>
                          <Spin size="small" />
                          正在检查…
                        </>
                      ) : settings.updateVersion ? (
                        <>
                          <Tag color="blue">
                            有新版本 {settings.updateVersion}
                          </Tag>
                          <Button
                            type="link"
                            size="small"
                            onClick={() =>
                              void Editor.OpenReleasePage().catch((e) =>
                                message.error(String(e)),
                              )
                            }
                          >
                            前往下载页面
                          </Button>
                        </>
                      ) : justChecked ? (
                        <>
                          <Tag color="green">已是最新版本</Tag>
                          刚刚检查
                        </>
                      ) : (
                        formatChecked(settings.lastUpdateCheck)
                      )}
                    </span>
                  </div>
                  <Button
                    size="small"
                    disabled={checking}
                    onClick={() => void checkUpdate()}
                  >
                    检查更新
                  </Button>
                </div>
                <div className="set-row">
                  <span>自动检查更新</span>
                  <Switch
                    size="small"
                    aria-label="自动检查更新"
                    checked={settings.autoUpdate}
                    onChange={(v) => void apply(() => Editor.SetAutoUpdate(v))}
                  />
                </div>
                <div className="set-row">
                  <div className="set-label">
                    <span>接收测试版</span>
                    <span className="set-hint">
                      更早获得新功能，可能不稳定。
                    </span>
                  </div>
                  <Switch
                    size="small"
                    aria-label="接收测试版"
                    checked={settings.beta}
                    onChange={(v) => void apply(() => Editor.SetBeta(v))}
                  />
                </div>
              </div>
              <span className="set-hint">
                检查更新只连接 GitHub
                获取版本信息，不上传字幕或音频，也不会自动下载新版本。
              </span>
            </section>
          )}

          {/* lets the last section scroll to the top */}
          <div
            aria-hidden="true"
            style={{ height: query.trim() ? 24 : 230 }}
          />
        </div>
      </main>
    </div>
  );
}
