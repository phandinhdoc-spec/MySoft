import {StandardizePreviewBox} from "./StandardizePreview";
import type {StandardizeReply} from "@pvta/shared";
import { useEffect, useMemo, useState } from "react";
import type { ChatMeta, ClientMessage, OfficeHost, ProjectMeta, WorkspaceState } from "@pvta/shared";
import type { Strings } from "./i18n";
import { addFiles, type AddResult } from "./files";
import { env } from "./platform";

interface Props {
  standardized: StandardizeReply | null;
  t: Strings;
  host: OfficeHost;
  ws: WorkspaceState;
  send(m: ClientMessage): boolean;
  /** Mở hội thoại; không id = hội thoại mới (trong dự án nếu có). */
  onOpen(id?: string, projectId?: string): void;
  onClose(): void;
  /** Kết quả thêm tệp gần nhất, và cách báo. */
  note: string | null;
  onNote(n: string | null): void;
  noteOf(r: AddResult): string;
  /** OCR cho PDF scan (qua bridge). */
  ocr?: (file: File) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
}

const NO_PROJECT = "__none";

function ago(ts: number, now: number, t: Strings): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return t.ws.justNow;
  if (m < 60) return `${m}′`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(ts).toLocaleDateString();
}

/** Ngăn "Hội thoại & dự án": hội thoại gom theo dự án; quy tắc chung và quy tắc từng dự án; liên kết giữa các ứng dụng. */
export function SessionsDrawer({ standardized, t, host, ws, send, onOpen, onClose, note, onNote, noteOf, ocr }: Props) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rulesFor, setRulesFor] = useState<string | null>(null); // "__global" hoặc mã dự án
  const [rulesDraft, setRulesDraft] = useState("");
  const [newProject, setNewProject] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(null), 3000); // hai lần bấm phải liền nhau
    return () => clearTimeout(id);
  }, [confirm]);

  // Không liên kết: chỉ hội thoại của ứng dụng này (hội thoại đang mở luôn hiện).
  const chats = useMemo(() => ws.chats.filter((c) => ws.link || c.host === host || c.id === ws.active), [ws.chats, ws.link, host, ws.active]);
  const byProject = (pid: string | undefined) => chats.filter((c) => (c.projectId ?? NO_PROJECT) === (pid ?? NO_PROJECT));

  const openRules = (key: string, current: string) => {
    setRulesFor(key);
    setRulesDraft(current);
  };
  const saveRules = () => {
    if (rulesFor === "__global") send({ type: "ws_rules", rules: rulesDraft });
    else if (rulesFor) send({ type: "ws_project", project: { id: rulesFor, rules: rulesDraft } });
    setRulesFor(null);
  };
  const del = (key: string, run: () => void) => {
    if (confirm === key) {
      setConfirm(null);
      run();
    } else setConfirm(key);
  };

  const pick = async (pid: string, list: FileList | null, folder: boolean) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    onNote(t.ws.reading);
    onNote(noteOf(await addFiles(files, { scope: "project", id: pid }, send, { folder, onProgress: onNote, ocr })));
  };

  const chatRow = (c: ChatMeta) => (
    <li key={c.id} className={`ws-chat${c.id === ws.active ? " on" : ""}`}>
      {editing === c.id ? (
        <form
          className="ws-edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) send({ type: "ws_rename", id: c.id, title: draft });
            setEditing(null);
          }}
        >
          <input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label={t.ws.rename} />
          <button type="submit" className="link">{t.ws.save}</button>
        </form>
      ) : (
        <>
          <button
            className="ws-main"
            onClick={() => {
              onOpen(c.id);
              onClose();
            }}
            title={c.digest ? `${c.title}\n\n${c.digest}` : c.title}
          >
            {ws.link && <span className={`ws-host h-${c.host}`}>{t.ws.hostTag[c.host]}</span>}
            <span className="ws-title">{c.title}</span>
            <span className="ws-time">{ago(c.updatedAt, now, t)}</span>
          </button>
          <select
            className="ws-move"
            aria-label={t.ws.moveTo}
            title={t.ws.moveTo}
            value={c.projectId ?? NO_PROJECT}
            onChange={(e) => send({ type: "ws_move", id: c.id, projectId: e.target.value === NO_PROJECT ? null : e.target.value })}
          >
            <option value={NO_PROJECT}>{t.ws.noProject}</option>
            {ws.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            className="icon sm"
            aria-label={t.ws.rename}
            title={t.ws.rename}
            onClick={() => {
              setEditing(c.id);
              setDraft(c.title);
            }}
          >
            ✎
          </button>
          <button
            className={`icon sm${confirm === c.id ? " danger" : ""}`}
            aria-label={t.ws.del}
            title={confirm === c.id ? t.ws.delConfirm : t.ws.del}
            onClick={() => del(c.id, () => send({ type: "ws_delete", id: c.id }))}
          >
            {confirm === c.id ? "✓" : "🗑"}
          </button>
        </>
      )}
    </li>
  );

  const group = (p: ProjectMeta | null) => {
    const list = byProject(p?.id);
    return (
      <section key={p?.id ?? NO_PROJECT} className="ws-group">
        <header>
          <span className="ws-gname">{p ? `📁 ${p.name}` : t.ws.noProject}</span>
          {p && (
            <>
              <button className="icon sm" aria-label={t.ws.rules} title={`${t.ws.rules}${p.rules ? ` · ${t.ws.rulesHas}` : ""}`} onClick={() => openRules(p.id, p.rules)}>
                {p.rules ? "📏" : "✎"}
              </button>
              <button
                className={`icon sm${confirm === p.id ? " danger" : ""}`}
                aria-label={t.ws.delProject}
                title={confirm === p.id ? t.ws.delConfirm : t.ws.delProject}
                onClick={() => del(p.id, () => send({ type: "ws_project_delete", id: p.id }))}
              >
                {confirm === p.id ? "✓" : "🗑"}
              </button>
            </>
          )}
          <button
            className="icon sm"
            aria-label={p ? t.ws.newInProject : t.ws.newChat}
            title={p ? t.ws.newInProject : t.ws.newChat}
            onClick={() => {
              onOpen(undefined, p?.id);
              onClose();
            }}
          >
            ＋
          </button>
        </header>
        {p && <p className="sub ws-mem">{list.filter((c) => c.digest).length ? t.ws.memory(list.filter((c) => c.digest).length) : t.ws.memoryNone}</p>}
        {p && (
          <div className="ws-files">
            <span className="sub">{(ws.projectFiles[p.id] ?? []).length ? t.ws.projectFiles((ws.projectFiles[p.id] ?? []).length) : t.ws.projectFilesNone}</span>
            <ul className="ws-filelist">
              {(ws.projectFiles[p.id] ?? []).map((f) => (
                <li key={f.name}>
                  <span className="ws-fname" title={`${f.name} · ${f.chars.toLocaleString()}`}>{f.name}</span>
                  <button className="icon sm" aria-label={`${t.ws.removeFile}: ${f.name}`} title={t.ws.removeFile} onClick={() => send({ type: "file_remove", scope: "project", id: p.id, name: f.name })}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <div className="ws-file-actions">
              <label className="link-btn">
                📎 {t.ws.addFiles}
                <input type="file" multiple hidden accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.html,.htm,.tex,.srt,.yaml,.yml,.docx,.xlsx,.pptx,.pdf" onChange={(e) => { const l = e.target.files; void pick(p.id, l, false).then(() => (e.target.value = "")); }} />
              </label>
              {/* Safari trên iPad không cho chọn cả thư mục. */}
              {!env.ipad && <label className="link-btn">
                📂 {t.ws.addFolder}
                <input
                  type="file"
                  hidden
                  multiple
                  // @ts-expect-error webkitdirectory chưa có trong kiểu React
                  webkitdirectory=""
                  onChange={(e) => { const l = e.target.files; void pick(p.id, l, true).then(() => (e.target.value = "")); }}
                />
              </label>}
            </div>
          </div>
        )}
        {list.length ? <ul>{list.map(chatRow)}</ul> : p ? <p className="sub ws-empty">{t.ws.emptyProject}</p> : null}
      </section>
    );
  };

  const rulesTitle = rulesFor === "__global" ? t.ws.rulesGlobal : ws.projects.find((p) => p.id === rulesFor)?.name;

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={t.ws.title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{t.ws.title}</h2>
          <button
            className={`icon${ws.link ? " on" : ""}`}
            aria-pressed={ws.link}
            aria-label={t.ws.link}
            title={ws.link ? t.ws.linkOn : t.ws.linkOff}
            onClick={() => send({ type: "ws_link", link: !ws.link })}
          >
            🔗
          </button>
          <button className="icon" aria-label={t.ws.rulesGlobal} title={t.ws.rulesGlobal} onClick={() => openRules("__global", ws.globalRules)}>
            {ws.globalRules ? "📏" : "✎"}
          </button>
          <button className="icon" aria-label={t.ws.newProject} title={t.ws.newProject} onClick={() => setNewProject(true)}>
            📁
          </button>
          <button className="icon" aria-label={t.close} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          {newProject && (
            <form
              className="ws-edit"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) send({ type: "ws_project", project: { name: draft } });
                setNewProject(false);
                setDraft("");
              }}
            >
              <input autoFocus placeholder={t.ws.projectName} value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} aria-label={t.ws.projectName} />
              <button type="submit" className="link">{t.ws.save}</button>
            </form>
          )}
          {rulesFor && (
            <div className="ws-rules">
              <strong>{t.ws.rules}: {rulesTitle}</strong>
              <p className="sub">{rulesFor === "__global" ? t.ws.rulesGlobalHint : t.ws.rulesProjectHint}</p>
              <textarea rows={4} maxLength={2000} value={rulesDraft} onChange={(e) => setRulesDraft(e.target.value)} aria-label={t.ws.rules} />
              <StandardizePreviewBox key={rulesFor} kind="rule" text={rulesDraft} reply={standardized} send={send} onApply={setRulesDraft}/>
              {rulesFor === "__global" && ws.chatRules && (ws.chatRules.text.trim() || ws.chatRules.rules.length > 0) && (
                <details className="ws-chat-rules">
                  <summary>
                    {t.nb.chatRules} · {ws.chatRules.rules.length + (ws.chatRules.text.trim() ? 1 : 0)}
                  </summary>
                  <p className="sub">{t.nb.chatRulesHint}</p>
                  {ws.chatRules.text.trim() && <p className="sub" style={{ whiteSpace: "pre-wrap" }}>{ws.chatRules.text}</p>}
                  <ul>
                    {ws.chatRules.rules.map((r) => (
                      <li key={r.key}>
                        <code>#{r.key}</code> <strong>{r.title}</strong>
                        {r.always ? ` (${t.nb.always})` : ""}: {r.text}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="sub">Lưu giữ nguyên nội dung. Chỉ chuẩn hóa khi bấm nút và chọn dùng bản mới.</p>
              <div className="ws-rules-actions">
                <button className="link" onClick={() => setRulesFor(null)}>{t.close}</button>
                <button className="primary" onClick={saveRules}>{t.ws.save}</button>
              </div>
            </div>
          )}
          {note && (
            <p className="sub ws-note" role="status" onClick={() => onNote(null)} title={t.close}>
              {note}
            </p>
          )}
          {ws.projects.map((p) => group(p))}
          {group(null)}
          {chats.length === 0 && ws.projects.length === 0 && <p className="sub ws-empty">{t.ws.empty}</p>}
        </div>
      </div>
    </div>
  );
}
