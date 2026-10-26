import {standardize} from "@pvta/core/standardize/index";
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  DEFAULT_EFFORT,
  EFFORTS,
  isValidModelChoice,
  LIMITS,
  type ClientMessage,
  type OfficeHost,
  type ServerMessage,
  type ToolCall,
  type ToolResult,
} from "@pvta/shared";
import { ChatSession, type RpcPort } from "./chat.js";
import { ConfigStore, DEFAULT_ORIGINS, DEFAULT_PORT } from "./config.js";
import { Engine } from "./engine.js";
import { docDisplayName } from "./docs.js";
import { learnFromDocs } from "./filelearn.js";
import { deleteLearned, LearnQueue, Learner, LearnState, listLearned } from "./learner.js";
import { LocalTools } from "./localtools.js";
import { pvtaHome, paths } from "./paths.js";
import { createWebServer, detectWeb, type WebOptions } from "./web.js";
import { discoverBackends, ProbeStore, type ProbeEntry } from "./probe.js";
import { discoverModels, loadCatalog, saveCatalog } from "./modelscan.js";
import { BACKENDS, resolveBin } from "./backends/index.js";
import { findBundledSkills, SkillStore } from "./skills.js";
import { deleteSkill, describeCandidate, installCandidates, installPasted, scanGithub, setSkillLoad, skillInfos, type Candidate } from "./skillimport.js";
import { Workspace } from "./workspace.js";
import { ThemeCache } from "./officethemes.js";
import { buildSuggestPrompt, parseSuggestion } from "./themesuggest.js";
import { FileStore, validScopeId, type Scope } from "./filestore.js";
import { AddinNotebooks } from "./notebook.js";
import { alwaysRulesText, invokedRulesText, readChatRules } from "./sharedrules.js";
import { applyUpdate, compareVersions, detectApp, fetchLatest, installerCommand, relaunch, runInstaller, type AppInfo, type LatestInfo, type SpawnFn } from "./updater.js";
import { buildFeedback, manualIssueUrl, saveFeedbackFiles, sendViaGh, type RunFn } from "./community.js";
import { buildDigestPrompt, ChatStore, historyFromMsgs, transcriptOf } from "./chatstore.js";
import fs from "node:fs";
import path from "node:path";
import {
  builtinCatalog,
  clampEffort,
  effortsFor,
  type ModelCatalog,
  API_PROVIDER_IDS,
  API_PROVIDERS,
  modelFamily,
  optimizerSystem,
  AUTO_MODEL,
  BACKEND_INFO,
  CLI_BACKEND_IDS,
  readyBackends,
  resolveAuto,
  splitApiModel,
  type ApiProvider,
  type ApiStatus,
  type Capabilities,
  type CliBackendId,
  type MachineInfo,
  type ModelChoice,
  type Hints,
} from "@pvta/shared";
import { ApiClient } from "./api.js";
import type { DocContext } from "./prompts.js";
import { EngineError } from "./errors.js";
import { beautifyRecord, sanitizeRecord } from "./learner.js";
import { beautifyKind, buildBeautifyPrompt, type DocKind } from "./beautify.js";
import { buildHintPrompt, cheapestChoice, HINT, HintGate, hintKey, isEmptyHints, localHints, mergeHints, parseHintResponse, type HintInput } from "./hints.js";
import { cleanWriteOutput, isWriteAction, WRITE_LABEL, writeRequest, writeSystem } from "./writing.js";
import { PromptLibrary } from "./promptlib.js";
import { Stopwatch } from "./timing.js";
import { clampTemperature, WRITE_MAX_CHARS, type Effort, type WriteAction, type WritingMode } from "@pvta/shared";
import { ModeStore } from "./modestore.js";
import { buildVisionPrompt, cleanMeta, IMG, imageSection, ImageStore, neededImages, parseVision, visionCapable } from "./images.js";
import { fetchRefText, findRefs, PlaceCache, RefGate, RefStore, type Fetcher, type Resolver } from "./refs.js";
import { checkBasisLocal, muteBasisLocal } from "./basis.js";
import { LicenseStore } from "@pvta/core/license/index";
import { IpadHost, type IpadHostOptions } from "./ipadserver.js";
import { buildIndex, promptSection as ragPromptSection, searchTool as ragSearchTool, type RagContext, type RagIndex, type RagStatus } from "@pvta/shared";

export interface ServerOptions {
  /** Thay cách tải web (kiểm thử): tìm văn bản liên quan và tải nội dung khi người dùng bấm xem. */
  webFetch?: Fetcher;
  webResolve?: Resolver;
  home?: string;
  port?: number;
  host?: string;
  /** Chờ bao lâu sau khi đóng panel trước khi dọn phiên (mặc định 30 giây). */
  closeGraceMs?: number;
  /** Tối đa bao lâu cho học nốt khi đóng (mặc định 120 giây). */
  flushLearnMs?: number;
  /** Thay cách quét chủ đề của Office (kiểm thử). */
  themeScan?: (host: OfficeHost) => import("./officethemes.js").ThemeCatalog;
  /** Chờ bao lâu sau lần lưu cuối thì tóm tắt hội thoại trong dự án (mặc định 30 giây). */
  digestMs?: number;
  /** Cho phép kết nối không có Origin (chỉ dùng khi kiểm thử). */
  allowNoOrigin?: boolean;
  engine?: Engine;
  idleCheckMs?: number;
  /** Dò CLI trên máy khi khởi động (mặc định: có, trừ khi truyền engine giả). */
  discover?: boolean;
  /** Phục vụ add-in qua HTTPS + wss trên cổng riêng (bản cài đặt). Mặc định tự dò từ PVTA_WEB. */
  web?: WebOptions | false;
  /** Cập nhật tại chỗ. app: false = tắt; mặc định tự dò bản đã cài. Các trường còn lại dùng khi kiểm thử. */
  update?: {
    app?: AppInfo | false;
    fetchFn?: typeof fetch;
    tarballUrl?: string;
    extractFn?: (tgz: string, into: string) => Promise<void>;
    /** Chờ bao lâu sau khi khởi động thì kiểm tra lần đầu (mặc định 5 giây; 0 = không tự kiểm tra). */
    firstCheckMs?: number;
    restart?: () => void;
    /** Thay việc chạy lệnh cài đặt (kiểm thử). */
    spawnFn?: SpawnFn;
    /** Hệ điều hành giả định cho lệnh cài đặt (kiểm thử). */
    platform?: NodeJS.Platform;
  };
  /** Thay hàm fetch của backend API và việc tải danh sách model (kiểm thử). */
  apiFetch?: typeof fetch;
  /** Phản hồi cộng đồng: thay việc chạy `gh` (kiểm thử). */
  communityRun?: RunFn;
  /** Chế độ iPad: false = tắt hẳn; các trường còn lại thay cổng, tên máy, thư mục web (kiểm thử). */
  ipad?: Partial<Omit<IpadHostOptions, "home" | "load" | "save" | "accept">> | false;
}

interface SessionRec {
  id: string;
  dir: string;
  chat: ChatSession;
  ws?: WebSocket;
  closeTimer?: NodeJS.Timeout;
  host: OfficeHost;
  /** Tên tệp đang mở trong cửa sổ này (add-in báo khi kết nối). */
  docName?: string;
  /** Hội thoại đang mở ở cửa sổ này (chưa lưu lần nào thì chưa có) và dự án sẽ chứa nó. */
  chatId?: string;
  projectId?: string;
  /** Gọi công cụ Office.js trong cửa sổ này (dùng cho cả cửa sổ khác khi người dùng đồng ý). */
  callRpc?: (call: ToolCall, signal?: AbortSignal) => Promise<ToolResult>;
  pending: {
    rpc: Map<string, (r: ToolResult) => void>;
    approval: Map<string, (r: "approved" | "declined" | "timeout") => void>;
  };
  lang: "vi" | "en";
  /** Công cụ viết đang chạy (mỗi phiên một lượt; lượt mới thay lượt cũ). */
  write?: AbortController;
  /** Chỉ mục RAG của tệp đang mở trong cửa sổ này (add-in gửi các đoạn, bridge dựng; chỉ ở trong bộ nhớ). */
  rag?: RagIndex;
  ragMs?: number;
  /** Bản đồ hình–câu của văn bản đang mở (add-in gửi), để model nền đọc và phiên chính dùng. */
  images?: import("@pvta/shared").ImgMeta[];
  /** Lượt gợi ý nền: bộ hủy riêng để chạy song song với tác vụ chính, không hủy lẫn nhau. */
  hint?: AbortController;
  /** Đang "làm đẹp": loại văn bản và model đã làm, để học khi giáo viên lưu. */
  beautify?: { kind: DocKind; backend: import("@pvta/shared").BackendId; model: string };
  lastWriteModel?: ModelChoice;
  /** Hủy các yêu cầu đang chờ add-in (khi add-in ngắt kết nối hoặc tác vụ bị hủy). */
  failPending(reason: string): void;
}

const HOSTS: readonly OfficeHost[] = ["word", "excel", "powerpoint"];
/** Thao tác dùng AI/mạng: chỉ chạy khi đã kích hoạt (nếu bản này đòi giấy phép). */
const LICENSE_GATED = new Set<string>(["chat", "write", "optimize", "theme_suggest", "prewarm", "hint_get", "basis_check", "learn_file"]);
const MAX_TEXT = 100_000;

const RPC_TIMEOUT_MS = 120_000;

export interface RunningServer {
  port: number;
  close(): Promise<void>;
  sessions: Map<string, SessionRec>;
  workspace: Workspace;
  learner: Learner;
}

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const home = opts.home ?? pvtaHome();
  fs.mkdirSync(home, { recursive: true });
  const config = new ConfigStore(paths.config(home));
  const workspace = new Workspace(home);
  workspace.sweepStale(); // dọn thư mục phiên cũ hơn 24 giờ
  const skills = new SkillStore(paths.skills(home));
  skills.installBundled(findBundledSkills());
  const probe = new ProbeStore(paths.probe(home));
  const api = new ApiClient({ settings: () => config.get().api, fetch: opts.apiFetch });
  const engine = opts.engine ?? new Engine({ probe, api, allowApiKeys: () => config.get().allowApiKeys === true });
  const toCaps = (m: Partial<Record<CliBackendId, ProbeEntry>>): Capabilities => {
    const c: Capabilities = {};
    for (const id of CLI_BACKEND_IDS) {
      const e = m[id];
      if (e) c[id] = { installed: e.installed !== false, version: e.fingerprint, efforts: e.efforts };
    }
    return c;
  };
  let caps: Capabilities = toCaps({ agy: probe.get("agy"), claude: probe.get("claude"), codex: probe.get("codex"), opencode: probe.get("opencode") });
  const modelsFile = path.join(home, "models.json");
  let catalog: ModelCatalog = { ...builtinCatalog(), ...(loadCatalog(modelsFile) ?? {}) };
  const discover = opts.discover ?? !opts.engine;
  let scanning = discover;
  let discoveredOnce = false;

  const apiStatus = (): ApiStatus => {
    const providers: ApiStatus["providers"] = {};
    const st = config.get().api ?? {};
    for (const p of API_PROVIDER_IDS) {
      const e = st[p];
      if (e) providers[p] = { configured: api.configured(p), baseUrl: e.baseUrl, model: e.model, models: e.models };
    }
    return { providers };
  };
  /** Tải danh sách model bằng khóa đã lưu, lưu lại để bộ chọn model hiện đủ. Không bao giờ ném lỗi. */
  const refreshModels = async (provider: ApiProvider): Promise<Extract<ServerMessage, { type: "api_models" }>> => {
    try {
      const models = await api.listModels(provider);
      const all = { ...(config.get().api ?? {}) };
      const cur = all[provider];
      if (!cur) return { type: "api_models", provider, ok: false, error: "Chưa lưu cấu hình cho nhà cung cấp này." };
      all[provider] = { ...cur, models };
      config.set({ api: all });
      broadcastCaps();
      return { type: "api_models", provider, ok: true, models, saved: true };
    } catch (e) {
      return { type: "api_models", provider, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const autoChoice = (): ModelChoice | undefined => {
    const r = resolveAuto(caps, apiStatus());
    // Chưa biết máy có gì (không dò, chưa có probe.json): dùng Auto mặc định.
    if (!r && !discoveredOnce && Object.keys(caps).length === 0) return AUTO_MODEL;
    return r;
  };
  const platform: MachineInfo["platform"] = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
  const machine = (): MachineInfo => ({ capabilities: caps, api: apiStatus(), auto: autoChoice() ?? null, models: catalog, platform, scanning });
  /** Mức suy nghĩ thực sự dùng cho model này: theo danh sách model khai báo; model cố định mức thì không truyền. */
  const effortFor = (m: ModelChoice, e: Effort): Effort | undefined => clampEffort(effortsFor(m.backend, m.model, caps, catalog), e);
  const broadcastCaps = () => {
    const m = machine();
    for (const rec of sessions.values()) send(rec.ws, { type: "capabilities", ...m });
  };
  // Dò --version/--help của từng CLI, chạy nền để không chậm lúc mở panel.
  let discovery: Promise<void> = Promise.resolve();
  const runDiscovery = (): Promise<void> => {
    scanning = true;
    const bins = Object.fromEntries(CLI_BACKEND_IDS.map((id) => [id, resolveBin(BACKENDS[id])]));
    const helps = Object.fromEntries(CLI_BACKEND_IDS.map((id) => [id, BACKENDS[id].helpArgs ?? [["--help"]]]));
    discovery = discoverBackends(probe, bins, helps)
      .then((m) => {
        caps = toCaps(m);
        discoveredOnce = true;
        // Đã biết phiên bản từng CLI: lần gọi đầu khỏi phải chạy --version.
        for (const id of CLI_BACKEND_IDS) if (m[id]?.installed !== false && m[id]?.fingerprint) engine.primeVersion?.(id, m[id]!.fingerprint);
        // Hỏi tiếp từng CLI xem có model nào (chạy nền, xong thì báo add-in cập nhật danh sách).
        void discoverModels(bins, Object.fromEntries(CLI_BACKEND_IDS.map((id) => [id, caps[id]?.installed === true])), process.env, catalog)
          .then((c) => {
            catalog = c;
            saveCatalog(modelsFile, c);
            broadcastCaps();
          })
          .catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => {
        scanning = false;
        broadcastCaps();
      });
    return discovery;
  };
  if (discover) void runDiscovery();

  /** Chọn model thực sự chạy. Trả về thông báo (kind "missing") nếu backend chưa có trên máy. */
  async function pickModel(choice: ModelChoice | "auto"): Promise<{ model: ModelChoice } | { missing: string }> {
    // Chỉ chờ dò máy khi chưa biết gì về backend cần dùng (lần đầu cài); đã có kết quả cũ thì chạy ngay.
    const known =
      choice === "auto" ? resolveAuto(caps, apiStatus()) !== undefined : choice.backend === "api" || caps[choice.backend]?.installed === true;
    if (scanning && !known) await discovery;
    const ready = readyBackends(caps, apiStatus());
    const noneMsg =
      "Máy chưa có backend AI nào. Cài một trong các CLI: Claude Code (claude), Codex (codex) hoặc Antigravity (agy) rồi đăng nhập; " +
      "hoặc nhập khóa API trong ⚙ Cài đặt. Cài xong bấm “Dò lại”.";
    if (choice === "auto") {
      const m = autoChoice();
      return m ? { model: m } : { missing: noneMsg };
    }
    if (choice.backend === "api") {
      const p = splitApiModel(choice.model);
      if (p && api.configured(p.provider)) return { model: choice };
      const label = p ? API_PROVIDERS[p.provider].label : "API";
      return { missing: `Chưa nhập khóa API cho ${label}. Mở ⚙ Cài đặt → API để thêm${ready.length ? ", hoặc chọn model khác" : ""}.` };
    }
    if (caps[choice.backend]?.installed === false) {
      if (ready.length === 0) return { missing: noneMsg };
      const info = BACKEND_INFO[choice.backend];
      const others = ready.map((b) => BACKEND_INFO[b].label).join(", ");
      return { missing: `${info.product} chưa được cài trên máy này. Hãy chọn model của ${others}, hoặc cài ${info.product} (xem ⚙ Cài đặt → Backend).` };
    }
    return { model: choice };
  }

  const queue = new LearnQueue(paths.learnQueue(home));
  const learner = new Learner({
    engine,
    queue,
    state: new LearnState(paths.learnState(home)),
    skillsDir: skills.dir,
    cwd: paths.learnCwd(home),
    enabled: () => config.get().learn?.enabled !== false,
    rules: () => {
      const st = chatStore.state();
      return [st.globalRules, ...st.projects.map((p) => p.rules)].map((x) => x.trim()).filter(Boolean).join("\n");
    },
  });
  const local = new LocalTools(skills, paths.style(home));
  const promptLib = new PromptLibrary(paths.prompts(home));
  const modes = new ModeStore(paths.modes(home));
  const chatStore = new ChatStore(paths.chats(home), paths.chatDir(home));
  const themeCache = new ThemeCache(opts.themeScan);
  const fileStore = new FileStore(paths.files(home));
  {
    const st = chatStore.state();
    fileStore.prune(new Set(st.chats.map((c) => c.id)), new Set(st.projects.map((p) => p.id)));
  }
  // Sổ nguồn dùng chung với PVTA Chat (cùng thư mục notebooks/ trong dữ liệu PVTA).
  const nbAborts = new Map<string, AbortController>();
  const notebooks = new AddinNotebooks({
    home,
    changed: (id) => {
      for (const r of sessions.values()) send(r.ws, { type: "nb_changed", id });
    },
    ask: async (system, user, signal, meta) => {
      const cfgModel = config.get().model;
      const picked = await pickModel(meta?.choice ? { backend: meta.choice.backend, model: meta.choice.model } : cfgModel === "auto" || isValidModelChoice(cfgModel) ? cfgModel : "auto");
      if ("missing" in picked) throw new Error(picked.missing);
      fs.mkdirSync(paths.learnCwd(home), { recursive: true });
      const res = await engine.run({
        backend: picked.model.backend,
        model: picked.model.model,
        cwd: paths.learnCwd(home),
        permission: "ask",
        effort: effortFor(picked.model, "low"),
        speed: picked.model.speed,
        signal,
        timeoutMs: 300_000,
        system,
        buildPrompt: (_resumed, systemSent) => (systemSent ? user : `${system}\n\n${user}`),
      });
      return res.text;
    },
  });
  const scopesOf = (r: SessionRec): Scope[] => {
    const out: Scope[] = [];
    if (r.chatId) out.push({ kind: "chat", id: r.chatId });
    const pid = projectOf(r);
    if (pid) out.push({ kind: "project", id: pid });
    return out;
  };
  const wsMsg = (r: SessionRec) => {
    const base = chatStore.state(r.chatId);
    const pid = projectOf(r);
    return {
      type: "workspace" as const,
      ...base,
      ...(pid ? { activeProject: pid } : {}),
      projectFiles: Object.fromEntries(base.projects.map((p) => [p.id, fileStore.list({ kind: "project", id: p.id })])),
      chatFiles: r.chatId ? fileStore.list({ kind: "chat", id: r.chatId }) : [],
      chatRules: readChatRules(home),
    };
  };
  const broadcastWorkspace = () => {
    for (const r of sessions.values()) send(r.ws, wsMsg(r));
  };
  /** Dự án của hội thoại đang mở ở một cửa sổ (đã lưu thì theo bản lưu). */
  const projectOf = (r: SessionRec) => (r.chatId ? chatStore.get(r.chatId)?.projectId : undefined) ?? r.projectId;
  /** Hội thoại đang mở ở các cửa sổ: chưa tóm tắt (vẫn còn nguyên trong ngữ cảnh). */
  const openChatIds = () => new Set([...sessions.values()].map((r) => r.chatId).filter((x): x is string => !!x));
  const staleDigests = () => {
    const open = openChatIds();
    return chatStore.needDigest().filter((c) => !open.has(c.id));
  };
  let digestJob: Promise<void> | undefined;
  let digestTimer: NodeJS.Timeout | undefined;
  /** Bộ nhớ dự án: nhờ model tóm tắt các hội thoại đã rời đi. Chạy nền, mức suy nghĩ thấp, tối đa vài hội thoại mỗi lượt. */
  const runDigests = (): Promise<void> => {
    if (digestJob) return digestJob;
    const run = (async () => {
      try {
        for (const c of staleDigests().slice(0, 5)) {
          const cfgModel = config.get().model;
          const picked = await pickModel(cfgModel === "auto" || isValidModelChoice(cfgModel) ? cfgModel : "auto");
          if ("missing" in picked || picked.model.backend === "api") return; // khóa API: không chạy nền
          const transcript = transcriptOf(chatStore.messages(c.id));
          if (!transcript) {
            chatStore.setDigest(c.id, "(chưa có nội dung)", c.updatedAt);
            continue;
          }
          const prompt = buildDigestPrompt(c.title, transcript);
          fs.mkdirSync(paths.learnCwd(home), { recursive: true });
          const res = await engine.run({
            backend: picked.model.backend,
            model: picked.model.model,
            cwd: paths.learnCwd(home),
            effort: "low",
            permission: "ask",
            buildPrompt: () => prompt,
            timeoutMs: 90_000,
          });
          chatStore.setDigest(c.id, res.text, c.updatedAt);
        }
      } catch {
        /* tóm tắt lỗi: thử lại lần sau, không ảnh hưởng hội thoại */
      }
    })();
    // Đặt lại sau khi gán (vòng lặp không có việc thì cả hàm chạy xong ngay, trước lúc gán).
    const job: Promise<void> = run.finally(() => {
      if (digestJob === job) digestJob = undefined;
      broadcastWorkspace();
    });
    digestJob = job;
    return job;
  };
  const scheduleDigests = () => {
    clearTimeout(digestTimer);
    digestTimer = setTimeout(() => void runDigests(), opts.digestMs ?? 30_000);
    digestTimer.unref?.();
  };
  const broadcastModes = (extra: { saved?: string; notice?: string } = {}) => {
    const m = { type: "modes" as const, custom: modes.list(), ...extra };
    for (const r of sessions.values()) send(r.ws, m);
  };
  /** Chế độ đã lưu còn tồn tại không (chế độ tự tạo có thể vừa bị xóa). */
  const savedMode = (): WritingMode => {
    const m = config.get().mode;
    return modes.has(m) ? m : "standard";
  };
  const learnOn = () => config.get().learn?.enabled !== false;
  let fileLearn: { busy: boolean; note?: string } = { busy: false };
  const learnedMsg = () => ({ type: "learned" as const, enabled: learnOn(), pending: queue.all().length, items: listLearned(skills.dir), fileLearn });
  const broadcastLearned = () => {
    const m = learnedMsg();
    for (const r of sessions.values()) send(r.ws, m);
  };
  const hintsOn = () => config.get().hints?.enabled !== false;
  const ragOn = () => config.get().rag?.enabled !== false;
  const ragMsg = (r?: SessionRec): ServerMessage => {
    const i = r?.rag;
    const st: RagStatus = { enabled: ragOn(), ready: !!i && i.chunks.length > 0, ...(i ? { name: i.name, chunks: i.chunks.length, chars: i.chars, truncated: i.truncated, builtAt: i.builtAt, ms: r?.ragMs, fp: i.fp } : {}) };
    return { type: "rag", ...st };
  };
  const hintGate = new HintGate();
  const refStore = new RefStore(path.join(home, "refs"));
  // ---- Hình trong văn bản: model nền đọc hình trong thư mục ẩn riêng (hint/img), tách khỏi phiên chính ----
  const imgStore = new ImageStore(path.join(paths.hintCwd(home), "img"));
  const imgReading = new Map<string, Promise<void>>();
  let imgChain: Promise<void> = Promise.resolve();
  let imgFailAt = Number.NEGATIVE_INFINITY;
  const imgStatus = (rec: SessionRec) => {
    const map = rec.images ?? [];
    if (rec.ws) send(rec.ws, { type: "img_status", total: map.length, read: map.filter((m) => imgStore.desc(m.hash)).length });
  };
  /** Đọc các hình chưa có mô tả (gói 4 hình một lượt, mỗi lúc một lượt, model rẻ nhất có xem được ảnh). */
  const readImages = (rec: SessionRec, items: import("@pvta/shared").ImgMeta[]): Promise<void> => {
    const todo = items.filter((m) => !imgStore.desc(m.hash) && imgStore.hasImage(m.hash));
    const waits: Promise<void>[] = [];
    const fresh = todo.filter((m) => {
      const p = imgReading.get(m.hash);
      if (p) waits.push(p);
      return !p;
    });
    for (let i = 0; i < fresh.length; i += IMG.batch) {
      const batch = fresh.slice(i, i + IMG.batch);
      const job = (imgChain = imgChain.then(async () => {
        const choice = cheapestChoice(caps, catalog);
        if (!visionCapable(choice) || Date.now() - imgFailAt < IMG.failCooldownMs) return;
        const dir = paths.hintCwd(home);
        fs.mkdirSync(dir, { recursive: true });
        const files = batch.map((m) => ({ ...m, file: imgStore.imagePath(m.hash) }));
        const { system, request } = buildVisionPrompt(files, (f) => f);
        try {
          const res = await engine.run({
            backend: choice.backend,
            model: choice.model,
            cwd: dir,
            permission: "ask",
            effort: effortFor(choice, "low"),
            timeoutMs: IMG.timeoutMs,
            system,
            images: files.map((f) => f.file),
            buildPrompt: (_r, systemSent) => (systemSent ? request : `${system}\n\n${request}`),
          });
          const got = parseVision(res.text, batch.map((m) => m.id));
          for (const m of batch) {
            const d = got.get(m.id);
            if (d) imgStore.saveDesc(m.hash, { ...d, model: `${choice.backend}:${choice.model}`, at: Date.now() });
          }
        } catch {
          imgFailAt = Date.now(); // im lặng; nghỉ một lúc rồi mới thử lại
        } finally {
          for (const m of batch) imgReading.delete(m.hash);
          imgStatus(rec);
        }
      }));
      for (const m of batch) imgReading.set(m.hash, job);
      waits.push(job);
    }
    return Promise.all(waits).then(() => undefined);
  };
  const imagesDeps = (rec: SessionRec) => ({
    section: () => (rec.host === "word" ? imageSection(rec.images ?? [], (h) => imgStore.desc(h)) : ""),
    ensure: async (text: string, signal: AbortSignal) => {
      const need = neededImages(text, rec.images ?? []).filter((m) => !imgStore.desc(m.hash));
      if (need.length === 0 || signal.aborted) return;
      await Promise.race([
        readImages(rec, need),
        new Promise<void>((r) => setTimeout(r, IMG.waitMs).unref()),
        new Promise<void>((r) => signal.addEventListener("abort", () => r(), { once: true })),
      ]);
    },
    decorate: (r: ToolResult): ToolResult => {
      if (!r.ok || !r.result || typeof r.result !== "object") return r;
      const res = r.result as { images?: Array<{ hash?: string } & Record<string, unknown>> };
      if (!Array.isArray(res.images)) return r;
      return {
        ...r,
        result: {
          ...res,
          images: res.images.map(({ hash, ...rest }) => {
            const d = hash ? imgStore.desc(hash) : undefined;
            return { ...rest, ...(d ? { noi_dung: d.what, chu_trong_hinh: d.text, so_lieu: d.data } : { noi_dung: "chưa đọc được" }) };
          }),
        },
      };
    },
  });
  const refGate = new RefGate();
  const placeCache = new PlaceCache(path.join(home, "refs", "places.json"));
  const refInfos = (file: string) => refStore.list(file).map(({ id, title, url, host, why }) => ({ id, title, url, host, why }));
  /** Tìm văn bản liên quan trên mạng ở nền: chỉ lưu tên và link, bridge tự tìm nên không tốn lượt model. */
  async function runRefs(rec: SessionRec, ws: WebSocket, key: string, input: HintInput, head: string, modeId?: string): Promise<void> {
    const file = input.fileName;
    let ok = false;
    try {
      const found = await findRefs({ fileName: file, profile: input.profile, head, modeId }, opts.webFetch, placeCache);
      if (found.length) {
        refStore.add(found);
        send(ws, { type: "refs", items: refInfos(file) });
      }
      ok = found.length > 0;
    } catch {
      /* im lặng */
    } finally {
      refGate.finish(key, ok);
    }
  }
  const hintInput = (rec: SessionRec, profile: string): HintInput => {
    const st = chatStore.state();
    return {
      host: rec.host,
      fileName: rec.docName ?? "",
      profile,
      skills: skills.list().map((s) => ({ name: s.name, description: s.description, load: s.load })),
      customModes: modes.list(),
      projects: st.projects,
      chatTitles: st.chats.map((c) => ({ projectId: c.projectId, title: c.title })),
    };
  };
  /** Lượt model nhỏ nhất chạy nền: bộ hủy và tiến trình riêng, im lặng nếu lỗi (không báo lỗi cho giáo viên). */
  async function runHintAi(rec: SessionRec, ws: WebSocket, id: string, key: string, input: HintInput, local: Hints, choice: ModelChoice): Promise<void> {
    hintGate.start(rec.id);
    rec.hint?.abort();
    const ac = new AbortController();
    rec.hint = ac;
    let result: Hints | undefined;
    try {
      const { system, request } = buildHintPrompt(input);
      // Thư mục ẩn riêng (không phải rec.dir của phiên chính): hai tiến trình CLI không dùng chung nơi làm việc.
      const hintDir = paths.hintCwd(home);
      fs.mkdirSync(hintDir, { recursive: true });
      const res = await engine.run({
        backend: choice.backend,
        model: choice.model,
        cwd: hintDir,
        permission: "ask",
        effort: effortFor(choice, "low"),
        signal: ac.signal,
        timeoutMs: HINT.timeoutMs,
        system,
        buildPrompt: (_resumed, systemSent) => (systemSent ? request : `${system}\n\n${request}`),
      });
      const ai = parseHintResponse(res.text, input);
      if (ai) result = mergeHints(local, ai);
    } catch {
      /* im lặng: gợi ý chỉ là phần thêm */
    } finally {
      if (rec.hint === ac) rec.hint = undefined;
      if (ac.signal.aborted) hintGate.release();
      else hintGate.finish(key, result);
    }
    if (result && !ac.signal.aborted && !isEmptyHints(result)) send(ws, { type: "hints", id, hints: result });
  }
  const skillsMsg = (notice?: string) => ({ type: "skills" as const, items: skillInfos(skills), ...(notice ? { notice } : {}) });
  const broadcastSkills = (notice?: string) => {
    const m = skillsMsg(notice);
    for (const r of sessions.values()) send(r.ws, m);
  };
  // Cập nhật: chỉ kiểm tra khi bản đã cài; người dùng bấm mới tải về.
  const updApp: AppInfo | undefined = opts.update?.app === false ? undefined : (opts.update?.app ?? detectApp());
  let updLatest: LatestInfo | undefined;
  let updState: "checking" | "downloading" | "installing" | "restarting" | undefined;
  let updError: string | undefined;
  const updateMsg = () => ({
    type: "update" as const,
    current: updApp?.version ?? "dev",
    available: !!(updApp && updLatest && compareVersions(updLatest.version, updApp.version) > 0),
    ...(updLatest ? { latest: updLatest.version, notes: updLatest.notes } : {}),
    ...(updState ? { state: updState } : {}),
    ...(updError ? { error: updError } : {}),
    canUpdate: !!updApp,
    ...(installerCommand(opts.update?.platform) ? { installerCmd: installerCommand(opts.update?.platform)!.display } : {}),
  });
  const broadcastUpdate = () => {
    const m = updateMsg();
    for (const r of sessions.values()) send(r.ws, m);
  };
  const checkUpdate = async () => {
    if (!updApp || updState) return;
    updState = "checking";
    updError = undefined;
    broadcastUpdate();
    try {
      updLatest = await fetchLatest(opts.update?.fetchFn ?? fetch);
    } catch (e) {
      updError = (e as Error).message;
    }
    updState = undefined;
    broadcastUpdate();
  };
  const anyBusy = () => [...sessions.values()].some((r) => r.chat.busy);
  const doUpdate = async () => {
    if (process.env.PVTA_RELEASE_REPO === "phandinhdoc-spec/PVTA-ChatBox") { doInstaller(); return; }
    if (!updApp || updState) return;
    if (anyBusy()) {
      updError = "PVTA đang trả lời. Đợi xong rồi cập nhật.";
      broadcastUpdate();
      return;
    }
    updError = undefined;
    updState = "checking";
    broadcastUpdate();
    try {
      updLatest = await fetchLatest(opts.update?.fetchFn ?? fetch);
      if (compareVersions(updLatest.version, updApp.version) <= 0) {
        updState = undefined;
        broadcastUpdate();
        return;
      }
      updState = "downloading";
      broadcastUpdate();
      await applyUpdate({ app: updApp, latest: updLatest, fetchFn: opts.update?.fetchFn, tarballUrl: opts.update?.tarballUrl, extractFn: opts.update?.extractFn });
      updState = "restarting";
      broadcastUpdate();
      setTimeout(() => relaunch(updApp, process.env, opts.update?.restart), 800);
    } catch (e) {
      updError = (e as Error).message;
      updState = undefined;
      broadcastUpdate();
    }
  };
  // Cập nhật bằng lệnh cài đặt từ GitHub. Script tự dừng bridge này, thay bản mới rồi bật lại;
  // add-in tự nối lại và tải lại trang khi thấy số phiên bản đổi. Quá 3 phút mà bridge vẫn chạy thì coi là chưa xong.
  let installTimer: NodeJS.Timeout | undefined;
  const failInstall = (msg: string) => {
    if (updState !== "installing") return;
    clearTimeout(installTimer);
    updState = undefined;
    updError = msg;
    broadcastUpdate();
  };
  const doInstaller = () => {
    if (!updApp || updState) return;
    if (anyBusy()) {
      updError = "PVTA đang trả lời. Đợi xong rồi cập nhật.";
      broadcastUpdate();
      return;
    }
    if (!installerCommand(opts.update?.platform)) {
      updError = "Hệ điều hành này chưa có lệnh cài đặt tự động.";
      broadcastUpdate();
      return;
    }
    updError = undefined;
    updState = "installing";
    broadcastUpdate();
    const started = runInstaller({ logFile: path.join(home, "update.log"), platform: opts.update?.platform, spawnFn: opts.update?.spawnFn, onFail: failInstall });
    if (!started) return failInstall("Không chạy được lệnh cài đặt.");
    installTimer = setTimeout(() => failInstall("Lệnh cài đặt chưa hoàn tất sau 60 phút. Xem update.log trong thư mục dữ liệu của PVTA, hoặc dán lệnh vào Terminal/PowerShell."), 3600_000);
    installTimer.unref();
  };
  /** Kết quả dò GitHub giữ tạm 10 phút để cài các skill đã chọn không phải tải lại. */
  const scanCache = new Map<string, { at: number; items: Candidate[] }>();
  const broadcastPrompts = () => {
    const m = { type: "prompts" as const, ...promptLib.state() };
    for (const r of sessions.values()) send(r.ws, m);
  };
  const readStyle = () => {
    try {
      return fs.readFileSync(paths.style(home), "utf8");
    } catch {
      return "";
    }
  };

  const allowedOrigins = new Set(config.get().allowedOrigins ?? DEFAULT_ORIGINS);
  const sessions = new Map<string, SessionRec>();

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "pvta-bridge" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024,
    // Chặn trang web lạ mở WebSocket tới cổng cục bộ: bắt buộc Origin nằm trong danh sách cho phép.
    verifyClient: (info: { origin?: string }) => {
      if (!info.origin) return opts.allowNoOrigin === true;
      return allowedOrigins.has(info.origin);
    },
  });

  const onUpgrade = (req: http.IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    if ((req.url ?? "").split("?")[0] !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  };
  httpServer.on("upgrade", onUpgrade);
  const webOpts = opts.web === false ? undefined : (opts.web ?? detectWeb(home));
  const webServer = webOpts ? createWebServer(webOpts) : undefined;
  webServer?.on("upgrade", onUpgrade);

  const send = (ws: WebSocket | undefined, msg: ServerMessage) => {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  // Chế độ iPad: máy này làm máy chủ cho Word/Excel trên iPad trong cùng Wi-Fi (mặc định tắt).
  const ipad =
    opts.ipad === false
      ? undefined
      : new IpadHost({
          home,
          // Thư mục add-in lấy thẳng từ PVTA_WEB: không phụ thuộc chứng chỉ localhost của máy chủ add-in trên máy.
          webDir: webOpts?.dir ?? (opts.web === false ? undefined : process.env.PVTA_WEB),
          version: updApp?.version,
          ...opts.ipad,
          load: () => config.get().ipad ?? {},
          save: (patch) => config.set({ ipad: { ...config.get().ipad, ...patch } }),
          accept: (ws, req) => wss.emit("connection", ws, req),
        });
  const ipadMsg = (ws?: WebSocket): ServerMessage | undefined => (ipad ? { type: "ipad", ...ipad.status(!!ws && ipad.remote.has(ws)) } : undefined);
  const broadcastIpad = () => {
    if (!ipad) return;
    for (const r of sessions.values()) if (r.ws) send(r.ws, ipadMsg(r.ws)!);
  };

  function makeSession(id: string, host: OfficeHost, lang: "vi" | "en"): SessionRec {
    const dir = workspace.create(id);
    const pendingRpc = new Map<string, (r: ToolResult) => void>();
    const pendingApproval = new Map<string, (r: "approved" | "declined" | "timeout") => void>();
    let seq = 0;
    const rec: SessionRec = {
      id,
      dir,
      host,
      lang,
      chat: undefined as unknown as ChatSession,
      pending: { rpc: pendingRpc, approval: pendingApproval },
      failPending: () => undefined,
    };

    rec.failPending = (reason: string) => {
      for (const [rid, fn] of [...pendingRpc]) {
        pendingRpc.delete(rid);
        fn({ tool: "", ok: false, error: reason });
      }
      for (const [rid, fn] of [...pendingApproval]) {
        pendingApproval.delete(rid);
        fn("declined");
      }
    };

    const port: RpcPort = {
      emit: (m) => send(rec.ws, m),
      call: (call: ToolCall, signal?: AbortSignal) =>
        new Promise<ToolResult>((resolve) => {
          if (!rec.ws || rec.ws.readyState !== rec.ws.OPEN) return resolve({ tool: call.tool, ok: false, error: "Add-in không còn kết nối." });
          if (signal?.aborted) return resolve({ tool: call.tool, ok: false, error: "Đã hủy." });
          const rid = `r${++seq}`;
          const done = (r: ToolResult) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            pendingRpc.delete(rid);
            resolve({ ...r, tool: call.tool }); // add-in không gửi lại tên công cụ
          };
          const onAbort = () => done({ tool: call.tool, ok: false, error: "Đã hủy." });
          const timer = setTimeout(() => done({ tool: call.tool, ok: false, error: "Add-in không phản hồi (quá thời gian)." }), RPC_TIMEOUT_MS);
          signal?.addEventListener("abort", onAbort, { once: true });
          pendingRpc.set(rid, done);
          send(rec.ws, { type: "rpc_request", id: rid, call });
        }),
      approve: (call: ToolCall, signal?: AbortSignal) =>
        new Promise((resolve) => {
          if (signal?.aborted) return resolve("declined");
          const rid = `a${++seq}`;
          const done = (r: "approved" | "declined" | "timeout") => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            pendingApproval.delete(rid);
            resolve(r);
          };
          const onAbort = () => done("declined");
          const timer = setTimeout(() => done("timeout"), LIMITS.approvalTimeoutMs);
          signal?.addEventListener("abort", onAbort, { once: true });
          pendingApproval.set(rid, done);
          send(rec.ws, { type: "approval_request", id: rid, call });
        }),
    };

    rec.callRpc = port.call;
    rec.chat = new ChatSession({
      sessionId: id,
      docs: {
        list: () =>
          [...sessions.values()]
            .filter((r) => r.ws && r.ws.readyState === r.ws.OPEN)
            .map((r) => ({ id: r.id, host: r.host, name: r.docName ?? "(chưa biết tên tệp)", busy: r.chat.busy })),
        call: (rid, c, sig) => {
          const t = sessions.get(rid);
          return t?.callRpc ? t.callRpc(c, sig) : Promise.resolve({ tool: c.tool, ok: false, error: "Cửa sổ đó không còn kết nối." });
        },
      },
      host,
      lang,
      engine,
      cwd: dir,
      skills,
      local,
      config,
      learnQueue: queue,
      readStyle,
      port,
      learnEnabled: learnOn,
      extraRules: () => [chatStore.effectiveRules(projectOf(rec)), alwaysRulesText(readChatRules(home))].filter(Boolean).join("\n"),
      notebooks: { section: (t: string) => notebooks.section(t), tool: (c) => notebooks.tool(c) },
      pdfTool: (call) => {
        const r = fileStore.pages(scopesOf(rec), call.args);
        return r.ok ? { tool: call.tool, ok: true, result: r.result } : { tool: call.tool, ok: false, error: r.error };
      },
      themeTool: (call) => {
        const cat = themeCache.get(host);
        const kind = call.args.kind === "colors" || call.args.kind === "fonts" || call.args.kind === "theme" ? call.args.kind : undefined;
        const all = [...cat.themes, ...cat.colors, ...cat.fonts].filter((t) => !kind || t.kind === kind);
        return {
          tool: call.tool,
          ok: true,
          result: {
            nguon: cat.source === "office" ? "chủ đề có sẵn của Office trên máy" : "danh sách dự phòng của PVTA (không đọc được chủ đề của Office)",
            items: all.slice(0, 80).map((t) => ({ id: t.id, name: t.name, kind: t.kind, ...(t.colors ? { dk2: t.colors.dk2, accents: [t.colors.accent1, t.colors.accent2, t.colors.accent3, t.colors.accent4, t.colors.accent5, t.colors.accent6] } : {}), ...(t.fonts ? { fonts: t.fonts } : {}) })),
          },
        };
      },
      extraFiles: () => fileStore.promptSection(scopesOf(rec)),
      fileTool: (call) => {
        const r = call.tool === "office_file_read" ? fileStore.read(scopesOf(rec), call.args) : fileStore.search(scopesOf(rec), call.args);
        return r.ok ? { tool: call.tool, ok: true, result: r.result } : { tool: call.tool, ok: false, error: r.error };
      },
      extraContext: () => chatStore.projectContext(projectOf(rec), rec.chatId),
      images: imagesDeps(rec),
      rag: {
        section: (ctx: RagContext) => (ragOn() && rec.rag ? ragPromptSection(rec.rag, ctx) : ""),
        tool: (call) => {
          const r = ragSearchTool(ragOn() ? rec.rag : undefined, call.args);
          return r.ok ? { tool: call.tool, ok: true, result: r.result } : { tool: call.tool, ok: false, error: r.error };
        },
      },
    });
    return rec;
  }

  async function finalize(rec: SessionRec): Promise<void> {
    if (sessions.get(rec.id) !== rec) return;
    sessions.delete(rec.id);
    rec.chat.cancel();
    // Học nốt hàng đợi (tối đa ~120 giây) rồi mới xóa thư mục phiên.
    const flush = learner.maybeRun({ force: true }).catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([flush, new Promise((r) => (timer = setTimeout(r, opts.flushLearnMs ?? 120_000)))]);
    clearTimeout(timer);
    // Panel mở lại cùng phiên trong lúc học nốt: thư mục đang được phiên mới dùng, không xóa.
    if (!sessions.has(rec.id)) workspace.remove(rec.id);
  }

  function docContext(v: unknown): DocContext | undefined {
    if (!v || typeof v !== "object") return undefined;
    const o = v as Record<string, unknown>;
    return {
      selection: typeof o.selection === "string" ? o.selection.slice(0, 20_000) : undefined,
      where: typeof o.where === "string" ? o.where.slice(0, 100) : undefined,
    };
  }

  /** Đọc chế độ viết + nhiệt độ từ tin nhắn, lưu lại; trả về giá trị để chạy. */
  function takeStyle(msg: { mode?: unknown; temperature?: unknown }): { mode: WritingMode; modeText: string; temperature?: number } {
    const patch: { mode?: WritingMode; temperature?: number | null } = {};
    if (modes.has(msg.mode)) patch.mode = msg.mode;
    if (msg.temperature === null) patch.temperature = null;
    else if (clampTemperature(msg.temperature) !== undefined) patch.temperature = clampTemperature(msg.temperature);
    if (Object.keys(patch).length) config.set(patch);
    const cfg = config.get();
    const mode = savedMode();
    const spec = modes.resolve(mode);
    const temperature = clampTemperature(cfg.temperature) ?? spec?.temperature;
    return { mode, modeText: spec?.instructions ?? "", temperature };
  }

  /** Một lượt công cụ viết: không công cụ, không lịch sử, không giữ phiên CLI (nhanh, gọn). */
  /**
   * Một lượt gọi ngắn: không công cụ, không lịch sử, không giữ phiên CLI (nhanh, gọn).
   * Dùng cho công cụ viết và tối ưu lời nhắc. Mỗi phiên một lượt: lượt mới thay lượt cũ.
   */
  async function runOneShot(
    rec: SessionRec,
    ws: WebSocket,
    id: string,
    choice: ModelChoice | "auto",
    effort: Effort,
    temperature: number | undefined,
    build: (model: ModelChoice) => { system: string; request: string },
    clean: (s: string) => string,
  ): Promise<void> {
    rec.write?.abort();
    const ac = new AbortController();
    rec.write = ac;
    const sw = new Stopwatch();
    try {
      const picked = await pickModel(choice);
      if ("missing" in picked) {
        send(ws, { type: "error", id, kind: "missing", message: picked.missing });
        return;
      }
      if (ac.signal.aborted) throw new EngineError("other", "Đã hủy.");
      if (choice === "auto") send(ws, { type: "model_used", id, model: picked.model });
      const { system, request } = build(picked.model);
      const res = await engine.run({
        backend: picked.model.backend,
        model: picked.model.model,
        cwd: rec.dir,
        permission: "ask",
        effort: effortFor(picked.model, effort),
        speed: picked.model.speed,
        temperature,
        signal: ac.signal,
        timeoutMs: 300_000,
        system,
        buildPrompt: (_resumed, systemSent) => (systemSent ? request : `${system}\n\n${request}`),
        onDelta: (t) => send(ws, { type: "text_delta", id, text: t }),
      });
      send(ws, { type: "write_result", id, text: clean(res.text) });
      send(ws, { type: "done", id, timings: { spawnMs: res.timings.spawnMs, firstTokenMs: res.timings.firstTokenMs, totalMs: sw.elapsed(), rounds: 1, rpcMs: [], warm: res.timings.warm }, notes: res.notes });
    } catch (e) {
      if (e instanceof EngineError) send(ws, { type: "error", id, kind: e.kind, message: e.message });
      else send(ws, { type: "error", id, kind: "other", message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (rec.write === ac) rec.write = undefined;
    }
  }

  function runWrite(
    rec: SessionRec,
    ws: WebSocket,
    id: string,
    action: WriteAction,
    text: string,
    context: string | undefined,
    option: string | undefined,
    choice: ModelChoice | "auto",
    effort: Effort,
    style: { modeText: string; temperature?: number },
  ): Promise<void> {
    return runOneShot(rec, ws, id, choice, effort, style.temperature, (model) => {
      rec.lastWriteModel = model;
      return {
        system: writeSystem({ host: rec.host, lang: rec.lang, style: readStyle(), modeText: style.modeText }),
        request: writeRequest({ action, text, context, option }),
      };
    }, cleanWriteOutput);
  }

  function handle(ws: WebSocket, msg: ClientMessage, rec: SessionRec | undefined): SessionRec | undefined {
    if (msg.type === "hello") {
      const host: OfficeHost = HOSTS.includes(msg.host) ? msg.host : "word";
      const lang = msg.lang === "en" ? "en" : "vi";
      const existing = sessions.get(String(msg.sessionId));
      let r: SessionRec;
      if (existing) {
        // Tải lại panel trong thời gian chờ: giữ phiên.
        if (existing.closeTimer) clearTimeout(existing.closeTimer);
        existing.closeTimer = undefined;
        if (existing.ws && existing.ws !== ws) existing.ws.close();
        existing.ws = ws;
        r = existing;
      } else {
        r = makeSession(String(msg.sessionId), host, lang); // ném lỗi nếu sessionId không hợp lệ
        r.ws = ws;
        sessions.set(r.id, r);
      }
      r.docName = docDisplayName(msg.doc);
      const cfg = config.get();
      send(ws, {
        type: "ready",
        permission: cfg.permission ?? null,
        model: cfg.model === "auto" || isValidModelChoice(cfg.model) ? cfg.model : "auto",
        effort: cfg.effort ?? DEFAULT_EFFORT,
        mode: savedMode(),
        temperature: clampTemperature(cfg.temperature) ?? null,
        busy: r.chat.busy,
        ...machine(),
      });
      send(ws, { type: "prompts", ...promptLib.state() });
      send(ws, wsMsg(r));
      send(ws, { type: "modes", custom: modes.list() });
      send(ws, learnedMsg());
      send(ws, { type: "hints_cfg", enabled: hintsOn() });
      send(ws, skillsMsg());
      send(ws, updateMsg());
      send(ws, ragMsg(r));
      const im = ipadMsg(ws);
      if (im) send(ws, im);
      return r;
    }
    if (!rec) return rec;
    // Chưa kích hoạt (bản có đòi giấy phép): chỉ chặn các thao tác dùng AI; kích hoạt làm trong ứng dụng PVTA trên máy.
    if (LICENSE_GATED.has(msg.type) && !new LicenseStore(home).activated()) {
      send(ws, { type: "error", id: String((msg as { id?: string }).id ?? ""), kind: "denied", message: "PVTA chưa được kích hoạt. Mở ứng dụng PVTA trên máy, nhập email và mã kích hoạt được cấp, rồi quay lại đây." });
      return rec;
    }
    const pend = rec.pending;

    switch (msg.type) {
      case "chat": {
        const id = String(msg.id ?? "");
        if (rec.chat.busy) {
          send(ws, { type: "error", id, kind: "other", message: "Đang xử lý tin nhắn trước, hãy chờ hoặc hủy." });
          return rec;
        }
        const model = msg.model === "auto" ? "auto" : isValidModelChoice(msg.model) ? msg.model : undefined;
        if (!model) {
          send(ws, { type: "error", id, kind: "model", message: "Model không hợp lệ. Hãy chọn lại model." });
          return rec;
        }
        const text = String(msg.text ?? "");
        if (text.length > MAX_TEXT) {
          send(ws, { type: "error", id, kind: "other", message: `Yêu cầu quá dài (tối đa ${MAX_TEXT} ký tự).` });
          return rec;
        }
        config.set({ model: model === "auto" ? "auto" : { backend: model.backend, model: model.model, ...(model.speed ? { speed: model.speed } : {}) } });
        const effort = EFFORTS.includes(msg.effort as never) ? msg.effort : undefined;
        if (effort) config.set({ effort });
        const chat = rec.chat;
        const style = takeStyle(msg);
        chat.reserve(); // giữ trạng thái bận trong lúc chờ dò backend
        void pickModel(model).then(
          (r) => {
            if ("missing" in r) {
              chat.release();
              send(ws, { type: "error", id, kind: "missing", message: r.missing });
              return;
            }
            if (model === "auto") send(ws, { type: "model_used", id, model: r.model });
            // Hội thoại mới trong dự án: chờ (tối đa 25 giây) bản tóm tắt các hội thoại vừa rời đi để bối cảnh đầy đủ.
            const pid = projectOf(rec);
            const waitDigest = pid && staleDigests().some((c) => c.projectId === pid) ? Promise.race([runDigests(), new Promise<void>((res) => setTimeout(res, 25_000).unref?.())]) : Promise.resolve();
            void waitDigest.then(async () => {
              let body = text;
              if (msg.beautify) {
                const head = String(msg.beautify.head ?? "").slice(0, 1500);
                const kind = beautifyKind(rec.host);
                rec.beautify = { kind, backend: r.model.backend, model: r.model.model };
                body = buildBeautifyPrompt({ host: rec.host, fileName: rec.docName, head, hasImages: (rec.images?.length ?? 0) > 0, design: String(msg.beautify.design ?? "").slice(0,12000) });
                send(ws, { type: "prompt_shown", id, text: body });
                send(ws, { type: "beautify_state", phase: "working", label: kind.label });
              }
              if (!msg.beautify) {
                const invoked = invokedRulesText(readChatRules(home), text);
                if (invoked) body = `${text}\n\n${invoked}`;
              }
              await chat.chat(id, body, r.model, effortFor(r.model, (effort ?? config.get().effort ?? DEFAULT_EFFORT) as Effort), style, docContext(msg.context), !!msg.beautify);
            });
          },
          () => chat.release(),
        );
        return rec;
      }
      case "write": {
        const id = String(msg.id ?? "");
        if (!isWriteAction(msg.action)) {
          send(ws, { type: "error", id, kind: "other", message: "Thao tác viết không hợp lệ." });
          return rec;
        }
        const text = String(msg.text ?? "");
        if (!text.trim() && !(msg.action === "continue" || msg.action === "ideas")) {
          send(ws, { type: "error", id, kind: "other", message: "Chưa chọn chữ nào. Hãy bôi đen một đoạn trong văn bản." });
          return rec;
        }
        if (text.length > WRITE_MAX_CHARS) {
          send(ws, { type: "error", id, kind: "other", message: `Phần chọn quá dài (tối đa ${WRITE_MAX_CHARS.toLocaleString("vi-VN")} ký tự). Hãy chọn từng phần.` });
          return rec;
        }
        const model = msg.model === "auto" ? "auto" : isValidModelChoice(msg.model) ? msg.model : undefined;
        if (!model) {
          send(ws, { type: "error", id, kind: "model", message: "Model không hợp lệ. Hãy chọn lại model." });
          return rec;
        }
        const effort = EFFORTS.includes(msg.effort as never) ? msg.effort : (config.get().effort ?? DEFAULT_EFFORT);
        void runWrite(rec, ws, id, msg.action, text, typeof msg.context === "string" ? msg.context : undefined, typeof msg.option === "string" ? msg.option : undefined, model, effort as Effort, takeStyle(msg));
        return rec;
      }
      case "prewarm": {
        if (rec.chat.busy && msg.kind === "chat") return rec;
        const model = msg.model === "auto" ? "auto" : isValidModelChoice(msg.model) ? msg.model : undefined;
        if (!model || (scanning && model === "auto")) return rec;
        const m = model === "auto" ? autoChoice() : model;
        if (!m || m.backend === "api" || caps[m.backend]?.installed === false) return rec;
        const effort = effortFor(m, (EFFORTS.includes(msg.effort as never) ? msg.effort! : (config.get().effort ?? DEFAULT_EFFORT)) as Effort);
        const modeText = modes.resolve(modes.has(msg.mode) ? msg.mode : savedMode())?.instructions ?? "";
        const req =
          msg.kind === "write"
            ? {
                backend: m.backend,
                model: m.model,
                cwd: rec.dir,
                permission: "ask" as const,
                effort,
                speed: m.speed,
                system: writeSystem({ host: rec.host, lang: rec.lang, style: readStyle(), modeText }),
              }
            : rec.chat.nextRun(m, effort, { modeText });
        void engine.prewarm?.(req).catch(() => undefined);
        return rec;
      }
      case "optimize": {
        const id = String(msg.id ?? "");
        const text = String(msg.text ?? "").trim();
        if (!text) {
          send(ws, { type: "error", id, kind: "other", message: "Hãy gõ yêu cầu trước khi tối ưu." });
          return rec;
        }
        if (text.length > 8000) {
          send(ws, { type: "error", id, kind: "other", message: "Yêu cầu quá dài để tối ưu (tối đa 8.000 ký tự)." });
          return rec;
        }
        const model = msg.model === "auto" ? "auto" : isValidModelChoice(msg.model) ? msg.model : undefined;
        if (!model) {
          send(ws, { type: "error", id, kind: "model", message: "Model không hợp lệ. Hãy chọn lại model." });
          return rec;
        }
        const hasSel = msg.hasSelection === true;
        // Viết lại cho đúng họ model sẽ chạy lời nhắc; dùng mức suy nghĩ thấp cho nhanh.
        void runOneShot(rec, ws, id, model, "low", 0.3, (m) => ({
          system: optimizerSystem(modelFamily(m), rec.host, rec.lang),
          request: `${hasSel ? "(Giáo viên đang chọn một đoạn trong tài liệu; lời nhắc có thể nói tới \"phần đang chọn\".)\n\n" : ""}<yeu_cau_goc>\n${text}\n</yeu_cau_goc>`,
        }), cleanWriteOutput);
        return rec;
      }
      case "prompts_save": {
        const r = promptLib.save(msg.prompt);
        if (!r.ok) send(ws, { type: "error", id: "prompts", kind: "other", message: r.error });
        broadcastPrompts();
        return rec;
      }
      case "modes_save": {
        const r = modes.save(msg.mode);
        if (!r.ok) send(ws, { type: "error", id: "modes", kind: "other", message: r.error });
        else broadcastModes({ saved: r.id });
        return rec;
      }
      case "modes_delete":
        if (modes.remove(String(msg.id ?? ""))) broadcastModes();
        return rec;
      case "modes_order":
        modes.reorder(msg.ids);
        broadcastModes();
        return rec;
      case "modes_import": {
        const r = modes.import(msg.data, msg.replace === true);
        if (!r.ok) send(ws, { type: "error", id: "modes", kind: "other", message: r.errors.join(" ") });
        else broadcastModes({ notice: [`Đã nhập ${r.added} chế độ.`, ...r.errors].join(" ") });
        return rec;
      }
      case "modes_reset":
        modes.reset();
        if (!modes.has(config.get().mode)) config.set({ mode: "standard", temperature: null });
        broadcastModes();
        return rec;
      case "prompts_delete":
        promptLib.remove(String(msg.id ?? ""));
        broadcastPrompts();
        return rec;
      case "prompts_fav":
        promptLib.favorite(String(msg.id ?? ""), msg.fav === true);
        broadcastPrompts();
        return rec;
      case "learn_set":
        config.set({ learn: { ...(config.get().learn ?? {}), enabled: msg.enabled === true } });
        broadcastLearned();
        return rec;
      case "beautify_cancel":
        rec.beautify = undefined;
        send(ws, { type: "beautify_state", phase: "off" });
        return rec;
      case "beautify_learn": {
        const b = rec.beautify;
        rec.beautify = undefined;
        if (!b) {
          send(ws, { type: "beautify_state", phase: "off" });
          return rec;
        }
        const changes = Array.isArray(msg.changes) ? msg.changes.map((c) => String(c)).slice(0, 30) : [];
        send(ws, { type: "beautify_state", phase: "learning", label: b.kind.label });
        queue.add(beautifyRecord({ docKind: b.kind.label, changes, backend: b.backend, model: b.model }));
        void learner
          .maybeRun({ force: true })
          .then((o) => {
            broadcastLearned();
            const note = o.written.length ? `đã học: ${o.written.join(", ")}` : o.error ? "chưa học được lần này, sẽ thử lại sau" : "không có thói quen mới đáng ghi";
            send(ws, { type: "beautify_state", phase: "off", note });
          })
          .catch(() => send(ws, { type: "beautify_state", phase: "off" }));
        return rec;
      }
      case "hint_set":
        config.set({ hints: { enabled: msg.enabled === true } });
        if (msg.enabled !== true) for (const r of sessions.values()) r.hint?.abort();
        for (const r of sessions.values()) send(r.ws, { type: "hints_cfg", enabled: hintsOn() });
        return rec;
      case "basis_check": {
        const found = checkBasisLocal(home, String(msg.text ?? "").slice(0, 60_000), String(msg.fileName ?? rec.docName ?? ""));
        if (found) send(ws, { type: "basis_report", id: String(msg.id ?? ""), ...found });
        return rec;
      }
      case "basis_mute": {
        muteBasisLocal(home, String(msg.no ?? "").slice(0, 80));
        return rec;
      }
      case "hint_get": {
        const id = String(msg.id ?? "");
        const profile = String(msg.profile ?? "");
        if (!hintsOn() || !profile.trim()) return rec;
        const input = hintInput(rec, profile);
        const key = hintKey(rec.host, rec.docName ?? "", profile);
        const cached = hintGate.cached(key);
        if (cached) {
          if (!isEmptyHints(cached)) send(ws, { type: "hints", id, hints: cached });
          return rec;
        }
        const local = localHints(input);
        if (!isEmptyHints(local)) send(ws, { type: "hints", id, hints: local });
        const rkey = key + "|refs";
        const rd = refGate.decide(rkey);
        if (rd === "cached") {
          const known = refInfos(input.fileName);
          if (known.length) send(ws, { type: "refs", items: known });
        } else if (rd === "run" && input.fileName) void runRefs(rec, ws, rkey, input, String(msg.head ?? "").slice(0, 1500), local.mode?.id);
        else if (rd === "run") refGate.finish(rkey, false);
        const choice = cheapestChoice(caps, catalog);
        if (choice && hintGate.decide(key, rec.id) === "run") void runHintAi(rec, ws, id, key, input, local, choice);
        return rec;
      }
      case "ref_open": {
        const id = String(msg.id ?? "");
        const refId = String(msg.refId ?? "");
        const item = refStore.get(refId);
        if (!item) {
          send(ws, { type: "ref_text", id, refId, ok: false, error: "Không còn mục này trong danh sách." });
          return rec;
        }
        void fetchRefText(item.url, opts.webFetch, opts.webResolve).then((r) =>
          send(ws, r.ok ? { type: "ref_text", id, refId, ok: true, title: item.title, url: item.url, text: r.text, truncated: r.truncated } : { type: "ref_text", id, refId, ok: false, title: item.title, url: item.url, error: r.error }),
        );
        return rec;
      }
      case "img_map": {
        if (!hintsOn() || rec.host !== "word") return rec;
        rec.images = cleanMeta(msg.items);
        const need = rec.images.filter((m) => !imgStore.desc(m.hash) && !imgStore.hasImage(m.hash)).map((m) => m.hash);
        if (need.length) send(ws, { type: "img_need", hashes: [...new Set(need)] });
        void readImages(rec, rec.images);
        imgStatus(rec);
        return rec;
      }
      case "img_data": {
        if (!hintsOn() || !Array.isArray(msg.items)) return rec;
        const known = new Set((rec.images ?? []).map((m) => m.hash));
        for (const it of msg.items.slice(0, IMG.batch * 2) as Array<{ hash?: unknown; data?: unknown }>) {
          if (typeof it?.hash === "string" && known.has(it.hash) && typeof it.data === "string") imgStore.saveImage(it.hash, it.data);
        }
        void readImages(rec, rec.images ?? []);
        return rec;
      }
      case "ref_clear":
        refStore.clear();
        send(ws, { type: "refs", items: [] });
        return rec;
      case "learn_list":
        send(ws, learnedMsg());
        return rec;
      case "learn_file": {
        if (fileLearn.busy) return rec;
        const from = msg.from === "project" ? "project" : "open";
        const docs: Array<{ name: string; text: string }> = [];
        if (from === "open") {
          const idx = rec.rag;
          if (idx) docs.push({ name: idx.name, text: (idx.whole ?? idx.chunks).map((c) => c.text).join("\n") });
        } else {
          const pid = projectOf(rec);
          if (pid) docs.push(...fileStore.texts({ kind: "project", id: pid }));
        }
        if (!docs.length) {
          fileLearn = { busy: false, note: from === "open" ? "Chưa đọc được tệp đang mở (bật “Hỏi đáp trong tệp” rồi thử lại)." : "Dự án này chưa có tệp nào để học." };
          broadcastLearned();
          return rec;
        }
        fileLearn = { busy: true };
        broadcastLearned();
        const cfgModel = config.get().model;
        void pickModel(cfgModel === "auto" || isValidModelChoice(cfgModel) ? cfgModel : "auto")
          .then(async (picked) => {
            if ("missing" in picked) return { ok: false, written: [], note: picked.missing };
            if (picked.model.backend === "api") return { ok: false, written: [], note: "Học từ tệp cần Claude/Codex/Antigravity đăng nhập, chưa hỗ trợ khóa API." };
            const st = chatStore.state();
            return learnFromDocs(docs, {
              engine,
              skillsDir: skills.dir,
              cwd: paths.learnCwd(home),
              backend: picked.model.backend,
              model: picked.model.model,
              rules: [st.globalRules, ...st.projects.map((p) => p.rules)].map((x) => x.trim()).filter(Boolean).join("\n"),
              existing: listLearned(skills.dir).map((i) => i.name),
            });
          })
          .catch((e) => ({ ok: false, written: [], note: e instanceof Error ? e.message : String(e) }))
          .then((o) => {
            fileLearn = { busy: false, note: o.note };
            broadcastLearned();
          });
        return rec;
      }
      case "learn_delete": {
        if (msg.all === true) {
          for (const it of listLearned(skills.dir)) deleteLearned(skills.dir, it.name);
          queue.clear();
        } else if (typeof msg.name === "string") deleteLearned(skills.dir, msg.name);
        broadcastLearned();
        return rec;
      }
      case "update_check":
        void checkUpdate();
        return rec;
      case "update_apply":
        void doUpdate();
        return rec;
      case "update_installer":
        doInstaller();
        return rec;
      case "community_preview": {
        const b = buildFeedback({ skillsDir: skills.dir, version: updApp?.version ?? "dev" });
        send(ws, {
          type: "community",
          phase: "preview",
          items: b.pkg.skills.map((k) => ({ name: k.name, description: k.description, size: k.body.length })),
          skipped: b.skipped,
        });
        return rec;
      }
      case "community_send": {
        const names = Array.isArray(msg.names) ? msg.names.filter((n): n is string => typeof n === "string").slice(0, 60) : undefined;
        const b = buildFeedback({ skillsDir: skills.dir, version: updApp?.version ?? "dev", only: names });
        if (b.pkg.skills.length === 0) {
          send(ws, { type: "community", phase: "error", message: "Chưa có mục nào để gửi." });
          return rec;
        }
        send(ws, { type: "community", phase: "sending" });
        void (async () => {
          try {
            const file = saveFeedbackFiles(path.join(home, "feedback"), b).md;
            const r = await sendViaGh({ title: b.title, body: b.body, tmpDir: path.join(home, "feedback"), run: opts.communityRun });
            if (r.ok) send(ws, { type: "community", phase: "sent", url: r.url, file });
            else if (r.reason === "failed") send(ws, { type: "community", phase: "error", message: r.message, file });
            else send(ws, { type: "community", phase: "manual", issueUrl: manualIssueUrl(b.title), body: b.body, file });
          } catch (e) {
            send(ws, { type: "community", phase: "error", message: e instanceof Error ? e.message : String(e) });
          }
        })();
        return rec;
      }
      case "standardize": {
        const id = typeof msg.id === "string" ? msg.id.slice(0, 100) : "";
        if (!["skill", "rule"].includes(msg.kind) || typeof msg.text !== "string" || msg.text.length > 60_000) {
          send(ws, {type: "standardized", id, error: "Nội dung hoặc loại chuẩn hóa không hợp lệ (tối đa 60.000 ký tự)."});
          return rec;
        }
        void standardize({kind: msg.kind, text: msg.text}).then(result => {
          send(ws, {type: "standardized", id, result});
        }).catch(e => send(ws, {type: "standardized", id, error: e instanceof Error ? e.message : String(e)}));
        return rec;
      }
      case "skills_get":
        send(ws, skillsMsg());
        return rec;
      case "skills_scan": {
        const source = typeof msg.source === "string" ? msg.source.trim() : "";
        void (async () => {
          try {
            const { items } = await scanGithub(source);
            if (items.length === 0) {
              send(ws, { type: "error", id: "skills", kind: "other", message: "Không thấy SKILL.md nào ở link này. Hãy dán link thư mục của một skill, hoặc kho có thư mục skills/." });
              return;
            }
            scanCache.set(source, { at: Date.now(), items });
            send(ws, { type: "skills_found", source, items: items.map(describeCandidate) });
          } catch (e) {
            send(ws, { type: "error", id: "skills", kind: "other", message: e instanceof Error ? e.message : String(e) });
          }
        })();
        return rec;
      }
      case "skills_install": {
        const fail = (message: string) => send(ws, { type: "error", id: "skills", kind: "other", message });
        const report = (r: ReturnType<typeof installCandidates>) => {
          const names = r.installed.map((x) => x.name);
          const parts: string[] = [];
          if (names.length) parts.push(`Đã thêm ${names.length} skill: ${names.join(", ")}. Gõ /tên-skill trong ô chat để dùng; hoặc bật "Tự dùng" trong bảng Skills.`);
          if (r.skipped.length) parts.push(`Bỏ qua: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join("; ")}.`);
          if (!names.length) fail(parts.join(" ") || "Không có skill nào được cài.");
          else broadcastSkills(parts.join(" "));
        };
        if (typeof msg.text === "string" && msg.text.trim()) {
          if (msg.text.length > 120_000) {
            fail("Nội dung quá dài (tối đa 60 KB).");
            return rec;
          }
          report(installPasted(skills, msg.text, typeof msg.name === "string" ? msg.name : undefined));
          return rec;
        }
        const source = typeof msg.source === "string" ? msg.source.trim() : "";
        const keys = Array.isArray(msg.keys) ? msg.keys.filter((k): k is string => typeof k === "string").slice(0, 40) : [];
        if (!source || keys.length === 0) {
          fail("Chưa chọn skill nào để cài.");
          return rec;
        }
        void (async () => {
          try {
            let hit = scanCache.get(source);
            if (!hit || Date.now() - hit.at > 600_000) {
              const { items } = await scanGithub(source);
              hit = { at: Date.now(), items };
              scanCache.set(source, hit);
            }
            report(installCandidates(skills, source, hit.items.filter((c) => keys.includes(c.key))));
          } catch (e) {
            fail(e instanceof Error ? e.message : String(e));
          }
        })();
        return rec;
      }
      case "skills_set":
        if (typeof msg.name === "string" && ["always", "demand", "manual", "off"].includes(msg.load)) setSkillLoad(skills, msg.name, msg.load);
        broadcastSkills();
        return rec;
      case "skills_delete":
        if (typeof msg.name === "string") deleteSkill(skills, msg.name);
        broadcastSkills();
        return rec;
      case "write_feedback": {
        if (!learnOn()) return rec;
        if (!isWriteAction(msg.action) || !["replace", "after", "copy"].includes(msg.applied)) return rec;
        const used = rec.lastWriteModel;
        if (!used || used.backend === "api") return rec; // không học bằng API
        try {
          const opt = typeof msg.option === "string" && msg.action !== "custom" ? msg.option : undefined;
          queue.add(
            sanitizeRecord({
              request: `Công cụ viết: ${WRITE_LABEL[msg.action]}${opt ? ` (${opt})` : ""} → ${msg.applied === "replace" ? "thay thế" : msg.applied === "after" ? "chèn thêm" : "sao chép"}`,
              calls: [{ tool: `writing_${msg.action}`, args: opt ? { option: opt } : {} }],
              backend: used.backend,
              model: used.model,
            }),
          );
        } catch {
          /* học nền là phụ trợ */
        }
        return rec;
      }
      case "set_api": {
        if (!API_PROVIDER_IDS.includes(msg.provider)) return rec;
        const all = { ...(config.get().api ?? {}) };
        if (msg.remove) delete all[msg.provider];
        else {
          const cur = { ...(all[msg.provider] ?? {}) };
          const before = `${cur.key ?? ""}|${cur.baseUrl ?? ""}`;
          if (typeof msg.key === "string" && msg.key.trim()) cur.key = msg.key.trim().slice(0, 500);
          if (typeof msg.baseUrl === "string") {
            const u = msg.baseUrl.trim();
            if (u === "") delete cur.baseUrl;
            else if (/^https?:\/\/[^\s]+$/i.test(u)) cur.baseUrl = u.slice(0, 300);
          }
          // Đổi khóa hoặc địa chỉ thì danh sách model cũ không còn đúng.
          if (before !== `${cur.key ?? ""}|${cur.baseUrl ?? ""}`) delete cur.models;
          if (typeof msg.model === "string") {
            const m = msg.model.trim();
            if (m === "") delete cur.model;
            else if (/^[A-Za-z0-9][\w.:/@+-]{0,99}$/.test(m)) cur.model = m;
          }
          all[msg.provider] = cur;
        }
        config.set({ api: all });
        broadcastCaps();
        // Có cấu hình dùng được thì tự tải danh sách model, thầy cô khỏi phải nhớ tên.
        if (!msg.remove && api.configured(msg.provider) && !(config.get().api?.[msg.provider]?.models?.length)) {
          void refreshModels(msg.provider).then((r) => send(ws, r));
        }
        return rec;
      }
      case "api_models": {
        if (!API_PROVIDER_IDS.includes(msg.provider)) return rec;
        const provider = msg.provider;
        const key = typeof msg.key === "string" && msg.key.trim() ? msg.key.trim().slice(0, 500) : undefined;
        const baseUrl = typeof msg.baseUrl === "string" && /^https?:\/\/[^\s]+$/i.test(msg.baseUrl.trim()) ? msg.baseUrl.trim().slice(0, 300) : undefined;
        void (async () => {
          if (!key && !baseUrl) return send(ws, await refreshModels(provider)); // khóa đã lưu: lưu lại danh sách
          try {
            send(ws, { type: "api_models", provider, ok: true, models: await api.listModels(provider, { key, baseUrl }) }); // thử giá trị đang gõ, không lưu
          } catch (e) {
            send(ws, { type: "api_models", provider, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
        return rec;
      }
      case "rescan":
        if (!scanning) {
          void runDiscovery();
          broadcastCaps(); // báo "đang dò" ngay
        }
        return rec;
      case "rpc_response": {
        const fn = pend.rpc.get(msg.id);
        if (fn) fn({ tool: "", ok: msg.ok === true, result: msg.result, error: typeof msg.error === "string" ? msg.error : undefined });
        return rec;
      }
      case "approval": {
        const fn = pend.approval.get(msg.id);
        if (fn && msg.approved === true && msg.all === true) rec.chat.approveRest();
        if (fn) fn(msg.approved === true ? "approved" : "declined");
        return rec;
      }
      case "set_permission":
        if (msg.level === "read" || msg.level === "ask" || msg.level === "full") config.set({ permission: msg.level });
        return rec;
      case "reset":
        rec.chat.cancel(); // đang chạy dở thì dừng, tránh ghi vào lịch sử vừa xóa
        rec.chat.reset();
        return rec;
      case "themes_get": {
        const { host: h, themes, colors, fonts, source, dirs } = themeCache.get(rec.host);
        send(ws, { type: "themes", host: h, themes, colors, fonts, source, dirs });
        return rec;
      }
      case "theme_suggest": {
        const id = String(msg.id ?? "");
        const profile = String(msg.profile ?? "");
        if (!profile.trim()) {
          send(ws, { type: "error", id, kind: "other", message: "Chưa đọc được cấu trúc tệp." });
          return rec;
        }
        const model = msg.model === "auto" ? "auto" : isValidModelChoice(msg.model) ? msg.model : undefined;
        if (!model) {
          send(ws, { type: "error", id, kind: "model", message: "Model không hợp lệ. Hãy chọn lại model." });
          return rec;
        }
        const effort = EFFORTS.includes(msg.effort as never) ? (msg.effort as Effort) : "low";
        void runOneShot(rec, ws, id, model, effort, 0.4, () => buildSuggestPrompt(rec.host, profile, String(msg.wish ?? "")), (t) => JSON.stringify(parseSuggestion(t, rec.host)));
        return rec;
      }
      case "ws_get":
        send(ws, wsMsg(rec));
        return rec;
      case "ws_open": {
        rec.chat.cancel();
        rec.write?.abort();
        const id = msg.id;
        if (id !== undefined) {
          const meta = ChatStore.validId(id) ? chatStore.get(id) : undefined;
          if (!meta) {
            send(ws, { type: "error", id: "workspace", kind: "other", message: "Không tìm thấy hội thoại này." });
            return rec;
          }
          const msgs = chatStore.messages(id);
          rec.chat.setHistory(historyFromMsgs(msgs));
          rec.chatId = id;
          rec.projectId = undefined;
          send(ws, { type: "ws_chat", id, msgs });
        } else {
          rec.chat.reset();
          // Hội thoại chưa từng lưu bị bỏ: xóa tệp đính kèm của nó.
          if (rec.chatId && !chatStore.get(rec.chatId)) fileStore.removeScope({ kind: "chat", id: rec.chatId });
          rec.chatId = undefined;
          rec.projectId = typeof msg.projectId === "string" && chatStore.state().projects.some((p) => p.id === msg.projectId) ? msg.projectId : undefined;
          send(ws, { type: "ws_chat", id: "", msgs: [] });
        }
        send(ws, wsMsg(rec));
        void runDigests(); // hội thoại vừa rời đi thành bộ nhớ của dự án
        return rec;
      }
      case "ws_save": {
        if (!ChatStore.validId(msg.id) || !Array.isArray(msg.msgs)) return rec;
        const meta = chatStore.save(msg.id, rec.host, msg.msgs, rec.projectId);
        if (meta) {
          rec.chatId = meta.id;
          broadcastWorkspace();
          if (meta.projectId) scheduleDigests();
        }
        return rec;
      }
      case "ws_rename":
        if (chatStore.rename(String(msg.id ?? ""), String(msg.title ?? ""))) broadcastWorkspace();
        return rec;
      case "ws_move":
        if (chatStore.move(String(msg.id ?? ""), msg.projectId === null ? null : String(msg.projectId ?? ""))) {
          broadcastWorkspace();
          if (msg.projectId) scheduleDigests();
        }
        return rec;
      case "ws_delete": {
        const id = String(msg.id ?? "");
        if (!chatStore.remove(id)) return rec;
        fileStore.removeScope({ kind: "chat", id });
        for (const r of sessions.values()) {
          if (r.chatId !== id) continue;
          r.chat.cancel();
          r.chat.reset();
          r.chatId = undefined;
          send(r.ws, { type: "ws_chat", id: "", msgs: [] });
        }
        broadcastWorkspace();
        return rec;
      }
      case "ws_project": {
        const r = chatStore.saveProject(msg.project ?? {});
        if (!r.ok) send(ws, { type: "error", id: "workspace", kind: "other", message: r.error });
        else broadcastWorkspace();
        return rec;
      }
      case "ws_project_delete":
        if (chatStore.removeProject(String(msg.id ?? ""))) {
          fileStore.removeScope({ kind: "project", id: String(msg.id) });
          broadcastWorkspace();
        }
        return rec;
      case "file_add": {
        const kind = msg.scope === "project" ? "project" : msg.scope === "chat" ? "chat" : undefined;
        if (!kind || !validScopeId(msg.id)) return rec;
        if (kind === "project" && !chatStore.state().projects.some((p) => p.id === msg.id)) {
          send(ws, { type: "error", id: "files", kind: "other", message: "Dự án này không còn." });
          return rec;
        }
        const r = fileStore.add({ kind, id: msg.id }, msg.name, msg.text);
        if (!r.ok) send(ws, { type: "error", id: "files", kind: "other", message: r.error });
        else {
          if (kind === "chat" && rec.chatId !== msg.id) rec.chatId = msg.id; // hội thoại mới của cửa sổ này
          broadcastWorkspace();
        }
        return rec;
      }
      case "file_remove": {
        const kind = msg.scope === "project" ? "project" : msg.scope === "chat" ? "chat" : undefined;
        if (kind && validScopeId(msg.id) && fileStore.remove({ kind, id: msg.id }, msg.name)) broadcastWorkspace();
        return rec;
      }
      case "ws_rules":
        try { chatStore.setGlobalRules(String(msg.rules ?? "")); broadcastWorkspace(); }
        catch (e) { send(ws, {type: "error", id: "rules", kind: "other", message: (e as Error).message}); }
        return rec;
      case "rag_build": {
        if (!Array.isArray(msg.segments)) return rec;
        const t0 = performance.now();
        rec.rag = buildIndex({ name: String(msg.name ?? rec.docName ?? "").slice(0, 200) || "tài liệu", host: rec.host, segments: msg.segments, fp: typeof msg.fp === "string" ? msg.fp.slice(0, 64) : undefined });
        rec.ragMs = Math.round(performance.now() - t0);
        send(ws, ragMsg(rec));
        return rec;
      }
      case "rag_set":
        config.set({ rag: { enabled: msg.enabled === true } });
        for (const r of sessions.values()) send(r.ws, ragMsg(r));
        return rec;
      case "rag_clear":
        rec.rag = undefined;
        send(ws, ragMsg(rec));
        return rec;
      case "ipad_get":
        ipad?.refresh();
        if (ipad) send(ws, ipadMsg(ws)!);
        return rec;
      case "ipad_set":
        // iPad không tự tắt được chế độ của chính mình (sẽ mất kết nối ngay).
        if (!ipad || ipad.remote.has(ws)) return rec;
        void ipad.setEnabled(msg.enabled === true).then(broadcastIpad);
        return rec;
      case "ipad_reveal":
        if (ipad && !ipad.remote.has(ws)) ipad.revealManifests();
        return rec;
      case "ipad_reset":
        if (!ipad || ipad.remote.has(ws)) return rec;
        void ipad.resetToken().then(broadcastIpad);
        return rec;
      case "ws_link":
        chatStore.setLink(msg.link === true);
        broadcastWorkspace();
        return rec;
      case "nb": {
        const req = String(msg.req ?? "");
        if (!/^[\w#-]{1,80}$/.test(req)) return rec;
        const ac = new AbortController();
        nbAborts.set(req, ac);
        const params = msg.params && typeof msg.params === "object" && !Array.isArray(msg.params) ? msg.params : {};
        notebooks.rpc(String(msg.method ?? ""), params, ac.signal).then(
          (data) => send(ws, { type: "nb_reply", req, ok: true, data }),
          (e) => send(ws, { type: "nb_reply", req, ok: false, error: e instanceof Error ? e.message : String(e) }),
        ).finally(() => nbAborts.delete(req));
        return rec;
      }
      case "nb_cancel": {
        const req = String(msg.req ?? "");
        nbAborts.get(req)?.abort();
        notebooks.cancel(req);
        return rec;
      }
      case "nb_upload": {
        const reply = `${String(msg.req ?? "")}#${Number(msg.part) || 0}`;
        void (async () => {
          try {
            const r = await notebooks.receive(msg);
            if (!r.done) return send(ws, { type: "nb_reply", req: reply, ok: true, data: { received: true } });
            if (msg.purpose === "ocr") {
              const ac = new AbortController();
              nbAborts.set(String(msg.req), ac);
              try {
                const o = await notebooks.ocrPdf(r.file, ac.signal);
                send(ws, o.ok ? { type: "nb_reply", req: reply, ok: true, data: { text: o.text } } : { type: "nb_reply", req: reply, ok: false, error: o.reason });
              } finally {
                nbAborts.delete(String(msg.req));
                fs.rmSync(r.dir, { recursive: true, force: true });
              }
              return;
            }
            const nb = String(msg.nb ?? "");
            send(ws, { type: "nb_reply", req: reply, ok: true, data: await notebooks.addUploaded(nb, r.file, r.dir) });
          } catch (e) {
            notebooks.cancel(String(msg.req ?? ""));
            send(ws, { type: "nb_reply", req: reply, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
        return rec;
      }
      case "cancel":
        rec.chat.cancel();
        rec.write?.abort();
        return rec;
    }
    return rec;
  }

  wss.on("connection", (ws) => {
    let rec: SessionRec | undefined;

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
      learner.touch();
      // Lỗi trong một tin nhắn không được làm sập cả bridge (lỗi ném trong sự kiện là lỗi không bắt được).
      try {
        rec = handle(ws, msg, rec);
      } catch (e) {
        console.error(`PVTA: lỗi xử lý tin '${msg.type}': ${e instanceof Error ? e.message : String(e)}`);
        if (msg.type === "hello") ws.close(1008, "hello không hợp lệ");
      }
    });

    ws.on("close", () => {
      const r = rec;
      if (!r || r.ws !== ws) return;
      r.ws = undefined;
      // Add-in không còn để trả lời: các yêu cầu đang chờ thất bại ngay, không chờ hết hạn.
      r.failPending("Add-in đã đóng hoặc tải lại.");
      // Chờ một lúc phòng khi chỉ tải lại panel, rồi mới dọn.
      r.closeTimer = setTimeout(() => void finalize(r), opts.closeGraceMs ?? 30_000);
    });
  });

  // Học nền lúc rảnh.
  const idleTimer = setInterval(() => void learner.maybeRun().catch(() => undefined), opts.idleCheckMs ?? 30_000);
  idleTimer.unref();
  // Kiểm tra bản mới sau khi khởi động, rồi 12 giờ một lần (bỏ qua nếu PVTA_NO_UPDATE_CHECK).
  const firstCheck = opts.update?.firstCheckMs ?? 5_000;
  let updFirst: NodeJS.Timeout | undefined;
  let updEvery: NodeJS.Timeout | undefined;
  if (updApp && firstCheck > 0 && !process.env.PVTA_NO_UPDATE_CHECK) {
    updFirst = setTimeout(() => void checkUpdate(), firstCheck);
    updFirst.unref();
    updEvery = setInterval(() => void checkUpdate(), 12 * 3600_000);
    updEvery.unref();
  }

  const port = opts.port ?? config.get().port ?? DEFAULT_PORT;
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, opts.host ?? "127.0.0.1", () => resolve());
  });
  if (webServer && webOpts) {
    await new Promise<void>((resolve) => {
      // Cổng add-in bận hoặc chứng chỉ lỗi: bridge vẫn chạy (chế độ dev dùng cổng WS thường).
      webServer.once("error", (e) => {
        console.error(`PVTA: không mở được máy chủ add-in (${(e as Error).message})`);
        resolve();
      });
      webServer.listen(webOpts.port, "127.0.0.1", () => resolve());
    });
  }
  if (ipad && config.get().ipad?.enabled) await ipad.start();
  const addr = httpServer.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;

  return {
    port: actualPort,
    sessions,
    workspace,
    learner,
    async close() {
      clearTimeout(installTimer);
      clearInterval(idleTimer);
      clearTimeout(updFirst);
      clearInterval(updEvery);
      clearTimeout(digestTimer);
      engine.disposeWarm?.();
      for (const s of sessions.values()) if (s.closeTimer) clearTimeout(s.closeTimer);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => httpServer.close(() => r()));
      if (webServer?.listening) await new Promise<void>((r) => webServer.close(() => r()));
      await ipad?.close();
    },
  };
}


