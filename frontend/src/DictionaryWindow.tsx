import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Switch,
  Tag,
} from "antd";
import {
  IconBook,
  IconDots,
  IconFileExport,
  IconFileImport,
  IconList,
  IconMessageCircle,
  IconPlus,
  IconTag,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { Events } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type {
  Entry,
  ImportPreview,
} from "../bindings/mousqueau/internal/dictionary/models";
import type { DictionaryView } from "../bindings/mousqueau/models";
import { errorText, useT } from "./i18n";
import IconButton from "./IconButton";
import { decorative } from "./icons";
import { customChrome, isMac } from "./useSettings";
import WindowControls from "./WindowControls";

const CATEGORIES = [
  "person",
  "nickname",
  "term",
  "catchphrase",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICONS = {
  all: IconList,
  person: IconUser,
  nickname: IconTag,
  term: IconBook,
  catchphrase: IconMessageCircle,
  other: IconDots,
};

const ACTION_COLORS: Record<string, string> = {
  add: "green",
  merge: "blue",
  conflict: "orange",
  skip: "default",
};

const SEPARATORS = [",", "，", "|"];

type Draft = {
  id?: string;
  canonical: string;
  category: string;
  variants: string[];
  misspellings: string[];
  original: string[];
  personId?: string;
  note: string;
  disabled: boolean;
  caseSensitive: boolean;
};

const emptyDraft = (): Draft => ({
  canonical: "",
  category: "person",
  variants: [],
  misspellings: [],
  original: [],
  note: "",
  disabled: false,
  caseSensitive: false,
});

const toDraft = (e: Entry): Draft => ({
  id: e.id,
  canonical: e.canonical,
  category: e.category,
  variants: e.variants ?? [],
  misspellings: e.misspellings ?? [],
  original: e.original ?? [],
  personId: e.personId || undefined,
  note: e.note ?? "",
  disabled: !!e.disabled,
  caseSensitive: !!e.caseSensitive,
});

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, personId: a.personId || undefined }) ===
  JSON.stringify({ ...b, personId: b.personId || undefined });

export default function DictionaryWindow() {
  const { message, modal } = AntApp.useApp();
  const t = useT();
  const [view, setView] = useState<DictionaryView | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  // The entry shown on the right and its working copy. A new entry has a
  // draft without an id.
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [replace, setReplace] = useState<string[]>([]);

  const entries = view?.entries ?? [];
  const readOnly = !!view?.readOnly;
  const stored = entries.find((e) => e.id === selected);
  const dirty =
    !!draft && (!draft.id || !stored || !sameDraft(draft, toDraft(stored)));

  const refresh = async () => {
    try {
      setView(await Editor.GetDictionary());
    } catch (e) {
      message.error(errorText(e));
    }
  };
  useEffect(() => {
    void refresh();
    return Events.On("dictionary", () => void refresh());
  }, []);

  // Follow changes made elsewhere (the editor adds entries too) unless the
  // shown entry has unsaved edits. Pick the first entry when nothing is shown.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!view) return;
    const list = view.entries ?? [];
    if (draft && !draft.id) return;
    const current = list.find((e) => e.id === selected);
    if (current) {
      if (!dirtyRef.current) setDraft(toDraft(current));
      return;
    }
    const first = list[0];
    setSelected(first?.id ?? null);
    setDraft(first ? toDraft(first) : null);
  }, [view]);

  const people = useMemo(
    () => entries.filter((e) => e.category === "person"),
    [view],
  );
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: entries.length };
    for (const e of entries) n[e.category] = (n[e.category] ?? 0) + 1;
    return n;
  }, [view]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      const hay = [
        e.canonical,
        e.note ?? "",
        ...(e.variants ?? []),
        ...(e.misspellings ?? []),
        ...(e.original ?? []),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [view, query, category]);

  const categoryName = (c: string) =>
    t.dictionary.categories[c as Category] ?? c;
  const personName = (id: string) =>
    people.find((p) => p.id === id)?.canonical ?? id;
  const summary = (e: Entry) => {
    if (e.misspellings?.length)
      return t.dictionary.misspelledAs(e.misspellings.join("、"));
    if (e.personId) return t.dictionary.refersToName(personName(e.personId));
    if (e.variants?.length)
      return t.dictionary.variantsAre(e.variants.join("、"));
    return "—";
  };

  // Leaving an entry with unsaved edits asks first.
  const leave = (go: () => void) => {
    if (!dirty) {
      go();
      return;
    }
    modal.confirm({
      title: t.dictionary.discardTitle,
      okText: t.dictionary.discard,
      okButtonProps: { danger: true },
      cancelText: t.dictionary.cancel,
      onOk: go,
    });
  };
  const show = (e: Entry) =>
    leave(() => {
      setSelected(e.id);
      setDraft(toDraft(e));
      setConfirmDelete(false);
    });
  const addNew = () =>
    leave(() => {
      setSelected(null);
      setDraft(emptyDraft());
      setCategory("all");
      setConfirmDelete(false);
    });
  const edit = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    try {
      const before = new Set(entries.map((e) => e.id));
      const next = await Editor.UpsertDictionaryEntry({
        id: draft.id ?? "",
        canonical: draft.canonical,
        category: draft.category,
        variants: draft.variants,
        misspellings: draft.misspellings,
        original: draft.original,
        personId: draft.personId || undefined,
        note: draft.note,
        disabled: draft.disabled,
        caseSensitive: draft.caseSensitive,
      });
      const saved =
        (next.entries ?? []).find((e) => e.id === draft.id) ??
        (next.entries ?? []).find((e) => !before.has(e.id));
      setSelected(saved?.id ?? null);
      setDraft(saved ? toDraft(saved) : null);
      setView(next);
      message.success(t.dictionary.saved);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const remove = async () => {
    if (!draft?.id) return;
    try {
      const next = await Editor.DeleteDictionaryEntry(draft.id);
      setSelected(null);
      setDraft(null);
      setConfirmDelete(false);
      setView(next);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const closeImport = () => {
    setPreview(null);
    setReplace([]);
  };

  const isNew = !!draft && !draft.id;
  const title = isNew
    ? t.dictionary.add
    : draft
      ? draft.canonical.trim() || t.dictionary.untitled
      : t.dictionary.title;
  const status = readOnly
    ? t.dictionary.readOnlyStatus
    : dirty
      ? t.dictionary.unsaved
      : "";

  return (
    <div
      className={`panel-window dictionary${isMac ? " mac" : ""}${customChrome ? " custom-chrome" : ""}`}
    >
      <nav className="set-side" aria-label={t.dictionary.categoriesLabel}>
        <div className="panel-drag" />
        <Input
          size="small"
          allowClear
          placeholder={t.dictionary.search}
          aria-label={t.dictionary.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(["all", ...CATEGORIES] as const).map((id) => {
          const CategoryIcon = CATEGORY_ICONS[id];
          const on = id === category;
          return (
            <button
              key={id}
              type="button"
              className={`side-item${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => setCategory(id)}
            >
              <CategoryIcon size={16} {...decorative} />
              <span className="dict-side-label">
                {id === "all" ? t.dictionary.categoryAll : categoryName(id)}
              </span>
              <span className="dict-side-count">{counts[id] ?? 0}</span>
            </button>
          );
        })}
        <div className="spacer" />
        <p className="dict-local">{t.dictionary.localOnly}</p>
      </nav>

      <section className="dict-list" aria-label={t.dictionary.entriesLabel}>
        <div className="set-head dict-head">
          <h1>{t.dictionary.title}</h1>
          <div className="spacer" />
          <Button
            type="text"
            size="small"
            icon={<IconFileImport size={16} {...decorative} />}
            aria-label={t.dictionary.importJson}
            title={t.dictionary.importJson}
            disabled={readOnly}
            onClick={() =>
              void Editor.PreviewDictionaryImport()
                .then(setPreview)
                .catch((e) => message.error(errorText(e)))
            }
          />
          <Button
            type="text"
            size="small"
            icon={<IconFileExport size={16} {...decorative} />}
            aria-label={t.dictionary.exportJson}
            title={t.dictionary.exportJson}
            onClick={() =>
              void Editor.ExportDictionary()
                .then((p) => {
                  if (p) void message.success(t.dictionary.exported(p));
                })
                .catch((e) => message.error(errorText(e)))
            }
          />
          <Button
            type="text"
            size="small"
            icon={<IconPlus size={16} {...decorative} />}
            aria-label={t.dictionary.add}
            title={t.dictionary.add}
            disabled={readOnly}
            onClick={addNew}
          />
        </div>
        <div className="dict-rows">
          {rows.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`dict-row${e.id === selected ? " on" : ""}${e.disabled ? " off" : ""}`}
              aria-current={e.id === selected ? "true" : undefined}
              onClick={() => show(e)}
            >
              <span className="dict-row-head">
                <strong>{e.canonical}</strong>
                {e.disabled && <span>{t.dictionary.disabled}</span>}
                <span>{categoryName(e.category)}</span>
              </span>
              <span className="dict-row-sub">{summary(e)}</span>
            </button>
          ))}
          {view && rows.length === 0 && (
            <div className="set-empty">{t.dictionary.noMatch}</div>
          )}
        </div>
      </section>

      <main className="set-main">
        <div className="set-head dict-head">
          <h1>{title}</h1>
          <div className="spacer" />
          {status && <span className="set-hint">{status}</span>}
          {customChrome && <WindowControls />}
        </div>
        {readOnly && (
          <Alert
            className="dict-alert"
            type="error"
            showIcon
            message={t.dictionary.readOnly}
            description={view?.error || undefined}
          />
        )}
        {draft ? (
          <>
            <div className="dict-detail">
              <div className="set-card">
                <label className="set-row">
                  <span>{t.dictionary.canonical}</span>
                  <Input
                    size="small"
                    className="dict-canonical"
                    value={draft.canonical}
                    disabled={readOnly}
                    placeholder={t.dictionary.canonicalPlaceholder}
                    onChange={(e) => edit({ canonical: e.target.value })}
                  />
                </label>
                <div className="set-row">
                  <span>{t.dictionary.category}</span>
                  <Select
                    size="small"
                    className="dict-select"
                    aria-label={t.dictionary.category}
                    disabled={readOnly}
                    value={draft.category}
                    onChange={(category) => edit({ category })}
                    options={CATEGORIES.map((c) => ({
                      value: c,
                      label: categoryName(c),
                    }))}
                  />
                </div>
                {draft.category === "nickname" && (
                  <div className="set-row">
                    <div className="set-label">
                      <span>{t.dictionary.refersTo}</span>
                      <span className="set-hint">
                        {t.dictionary.refersToHint}
                      </span>
                    </div>
                    <Select
                      size="small"
                      allowClear
                      className="dict-select"
                      aria-label={t.dictionary.refersTo}
                      placeholder={t.dictionary.pickPerson}
                      disabled={readOnly}
                      value={draft.personId || undefined}
                      onChange={(personId) => edit({ personId })}
                      options={people.map((p) => ({
                        value: p.id,
                        label: p.canonical,
                      }))}
                    />
                  </div>
                )}
              </div>

              <div className="set-card">
                <div className="set-row set-field">
                  <span className="ink">{t.dictionary.misspellings}</span>
                  <Select
                    mode="tags"
                    size="small"
                    open={false}
                    aria-label={t.dictionary.misspellings}
                    placeholder={t.dictionary.tagsPlaceholder}
                    disabled={readOnly}
                    tokenSeparators={SEPARATORS}
                    value={draft.misspellings}
                    onChange={(misspellings) => edit({ misspellings })}
                  />
                  <span className="set-hint">
                    {t.dictionary.misspellingsHint}
                  </span>
                </div>
                <div className="set-row set-field">
                  <span className="ink">{t.dictionary.variants}</span>
                  <Select
                    mode="tags"
                    size="small"
                    open={false}
                    aria-label={t.dictionary.variants}
                    placeholder={t.dictionary.tagsPlaceholder}
                    disabled={readOnly}
                    tokenSeparators={SEPARATORS}
                    value={draft.variants}
                    onChange={(variants) => edit({ variants })}
                  />
                  <span className="set-hint">{t.dictionary.variantsHint}</span>
                </div>
                <div className="set-row set-field">
                  <span className="ink">{t.dictionary.original}</span>
                  <Select
                    mode="tags"
                    size="small"
                    open={false}
                    aria-label={t.dictionary.original}
                    placeholder={t.dictionary.originalPlaceholder}
                    disabled={readOnly}
                    tokenSeparators={SEPARATORS}
                    value={draft.original}
                    onChange={(original) => edit({ original })}
                  />
                </div>
              </div>

              <div className="set-card">
                <div className="set-row">
                  <div className="set-label">
                    <span>{t.dictionary.caseSensitive}</span>
                    <span className="set-hint">
                      {t.dictionary.caseSensitiveHint}
                    </span>
                  </div>
                  <Switch
                    size="small"
                    aria-label={t.dictionary.caseSensitive}
                    disabled={readOnly}
                    checked={draft.caseSensitive}
                    onChange={(caseSensitive) => edit({ caseSensitive })}
                  />
                </div>
                <div className="set-row">
                  <div className="set-label">
                    <span>{t.dictionary.disable}</span>
                    <span className="set-hint">{t.dictionary.disableHint}</span>
                  </div>
                  <Switch
                    size="small"
                    aria-label={t.dictionary.disable}
                    disabled={readOnly}
                    checked={draft.disabled}
                    onChange={(disabled) => edit({ disabled })}
                  />
                </div>
                <label className="set-row set-field">
                  <span className="ink">{t.dictionary.note}</span>
                  <Input.TextArea
                    rows={2}
                    disabled={readOnly}
                    value={draft.note}
                    onChange={(e) => edit({ note: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="dict-foot">
              {draft.id &&
                (confirmDelete ? (
                  <>
                    <span>{t.dictionary.deleteConfirm}</span>
                    <Button size="small" onClick={() => setConfirmDelete(false)}>
                      {t.dictionary.cancel}
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      danger
                      onClick={() => void remove()}
                    >
                      {t.dictionary.delete}
                    </Button>
                  </>
                ) : (
                  <IconButton
                    size="small"
                    type="text"
                    danger
                    label={t.dictionary.deleteEntry}
                    disabled={readOnly}
                    onClick={() => setConfirmDelete(true)}
                    icon={<IconTrash size={16} {...decorative} />}
                  />
                ))}
              <div className="spacer" />
              <Button
                size="small"
                disabled={readOnly || !dirty || isNew}
                onClick={() => stored && setDraft(toDraft(stored))}
              >
                {t.dictionary.revert}
              </Button>
              <Button
                size="small"
                type="primary"
                disabled={readOnly || !dirty || !draft.canonical.trim()}
                onClick={() => void save()}
              >
                {t.dictionary.save}
              </Button>
            </div>
          </>
        ) : (
          view && <div className="dict-none">{t.dictionary.nothingSelected}</div>
        )}
      </main>

      <Modal
        className="dict-import"
        title={t.dictionary.importPreview}
        open={!!preview}
        width={460}
        style={{ top: 52 }}
        onCancel={closeImport}
        cancelText={t.dictionary.cancel}
        okText={t.dictionary.applyImport}
        onOk={() =>
          void Editor.ApplyDictionaryImport(replace)
            .then((next) => {
              setView(next);
              closeImport();
              message.success(t.dictionary.imported);
            })
            .catch((e) => message.error(errorText(e)))
        }
      >
        {preview && (
          <>
            <p className="set-hint">
              {t.dictionary.previewSummary(
                preview.add,
                preview.merge,
                preview.conflict,
                preview.skip,
              )}
            </p>
            <div className="set-card dict-import-list">
              {(preview.actions ?? []).map((a, i) => (
                <div className="set-row set-line" key={i}>
                  <Tag color={ACTION_COLORS[a.action]}>
                    {a.action === "add"
                      ? t.dictionary.actionAdd
                      : a.action === "merge"
                        ? t.dictionary.actionMerge
                        : a.action === "conflict"
                          ? t.dictionary.actionConflict
                          : t.dictionary.actionSkip}
                  </Tag>
                  <div className="set-label">
                    <strong>{a.incoming.canonical}</strong>
                    <span className="set-hint">
                      {a.conflictReason || categoryName(a.incoming.category)}
                    </span>
                  </div>
                  {a.action === "conflict" && a.existingId && (
                    <Checkbox
                      checked={replace.includes(a.existingId)}
                      onChange={() => {
                        const id = a.existingId!;
                        setReplace((r) =>
                          r.includes(id)
                            ? r.filter((x) => x !== id)
                            : [...r, id],
                        );
                      }}
                    >
                      {t.dictionary.replaceExisting}
                    </Checkbox>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
