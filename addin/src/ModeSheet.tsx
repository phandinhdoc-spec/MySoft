import { useEffect, useRef, useState } from "react";
import {
  BUILTIN_MODE_ICONS,
  duplicateMode,
  EFFORTS,
  exportModes,
  isWritingMode,
  MODE_LIMITS,
  resolveMode,
  WRITING_MODE_IDS,
  type ClientMessage,
  type CustomMode,
  type Effort,
  type ModelChoice,
  type WritingMode,
} from "@pvta/shared";
import type { Strings } from "./i18n";
import { copyText } from "./util";

export type ModeView = "pick" | "manage";

interface Props {
  t: Strings;
  custom: CustomMode[];
  mode: WritingMode;
  temperature: number | null;
  /** Model sẽ chạy (để nói nhiệt độ có áp dụng được không). */
  effective: ModelChoice | null;
  view: ModeView;
  /** Kết quả / lỗi bridge báo về (lưu, nhập tệp). */
  status: { saved?: string; notice?: string; error?: string } | null;
  send(m: ClientMessage): boolean;
  onMode(m: WritingMode): void;
  onTemperature(v: number | null): void;
  onView(v: ModeView): void;
  onClose(): void;
}

/** Nhiệt độ có thực sự tới được model không (CLI không có tham số này). */
export function temperatureSupport(m: ModelChoice | null): "yes" | "maybe" | "no-cli" | "no-model" {
  if (!m) return "no-cli";
  if (m.backend !== "api") return "no-cli";
  if (/^openai\/(gpt-5|o\d)/i.test(m.model)) return "no-model";
  if (m.model.startsWith("anthropic/")) return "maybe";
  return "yes";
}

/** Tên, biểu tượng, mô tả của một chế độ bất kỳ (chế độ có sẵn lấy tên theo ngôn ngữ giao diện). */
export function modeInfo(t: Strings, id: WritingMode, custom: readonly CustomMode[]): { name: string; icon: string; hint: string; builtin: boolean } {
  if (isWritingMode(id)) return { name: t.m.names[id] ?? id, icon: BUILTIN_MODE_ICONS[id], hint: t.m.hints[id] ?? "", builtin: true };
  const c = custom.find((m) => m.id === id);
  return { name: c?.name ?? t.m.names.standard ?? "", icon: c?.icon ?? "✎", hint: c?.hint ?? "", builtin: false };
}

/** Cửa sổ Chế độ viết: chọn chế độ (và nhiệt độ khi dùng API), hoặc quản lý chế độ tự tạo. Tách khỏi cửa sổ chọn model. */
export function ModeSheet(p: Props) {
  const { t } = p;
  const [editing, setEditing] = useState<CustomMode | null>(null);
  return (
    <div className="sheet-wrap" onClick={p.onClose}>
      <div className={`sheet ${p.view === "manage" ? "tall" : ""}`} role="dialog" aria-label={t.m.title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          {editing ? (
            <button className="icon" aria-label={t.mm.back} onClick={() => setEditing(null)}>←</button>
          ) : p.view === "manage" ? (
            <button className="icon" aria-label={t.mm.back} onClick={() => p.onView("pick")}>←</button>
          ) : null}
          <h2>{editing ? (editing.id ? t.mm.edit : t.mm.create) : p.view === "manage" ? t.mm.manage : t.m.title}</h2>
          <button className="icon" aria-label={t.close} onClick={p.onClose}>✕</button>
        </header>
        {editing ? (
          <ModeEditor t={t} draft={editing} status={p.status} send={p.send} onDone={() => setEditing(null)} />
        ) : p.view === "manage" ? (
          <ModeManager {...p} onEdit={setEditing} />
        ) : (
          <ModePicker {...p} />
        )}
      </div>
    </div>
  );
}

function ModePicker({ t, custom, mode, temperature, effective, onMode, onTemperature, onView }: Props) {
  const ids: WritingMode[] = [...WRITING_MODE_IDS, ...custom.map((m) => m.id)];
  const spec = resolveMode(mode, custom);
  const shown = temperature ?? spec?.temperature;
  const support = temperatureSupport(effective);
  return (
    <div className="sheet-body">
      <div className="mode-grid" role="radiogroup" aria-label={t.m.title}>
        {ids.map((id) => {
          const info = modeInfo(t, id, custom);
          return (
            <button key={id} role="radio" aria-checked={mode === id} className={`mode ${mode === id ? "sel" : ""}`} onClick={() => onMode(id)}>
              <span className="opt-name">
                <span aria-hidden>{info.icon}</span> {info.name}
              </span>
              {info.hint && <span className="opt-hint">{info.hint}</span>}
            </button>
          );
        })}
      </div>
      <div className="temp-row">
        <label htmlFor="pvta-temp" className="foot-label">
          {t.m.temperature}
        </label>
        <input
          id="pvta-temp"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={shown ?? 0.7}
          disabled={support === "no-cli"}
          onChange={(e) => onTemperature(Number(e.target.value))}
          aria-valuetext={shown === undefined ? t.m.modelDefault : shown.toFixed(2)}
        />
        <span className="temp-val">{shown === undefined ? t.m.modelDefault : shown.toFixed(2).replace(".", ",")}</span>
        {temperature !== null && (
          <button className="link" onClick={() => onTemperature(null)}>
            {t.m.byMode}
          </button>
        )}
      </div>
      <p className="opt-hint mode-note">{t.m.support[support]}</p>
      <div className="row mode-foot">
        <button className="small" onClick={() => onView("manage")}>
          ⚙ {t.mm.manage}
        </button>
      </div>
    </div>
  );
}

function ModeManager({ t, custom, status, send, onEdit }: Props & { onEdit(m: CustomMode): void }) {
  const [order, setOrder] = useState(custom);
  const [drag, setDrag] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setOrder(custom), [custom]);

  const commit = (list: CustomMode[]) => {
    setOrder(list);
    send({ type: "modes_order", ids: list.map((m) => m.id) });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  };
  const dup = (id: WritingMode) => {
    const name = `${modeInfo(t, id, custom).name} ${t.mm.copySuffix}`;
    const m = duplicateMode(id, name, custom);
    if (m) onEdit(m);
  };
  const importText = (text: string) => {
    try {
      send({ type: "modes_import", data: JSON.parse(text) as unknown });
      setPaste(null);
      setLocal(null);
    } catch {
      setLocal(t.mm.badJson);
    }
  };
  const doExport = async () => {
    const json = exportModes(custom);
    let ok = false;
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "pvta-che-do-viet.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      ok = true;
    } catch {
      /* một số bản Office chặn tải tệp trong panel: vẫn còn sao chép */
    }
    const copied = await copyText(json);
    setLocal(copied ? t.mm.exported : ok ? t.mm.exportedFile : t.mm.exportFail);
  };

  const msg = local ?? status?.error ?? status?.notice;
  return (
    <>
      <div className="sheet-body">
        {msg && (
          <div className={status?.error && !local ? "notice" : "optbar"} role="status">
            {msg}
          </div>
        )}
        <div className="group-head">
          <span className="group-name">{t.mm.builtin}</span>
          <span className="opt-hint">{t.mm.builtinHint}</span>
        </div>
        <ul className="mode-list">
          {WRITING_MODE_IDS.map((id) => {
            const info = modeInfo(t, id, custom);
            return (
              <li key={id} className="mode-row">
                <span className="mode-ico" aria-hidden>{info.icon}</span>
                <span className="mode-txt">
                  <span className="opt-name">{info.name}</span>
                  <span className="opt-hint">{info.hint}</span>
                </span>
                <button className="small" onClick={() => dup(id)}>{t.mm.duplicate}</button>
              </li>
            );
          })}
        </ul>
        <div className="group-head">
          <span className="group-name">{t.mm.own}</span>
          <span className="opt-hint">{order.length > 1 ? t.mm.dragHint : ""}</span>
        </div>
        {order.length === 0 && <p className="opt-hint lib-empty">{t.mm.empty}</p>}
        <ul className="mode-list">
          {order.map((m, i) => (
            <li
              key={m.id}
              className={`mode-row own ${drag === m.id ? "dragging" : ""}`}
              draggable
              onDragStart={(e) => {
                setDrag(m.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", m.id);
              }}
              onDragOver={(e) => {
                if (!drag || drag === m.id) return;
                e.preventDefault();
                const from = order.findIndex((x) => x.id === drag);
                if (from < 0) return;
                const next = order.slice();
                const [it] = next.splice(from, 1);
                next.splice(i, 0, it!);
                setOrder(next);
              }}
              onDragEnd={() => {
                setDrag(null);
                if (order.some((x, k) => x.id !== custom[k]?.id)) commit(order);
              }}
            >
              <span className="grip" aria-hidden>⋮⋮</span>
              <span className="mode-ico" aria-hidden>{m.icon ?? "✎"}</span>
              <span className="mode-txt">
                <span className="opt-name">{m.name}</span>
                {m.hint && <span className="opt-hint">{m.hint}</span>}
              </span>
              <span className="mode-acts">
                <button className="icon" title={t.mm.up} aria-label={`${t.mm.up}: ${m.name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon" title={t.mm.down} aria-label={`${t.mm.down}: ${m.name}`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon" title={t.mm.edit} aria-label={`${t.mm.edit}: ${m.name}`} onClick={() => onEdit(m)}>✎</button>
                <button className="icon" title={t.mm.duplicate} aria-label={`${t.mm.duplicate}: ${m.name}`} onClick={() => dup(m.id)}>⧉</button>
                {confirmDel === m.id ? (
                  <button className="small danger-text" onClick={() => { send({ type: "modes_delete", id: m.id }); setConfirmDel(null); }}>
                    {t.mm.confirmDelete}
                  </button>
                ) : (
                  <button className="icon" title={t.mm.delete} aria-label={`${t.mm.delete}: ${m.name}`} onClick={() => setConfirmDel(m.id)}>🗑</button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {paste !== null && (
          <div className="api-form mode-paste">
            <textarea rows={6} value={paste} placeholder={t.mm.pasteHint} onChange={(e) => setPaste(e.target.value)} spellCheck={false} aria-label={t.mm.pasteHint} />
            <div className="row">
              <button className="small primary" disabled={!paste.trim()} onClick={() => importText(paste)}>{t.mm.import}</button>
              <button className="link" onClick={() => setPaste(null)}>{t.mm.cancel}</button>
            </div>
          </div>
        )}
      </div>
      <footer className="sheet-foot mode-tools">
        <button
          className="small primary"
          disabled={custom.length >= MODE_LIMITS.count}
          onClick={() => onEdit({ id: "", name: "", icon: "✎", instructions: "" })}
        >
          ＋ {t.mm.create}
        </button>
        <button className="small" onClick={() => file.current?.click()}>{t.mm.importFile}</button>
        <button className="link" onClick={() => setPaste(paste ?? "")}>{t.mm.paste}</button>
        <button className="small" disabled={custom.length === 0} onClick={() => void doExport()}>{t.mm.export}</button>
        <span className="spacer" />
        {confirmReset ? (
          <button className="small danger-text" onClick={() => { send({ type: "modes_reset" }); setConfirmReset(false); }}>
            {t.mm.confirmReset}
          </button>
        ) : (
          <button className="link" disabled={custom.length === 0} onClick={() => setConfirmReset(true)}>{t.mm.reset}</button>
        )}
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 512 * 1024) return setLocal(t.mm.tooBig);
            importText(await f.text());
          }}
        />
      </footer>
    </>
  );
}

function ModeEditor({ t, draft, status, send, onDone }: { t: Strings; draft: CustomMode; status: Props["status"]; send(m: ClientMessage): boolean; onDone(): void }) {
  const [m, setM] = useState<CustomMode>(draft);
  const [sent, setSent] = useState(false);
  const set = (patch: Partial<CustomMode>) => setM((x) => ({ ...x, ...patch }));
  // Bridge báo đã lưu (hoặc lỗi) sau khi bấm Lưu.
  useEffect(() => {
    if (!sent || !status) return;
    if (status.error) setSent(false);
    else if (status.saved) onDone();
  }, [status, sent, onDone]);
  const tooLong = m.instructions.length > MODE_LIMITS.instructions;
  const canSave = !!m.name.trim() && !!m.instructions.trim() && !tooLong;
  return (
    <form
      className="sheet-body api-form mode-edit"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        setSent(true);
        send({ type: "modes_save", mode: m });
      }}
    >
      {sent && status?.error && <div className="notice" role="alert">{status.error}</div>}
      <div className="row mode-name-row">
        <label className="mode-icon-field">
          <span>{t.mm.icon}</span>
          <input value={m.icon ?? ""} maxLength={MODE_LIMITS.icon} onChange={(e) => set({ icon: e.target.value })} />
        </label>
        <label className="grow">
          <span>{t.mm.name}</span>
          <input value={m.name} maxLength={MODE_LIMITS.name} required onChange={(e) => set({ name: e.target.value })} autoFocus={!m.id} />
        </label>
      </div>
      <label>
        <span>{t.mm.hint}</span>
        <input value={m.hint ?? ""} maxLength={MODE_LIMITS.hint} placeholder={t.mm.hintPh} onChange={(e) => set({ hint: e.target.value })} />
      </label>
      <label>
        <span>
          {t.mm.instructions} <span className={`dim ${tooLong ? "error" : ""}`}>({m.instructions.length.toLocaleString("vi-VN")}/{MODE_LIMITS.instructions.toLocaleString("vi-VN")})</span>
        </span>
        <textarea rows={9} value={m.instructions} placeholder={t.mm.instructionsPh} onChange={(e) => set({ instructions: e.target.value })} />
      </label>
      <label>
        <span>{t.effort}</span>
        <select value={m.effort ?? ""} onChange={(e) => set({ effort: (e.target.value || undefined) as Effort | undefined })}>
          <option value="">{t.mm.effortAny}</option>
          {EFFORTS.filter((e) => e !== "ultra").map((e) => (
            <option key={e} value={e}>{t.efforts[e] ?? e}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={m.temperature !== undefined} onChange={(e) => set({ temperature: e.target.checked ? 0.3 : undefined })} />
        <span>{t.mm.setTemp}</span>
      </label>
      {m.temperature !== undefined && (
        <div className="temp-row">
          <input type="range" min={0} max={1} step={0.05} value={m.temperature} aria-label={t.m.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} />
          <span className="temp-val">{m.temperature.toFixed(2).replace(".", ",")}</span>
        </div>
      )}
      <p className="opt-hint">{t.mm.tempNote}</p>
      <div className="row">
        <button type="submit" className="primary" disabled={!canSave || sent}>{t.save}</button>
        <button type="button" className="link" onClick={onDone}>{t.mm.cancel}</button>
      </div>
    </form>
  );
}
