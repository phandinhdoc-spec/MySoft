import {
  BACKEND_INFO,
  choiceFromInfo,
  effectiveEffort,
  effortsFor,
  findModelInfo,
  isBackendReady,
  modelsOf,
  type BackendId,
  type CliBackendId,
  type Effort,
  type MachineInfo,
  type ModelChoice,
} from "@pvta/shared";
import type { Strings } from "./i18n";
import { apiModels, GROUP_ORDER, modelLabel } from "./models";

interface Props {
  t: Strings;
  machine: MachineInfo | null;
  value: ModelChoice | "auto";
  effort: Effort;
  onPick(v: ModelChoice | "auto"): void;
  onEffort(e: Effort): void;
  onClose(): void;
  onSetup(section: "ai" | "api"): void;
}

/**
 * Bảng chọn model: một danh sách xổ gồm các model do chính CLI trên máy khai báo (nhóm theo CLI),
 * rồi mức suy nghĩ và Thường/Nhanh, chỉ hiện những gì model đang chọn hỗ trợ.
 * Chế độ viết nằm ở cửa sổ riêng (ModeSheet), không ở đây.
 */
export function ModelPicker({ t, machine, value, effort, onPick, onEffort, onClose, onSetup }: Props) {
  const caps = machine?.capabilities;
  const api = machine?.api;
  const catalog = machine?.models;
  const scanning = machine?.scanning ?? true;
  const current = value === "auto" ? machine?.auto ?? null : value;
  const isAuto = value === "auto";
  const cli = current && current.backend !== "api" ? (current.backend as CliBackendId) : undefined;
  const info = cli && current ? findModelInfo(modelsOf(catalog, cli), current.model)?.info : undefined;

  // Tự động: model do bridge chọn, không đổi mức/tốc độ từ đây (model có biến thể như Gemini gắn mức vào mã).
  const allowed = current && !(isAuto && info?.variants) ? effortsFor(current.backend, current.model, caps, catalog) : [];
  const shownEffort = current ? effectiveEffort(current, effort, caps, catalog) : undefined;
  const fastOn = !!current?.speed;
  const canFast = !isAuto && !!info?.fast && !!cli;

  const status = (b: BackendId): { ready: boolean; text: string; cls: string } => {
    if (isBackendReady(b, caps, api)) {
      const v = b !== "api" ? caps?.[b as CliBackendId]?.version : "";
      return { ready: true, text: v ? v.replace(/^[^\d]*/, "v").split(" ")[0]! : t.ready, cls: "ok" };
    }
    if (scanning && b !== "api" && !caps?.[b as CliBackendId]) return { ready: false, text: t.checking, cls: "wait" };
    return { ready: false, text: b === "api" ? t.noKey : t.notInstalled, cls: "off" };
  };
  const readyGroups = GROUP_ORDER.filter((b) => status(b).ready);
  const notReady = GROUP_ORDER.filter((b) => !status(b).ready);

  /** Giá trị của ô chọn: "auto", "<backend>|<mã model trong danh sách>". */
  const selValue = isAuto ? "auto" : current ? `${current.backend}|${info ? info.id : current.model}` : "auto";
  const knownSel = isAuto || current?.backend === "api" || !!info;

  const onSelect = (v: string) => {
    if (v === "auto") return onPick("auto");
    const i = v.indexOf("|");
    const b = v.slice(0, i) as BackendId;
    const id = v.slice(i + 1);
    if (b === "api") return onPick({ backend: "api", model: id });
    const mi = modelsOf(catalog, b).find((m) => m.id === id);
    onPick(mi ? choiceFromInfo(b, mi, effort, fastOn && !!mi.fast) : { backend: b, model: id });
  };
  const pickEffort = (e: Effort) => {
    onEffort(e);
    if (!isAuto && cli && info?.variants) onPick(choiceFromInfo(cli, info, e, fastOn));
  };
  const pickSpeed = (fast: boolean) => {
    if (cli && info) onPick(choiceFromInfo(cli, info, shownEffort ?? effort, fast));
  };

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={t.chooseModel} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{t.chooseModel}</h2>
          <button className="icon" aria-label={t.close} onClick={onClose}>✕</button>
        </header>
        <div className="sheet-body">
          <div className="field">
            <label className="foot-label" htmlFor="pvta-model">{t.model}</label>
            <select id="pvta-model" value={selValue} onChange={(e) => onSelect(e.target.value)}>
              <option value="auto">
                {t.modelAuto}
                {machine?.auto ? ` · ${modelLabel(machine.auto, catalog)}` : scanning ? ` · ${t.checking}` : ""}
              </option>
              {!knownSel && current && (
                <option value={selValue}>
                  {current.model} ({t.modelInUse})
                </option>
              )}
              {readyGroups.map((b) => (
                <optgroup key={b} label={`${BACKEND_INFO[b].label} ${status(b).text}`}>
                  {b === "api"
                    ? apiModels(api).map((o) => (
                        <option key={o.value.model} value={`api|${o.value.model}`}>
                          {o.label}
                        </option>
                      ))
                    : modelsOf(catalog, b as CliBackendId).map((m) => (
                        <option key={m.id} value={`${b}|${m.id}`}>
                          {m.label}
                        </option>
                      ))}
                </optgroup>
              ))}
            </select>
            {!isAuto && info?.hint && <span className="opt-hint">{info.hint}</span>}
            {cli && !isAuto && <span className="opt-hint dim">{catalog?.[cli]?.live ? t.modelsLive : t.modelsBuiltin}</span>}
          </div>

          <div className="field" title={t.effortHint}>
            <span className="foot-label">{t.effort}</span>
            {allowed.length === 0 ? (
              <span className="opt-hint">{t.effortFixed}</span>
            ) : (
              <div className="seg" role="radiogroup" aria-label={t.effort}>
                {allowed.map((e) => (
                  <button key={e} role="radio" aria-checked={shownEffort === e} className={shownEffort === e ? "on" : ""} onClick={() => pickEffort(e)}>
                    {t.efforts[e] ?? e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canFast && (
            <div className="field">
              <span className="foot-label">{t.speed}</span>
              <div className="seg" role="radiogroup" aria-label={t.speed}>
                <button role="radio" aria-checked={!fastOn} className={!fastOn ? "on" : ""} onClick={() => pickSpeed(false)}>
                  {t.speedNormal}
                </button>
                <button role="radio" aria-checked={fastOn} className={fastOn ? "on" : ""} onClick={() => pickSpeed(true)}>
                  {t.speedFast} ⚡
                </button>
              </div>
              <span className="opt-hint">{info?.fastNote ?? t.speedHint}</span>
            </div>
          )}

          {notReady.map((b) => {
            const st = status(b);
            return (
              <section key={b} className="group dim">
                <div className="group-head">
                  <span className="group-name">{BACKEND_INFO[b].label}</span>
                  <span className={`badge ${st.cls}`}>{st.text}</span>
                  {!(scanning && st.cls === "wait") && (
                    <button className="link" onClick={() => onSetup(b === "api" ? "api" : "ai")}>
                      {b === "api" ? t.addApiKey : t.howToInstall}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
