import { useEffect, useRef, useState } from "react";
import {
  API_PROVIDER_IDS,
  API_PROVIDERS,
  BACKEND_INFO,
  maskKey,
  parseQuickSetup,
  readyBackends,
  type ApiModelEntry,
  type ApiProvider,
  type QuickSetup,
  type ClientMessage,
  type CliBackendId,
  type MachineInfo,
  type OfficeHost,
  type PermissionLevel,
  type RagStatus,
  type ServerMessage,
  type UpdateState,
} from "@pvta/shared";
import type { Strings } from "./i18n";
import { convertEquationToLatexInWordXml, convertLatexInWordXml, normalizeWordXmlInPlace } from "./office/word";
import { copyText, openUrl } from "./util";

export type SettingsSection = "perm" | "ai" | "api" | "learn";
export type LearnedState = Extract<ServerMessage, { type: "learned" }>;
export type CommunityState = Extract<ServerMessage, { type: "community" }>;
export type IpadState = Extract<ServerMessage, { type: "ipad" }>;
/** Kết quả tải danh sách model từ API; at đổi mỗi lần để biểu mẫu nhận ra tin mới. */
export interface ApiModelsResult {
  provider: ApiProvider;
  ok: boolean;
  models?: ApiModelEntry[];
  saved?: boolean;
  error?: string;
  at: number;
}

interface Props {
  t: Strings;
  host?: OfficeHost;
  language?:'vi'|'en';
  onLanguage?:(language:'vi'|'en')=>void;
  machine: MachineInfo | null;
  permission: PermissionLevel | null;
  learned: LearnedState | null;
  hintsOn: boolean;
  update: UpdateState | null;
  community: CommunityState | null;
  apiModelsMsg: ApiModelsResult | null;
  ipad: IpadState | null;
  rag: RagStatus | null;
  ragBusy: boolean;
  onRagRefresh(): void;
  focus?: SettingsSection;
  send(m: ClientMessage): boolean;
  onPermission(l: PermissionLevel): void;
  /** Mở cửa sổ quản lý chế độ viết. */
  onModes(): void;
  onClose(): void;
}

export function PermissionChoices({ t, value, onChoose }: { t: Strings; value: PermissionLevel | null; onChoose(l: PermissionLevel): void }) {
  const items = [
    ["read", t.permRead, t.permReadDesc],
    ["ask", t.permAsk, t.permAskDesc],
    ["full", t.permFull, t.permFullDesc],
  ] as const;
  return (
    <div className="choices" role="radiogroup" aria-label={t.permission}>
      {items.map(([level, label, desc]) => (
        <button key={level} role="radio" aria-checked={value === level} className={`choice ${value === level ? "sel" : ""}`} onClick={() => onChoose(level)}>
          <span className="radio" aria-hidden />
          <span className="opt-main">
            <span className="opt-name">{label}</span>
            <span className="opt-hint">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CopyLine({ t, cmd }: { t: Strings; cmd: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="cmd">
      <code>{cmd}</code>
      <button
        className="small"
        onClick={async () => {
          if (await copyText(cmd)) {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }
        }}
      >
        {done ? t.copied : t.copy}
      </button>
    </div>
  );
}

function AiRow({ t, id, machine, anyReady }: { t: Strings; id: CliBackendId; machine: MachineInfo | null; anyReady: boolean }) {
  const info = BACKEND_INFO[id];
  const cap = machine?.capabilities?.[id];
  const ready = cap?.installed === true;
  const checking = !cap && (machine?.scanning ?? true);
  // Máy chưa có AI nào: mở sẵn cách cài của mọi backend; có rồi thì thu gọn các mục còn lại.
  const expand = !ready && !checking && !anyReady;
  const [open, setOpen] = useState(expand);
  useEffect(() => setOpen(expand), [expand]);
  const win = machine?.platform === "win";
  return (
    <div className={`ai-row ${ready ? "ready" : ""}`}>
      <button className="ai-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="opt-main">
          <span className="opt-name">{info.product}</span>
          <span className="opt-hint">
            {t.plan}: {info.plan}
          </span>
        </span>
        <span className={`badge ${ready ? "ok" : checking ? "wait" : "off"}`}>
          {ready ? cap!.version.replace(/^[^\d]*/, "v").split(" ")[0] || t.ready : checking ? t.checking : t.notInstalled}
        </span>
        {!ready && !checking && <span className="chev" aria-hidden>{open ? "▴" : "▾"}</span>}
      </button>
      {open && info.install && (
        <div className="ai-body">
          <p>{win ? t.installWin : t.installMac}</p>
          <CopyLine t={t} cmd={win ? info.install.win : info.install.mac} />
          {info.install.npm && (
            <>
              <p>{t.orNpm}</p>
              <CopyLine t={t} cmd={info.install.npm} />
            </>
          )}
          {info.login && <p className="opt-hint">{info.login}</p>}
          {info.docs && (
            <button className="link" onClick={() => openUrl(info.docs!)}>
              {t.openGuide}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ApiForm({ t, machine, send, result }: { t: Strings; machine: MachineInfo | null; send: Props["send"]; result: ApiModelsResult | null }) {
  const firstSaved = API_PROVIDER_IDS.find((p) => machine?.api.providers[p]?.configured);
  const [provider, setProvider] = useState<ApiProvider>(firstSaved ?? "anthropic");
  const st = machine?.api.providers[provider];
  const info = API_PROVIDERS[provider];
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(st?.baseUrl ?? "");
  const [model, setModel] = useState(st?.model ?? "");
  const [savedAt, setSavedAt] = useState(0);
  // Dán nhanh
  const [quick, setQuick] = useState("");
  const [quickNote, setQuickNote] = useState<{ ok: boolean; text: string } | null>(null);
  const pending = useRef<QuickSetup | null>(null);
  // Danh sách model: loading = đang chờ bridge; fetched = danh sách vừa tải bằng giá trị đang gõ (chưa lưu)
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState<ApiModelEntry[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [typing, setTyping] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const compatible = provider === "compatible";
  const urlVisible = compatible || info.fixedUrl === true || showUrl || !!baseUrl.trim();

  const applyQuick = (q: QuickSetup) => {
    if (q.baseUrl) setShowUrl(true);
    if (q.key !== undefined) setKey(q.key);
    if (q.baseUrl !== undefined) setBaseUrl(q.baseUrl);
    if (q.model !== undefined) setModel(q.model);
  };

  useEffect(() => {
    setKey("");
    setBaseUrl(machine?.api.providers[provider]?.baseUrl ?? "");
    setModel(machine?.api.providers[provider]?.model ?? "");
    setFetched(null);
    setLoadErr(null);
    setLoadedNote(null);
    setLoading(false);
    setFilter("");
    setTyping(false);
    setShowUrl(false);
    // Nhà cung cấp có địa chỉ cố định và danh sách model công khai (Command Code): tải danh sách ngay khi chọn.
    const pi = API_PROVIDERS[provider];
    if (pi.publicModels && !(machine?.api.providers[provider]?.models?.length)) {
      setLoading(true);
      send({ type: "api_models", provider });
    }
    // Đổi nhà cung cấp do Dán nhanh: điền lại các giá trị vừa tách được.
    if (pending.current && pending.current.provider === provider) {
      applyQuick(pending.current);
      pending.current = null;
    }
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tin tải danh sách model từ bridge (bỏ qua tin cũ còn lại từ lần mở Cài đặt trước)
  const seenAt = useRef(result?.at ?? 0);
  useEffect(() => {
    if (!result || result.at === seenAt.current) return;
    seenAt.current = result.at;
    if (result.provider !== provider) return;
    setLoading(false);
    if (result.ok && result.models) {
      setLoadErr(null);
      if (result.saved) {
        setFetched(null); // đã lưu: dùng danh sách trong machine.api
        setLoadedNote(t.apiModelsSaved(result.models.length));
      } else {
        setFetched(result.models);
        setLoadedNote(null);
      }
    } else {
      setLoadErr(result.error ?? "");
    }
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadModels = (over?: { provider: ApiProvider; key?: string; baseUrl?: string }) => {
    setLoading(true);
    setLoadErr(null);
    setLoadedNote(null);
    send({ type: "api_models", provider: over?.provider ?? provider, key: (over ? over.key : key.trim()) || undefined, baseUrl: (over ? over.baseUrl : baseUrl.trim()) || undefined });
  };

  const runQuick = (text: string) => {
    const q = parseQuickSetup(text);
    const parts = (["provider", "key", "baseUrl", "model"] as const).filter((k) => q[k] !== undefined);
    if (parts.length === 0) {
      setQuick(text); // giữ lại đoạn vừa dán để thầy cô sửa
      setQuickNote({ ok: false, text: t.apiQuickNone });
      return;
    }
    const what = parts.map((k) => (k === "key" ? `${t.apiQuickParts.key} (${maskKey(q.key!)})` : t.apiQuickParts[k])).join(", ");
    setQuickNote({ ok: true, text: t.apiQuickDone(what) });
    setQuick(""); // không để khóa nằm lại trong ô dán
    const target = q.provider ?? provider;
    if (target !== provider) {
      pending.current = { ...q, provider: target };
      setProvider(target);
    } else applyQuick(q);
    // Có đủ để thử là tải luôn danh sách model.
    const needsKey = API_PROVIDERS[target].needsKey;
    const hasKey = !!q.key || !!machine?.api.providers[target]?.configured;
    const hasUrl = target !== "compatible" || !!q.baseUrl || !!machine?.api.providers[target]?.baseUrl;
    if ((!needsKey || hasKey) && hasUrl) loadModels({ provider: target, key: q.key, baseUrl: q.baseUrl });
  };

  const saved = st?.models;
  const list: ApiModelEntry[] | undefined = fetched ?? (saved && saved.length ? saved : undefined);
  const labelOf = (m: ApiModelEntry) => (m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id);
  const f = filter.trim().toLowerCase();
  const shown = list ? list.filter((m) => !f || m.id.toLowerCase().includes(f) || (m.label ?? "").toLowerCase().includes(f)) : [];
  const urlChanged = baseUrl.trim() !== (st?.baseUrl ?? "");
  const canSave = compatible ? !!baseUrl.trim() && !!model.trim() : !!key.trim() || (!!st?.configured && (model !== (st?.model ?? "") || urlChanged));
  const canLoad = !loading && (info.publicModels ? true : compatible ? !!baseUrl.trim() || !!st?.baseUrl : !!key.trim() || !!st?.configured);

  return (
    <form
      className="api-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        send({ type: "set_api", provider, key: key.trim() || undefined, baseUrl: compatible || urlVisible ? baseUrl.trim() : undefined, model: model.trim() });
        setKey("");
        setFetched(null); // sau khi lưu, bridge tự tải lại và gửi danh sách đã lưu
        setSavedAt(Date.now());
      }}
    >
      <div className="api-quick">
        <span className="opt-name">{t.apiQuickTitle}</span>
        <span className="opt-hint">{t.apiQuickHint}</span>
        <textarea
          value={quick}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          placeholder={t.apiQuickPlaceholder}
          onChange={(e) => setQuick(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim()) {
              e.preventDefault();
              runQuick(text);
            }
          }}
        />
        <div className="row">
          <button type="button" className="small" disabled={!quick.trim()} onClick={() => runQuick(quick)}>
            {t.apiQuickFill}
          </button>
        </div>
        {quickNote && <span className={quickNote.ok ? "opt-hint" : "api-err"}>{quickNote.text}</span>}
      </div>

      <label>
        <span>{t.provider}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as ApiProvider)}>
          {API_PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {API_PROVIDERS[p].label}
              {machine?.api.providers[p]?.configured ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>
      {urlVisible ? (
        <label>
          <span>{t.baseUrl}</span>
          <input value={info.fixedUrl && !baseUrl ? info.baseUrl : baseUrl} readOnly={info.fixedUrl === true} placeholder={info.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} inputMode="url" spellCheck={false} />
        </label>
      ) : (
        <button type="button" className="link" onClick={() => setShowUrl(true)}>
          {t.apiShowUrl}
        </button>
      )}
      <label>
        <span>{t.apiKey}</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          placeholder={st?.configured ? `${t.apiKeySaved} · ${t.apiKeyNew}` : info.keyHint}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>

      <div className="api-models">
        <span className="opt-name">{t.apiModel}</span>
        <div className="row">
          <button type="button" className="small" disabled={!canLoad} onClick={() => loadModels()}>
            {loading ? t.apiLoading : list ? t.apiRefreshModels : t.apiLoadModels}
          </button>
          {list && <span className="opt-hint">{t.apiModelsCount(list.length)}</span>}
        </div>
        {!list && !loading && !canLoad && !compatible && <span className="opt-hint">{t.apiNeedKeyToLoad}</span>}
        {loadErr !== null && <span className="api-err">{t.apiModelsFail(loadErr)}</span>}
        {loadedNote && <span className="opt-hint">{loadedNote}</span>}
        {list && !typing ? (
          <>
            {list.length > 12 && <input value={filter} placeholder={t.apiFilterModels} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />}
            <select value={model} onChange={(e) => setModel(e.target.value)} aria-label={t.apiModel}>
              <option value="">{t.apiPickModel}</option>
              {model && !list.some((m) => m.id === model) && <option value={model}>{model}</option>}
              {shown.map((m) => (
                <option key={m.id} value={m.id}>
                  {labelOf(m)}
                </option>
              ))}
            </select>
            <button type="button" className="link" onClick={() => setTyping(true)}>
              {t.apiTypeModel}
            </button>
          </>
        ) : (
          <>
            <input value={model} placeholder={info.defaultModel || "llama3.2"} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
            {list && (
              <button type="button" className="link" onClick={() => setTyping(false)}>
                {t.apiModelFromList}
              </button>
            )}
          </>
        )}
      </div>

      <div className="row">
        <button type="submit" className="primary" disabled={!canSave}>
          {Date.now() - savedAt < 2000 ? t.saved : t.save}
        </button>
        {st && (
          <button type="button" className="danger-text" onClick={() => send({ type: "set_api", provider, remove: true })}>
            {t.remove}
          </button>
        )}
      </div>
    </form>
  );
}

function LearnSection({ t, learned, send }: { t: Strings; learned: LearnedState | null; send(m: ClientMessage): boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const enabled = learned?.enabled !== false;
  const items = learned?.items ?? [];
  return (
    <>
      <div className="set-head">
        <h3>{t.learn.title}</h3>
        <button className="small" onClick={() => send({ type: "learn_set", enabled: !enabled })}>
          {enabled ? t.learn.toggleOn : t.learn.toggleOff}
        </button>
      </div>
      <p className="opt-hint">{t.learn.intro}</p>
      <p className={`opt-hint ${enabled ? "" : "dim"}`}>
        <strong>{enabled ? t.learn.on : t.learn.off}</strong>
      </p>
      <p className="opt-hint">{t.learn.pending(learned?.pending ?? 0)}</p>
      <p className="opt-hint">{t.learn.fileIntro}</p>
      <div className="row">
        <button className="small" disabled={learned?.fileLearn?.busy} onClick={() => send({ type: "learn_file", from: "open" })}>
          {t.learn.fileOpen}
        </button>
        <button className="small" disabled={learned?.fileLearn?.busy} onClick={() => send({ type: "learn_file", from: "project" })}>
          {t.learn.fileProject}
        </button>
      </div>
      {(learned?.fileLearn?.busy || learned?.fileLearn?.note) && <p className="opt-hint">{learned?.fileLearn?.busy ? t.learn.fileBusy : learned?.fileLearn?.note}</p>}
      {items.length === 0 ? (
        <p className="opt-hint">{t.learn.none}</p>
      ) : (
        <>
          <p className="opt-hint">{t.learn.learnedCount(items.length)}</p>
          <ul className="mode-list">
            {items.map((it) => (
              <li key={it.name} className="learn-item">
                <div className="mode-row">
                  <span className="mode-txt">
                    <span className="opt-name">
                      {it.name.replace(/^learned-/, "")}
                      {it.source === "file" ? ` · ${t.learn.fromFile}` : ""}
                    </span>
                    <span className="opt-hint">{it.description}</span>
                  </span>
                  <span className="mode-acts">
                    <button className="small" onClick={() => setOpen(open === it.name ? null : it.name)}>
                      {open === it.name ? t.learn.hide : t.learn.view}
                    </button>
                    <button className="small danger-text" onClick={() => send({ type: "learn_delete", name: it.name })}>
                      {t.learn.del}
                    </button>
                  </span>
                </div>
                {open === it.name && <pre className="args learn-body">{it.body}</pre>}
              </li>
            ))}
          </ul>
          {confirm ? (
            <div className="row">
              <span className="opt-hint">{t.learn.confirmAll}</span>
              <button
                className="small danger-text"
                onClick={() => {
                  send({ type: "learn_delete", all: true });
                  setConfirm(false);
                }}
              >
                {t.learn.yes}
              </button>
              <button className="small" onClick={() => setConfirm(false)}>
                {t.learn.no}
              </button>
            </div>
          ) : (
            <button className="small danger-text" onClick={() => setConfirm(true)}>
              {t.learn.delAll}
            </button>
          )}
        </>
      )}
    </>
  );
}

function CommunitySection({ t, community, send }: { t: Strings; community: CommunityState | null; send(m: ClientMessage): boolean }) {
  // Mục bị bỏ tích. Mặc định tích tất cả.
  const [off, setOff] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  // Kết quả của lần trước không hiện lại khi mở Cài đặt: chỉ hiện sau khi thầy cô bấm "Xem trước và gửi".
  const [hidden, setHidden] = useState(true);
  const phase = hidden ? undefined : community?.phase;
  const items = community?.items ?? [];
  const chosen = items.filter((i) => !off.has(i.name)).map((i) => i.name);
  const toggle = (name: string) =>
    setOff((cur) => {
      const n = new Set(cur);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  return (
    <>
      <div className="set-head">
        <h3>{t.community.title}</h3>
        {phase !== "preview" && phase !== "sending" && (
          <button
            className="small"
            onClick={() => {
              setOff(new Set());
              setCopied(false);
              setHidden(false);
              send({ type: "community_preview" });
            }}
          >
            {t.community.preview}
          </button>
        )}
      </div>
      <p className="opt-hint">{t.community.intro}</p>
      {phase === "preview" &&
        (items.length === 0 ? (
          <p className="opt-hint">{t.community.none}</p>
        ) : (
          <>
            <p className="opt-hint">{t.community.count(items.length)}</p>
            <ul className="mode-list">
              {items.map((it) => (
                <li key={it.name} className="learn-item">
                  <label className="mode-row">
                    <input type="checkbox" checked={!off.has(it.name)} onChange={() => toggle(it.name)} />
                    <span className="mode-txt">
                      <span className="opt-name">{it.name.replace(/^learned-/, "")}</span>
                      <span className="opt-hint">{it.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {(community?.skipped?.length ?? 0) > 0 && <p className="opt-hint">{t.community.skipped(community!.skipped!.length)}</p>}
            <div className="row">
              <button className="small" disabled={chosen.length === 0} onClick={() => send({ type: "community_send", names: chosen })}>
                {t.community.send}
              </button>
              <button className="small" onClick={() => setHidden(true)}>
                {t.community.cancel}
              </button>
            </div>
          </>
        ))}
      {phase === "sending" && <p className="opt-hint">{t.community.sending}</p>}
      {phase === "sent" && (
        <p className="opt-hint">
          {t.community.sent}{" "}
          {community?.url && (
            <button className="small" onClick={() => openUrl(community.url!)}>
              {t.community.open}
            </button>
          )}
        </p>
      )}
      {phase === "manual" && (
        <>
          <p className="opt-hint">{t.community.manualHint}</p>
          <div className="row">
            <button
              className="small"
              onClick={() => void copyText(community?.body ?? "").then((ok) => setCopied(ok))}
            >
              {copied ? t.community.copied : t.community.copy}
            </button>
            <button className="small" onClick={() => community?.issueUrl && openUrl(community.issueUrl)}>
              {t.community.openIssue}
            </button>
          </div>
        </>
      )}
      {phase === "error" && <div className="error" role="alert">{community?.message}</div>}
      {(phase === "sent" || phase === "manual" || phase === "error") && community?.file && (
        <p className="opt-hint">
          {t.community.savedAt} {community.file}
        </p>
      )}
    </>
  );
}

function UpdateViaCommand({ t, update, send }: { t: Strings; update: UpdateState; send(m: ClientMessage): boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!update.canUpdate || !update.installerCmd || update.state) return null;
  return (
    <div className="upd-cmd">
      <p className="opt-hint">
        <strong>{t.upd.viaCmdTitle}</strong> {t.upd.viaCmdHint}
      </p>
      <pre className="args">{update.installerCmd}</pre>
      {confirm ? (
        <div className="row">
          <span className="opt-hint">{t.upd.viaCmdConfirm}</span>
          <button
            className="small"
            onClick={() => {
              send({ type: "update_installer" });
              setConfirm(false);
            }}
          >
            {t.upd.viaCmdRun}
          </button>
          <button className="small" onClick={() => setConfirm(false)}>
            {t.learn.no}
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="small" onClick={() => setConfirm(true)}>
            {t.upd.viaCmdRun}
          </button>
          <button className="small" onClick={() => void copyText(update.installerCmd!).then((ok) => setCopied(ok))}>
            {copied ? t.upd.viaCmdCopied : t.upd.viaCmdCopy}
          </button>
        </div>
      )}
    </div>
  );
}

/** Chế độ iPad: máy tính làm máy chủ cho Word/Excel trên iPad (cùng Wi-Fi). */
function IpadSection({ t, ipad, send }: { t: Strings; ipad: IpadState; send(m: ClientMessage): boolean }) {
  const s = t.ipad;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(false);
  }, [ipad.running, ipad.enabled]);
  // Mở mục: làm mới tên/IP (đổi Wi-Fi thì chứng chỉ và manifest theo IP được tạo lại).
  // Chỉ một lần khi mở (send là hàm mới mỗi lần vẽ lại; phụ thuộc vào nó sẽ thành vòng lặp với tin "ipad").
  useEffect(() => {
    send({ type: "ipad_get" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ipad.remote) {
    return (
      <>
        <h3>{s.title}</h3>
        <p className="opt-hint">{s.remoteNote(ipad.host)}</p>
      </>
    );
  }
  return (
    <>
      <div className="set-head">
        <h3>{s.title}</h3>
        <button
          className="small"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            send({ type: "ipad_set", enabled: !ipad.enabled });
          }}
        >
          {busy ? s.working : ipad.enabled ? s.turnOff : s.turnOn}
        </button>
      </div>
      <p className="opt-hint">{s.intro}</p>
      {ipad.error && <div className="error" role="alert">{ipad.error}</div>}
      {ipad.running && (
        <>
          <p className="opt-hint">
            <strong>{s.running(ipad.host, ipad.clients)}</strong>
          </p>
          <ol className="ipad-steps">
            <li>
              {s.step1}
              <CopyLine t={t} cmd={ipad.setupUrl ?? ""} />
              {ipad.setupUrlIp && <span className="opt-hint">{s.step1Ip(ipad.setupUrlIp)}</span>}
            </li>
            <li>{s.step2}</li>
            <li>
              {s.step3}{" "}
              <button className="small" onClick={() => send({ type: "ipad_reveal" })}>
                {s.reveal}
              </button>
            </li>
            <li>{s.step4}</li>
          </ol>
          <p className="opt-hint">{s.limits}</p>
          <button
            className="link"
            onClick={() => {
              if (confirm(s.resetConfirm)) send({ type: "ipad_reset" });
            }}
          >
            {s.reset}
          </button>
        </>
      )}
    </>
  );
}

export function Settings({ t, host, language, onLanguage, machine, permission, learned, hintsOn, update, community, apiModelsMsg, ipad, rag, ragBusy, onRagRefresh, focus, send, onPermission, onModes, onClose }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const [latexBusy, setLatexBusy] = useState(false);
  const [latexNote, setLatexNote] = useState<string | null>(null);
  useEffect(() => {
    if (focus) body.current?.querySelector(`#set-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus]);
  const isEn = language === "en";
  const scopeLabelOf = (sc: "selection" | "document") =>
    sc === "selection" ? (isEn ? "selection" : "vùng chọn") : (isEn ? "document" : "toàn văn bản");
  const runLatexToEquation = async () => {
    if (latexBusy) return;
    setLatexBusy(true);
    setLatexNote(null);
    try {
      const r = await convertLatexInWordXml("auto");
      const scopeLabel = scopeLabelOf(r.scope);
      setLatexNote(
        r.converted > 0
          ? isEn
            ? `Converted ${r.converted} formula(s) across ${r.paragraphs} paragraph(s) (${scopeLabel}) via XML in ${r.ms} ms.`
            : `Đã chuyển ${r.converted} công thức LaTeX → Equation (${r.paragraphs} đoạn, ${scopeLabel}) bằng XML trong ${r.ms} ms.`
          : isEn
            ? `No raw LaTeX ($…$, $$…$$) found in ${scopeLabel}.`
            : `Không có công thức LaTeX dạng chữ ($…$, $$…$$) nào cần chuyển trong ${scopeLabel}.`,
      );
    } catch (e) {
      setLatexNote(e instanceof Error ? e.message : String(e));
    } finally {
      setLatexBusy(false);
    }
  };
  const runEquationToLatex = async () => {
    if (latexBusy) return;
    setLatexBusy(true);
    setLatexNote(null);
    try {
      const r = await convertEquationToLatexInWordXml("auto");
      const scopeLabel = scopeLabelOf(r.scope);
      setLatexNote(
        r.converted > 0
          ? isEn
            ? `Converted ${r.converted} Equation(s) → LaTeX across ${r.paragraphs} paragraph(s) (${scopeLabel}) via XML in ${r.ms} ms.`
            : `Đã chuyển ${r.converted} Equation → LaTeX $…$ (${r.paragraphs} đoạn, ${scopeLabel}) bằng XML trong ${r.ms} ms.`
          : isEn
            ? `No Word Equation found in ${scopeLabel}.`
            : `Không có Equation nào trong ${scopeLabel} để chuyển sang LaTeX.`,
      );
    } catch (e) {
      setLatexNote(e instanceof Error ? e.message : String(e));
    } finally {
      setLatexBusy(false);
    }
  };
  const runNormalizeXml = async () => {
    if (latexBusy) return;
    setLatexBusy(true);
    setLatexNote(null);
    try {
      const r = await normalizeWordXmlInPlace("auto");
      const scopeLabel = scopeLabelOf(r.scope);
      if (r.typographyFixed === 0 && r.mathConverted === 0) {
        setLatexNote(
          isEn
            ? `Text and formulas in ${scopeLabel} are already clean.`
            : `Văn bản và công thức trong ${scopeLabel} đã chuẩn, không cần sửa thêm.`,
        );
      } else {
        setLatexNote(
          isEn
            ? `Normalized ${r.typographyFixed} spacing/punctuation issue(s) and ${r.mathConverted} formula(s) (${r.paragraphs} paragraph(s), ${scopeLabel}) via XML in ${r.ms} ms.`
            : `Đã chuẩn hóa ${r.typographyFixed} lỗi khoảng trắng/dấu câu và chuyển ${r.mathConverted} công thức (${r.paragraphs} đoạn, ${scopeLabel}) bằng XML trong ${r.ms} ms.`,
        );
      }
    } catch (e) {
      setLatexNote(e instanceof Error ? e.message : String(e));
    } finally {
      setLatexBusy(false);
    }
  };
  return (
    <div className="sheet-wrap full" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={t.settings} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <button className="back-btn" aria-label={t.settingsBack} onClick={onClose}>
            ← {t.settingsBack}
          </button>
          <h2>{t.settings}</h2>
          <button className="icon" aria-label={t.close} onClick={onClose}>✕</button>
        </header>
        <div className="sheet-body" ref={body}>
          {onLanguage&&<section className="set"><label>{language==='en'?'Add-in language':'Ngôn ngữ add-in'}<select value={language??'vi'} onChange={e=>onLanguage(e.target.value as 'vi'|'en')}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></section>}
          <section id="set-perm" className="set">
            <h3>{t.sectionPerm}</h3>
            <PermissionChoices t={t} value={permission} onChoose={onPermission} />
          </section>
          <section id="set-modes" className="set">
            <div className="set-head">
              <h3>{t.m.title}</h3>
              <button className="small" onClick={onModes}>
                {t.mm.manage}
              </button>
            </div>
            <p className="opt-hint">{t.mm.settingsHint}</p>
          </section>
          {(host === "word" || !host) && (
            <section id="set-latex" className="set">
              <div className="set-head">
                <h3>{isEn ? "∑ Word XML Quick Tools (Equations & Typography)" : "∑ Công cụ xử lý nhanh bằng XML (Công thức & Chuẩn hóa)"}</h3>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
                <button className="small" disabled={latexBusy} onClick={() => void runLatexToEquation()}>
                  {isEn ? "LaTeX ($…$) → Equation" : "LaTeX ($…$) → Equation"}
                </button>
                <button className="small" disabled={latexBusy} onClick={() => void runEquationToLatex()}>
                  {isEn ? "Equation → LaTeX ($…$)" : "Equation → LaTeX ($…$)"}
                </button>
                <button className="small" disabled={latexBusy} onClick={() => void runNormalizeXml()}>
                  {isEn ? "Normalize Text & Chem/Math (XML)" : "Chuẩn hóa dấu câu & Hóa/Toán (XML)"}
                </button>
              </div>
              <p className="opt-hint">
                {isEn
                  ? "Processes Word OOXML directly in one pass (applies to selection if highlighted, otherwise the whole document): convert $…$ ↔ Word Equation, or normalize Vietnamese punctuation/spacing and plain formulas (H2SO4, Ca(OH)2, x^2) without slowing down regular chat."
                  : "Xử lý trực tiếp trên ngôn ngữ XML của Word trong 1 lượt (ưu tiên vùng đang bôi đen, không chọn thì áp cho cả văn bản): đổi qua lại giữa $…$ ↔ Equation chuẩn của Word, hoặc tự xóa khoảng trắng thừa, chuẩn hóa dấu câu và đổi công thức viết thường (H2SO4, Ca(OH)2, x^2) sang Equation."}
              </p>
              {latexNote && <p className="opt-hint"><strong>{latexNote}</strong></p>}
            </section>
          )}
          <section id="set-hints" className="set">
            <div className="set-head">
              <h3>{t.hint.title}</h3>
              <button className="small" onClick={() => send({ type: "hint_set", enabled: !hintsOn })}>
                {hintsOn ? t.hint.toggleOn : t.hint.toggleOff}
              </button>
            </div>
            <p className="opt-hint">{t.hint.intro}</p>
            <p className="opt-hint"><strong>{hintsOn ? t.hint.on : t.hint.off}</strong></p>
            <button className="small" onClick={() => send({ type: "ref_clear" })}>{t.hint.clear}</button>
          </section>
          {rag && (
            <section id="set-rag" className="set">
              <div className="set-head">
                <h3>{t.rag.title}</h3>
                <button className="small" onClick={() => send({ type: "rag_set", enabled: !rag.enabled })}>
                  {rag.enabled ? t.rag.turnOff : t.rag.turnOn}
                </button>
              </div>
              <p className="opt-hint">{t.rag.intro}</p>
              <p className="opt-hint">
                <strong>{!rag.enabled ? t.rag.off : ragBusy ? t.rag.building : rag.ready ? t.rag.status(rag.name ?? "", rag.chunks ?? 0, rag.chars ?? 0, rag.ms) : t.rag.notReady}</strong>
                {rag.enabled && rag.truncated ? ` · ${t.rag.truncated}` : ""}
              </p>
              {rag.enabled && (
                <button className="small" disabled={ragBusy} onClick={onRagRefresh}>
                  {t.rag.refresh}
                </button>
              )}
            </section>
          )}
          <section id="set-learn" className="set">
            <LearnSection t={t} learned={learned} send={send} />
          </section>
          <section id="set-community" className="set">
            <CommunitySection t={t} community={community} send={send} />
          </section>
          {ipad && (
            <section id="set-ipad" className="set">
              <IpadSection t={t} ipad={ipad} send={send} />
            </section>
          )}
          <section id="set-ver" className="set">
            <div className="set-head">
              <h3>{t.upd.title}</h3>
              <button className="small" disabled={!update?.canUpdate || !!update.state} onClick={() => send({ type: "update_check" })}>
                {update?.state === "checking" ? t.upd.checking : t.upd.check}
              </button>
            </div>
            <p className="opt-hint">
              {t.upd.version(update?.current && update.current !== "dev" ? update.current : "2.0.0")}
              {update && !update.canUpdate ? ` · ${t.upd.dev}` : ""}
            </p>
            {update?.available && !update.state && (
              <p className="opt-hint">
                {t.upd.available(update.latest ?? "", update.current)}
                {update.notes ? ` ${update.notes}` : ""}{" "}
                <button className="small" onClick={() => send({ type: "update_apply" })}>
                  {t.upd.now}
                </button>
              </p>
            )}
            {update?.state === "downloading" && <p className="opt-hint">{t.upd.downloading}</p>}
            {update?.state === "restarting" && <p className="opt-hint">{t.upd.restarting}</p>}
            {update?.state === "installing" && <p className="opt-hint">{t.upd.installing}</p>}
            {update && update.canUpdate && !update.available && !update.state && !update.error && update.latest && (
              <p className="opt-hint">{t.upd.latest}</p>
            )}
            {update?.error && <div className="error" role="alert">{update.error}</div>}
            {update && <UpdateViaCommand t={t} update={update} send={send} />}
          </section>
          <section id="set-ai" className="set">
            <div className="set-head">
              <h3>{t.sectionAi}</h3>
              <button className="small" disabled={machine?.scanning} onClick={() => send({ type: "rescan" })}>
                {machine?.scanning ? t.checking : t.rescan}
              </button>
            </div>
            {(["claude", "codex", "agy"] as CliBackendId[]).map((id) => (
                <AiRow key={id} t={t} id={id} machine={machine} anyReady={readyBackends(machine?.capabilities, machine?.api).length > 0} />
              ))}
            <p className="opt-hint">{t.rescanHint}</p>
          </section>
          <section id="set-api" className="set">
            <h3>{t.sectionApi}</h3>
            <p className="opt-hint">{t.apiIntro}</p>
            <ApiForm t={t} machine={machine} send={send} result={apiModelsMsg} />
          </section>
        </div>
      </div>
    </div>
  );
}
