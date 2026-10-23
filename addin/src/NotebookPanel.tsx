import { useCallback, useEffect, useRef, useState } from "react";
import type { Strings } from "./i18n";
import type { NbClient, NotebookBrief, NotebookFull } from "./nbClient";
import { openUrl } from "./util";

/** Sổ nguồn trong add-in: dùng chung dữ liệu với PVTA Chat. Sổ bật «Dùng trong chat» thì AI của add-in tra cứu được. */
export function NotebookPanel({ t, nb, onClose }: { t: Strings; nb: NbClient; onClose(): void }) {
  const [list, setList] = useState<NotebookBrief[] | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [open, setOpen] = useState<NotebookFull | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const openId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const L = t.nb;

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const refresh = useCallback(async () => {
    try {
      const [l, k] = await Promise.all([nb.call<NotebookBrief[]>("nb.list"), nb.call<string[]>("nb.links")]);
      setList(l);
      setLinks(k);
      if (openId.current) setOpen(await nb.call<NotebookFull>("nb.get", { id: openId.current }).catch(() => null));
    } catch (e) {
      fail(e);
    }
  }, [nb]);

  useEffect(() => {
    void refresh();
    return nb.onChanged(() => void refresh());
  }, [nb, refresh]);

  // Nguồn đang đọc: hỏi lại định kỳ để thấy trạng thái mới nếu thông báo bị lỡ.
  const reading = open?.sources.some((s) => s.state === "dang-doc");
  useEffect(() => {
    if (!reading) return;
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [reading, refresh]);

  const run = async (label: string, job: () => Promise<unknown>) => {
    setError("");
    setBusy(label);
    try {
      await job();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
      void refresh();
    }
  };

  const openBook = (id: string) => {
    openId.current = id;
    setOpen(null);
    void refresh();
  };
  const closeBook = () => {
    openId.current = null;
    setOpen(null);
    setQuestion("");
  };
  const toggleLink = (id: string) => run(L.link, () => nb.call("nb.setLinks", { ids: links.includes(id) ? links.filter((x) => x !== id) : [...links, id] }));

  const addFiles = (files: FileList | null) => {
    if (!files?.length || !open) return;
    const book = open.id;
    const picked = [...files];
    void run(L.uploading, async () => {
      const problems: string[] = [];
      for (const f of picked) {
        setBusy(`${L.uploading} ${f.name}…`);
        const r = await nb.upload<{ errors?: string[] }>(f, { purpose: "notebook", nb: book }).catch((e: Error) => ({ errors: [`${f.name}: ${e.message}`] }));
        problems.push(...(r.errors ?? []));
      }
      if (problems.length) throw new Error(problems.join("\n"));
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  const ask = () => {
    const q = question.trim();
    if (!q || !open) return;
    setQuestion("");
    void run(L.asking, () => nb.call("nb.ask", { id: open.id, question: q }));
  };

  const stateText = (s: NotebookFull["sources"][number]) => (s.state === "dang-doc" ? L.reading : s.state === "loi" ? `${L.failed}: ${s.error ?? ""}` : `${s.chars.toLocaleString("vi-VN")} ${L.chars}`);

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={L.title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          {open && (
            <button className="icon" aria-label={L.back} onClick={closeBook}>
              ‹
            </button>
          )}
          <h2>{open ? open.name : L.title}</h2>
          <button className="icon" aria-label={t.close} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          {error && (
            <div className="error" role="alert" style={{ whiteSpace: "pre-wrap" }}>
              {error}
            </div>
          )}
          {busy && (
            <div className="optbar" role="status">
              {busy}
            </div>
          )}

          {!open && (
            <>
              <p className="sub">{L.hint}</p>
              <form
                className="ws-new"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = name.trim();
                  if (!n) return;
                  setName("");
                  void run(L.create, async () => {
                    const b = await nb.call<NotebookFull>("nb.create", { name: n });
                    openBook(b.id);
                  });
                }}
              >
                <input placeholder={L.namePh} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label={L.namePh} />
                <button type="submit" className="link">
                  {L.create}
                </button>
              </form>
              {list && list.length === 0 && <p className="sub ws-empty">{L.empty}</p>}
              <ul className="sk-list">
                {(list ?? []).map((b) => (
                  <li key={b.id} className="sk-item">
                    <label title={L.linkHint}>
                      <input type="checkbox" checked={links.includes(b.id)} onChange={() => void toggleLink(b.id)} aria-label={`${L.link}: ${b.name}`} />
                    </label>
                    <button className="link" style={{ flex: 1, textAlign: "left" }} onClick={() => openBook(b.id)}>
                      <span className="opt-name">{b.name}</span> <span className="opt-hint">· {L.sourceCount(b.sources)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {links.length > 0 && <p className="sub">{L.linkedNote(links.length)}</p>}
            </>
          )}

          {open && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label className="opt-hint" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={links.includes(open.id)} onChange={() => void toggleLink(open.id)} /> {L.link}
                </label>
                <button
                  className="link"
                  onClick={() => {
                    const n = window.prompt(L.rename, open.name)?.trim();
                    if (n) void run(L.rename, () => nb.call("nb.rename", { id: open.id, name: n }));
                  }}
                >
                  {L.rename}
                </button>
                <button
                  className="link"
                  onClick={() => {
                    if (window.confirm(L.confirmDelete)) void run(L.delete, async () => (await nb.call("nb.remove", { id: open.id }), closeBook()));
                  }}
                >
                  {L.delete}
                </button>
              </div>

              <strong>{L.sources}</strong>
              {open.sources.length === 0 && <p className="sub">{L.noSources}</p>}
              <ul className="sk-list">
                {open.sources.map((s) => (
                  <li key={s.id} className={s.state === "loi" ? "sk-item bad" : "sk-item"}>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.on}
                        disabled={s.state !== "san-sang"}
                        onChange={(e) => void run(L.sources, () => nb.call("nb.toggle", { id: open.id, sid: s.id, on: e.target.checked }))}
                      />
                      <span className="opt-main">
                        <span className="opt-name">{s.title}</span>
                        <span className="opt-hint">{[stateText(s), s.note].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                    <button className="icon sm" aria-label={`${L.remove}: ${s.title}`} onClick={() => void run(L.remove, () => nb.call("nb.removeSource", { id: open.id, sid: s.id }))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.pptx,.md,.txt,.csv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.mkv,.webm" onChange={(e) => addFiles(e.target.files)} />
                <button className="link" disabled={!!busy} onClick={() => fileInput.current?.click()}>
                  📎 {L.addFile}
                </button>
              </div>
              <form
                style={{ display: "flex", gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const u = url.trim();
                  if (!u) return;
                  setUrl("");
                  void run(L.addUrl, () => nb.call("nb.addUrl", { id: open.id, url: u }));
                }}
              >
                <input style={{ flex: 1 }} placeholder={L.urlPh} value={url} onChange={(e) => setUrl(e.target.value)} aria-label={L.urlPh} />
                <button type="submit" className="link" disabled={!!busy}>
                  {L.addUrl}
                </button>
              </form>

              <strong>{L.askTitle}</strong>
              {open.messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "msg user" : "msg"} style={{ whiteSpace: "pre-wrap" }}>
                  {m.text}
                  {m.role === "assistant" && m.grounded === false && <p className="sub">{L.notGrounded}</p>}
                  {m.citations?.map((c) => (
                    <p key={c.n} className="sub">
                      [{c.n}] {c.title} · {c.ref}
                      {c.url && (
                        <>
                          {" "}
                          <button className="link" onClick={() => openUrl(c.url!)}>
                            {L.openLink}
                          </button>
                        </>
                      )}
                    </p>
                  ))}
                </div>
              ))}
              <form
                style={{ display: "flex", gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <input style={{ flex: 1 }} placeholder={L.askPh} value={question} maxLength={4000} onChange={(e) => setQuestion(e.target.value)} aria-label={L.askPh} />
                <button type="submit" className="primary" disabled={!!busy || !question.trim()}>
                  {L.ask}
                </button>
              </form>
              {open.messages.length > 0 && (
                <button className="link" onClick={() => void run(L.clear, () => nb.call("nb.clear", { id: open.id }))}>
                  {L.clear}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
