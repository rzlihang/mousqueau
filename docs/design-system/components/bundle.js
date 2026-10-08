/* @ds-bundle: {"format":4,"namespace":"Mousqueau","components":[{"name":"Provider"},{"name":"AppHeader"},{"name":"ThemeToggle"},{"name":"StatusBar"},{"name":"Panel"},{"name":"MediaPlaceholder"},{"name":"Timecode"},{"name":"SpeakerTag"},{"name":"CueCard"},{"name":"CueEditor"},{"name":"SpeakerManager"},{"name":"DiffText"},{"name":"SuggestionCard"}]} */
/* Hand-written from frontend/src/App.tsx and frontend/src/editor.ts (Mousqueau v0.1).
   Classic script: reads window.React and window.antd (Ant Design 5.29.3), assigns window.Mousqueau. */
(function () {
  var React = window.React;
  var antd = window.antd;
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var SPEAKER_COLORS = ["#1677ff", "#52c41a", "#d46b08"];
  var THEME_TOKEN = { colorPrimary: "#2867c7", borderRadius: 6 };
  // Contrast fixes this system makes on top of the app theme (text 4.5:1 or better).
  var LIGHT_FIXES = { colorError: "#cf1322", green7: "#237804", orange7: "#ad4e00", gold7: "#995b00" };
  var DARK_FIXES = { colorError: "#ff7875" }; // darkAlgorithm derives #dc6966

  function themeConfig(dark) {
    return {
      algorithm: dark ? antd.theme.darkAlgorithm : antd.theme.defaultAlgorithm,
      token: Object.assign({}, THEME_TOKEN, dark ? DARK_FIXES : LIGHT_FIXES),
    };
  }

  function pad(n, w) {
    return String(n).padStart(w, "0");
  }
  function formatTime(value) {
    var ms = Math.max(0, Math.round((value || 0) * 1000));
    return (
      pad(Math.floor(ms / 3600000), 2) + ":" +
      pad(Math.floor(ms / 60000) % 60, 2) + ":" +
      pad(Math.floor(ms / 1000) % 60, 2) + "," +
      pad(ms % 1000, 3)
    );
  }
  function parseTime(value) {
    var m = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(String(value).trim());
    if (!m || +m[2] > 59 || +m[3] > 59)
      throw new Error("请输入 HH:MM:SS,mmm，分与秒须为 00–59。");
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
  }

  // Character diff (LCS), shaped like the diff package's diffChars output.
  function diffChars(a, b) {
    var x = Array.from(a || ""), y = Array.from(b || "");
    var n = x.length, m = y.length, i, j;
    var t = [];
    for (i = 0; i <= n; i++) t.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--)
      for (j = m - 1; j >= 0; j--)
        t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    var out = [];
    function push(value, kind) {
      var last = out[out.length - 1];
      if (last && !!last.added === (kind === "added") && !!last.removed === (kind === "removed")) last.value += value;
      else out.push({ value: value, added: kind === "added", removed: kind === "removed" });
    }
    i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { push(x[i], ""); i++; j++; }
      else if (t[i + 1][j] >= t[i][j + 1]) { push(x[i], "removed"); i++; }
      else { push(y[j], "added"); j++; }
    }
    while (i < n) push(x[i++], "removed");
    while (j < m) push(y[j++], "added");
    return out;
  }

  function useDocumentDark() {
    var root = document.documentElement;
    var s = useState(root.getAttribute("data-theme") === "dark");
    useEffect(function () {
      var o = new MutationObserver(function () {
        s[1](root.getAttribute("data-theme") === "dark");
      });
      o.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
      return function () { o.disconnect(); };
    }, []);
    return s[0];
  }

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(" ");
  }
  function findSpeaker(speakers, id) {
    return (speakers || []).find(function (s) { return s.id === id; });
  }

  function Provider(props) {
    var docDark = useDocumentDark();
    var dark = props.dark == null ? docDark : props.dark;
    return h(
      antd.ConfigProvider,
      { button: { autoInsertSpace: false }, theme: themeConfig(dark) },
      h(antd.App, null,
        h("div", { className: cx("shell", props.className), "data-theme": dark ? "dark" : "light", style: props.style }, props.children))
    );
  }

  function AppHeader(props) {
    return h("header", { className: "app-header" },
      h("div", null,
        h("strong", null, props.title || "Mousqueau"),
        h("span", { className: "subtitle" }, props.subtitle == null ? "字幕校正 · 说话人辨识" : props.subtitle)),
      props.actions ? h(antd.Space, { wrap: true }, props.actions) : null,
      props.children);
  }

  function ThemeToggle(props) {
    return h("div", { className: "theme-toggle", style: props.style },
      h("span", null, props.label || "深色"),
      h(antd.Switch, { size: "small", checked: !!props.checked, onChange: props.onChange, "aria-label": props.label || "深色" }));
  }

  function StatusBar(props) {
    return h("div", { className: "statusbar" },
      h(antd.Space, { wrap: true }, props.children),
      props.busy ? h(antd.Space, null,
        h(antd.Spin, { size: "small" }),
        h("span", null, props.phase || "处理中…"),
        h(antd.Button, { danger: true, size: "small", onClick: props.onCancel }, "取消处理")) : null);
  }

  function Panel(props) {
    var title = h("h2", null, props.title,
      props.count != null ? h(React.Fragment, null, " ", h("span", { className: "muted" }, props.count)) : null);
    return h("section", { className: cx("panel", props.className), style: props.style },
      props.extra ? h("div", { className: "section-heading" }, title, props.extra) : title,
      props.children);
  }

  function MediaPlaceholder(props) {
    return h("div", { className: "video-placeholder" },
      h(antd.Empty, { description: props.description || "导入本机视频或音频" }));
  }

  function Timecode(props) {
    return h("div", { className: "clock" }, formatTime(props.seconds));
  }

  function SpeakerTag(props) {
    var s = props.speaker;
    if (!s) return h(antd.Tag, null, "Unknown");
    return h(antd.Tag, { color: s.color || "default" }, s.name || s.id);
  }

  function SpeakerTags(ids, speakers) {
    if (!ids || !ids.length) return h(SpeakerTag, null);
    return ids.map(function (id) {
      return h(SpeakerTag, { key: id, speaker: findSpeaker(speakers, id) || { id: id, name: id, color: "default" } });
    });
  }

  function CueCard(props) {
    var c = props.cue;
    return h("button", {
      type: "button",
      disabled: props.disabled,
      className: cx("cue", props.selected && "selected", props.playing && "playing"),
      onClick: props.onClick,
    },
      h("div", { className: "cue-meta" },
        h("span", null, "#" + c.identifier + " · " + formatTime(c.start) + " → " + formatTime(c.end)),
        c.review ? h(antd.Tag, { color: "orange" }, "待复核") : null),
      h("div", { className: "cue-text" }, c.text),
      h("div", null, SpeakerTags(c.speakerIds, props.speakers)));
  }

  function draftOf(c) {
    return { text: c.text, start: formatTime(c.start), end: formatTime(c.end), speakerIds: c.speakerIds || [], review: !!c.review };
  }

  function CueEditor(props) {
    var c = props.cue;
    var app = antd.App.useApp();
    var ds = useState(draftOf(c)), draft = ds[0], setDraft = ds[1];
    var dd = useState(!!props.dirty), dirty = dd[0], setDirty = dd[1];
    var busy = !!props.busy;
    var prev = React.useRef(c);
    useEffect(function () {
      if (prev.current === c) return;
      prev.current = c;
      setDraft(draftOf(c));
      setDirty(false);
    }, [c]);
    function change(patch) { setDraft(Object.assign({}, draft, patch)); setDirty(true); }
    function apply() {
      try {
        var edited = Object.assign({}, c, { text: draft.text, start: parseTime(draft.start), end: parseTime(draft.end), speakerIds: draft.speakerIds, review: draft.review });
        if (edited.end <= edited.start) throw new Error("结束时间必须晚于开始时间。");
        if (props.onApply) props.onApply(edited);
        setDirty(false);
      } catch (e) {
        app.message.error(String(e.message || e));
      }
    }
    var options = (props.speakers || []).map(function (s) { return { value: s.id, label: s.name }; });
    return h("div", { className: "cue-editor" },
      h("div", { className: "section-heading" },
        h("h3", null, "编辑 #" + c.identifier),
        dirty ? h(antd.Tag, { color: "gold" }, "尚未套用") : null),
      h("div", { className: "time-fields" },
        h("label", null, "开始", h(antd.Input, { disabled: busy, value: draft.start, onChange: function (e) { change({ start: e.target.value }); } })),
        h("label", null, "结束", h(antd.Input, { disabled: busy, value: draft.end, onChange: function (e) { change({ end: e.target.value }); } }))),
      h(antd.Input.TextArea, { disabled: busy, rows: 3, value: draft.text, onChange: function (e) { change({ text: e.target.value }); } }),
      h(antd.Select, { mode: "multiple", disabled: busy, style: { width: "100%" }, placeholder: "Unknown · 未指派说话人", value: draft.speakerIds, options: options, onChange: function (v) { change({ speakerIds: v }); } }),
      h(antd.Space, { wrap: true },
        h(antd.Checkbox, { disabled: busy, checked: draft.review, onChange: function (e) { change({ review: e.target.checked }); } }, "需要复核"),
        h(antd.Button, { type: "primary", disabled: busy || !dirty, onClick: apply }, "套用编辑"),
        h(antd.Button, { disabled: busy || !dirty, onClick: function () { setDraft(draftOf(c)); setDirty(false); } }, "放弃未套用修改")));
  }

  function SpeakerManager(props) {
    var speakers = props.speakers || [];
    var busy = !!props.busy;
    var si = useState("A"), id = si[0], setId = si[1];
    var sn = useState(""), name = sn[0], setName = sn[1];
    return h(React.Fragment, null,
      h("h2", null, "说话人管理"),
      h("p", { className: "muted" }, "不同分析范围的标签独立编号，可手动命名与指派。"),
      h("div", { className: "speaker-list" }, speakers.map(function (s) {
        return h("div", { key: s.id },
          h(antd.Tag, { color: s.color }, s.name),
          h(antd.Button, { size: "small", type: "text", disabled: busy, onClick: function () { setId(s.id); setName(s.name); } }, "编辑名称"));
      })),
      h("div", { className: "speaker-form" },
        h(antd.Input, { "aria-label": "说话人 ID", disabled: busy, value: id, onChange: function (e) { setId(e.target.value); }, placeholder: "说话人 ID（A / B / C）" }),
        h(antd.Input, { "aria-label": "显示名称", disabled: busy, value: name, onChange: function (e) { setName(e.target.value); }, placeholder: "显示名称，例如：主持人" }),
        h(antd.Button, {
          disabled: busy || !id.trim() || !name.trim(),
          onClick: function () {
            var existing = findSpeaker(speakers, id);
            if (props.onSave) props.onSave({ id: id.trim(), name: name.trim(), color: existing ? existing.color : SPEAKER_COLORS[speakers.length % SPEAKER_COLORS.length] });
          },
        }, "保存说话人")));
  }

  function DiffText(props) {
    var parts = diffChars(props.original, props.proposed);
    var proposed = props.side === "proposed";
    return h("p", null, parts
      .filter(function (d) { return proposed ? !d.removed : !d.added; })
      .map(function (d, i) {
        return h("span", { key: i, className: proposed ? (d.added ? "added" : "") : (d.removed ? "removed" : "") }, d.value);
      }));
  }

  function statusLabel(s) {
    if (s.status !== "pending") return s.status === "accepted" ? "已接受" : "已拒绝";
    return s.review ? "需人工复核" : "待确认";
  }

  function SuggestionCard(props) {
    var s = props.suggestion;
    var locked = !!props.busy || s.status !== "pending" || !!props.draftDirty;
    return h("article", { className: cx("suggestion", s.status) },
      h("div", { className: "section-heading" },
        h("strong", null, "字幕 #" + s.cueIdentifier),
        h(antd.Tag, { color: s.review ? "orange" : "blue" }, statusLabel(s))),
      h("div", { className: "comparison" },
        h("div", null, h("label", null, "分析时原文"), h(DiffText, { original: s.original, proposed: s.proposed, side: "original" })),
        h("div", null, h("label", null, "音频转录建议"), h(DiffText, { original: s.original, proposed: s.proposed, side: "proposed" }))),
      h("div", null, (s.speakerIds || []).map(function (id) {
        var sp = findSpeaker(props.speakers, id);
        return h(antd.Tag, { key: id, color: sp && sp.color }, (sp && sp.name) || id);
      })),
      h("p", { className: "muted" }, s.review
        ? "多人、重叠或跨句／范围边界：请对照音频确认文字与时间。"
        : "以音频转录为依据，请确认忠实度与繁体用字。"),
      h(antd.Space, null,
        h(antd.Button, { disabled: locked, type: "primary", onClick: props.onAccept }, s.review ? "确认后接受" : "接受"),
        h(antd.Button, { disabled: locked, onClick: props.onReject }, "拒绝"),
        h(antd.Button, { disabled: !!props.busy, onClick: props.onLocate }, "定位字幕")));
  }

  window.Mousqueau = Object.assign(window.Mousqueau || {}, {
    Provider: Provider,
    AppHeader: AppHeader,
    ThemeToggle: ThemeToggle,
    StatusBar: StatusBar,
    Panel: Panel,
    MediaPlaceholder: MediaPlaceholder,
    Timecode: Timecode,
    SpeakerTag: SpeakerTag,
    CueCard: CueCard,
    CueEditor: CueEditor,
    SpeakerManager: SpeakerManager,
    DiffText: DiffText,
    SuggestionCard: SuggestionCard,
    themeConfig: themeConfig,
    formatTime: formatTime,
    parseTime: parseTime,
    diffChars: diffChars,
    SPEAKER_COLORS: SPEAKER_COLORS,
  });
})();
