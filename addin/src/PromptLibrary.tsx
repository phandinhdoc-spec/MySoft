import { useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_PROMPTS, normalizePromptTemplate, fillPrompt, PROMPT_CATEGORIES, promptFields, type ClientMessage, type LibraryPrompt, type OfficeHost } from "@pvta/shared";
import { HOST_NAME, type Strings } from "./i18n";

interface Props {
  t: Strings;
  host: OfficeHost;
  own: LibraryPrompt[];
  favorites: string[];
  /** Nội dung ô nhập hiện tại (để "Lưu ô nhập thành lời nhắc"). */
  draft: string;
  /** Mở thẳng màn hình điền ô trống cho một lời nhắc (vd sau khi Tối ưu). */
  fillText?: string;
  send(m: ClientMessage): boolean;
  /** Đưa lời nhắc vào ô nhập; sendNow = gửi luôn. */
  onUse(text: string, sendNow: boolean): void;
  onClose(): void;
}

type View = { kind: "list" } | { kind: "fill"; prompt: LibraryPrompt } | { kind: "edit"; prompt: Partial<LibraryPrompt> };

const ALL = "__all";
const FAV = "__fav";
const MINE = "__mine";

/** Thư viện lời nhắc (kiểu Monica): mở bằng "/" hoặc nút 📚; ô trống [mô tả] hiện thành ô điền. */
export function PromptLibrary({ t, host, own, favorites, draft, fillText, send, onUse, onClose }: Props) {
  const [view, setView] = useState<View>(() =>
    fillText ? { kind: "fill", prompt: { id: "_draft", title: t.lib.fillTitle, text: fillText, category: "" } } : { kind: "list" },
  );
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(favorites.length ? FAV : ALL);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (view.kind === "list") search.current?.focus();
  }, [view.kind]);

  const all = useMemo(() => [...own, ...BUILTIN_PROMPTS].filter((p) => !p.hosts || p.hosts.includes(host)), [own, host]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
    return all
      .filter((p) => (cat === ALL ? true : cat === FAV ? favorites.includes(p.id) : cat === MINE ? p.own : p.category === cat))
      .filter((p) => words.every((w) => `${p.title} ${p.desc ?? ""} ${p.text}`.toLowerCase().normalize("NFC").includes(w)))
      .sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  }, [all, q, cat, favorites]);

  const pick = (p: LibraryPrompt) => {
    if (promptFields(p.text).length) setView({ kind: "fill", prompt: p });
    else {
      onUse(p.text, false);
      onClose();
    }
  };

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet tall" role="dialog" aria-label={t.lib.title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          {view.kind !== "list" && !fillText && (
            <button className="icon" aria-label={t.lib.back} onClick={() => setView({ kind: "list" })}>
              ←
            </button>
          )}
          <h2>{view.kind === "list" ? t.lib.title : view.kind === "fill" ? view.prompt.title : view.prompt.id ? t.lib.editTitle : t.lib.newTitle}</h2>
          <button className="icon" aria-label={t.close} onClick={onClose}>
            ✕
          </button>
        </header>

        {view.kind === "list" && (
          <>
            <div className="lib-top">
              <input
                ref={search}
                className="lib-search"
                placeholder={t.lib.search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && shown[0]) pick(shown[0]);
                }}
              />
              <div className="lib-cats" role="tablist">
                {[
                  { id: ALL, name: t.lib.all },
                  { id: FAV, name: `★ ${t.lib.fav}` },
                  { id: MINE, name: t.lib.mine },
                  ...PROMPT_CATEGORIES,
                ].map((c) => (
                  <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="sheet-body">
              {shown.length === 0 && <p className="opt-hint lib-empty">{cat === FAV ? t.lib.noFav : cat === MINE ? t.lib.noMine : t.lib.noResult}</p>}
              {shown.map((p) => {
                const fav = favorites.includes(p.id);
                return (
                  <div key={p.id} className="lib-item">
                    <button className="lib-main" onClick={() => pick(p)}>
                      <span className="opt-name">{p.title}</span>
                      <span className="opt-hint">{p.desc ?? p.text.slice(0, 90)}</span>
                    </button>
                    <button
                      className={`icon star ${fav ? "on" : ""}`}
                      aria-label={fav ? t.lib.unfav : t.lib.favOne}
                      aria-pressed={fav}
                      onClick={() => send({ type: "prompts_fav", id: p.id, fav: !fav })}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                    {p.own && (
                      <button className="icon" aria-label={t.lib.edit} onClick={() => setView({ kind: "edit", prompt: p })}>
                        ✎
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <footer className="sheet-foot">
              <button className="primary small" onClick={() => setView({ kind: "edit", prompt: { text: draft, category: "soan-bai", hosts: [host] } })}>
                ＋ {t.lib.create}
              </button>
              {draft.trim() && <span className="opt-hint">{t.lib.fromDraft}</span>}
            </footer>
          </>
        )}

        {view.kind === "fill" && <FillView t={t} prompt={view.prompt} onUse={(text, now) => (onUse(text, now), onClose())} />}
        {view.kind === "edit" && (
          <EditView
            t={t}
            host={host}
            prompt={view.prompt}
            onSave={(p) => {
              send({ type: "prompts_save", prompt: p });
              setView({ kind: "list" });
              setCat(MINE);
            }}
            onDelete={
              view.prompt.id
                ? () => {
                    send({ type: "prompts_delete", id: view.prompt.id! });
                    setView({ kind: "list" });
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function FillView({ t, prompt, onUse }: { t: Strings; prompt: LibraryPrompt; onUse(text: string, sendNow: boolean): void }) {
  const fields = promptFields(prompt.text);
  const [vals, setVals] = useState<Record<string, string>>({});
  const text = fillPrompt(prompt.text, vals);
  const missing = fields.filter((f) => !vals[f]?.trim()).length;
  return (
    <>
      <form
        className="sheet-body fill"
        onSubmit={(e) => {
          e.preventDefault();
          onUse(text, true);
        }}
      >
        {fields.map((f, i) => (
          <label key={f}>
            <span>{f}</span>
            <input autoFocus={i === 0} value={vals[f] ?? ""} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} />
          </label>
        ))}
        <p className="fill-preview">{text}</p>
        {missing > 0 && <p className="opt-hint">{t.lib.missing(missing)}</p>}
        <button type="submit" hidden />
      </form>
      <footer className="sheet-foot">
        <button className="primary small" onClick={() => onUse(text, true)}>
          {t.lib.sendNow}
        </button>
        <button className="small" onClick={() => onUse(text, false)}>
          {t.lib.toInput}
        </button>
      </footer>
    </>
  );
}

function EditView({
  t,
  host,
  prompt,
  onSave,
  onDelete,
}: {
  t: Strings;
  host: OfficeHost;
  prompt: Partial<LibraryPrompt>;
  onSave(p: Partial<LibraryPrompt>): void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(prompt.title ?? "");
  const [text, setText] = useState(prompt.text ?? "");
  const [category, setCategory] = useState(prompt.category && prompt.category !== "cua-toi" ? prompt.category : "soan-bai");
  const [onlyHost, setOnlyHost] = useState(!!prompt.hosts?.length);
  const fields = promptFields(text);
  const [normalized,setNormalized] = useState<ReturnType<typeof normalizePromptTemplate> | null>(null);
  return (
    <>
      <div className="sheet-body api-form">
        <label>
          <span>{t.lib.name}</span>
          <input autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t.lib.namePh} />
        </label>
        <label>
          <span>{t.lib.group}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {PROMPT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyHost} onChange={(e) => setOnlyHost(e.target.checked)} />
          <span>{t.lib.onlyHost(HOST_NAME[host])}</span>
        </label>
        <label>
          <span>{t.lib.content}</span>
          <textarea rows={7} value={text} maxLength={20000} onChange={(e) => {setText(e.target.value);setNormalized(null);}} placeholder={t.lib.contentPh} />
        </label>
        <button type="button" className="small" disabled={!text.trim()} onClick={()=>setNormalized(normalizePromptTemplate(text))}>Chuẩn hóa lời nhắc mẫu</button>
        {normalized&&<section aria-label="Bản chuẩn hóa lời nhắc">
          <textarea rows={5} readOnly value={normalized.text} aria-label="Xem trước bản chuẩn hóa"/>
          <ul>{[...normalized.fixes,...normalized.issues.map(i=>i.message)].map((message,i)=><li key={i}>{message}</li>)}</ul>
          <button type="button" disabled={normalized.issues.some(i=>i.level==='error')} onClick={()=>{setText(normalized.text);setNormalized(null);}}>Dùng bản chuẩn hóa</button>
          <button type="button" onClick={()=>setNormalized(null)}>Giữ bản gốc</button>
        </section>}
        <p className="opt-hint">{fields.length ? t.lib.fieldsFound(fields.join(", ")) : t.lib.fieldsHint}</p>
      </div>
      <footer className="sheet-foot">
        <button className="primary small" disabled={!title.trim() || !text.trim()} onClick={() => onSave({ id: prompt.id, title, text, category, hosts: onlyHost ? [host] : undefined })}>
          {t.save}
        </button>
        {onDelete && (
          <button className="danger-text small" onClick={onDelete}>
            {t.lib.delete}
          </button>
        )}
      </footer>
    </>
  );
}
