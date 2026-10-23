import {StandardizePreviewBox} from "./StandardizePreview";
import type {StandardizeReply} from "@pvta/shared";
import { useEffect, useState } from "react";
import type { ClientMessage, FoundSkill, SkillInfo, SkillLoad } from "@pvta/shared";
import type { Strings } from "./i18n";
import { openUrl } from "./util";

/** Nguồn gợi ý: kho skill do Anthropic công bố (gồm skill Word, Excel, PowerPoint, PDF). */
const SUGGESTED: Array<{ label: string; url: string }> = [{ label: "anthropics/skills", url: "https://github.com/anthropics/skills" }];

const ORDER: SkillInfo["kind"][] = ["community", "own", "learned", "builtin"];

export function SkillsPanel({
  standardized,
  t,
  items,
  found,
  notice,
  error,
  scanning,
  send,
  onScan,
  onUse,
  onClose,
}: {
  standardized: StandardizeReply | null;
  t: Strings;
  items: SkillInfo[];
  found: { source: string; items: FoundSkill[] } | null;
  notice: string | null;
  error: string | null;
  scanning: boolean;
  send(m: ClientMessage): boolean;
  onScan(source: string): void;
  onUse(name: string): void;
  onClose(): void;
}) {
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Có kết quả dò mới: chọn sẵn các skill cài được.
  useEffect(() => {
    setPicked(new Set((found?.items ?? []).filter((i) => !i.problem).map((i) => i.key)));
  }, [found]);

  const toggle = (k: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const installable = (found?.items ?? []).filter((i) => !i.problem);
  const sorted = [...items].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={t.sk.title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>🧩 {t.sk.title}</h2>
          <button className="icon" aria-label={t.close} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body sk-body">
          <p className="sub sk-intro">{t.sk.intro}</p>

          <section className="sk-sec">
            <h3>{t.sk.importTitle}</h3>
            <form
              className="sk-link"
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim() && !scanning) onScan(link.trim());
              }}
            >
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t.sk.linkPh} aria-label={t.sk.linkPh} spellCheck={false} />
              <button className="primary" type="submit" disabled={!link.trim() || scanning}>
                {scanning ? t.sk.scanning : t.sk.scan}
              </button>
            </form>
            <div className="sk-suggest">
              <span className="sub">{t.sk.suggestTitle}:</span>
              {SUGGESTED.map((s) => (
                <span key={s.url} className="sk-sug-group">
                  <button className="chip-btn" onClick={() => (setLink(s.url), onScan(s.url))} disabled={scanning}>
                    {s.label}
                  </button>
                  <button className="link" onClick={() => openUrl(s.url)} aria-label={`${s.label} ↗`}>
                    ↗
                  </button>
                </span>
              ))}
            </div>

            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="optbar" role="status">
                {notice}
              </div>
            )}

            {found && (
              <div className="sk-found">
                <div className="sk-found-head">
                  <strong>{t.sk.found(found.items.length)}</strong>
                  <button className="link" onClick={() => setPicked(new Set(installable.map((i) => i.key)))}>
                    {t.sk.selectAll}
                  </button>
                </div>
                <ul className="sk-list">
                  {found.items.map((i) => (
                    <li key={i.key} className={i.problem ? "sk-item bad" : "sk-item"}>
                      <label>
                        <input type="checkbox" disabled={!!i.problem} checked={picked.has(i.key)} onChange={() => toggle(i.key)} />
                        <span className="opt-main">
                          <span className="opt-name">{i.name}</span>
                          <span className="opt-hint">{i.problem ? `⚠ ${i.problem}` : i.description}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  className="primary"
                  disabled={picked.size === 0}
                  onClick={() => send({ type: "skills_install", source: found.source, keys: [...picked] })}
                >
                  {t.sk.installSel(picked.size)}
                </button>
              </div>
            )}

            <details className="sk-paste">
              <summary>{t.sk.pasteTitle}</summary>
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={t.sk.pastePh} rows={6} spellCheck={false} />
              <StandardizePreviewBox kind="skill" text={pasted} reply={standardized} send={send} onApply={setPasted}/>
              <button
                disabled={!pasted.trim()}
                onClick={() => {
                  if (send({ type: "skills_install", text: pasted })) setPasted("");
                }}
              >
                {t.sk.addPasted}
              </button>
            </details>
            <p className="sub sk-safe">🛡 {t.sk.safety}</p>
          </section>

          <section className="sk-sec">
            <h3>{t.sk.installedTitle}</h3>
            {sorted.length === 0 && <p className="sub">{t.sk.none}</p>}
            <ul className="sk-list">
              {sorted.map((s) => {
                const locked = s.kind === "builtin" || s.kind === "learned";
                return (
                  <li key={s.name} className={`sk-item ${s.load === "off" ? "off" : ""}`}>
                    <div className="sk-row">
                      <button className="sk-name" onClick={() => setOpen(open === s.name ? null : s.name)} aria-expanded={open === s.name}>
                        <span className="opt-name">{s.name}</span>
                        <span className={`badge kind-${s.kind}`}>{t.sk.kind[s.kind]}</span>
                      </button>
                      {!locked && (
                        <button className="small" disabled={s.load === "off"} title={t.sk.useTip} onClick={() => onUse(s.name)}>
                          {t.sk.use}
                        </button>
                      )}
                    </div>
                    <div className="opt-hint">{s.description || "—"}</div>
                    {open === s.name && (
                      <div className="sk-detail">
                        <div className="opt-hint dim">
                          {t.sk.chars(s.chars)}
                          {s.source ? ` · ${s.source}` : ""}
                        </div>
                        {locked ? (
                          <div className="opt-hint dim">{t.sk.locked}</div>
                        ) : (
                          <>
                            <div className="seg" role="radiogroup" aria-label={t.sk.title}>
                              {(["manual", "demand", "always", "off"] as SkillLoad[]).map((l) => (
                                <button key={l} role="radio" aria-checked={s.load === l} className={s.load === l ? "on" : ""} onClick={() => send({ type: "skills_set", name: s.name, load: l })}>
                                  {t.sk.load[l]}
                                </button>
                              ))}
                            </div>
                            <div className="opt-hint dim">{t.sk.loadHint[s.load]}</div>
                            <button
                              className="danger-text"
                              onClick={() => {
                                if (confirm === s.name) {
                                  send({ type: "skills_delete", name: s.name });
                                  setConfirm(null);
                                } else setConfirm(s.name);
                              }}
                            >
                              {confirm === s.name ? t.sk.confirmRemove : t.sk.remove}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="sub sk-safe">ℹ {t.sk.notes}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
