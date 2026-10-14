import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App as AntApp,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { Events } from "@wailsio/runtime";
import * as Editor from "../bindings/mousqueau/editorservice";
import type {
  Entry,
  ImportPreview,
} from "../bindings/mousqueau/internal/dictionary/models";
import type { DictionaryView } from "../bindings/mousqueau/models";
import { errorText, useT } from "./i18n";
import { customChrome, isMac } from "./useSettings";
import WindowControls from "./WindowControls";

const CATEGORIES = [
  "person",
  "nickname",
  "term",
  "catchphrase",
  "other",
] as const;

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

export default function DictionaryWindow() {
  const { message } = AntApp.useApp();
  const t = useT();
  const [view, setView] = useState<DictionaryView | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [replace, setReplace] = useState<string[]>([]);

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

  const people = useMemo(
    () => (view?.entries ?? []).filter((e) => e.category === "person"),
    [view],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (view?.entries ?? []).filter((e) => {
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

  const save = async () => {
    if (!draft) return;
    try {
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
      setView(next);
      setDraft(null);
      message.success(t.dictionary.saved);
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const openEdit = (e?: Entry) => {
    if (!e) {
      setDraft(emptyDraft());
      return;
    }
    setDraft({
      id: e.id,
      canonical: e.canonical,
      category: e.category,
      variants: e.variants ?? [],
      misspellings: e.misspellings ?? [],
      original: e.original ?? [],
      personId: e.personId,
      note: e.note ?? "",
      disabled: !!e.disabled,
      caseSensitive: !!e.caseSensitive,
    });
  };

  return (
    <div
      className={`settings-window dict-window${isMac ? " mac" : ""}${customChrome ? " custom-chrome" : ""}`}
    >
      <header className="set-head titlebar" data-wails-drag>
        <div className="set-title">
          <strong>{t.dictionary.title}</strong>
          <span className="muted small">
            {t.dictionary.count(view?.entries?.length ?? 0)}
          </span>
        </div>
        <div className="spacer" />
        {customChrome && <WindowControls />}
      </header>
      <div className="dict-toolbar">
        <Input.Search
          allowClear
          placeholder={t.dictionary.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <Select
          value={category}
          onChange={setCategory}
          style={{ width: 140 }}
          options={[
            { value: "all", label: t.dictionary.categoryAll },
            ...CATEGORIES.map((c) => ({
              value: c,
              label: t.dictionary.categories[c],
            })),
          ]}
        />
        <div className="spacer" />
        <Button
          disabled={!!view?.readOnly}
          onClick={() => void Editor.PreviewDictionaryImport().then(setPreview).catch((e) => message.error(errorText(e)))}
        >
          {t.dictionary.importJson}
        </Button>
        <Button
          onClick={() =>
            void Editor.ExportDictionary()
              .then((p) => {
                if (p) void message.success(t.dictionary.exported(p));
              })
              .catch((e) => message.error(errorText(e)))
          }
        >
          {t.dictionary.exportJson}
        </Button>
        <Button
          type="primary"
          disabled={!!view?.readOnly}
          onClick={() => openEdit()}
        >
          {t.dictionary.add}
        </Button>
      </div>
      {view?.readOnly && (
        <Alert
          type="error"
          showIcon
          style={{ margin: "0 16px 8px" }}
          message={t.dictionary.readOnly}
          description={view.error || undefined}
        />
      )}
      <div className="dict-body">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={rows}
          onRow={(record) => ({
            onClick: () => openEdit(record),
          })}
          columns={[
            {
              title: t.dictionary.canonical,
              dataIndex: "canonical",
              render: (v: string, r: Entry) => (
                <Space size={4}>
                  <span>{v}</span>
                  {r.disabled && <Tag>{t.dictionary.disabled}</Tag>}
                </Space>
              ),
            },
            {
              title: t.dictionary.category,
              dataIndex: "category",
              width: 100,
              render: (c: string) =>
                t.dictionary.categories[
                  c as keyof typeof t.dictionary.categories
                ] ?? c,
            },
            {
              title: t.dictionary.variants,
              dataIndex: "variants",
              render: (v: string[] | null) => (v ?? []).join("、") || "—",
            },
            {
              title: t.dictionary.misspellings,
              dataIndex: "misspellings",
              render: (v: string[] | null) => (v ?? []).join("、") || "—",
            },
            {
              title: t.dictionary.refersTo,
              key: "person",
              width: 120,
              render: (_: unknown, r: Entry) => {
                if (!r.personId) return "—";
                return (
                  people.find((p) => p.id === r.personId)?.canonical ??
                  r.personId
                );
              },
            },
            {
              title: t.dictionary.note,
              dataIndex: "note",
              ellipsis: true,
              render: (v: string | undefined) => v || "—",
            },
          ]}
        />
      </div>
      <Drawer
        title={draft?.id ? t.dictionary.edit : t.dictionary.add}
        open={!!draft}
        onClose={() => setDraft(null)}
        width={400}
        destroyOnClose
        extra={
          <Space>
            {draft?.id && (
              <Popconfirm
                title={t.dictionary.deleteConfirm}
                disabled={!!view?.readOnly}
                onConfirm={() =>
                  void Editor.DeleteDictionaryEntry(draft.id!)
                    .then((next) => {
                      setView(next);
                      setDraft(null);
                    })
                    .catch((e) => message.error(errorText(e)))
                }
              >
                <Button danger disabled={!!view?.readOnly}>
                  {t.dictionary.delete}
                </Button>
              </Popconfirm>
            )}
            <Button
              type="primary"
              disabled={!!view?.readOnly || !draft?.canonical.trim()}
              onClick={() => void save()}
            >
              {t.dictionary.save}
            </Button>
          </Space>
        }
      >
        {draft && (
          <Form layout="vertical" size="small">
            <Form.Item label={t.dictionary.canonical} required>
              <Input
                value={draft.canonical}
                onChange={(e) =>
                  setDraft({ ...draft, canonical: e.target.value })
                }
              />
            </Form.Item>
            <Form.Item label={t.dictionary.category}>
              <Select
                value={draft.category}
                onChange={(category) => setDraft({ ...draft, category })}
                options={CATEGORIES.map((c) => ({
                  value: c,
                  label: t.dictionary.categories[c],
                }))}
              />
            </Form.Item>
            <Form.Item label={t.dictionary.variants} extra={t.dictionary.variantsHint}>
              <Select
                mode="tags"
                value={draft.variants}
                onChange={(variants) => setDraft({ ...draft, variants })}
                tokenSeparators={[",", "，", "|"]}
                open={false}
              />
            </Form.Item>
            <Form.Item
              label={t.dictionary.misspellings}
              extra={t.dictionary.misspellingsHint}
            >
              <Select
                mode="tags"
                value={draft.misspellings}
                onChange={(misspellings) =>
                  setDraft({ ...draft, misspellings })
                }
                tokenSeparators={[",", "，", "|"]}
                open={false}
              />
            </Form.Item>
            <Form.Item label={t.dictionary.original}>
              <Select
                mode="tags"
                value={draft.original}
                onChange={(original) => setDraft({ ...draft, original })}
                tokenSeparators={[",", "，", "|"]}
                open={false}
              />
            </Form.Item>
            {draft.category === "nickname" && (
              <Form.Item label={t.dictionary.refersTo}>
                <Select
                  allowClear
                  value={draft.personId || undefined}
                  onChange={(personId) => setDraft({ ...draft, personId })}
                  options={people.map((p) => ({
                    value: p.id,
                    label: p.canonical,
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item label={t.dictionary.note}>
              <Input.TextArea
                rows={2}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </Form.Item>
          </Form>
        )}
      </Drawer>
      <Modal
        title={t.dictionary.importPreview}
        open={!!preview}
        onCancel={() => {
          setPreview(null);
          setReplace([]);
        }}
        onOk={() =>
          void Editor.ApplyDictionaryImport(replace)
            .then((next) => {
              setView(next);
              setPreview(null);
              setReplace([]);
              message.success(t.dictionary.imported);
            })
            .catch((e) => message.error(errorText(e)))
        }
        okText={t.dictionary.applyImport}
        width={640}
      >
        {preview && (
          <>
            <p className="muted">
              {t.dictionary.previewSummary(
                preview.add,
                preview.merge,
                preview.conflict,
                preview.skip,
              )}
            </p>
            <ul className="dict-preview-list">
              {(preview.actions ?? []).map((a, i) => (
                <li key={i}>
                  <Tag>
                    {a.action === "add"
                      ? t.dictionary.actionAdd
                      : a.action === "merge"
                        ? t.dictionary.actionMerge
                        : a.action === "conflict"
                          ? t.dictionary.actionConflict
                          : t.dictionary.actionSkip}
                  </Tag>
                  {a.incoming.canonical}
                  {a.action === "conflict" && a.existingId && (
                    <Button
                      size="small"
                      type={
                        replace.includes(a.existingId) ? "primary" : "default"
                      }
                      onClick={() => {
                        const id = a.existingId!;
                        setReplace((r) =>
                          r.includes(id) ? r.filter((x) => x !== id) : [...r, id],
                        );
                      }}
                    >
                      {t.dictionary.replaceExisting}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  );
}
