import { useCallback, useEffect, useRef, useState } from "react";
import { WRITE_ADDS, WRITE_FROM_CURSOR, type ModelCatalog, type WritingMode, type ClientMessage, type Effort, type ModelChoice, type OfficeHost, type ServerMessage, type WriteAction } from "@pvta/shared";
import type { Strings } from "./i18n";
import { Markdown, plainText } from "./Markdown";
import { modelLabel } from "./models";
import { applyText, onSelectionChanged, readSelection, type Selection } from "./office/selection";
import { copyText } from "./util";

interface Props {
  t: Strings;
  host: OfficeHost;
  online: boolean;
  readOnly: boolean;
  model: ModelChoice | "auto";
  catalog?: ModelCatalog;
  effort: Effort | undefined;
  mode: WritingMode;
  temperature: number | null;
  send(m: ClientMessage): boolean;
  /** App chuyển cho thẻ này các tin của lượt viết đang chạy. */
  register(id: string, fn: (m: ServerMessage) => void): void;
  /** Khởi động sẵn CLI cho lượt viết kế tiếp. */
  prewarm(): void;
  onSetup(): void;
}

interface Job {
  id: string;
  action: WriteAction;
  option?: string;
  text: string;
  context?: string;
  out: string;
  final?: string;
  running: boolean;
  error?: { message: string; missing: boolean };
  model?: ModelChoice;
  ms?: number;
  notes?: string[];
  applied?: "replace" | "after" | "copy";
}

const VI_CHARS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

/** Thẻ Viết: chế độ gợi ý viết trên phần đang chọn, kết quả xem trước rồi mới ghi vào tài liệu. */
export function WritePanel({ t, host, online, readOnly, model, catalog, effort, mode, temperature, send, register, prewarm, onSetup }: Props) {
  const [sel, setSel] = useState<Selection | null>(null);
  const [grade, setGrade] = useState(() => {
    try {
      return localStorage.getItem("pvta-grade") ?? "7";
    } catch {
      return "7";
    }
  });
  const [custom, setCustom] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Khởi động sẵn khi mở thẻ, khi đổi model / chế độ, và sau mỗi lượt: lượt sau trả lời nhanh hơn.
  const running = job?.running === true;
  useEffect(() => {
    if (online && !running) prewarm();
  }, [online, running, prewarm]);

  const refresh = useCallback(() => {
    readSelection(host)
      .then(setSel)
      .catch(() => setSel({ text: "" }));
  }, [host]);

  // Chế độ gợi ý viết: phần đang chọn được cập nhật ngay khi thầy cô chọn chỗ khác.
  useEffect(() => {
    refresh();
    const off = onSelectionChanged(() => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, 250);
    });
    return () => {
      off();
      window.clearTimeout(timer.current);
    };
  }, [refresh]);

  const run = (action: WriteAction, option?: string, src?: { text: string; context?: string }) => {
    const text = src?.text ?? sel?.text ?? "";
    const before = src ? src.context : sel?.before;
    const fromCursor = WRITE_FROM_CURSOR.includes(action) && host === "word";
    if (!text.trim() && !fromCursor) return;
    if (action === "translate") option = VI_CHARS.test(text) ? "en" : "vi";
    const id = crypto.randomUUID();
    const j: Job = { id, action, option, text, context: before, out: "", running: true };
    register(id, (m) => {
      setJob((cur) => {
        if (!cur || cur.id !== id) return cur;
        switch (m.type) {
          case "text_delta":
            return { ...cur, out: cur.out + m.text };
          case "write_result":
            return { ...cur, final: m.text };
          case "model_used":
            return { ...cur, model: m.model };
          case "done":
            return { ...cur, running: false, ms: m.timings.totalMs, notes: m.notes };
          case "error":
            return { ...cur, running: false, error: { message: m.message, missing: m.kind === "missing" } };
          default:
            return cur;
        }
      });
    });
    const ok = send({ type: "write", id, action, option, text, context: fromCursor || action === "continue" ? before : undefined, model, effort, mode, temperature });
    if (!ok) return;
    setJob({ ...j, model: model === "auto" ? undefined : model });
  };

  const result = job ? (job.final ?? job.out) : "";
  const apply = async (mode: "replace" | "after" | "copy") => {
    if (!job || !result) return;
    const plain = plainText(result);
    try {
      if (mode === "copy") {
        if (!(await copyText(plain))) return;
      } else await applyText(host, plain, mode);
    } catch (e) {
      setJob({ ...job, error: { message: e instanceof Error ? e.message : String(e), missing: false } });
      return;
    }
    send({ type: "write_feedback", action: job.action, applied: mode, option: job.option });
    setJob({ ...job, applied: mode });
    setFlash(mode === "replace" ? t.w.replaced : mode === "after" ? t.w.added : t.copied);
    window.setTimeout(() => setFlash(null), 1500);
    if (mode !== "copy") refresh();
  };

  const text = sel?.text ?? "";
  const hasText = !!text.trim();
  const tooMany = !!sel?.cells && !hasText && sel.cells.rows * sel.cells.cols > 400;
  const disabled = !online || job?.running === true;
  const btn = (a: WriteAction, label = t.w.labels[a]!, option?: string) => {
    const need = !(WRITE_FROM_CURSOR.includes(a) && host === "word");
    return (
      <button key={a} className="tool-btn" disabled={disabled || (need && !hasText)} onClick={() => run(a, option)}>
        {label}
      </button>
    );
  };
  const adds = job ? WRITE_ADDS.includes(job.action) : false;

  return (
    <div className="panel">
      <section className="selbox" aria-live="polite">
        <div className="selbox-head">
          <span className="selbox-label">{t.w.selected}</span>
          {hasText && <span className="opt-hint">{t.w.chars(text.length)}</span>}
          <span className="spacer" />
          <button className="icon" title={t.w.refresh} aria-label={t.w.refresh} onClick={refresh}>
            ↻
          </button>
        </div>
        {hasText ? (
          <p className="selbox-text">{text.length > 400 ? `${text.slice(0, 400)}…` : text}</p>
        ) : (
          <p className="opt-hint">{tooMany ? t.w.tooMany(sel!.cells!.rows, sel!.cells!.cols) : host === "word" ? t.w.nothingWord : t.w.nothing}</p>
        )}
      </section>

      <section className="tool-group">
        <h3>{t.w.groupFix}</h3>
        <div className="tool-grid">
          {btn("fix")}
          {btn("shorter")}
          {btn("longer")}
          {btn("formal")}
        </div>
      </section>
      <section className="tool-group">
        <h3>{t.w.groupStudent}</h3>
        <div className="tool-grid">
          <span className="tool-combo">
            <button className="tool-btn" disabled={disabled || !hasText} onClick={() => run("simpler", grade)}>
              {t.w.labels.simpler} · {t.w.grade}
            </button>
            <select
              aria-label={t.w.grade}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                try {
                  localStorage.setItem("pvta-grade", e.target.value);
                } catch {
                  /* bỏ qua */
                }
              }}
            >
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </span>
          {btn("questions")}
          {btn("summary")}
        </div>
      </section>
      <section className="tool-group">
        <h3>{t.w.groupMore}</h3>
        <div className="tool-grid">
          {btn("continue")}
          {btn("ideas")}
          {btn("translate")}
        </div>
        <form
          className="custom-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) run("custom", custom.trim());
          }}
        >
          <input value={custom} placeholder={t.w.custom} onChange={(e) => setCustom(e.target.value)} />
          <button type="submit" className="small" disabled={disabled || !hasText || !custom.trim()}>
            {t.w.run}
          </button>
        </form>
      </section>

      {job && (
        <section className="result" aria-live="polite">
          <div className="result-head">
            <strong>{t.w.labels[job.action]}</strong>
            {job.model && <span className="opt-hint">{modelLabel(job.model, catalog)}</span>}
            {job.ms !== undefined && <span className="opt-hint">{(job.ms / 1000).toFixed(1)}s</span>}
          </div>
          {result ? <Markdown text={result} /> : job.running && <div className="working">{t.thinking}</div>}
          {!job.running && job.notes?.map((n) => (
            <p key={n} className="note">{n}</p>
          ))}
          {job.error && (
            <div className={job.error.missing ? "notice" : "error"} role="alert">
              <span>{job.error.message}</span>
              {job.error.missing && (
                <button className="link" onClick={onSetup}>
                  {t.openSettings}
                </button>
              )}
            </div>
          )}
          <div className="row">
            {job.running ? (
              <button onClick={() => send({ type: "cancel", id: job.id })}>{t.stop}</button>
            ) : (
              result && (
                <>
                  {host === "word" && adds ? (
                    <button className="primary" onClick={() => apply("after")}>
                      {t.w.after}
                    </button>
                  ) : (
                    <button className="primary" onClick={() => apply("replace")}>
                      {t.w.replace}
                    </button>
                  )}
                  {host === "word" && !adds && <button onClick={() => apply("after")}>{t.w.after}</button>}
                  <button onClick={() => apply("copy")}>{t.copy}</button>
                  <button className="link" onClick={() => run(job.action, job.option, { text: job.text, context: job.context })}>
                    {t.w.retry}
                  </button>
                  <button className="link" onClick={() => setJob(null)}>
                    {t.w.discard}
                  </button>
                </>
              )
            )}
            {flash && <span className="flash">{flash}</span>}
          </div>
          {readOnly && !job.running && result && <p className="opt-hint">{t.w.readonlyNote}</p>}
        </section>
      )}
    </div>
  );
}
