import type { BasisChange, BasisRelated, CustomMode, Hints, RefInfo } from "@pvta/shared";
import { isWritingMode } from "@pvta/shared";
import type { Strings } from "./i18n";

interface Props {
  t: Strings;
  hints: Hints;
  gone: Set<string>;
  customModes: CustomMode[];
  projectName(id: string): string | undefined;
  onDismiss(key: string): void;
  onMode(id: string): void;
  onProject(id: string): void;
}

/** Hàng gợi ý nhỏ: chỉ đề xuất, bấm mới áp dụng. */
export function HintBar({ t, hints, gone, customModes, projectName, onDismiss, onMode, onProject }: Props) {
  const chips: Array<{ key: string; text: string; why: string; act?: () => void }> = [];
  const m = hints.mode;
  if (m && (isWritingMode(m.id) || customModes.some((c) => c.id === m.id))) {
    const name = t.m.names[m.id] ?? customModes.find((c) => c.id === m.id)?.name ?? m.id;
    chips.push({ key: `mode:${m.id}`, text: t.hint.mode(name), why: m.reason, act: () => onMode(m.id) });
  }
  for (const s of hints.skills.slice(0, 3)) chips.push({ key: `skill:${s.name}`, text: t.hint.skill(s.name), why: s.reason });
  const p = hints.project;
  const pn = p ? projectName(p.id) : undefined;
  if (p && pn) chips.push({ key: `project:${p.id}`, text: t.hint.project(pn), why: p.reason, act: () => onProject(p.id) });
  const shown = chips.filter((c) => !gone.has(c.key));
  if (shown.length === 0) return null;
  return (
    <div className="hint-bar" role="group" aria-label={t.hint.label} title={hints.source === "ai" ? t.hint.ai : t.hint.local}>
      <span className="hint-label" aria-hidden>💡</span>
      {shown.map((c) => (
        <span key={c.key} className="hint-chip" title={c.why}>
          <button className="hint-go" disabled={!c.act} onClick={() => { c.act?.(); onDismiss(c.key); }}>
            {c.text}
          </button>
          <button className="hint-x" aria-label={t.hint.dismiss} onClick={() => onDismiss(c.key)}>×</button>
        </span>
      ))}
    </div>
  );
}

interface RefProps {
  t: Strings;
  items: RefInfo[];
  open: { refId: string; ok: boolean; title?: string; text?: string; truncated?: boolean; error?: string } | null;
  busy: string | null;
  onView(refId: string): void;
  onUse(title: string, text: string): void;
  onClose(): void;
  onOpenLink(url: string): void;
}

/** Văn bản liên quan tìm trên mạng: chỉ hiện tên và link; bấm Xem mới tải nội dung. */
export function RefList({ t, items, open, busy, onView, onUse, onClose, onOpenLink }: RefProps) {
  return (
    <div className="ref-list" role="group" aria-label={t.hint.refs}>
      <div className="ref-head">📎 {t.hint.refs}</div>
      {items.slice(0, 3).map((r) => (
        <div key={r.id} className="ref-item">
          <div className="ref-title" title={r.why}>
            {r.title} <span className="ref-host">{r.host}</span>
          </div>
          <div className="ref-actions">
            <button className="small" disabled={busy === r.id} onClick={() => onView(r.id)}>
              {busy === r.id ? t.hint.loading : t.hint.view}
            </button>
            <button className="small" onClick={() => onOpenLink(r.url)}>{t.hint.link}</button>
          </div>
          {open && open.refId === r.id && (
            <div className="ref-body">
              {open.ok && open.text ? (
                <>
                  <pre className="args ref-text">{open.text.slice(0, 1500)}{open.text.length > 1500 ? "…" : ""}</pre>
                  <div className="ref-actions">
                    <button className="small primary" onClick={() => onUse(open.title ?? r.title, open.text!.slice(0, 6000))}>{t.hint.use}</button>
                    <button className="small" onClick={onClose}>{t.hint.hide}</button>
                  </div>
                  {open.truncated && <div className="opt-hint">{t.hint.truncated}</div>}
                </>
              ) : (
                <div className="opt-hint">{open.error ?? t.hint.failed}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface BasisProps {
  vi: boolean;
  changed: BasisChange[];
  related: BasisRelated[];
  disclaimer: string;
  canFix: boolean;
  onFix(): void;
  onMute(no: string): void;
  onDismiss(): void;
  onOpenLink(url: string): void;
}

/** Thanh «Căn cứ đã thay đổi» (mức 1) và «Có thể tham khảo» (mức 2). Chỉ báo, không tự sửa tài liệu. */
export function BasisBar({ vi, changed, related, disclaimer, canFix, onFix, onMute, onDismiss, onOpenLink }: BasisProps) {
  if (!changed.length && !related.length) return null;
  return (
    <div className="hint-bar basis-bar" role="alert">
      <button className="hint-x" aria-label={vi ? "Đóng" : "Close"} onClick={onDismiss}>×</button>
      {changed.length > 0 && (
        <div className="basis-changed">
          <strong>⚠ {vi ? "Căn cứ đã thay đổi" : "Legal basis changed"}</strong>
          {changed.map((c) => (
            <div key={c.no}>
              {c.text}{" "}
              <button className="small" onClick={() => onMute(c.no)}>{vi ? "Không nhắc nữa" : "Mute"}</button>
            </div>
          ))}
          {canFix && <button className="small" onClick={onFix}>{vi ? "Nhờ PVTA đề xuất sửa" : "Ask PVTA to suggest fixes"}</button>}
          <small>{disclaimer}</small>
        </div>
      )}
      {related.length > 0 && (
        <div className="basis-related">
          <strong>{vi ? "Có thể tham khảo" : "May be relevant"}</strong>
          {related.map((r) => (
            <div key={(r.no ?? "") + r.title} title={r.why}>
              {r.isNew && <b>{vi ? "Mới " : "New "}</b>}
              {r.url ? <a href={r.url} onClick={(e) => { e.preventDefault(); onOpenLink(r.url!); }}>{r.title}</a> : r.title}
              <small> · {r.statusLabel}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
