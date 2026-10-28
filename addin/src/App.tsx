import {lazy,Suspense} from 'react';
const PdfPreview=lazy(()=>import('./PdfPreview'));
import { WelcomeActions } from "./WelcomeActions";
import {Icon} from "./Icon";
import {DocumentContext} from "./DocumentContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BACKEND_INFO,
  effectiveEffort,
  DEFAULT_EFFORT,
  isBackendReady,
  readyBackends,
  type Effort,
  type ErrorKind,
  type MachineInfo,
  type ModelCatalog,
  type ModelChoice,
  type OfficeHost,
  type PermissionLevel,
  type ServerMessage,
  type Timings,
  type ToolCall,
  type WritingMode,
  type CustomMode,
  isWritingMode,
  resolveMode,
  promptFields,
  type LibraryPrompt,
  type WorkspaceState,
  type SkillInfo,
  type FoundSkill,
  type UpdateState,
  type Hints,
  type RefInfo,
} from "@pvta/shared";
import { BRIDGE_URL, BridgeClient } from "./bridgeClient";
import { detectLang, HOST_NAME, STRINGS, SUGGESTIONS } from "./i18n";
import { Markdown, plainText } from "./Markdown";
import { modelKey, modelLabel } from "./models";
import { ModelPicker } from "./ModelPicker";
import { ModeSheet, modeInfo, type ModeView } from "./ModeSheet";
import { PromptLibrary } from "./PromptLibrary";
import { SessionsDrawer } from "./SessionsDrawer";
import { SkillsPanel } from "./SkillsPanel";
import { NotebookPanel } from "./NotebookPanel";
import { NbClient } from "./nbClient";
import { chatFileName, chatToMarkdown, downloadText } from "./chatExport";
import { addFiles, type AddResult } from "./files";
import { ThemePanel, type Suggestion } from "./ThemePanel";
import { setThemeCatalog, type ThemeCatalogMsg } from "./themeStore";
import { WritePanel } from "./WritePanel";
import { TeacherSuitePanel } from "./TeacherSuitePanel";
import { executeTool, hostFromOffice } from "./office";
import { quickSelection } from "./office/selection";
import { PermissionChoices, Settings, type ApiModelsResult, type CommunityState, type IpadState, type LearnedState, type SettingsSection } from "./Settings";
import { argsPreview, toolLabel } from "./toolLabels";
import { copyText, currentDocName, openUrl } from "./util";
import { BasisBar, HintBar, RefList } from "./HintBar";
import { analyzeDocument, documentBasisText, documentHead } from "./office/analyze";
import { takeSigs, watchSave } from "./office/snapshot";
import { captureSheet, restoreSheet, takeSheetSigs, watchSaveExcel, type SheetSnapshot } from "./office/sheetbeautify";
import { captureBody, restoreBody, type BodySnapshot } from "./office/restore";
import { diffSigs, diffRoleSigs, isReadTool, type RagStatus, type RoleSig, type ParaSig } from "@pvta/shared";
import { readRagSource } from "./office/ragsource";
import { gotoRef } from "./office/goto";
import { scanWordImages } from "./office/images";
import { env } from "./platform";

interface ToolLine {
  tool: string;
  status: "running" | "done" | "denied" | "error";
  detail?: string;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolLine[];
  timings?: Timings;
  error?: { kind: ErrorKind; message: string };
  model?: ModelChoice;
  notes?: string[];
  offer?: { summary: string };
  /** Lời nhắc thật đã gửi cho model (khi khác câu người dùng thấy). */
  prompt?: string;
}

function newChatId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem("pvta-session");
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      sessionStorage.setItem("pvta-session", id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

export function App({ host: officeHost }: { host: Office.HostType | undefined }) {
  const host: OfficeHost = hostFromOffice(officeHost);
  const lang = useMemo(detectLang, []);
  const t = STRINGS[lang];
  const sid = useMemo(sessionId, []);

  const [online, setOnline] = useState(false);
  const [chatLinked, setChatLinked] = useState(false);
  const [pdfPreview,setPdfPreview]=useState<File|null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);
  const [permission, setPermission] = useState<PermissionLevel | null>(null);
  const [permLoaded, setPermLoaded] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [approval, setApproval] = useState<{ id: string; call: ToolCall } | null>(null);
  const [modelSel, setModelSel] = useState<ModelChoice | "auto">("auto");
  const [effort, setEffort] = useState<Effort>(DEFAULT_EFFORT);
  const [mode, setMode] = useState<WritingMode>("standard");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [learned, setLearned] = useState<LearnedState | null>(null);
  /** Gợi ý thông minh: bật/tắt (bridge giữ), gợi ý hiện có, những gợi ý đã bỏ qua. */
  const [hintsOn, setHintsOn] = useState(true);
  const [ipad, setIpad] = useState<IpadState | null>(null);
  const [hints, setHints] = useState<Hints | null>(null);
  const [basis, setBasis] = useState<Extract<ServerMessage, { type: "basis_report" }> | null>(null);
  const basisAsked = useRef(0);
  const [hintGone, setHintGone] = useState<Set<string>>(new Set());
  const hintAsked = useRef(0);
  /** Văn bản liên quan tìm trên mạng (chỉ tên và link); bản đã tải khi bấm Xem. */
  const [refs, setRefs] = useState<RefInfo[]>([]);
  /** Model nền đã đọc bao nhiêu hình trong văn bản đang mở. */
  const [imgStatus, setImgStatus] = useState<{ total: number; read: number } | null>(null);
  const [refText, setRefText] = useState<{ refId: string; ok: boolean; title?: string; text?: string; truncated?: boolean; error?: string } | null>(null);
  const [refBusy, setRefBusy] = useState<string | null>(null);
  /** Hội thoại & dự án (lưu ở bridge, dùng chung các ứng dụng). */
  const [ws, setWs] = useState<WorkspaceState | null>(null);
  const [standardized, setStandardized] = useState<Extract<ServerMessage, {type: "standardized"}> | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerRulesFor, setDrawerRulesFor] = useState<string | null>(null);
  const openDocRules = () => {
    setDrawerRulesFor("__doc");
    setDrawer(true);
  };
  /** Chủ đề có sẵn của Office (đọc ở bridge, theo phần mềm đang mở). */
  const [themeCat, setThemeCat] = useState<ThemeCatalogMsg | null>(null);
  /** Kết quả lần thêm tệp gần nhất (hiện ở ô soạn và ngăn dự án). */
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Mã hội thoại đang hiện; có tin mới chưa lưu thì dirty. */
  const chatId = useRef(newChatId());
  const dirty = useRef(false);
  const restored = useRef(false);
  /** Cửa sổ Chế độ viết (tách khỏi cửa sổ chọn model): đóng, chọn, hay quản lý. */
  const [modeView, setModeView] = useState<ModeView | null>(null);
  const [modeStatus, setModeStatus] = useState<{ saved?: string; notice?: string; error?: string } | null>(null);
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [picker, setPicker] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  /** Kết quả tải danh sách model từ API (at đổi mỗi lần để biểu mẫu nhận ra tin mới). */
  const [apiModelsMsg, setApiModelsMsg] = useState<ApiModelsResult | null>(null);
  const [tab, setTab] = useState<"chat" | "write" | "theme" | "suite">("chat");
  const [addinPalette, setAddinPalette] = useState<"modern" | "violet">(() => {
    try {
      return localStorage.getItem("pvta-addin-palette") === "violet" ? "violet" : "modern";
    } catch {
      return "modern";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.addinPalette = addinPalette;
    try {
      localStorage.setItem("pvta-addin-palette", addinPalette);
    } catch {
      /* ignore */
    }
  }, [addinPalette]);
  const [lib, setLib] = useState<{ fillText?: string } | null>(null);
  /** Skills: danh sách, bảng nhập, kết quả dò GitHub, thông báo/lỗi gần nhất. */
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [nbOpen, setNbOpen] = useState(false);
  const [skillFound, setSkillFound] = useState<{ source: string; items: FoundSkill[] } | null>(null);
  const [skillNotice, setSkillNotice] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillScanning, setSkillScanning] = useState(false);
  /** Menu "Thêm tiện ích" (⋯), lời nhắc hội thoại dài đã bỏ qua chưa, ghi chú ngắn sau khi chép/tải. */
  const [menu, setMenu] = useState(false);
  const [longDismissed, setLongDismissed] = useState(false);
  /** Cập nhật PVTA: trạng thái từ bridge; bản trang đang chạy để tự tải lại khi bridge đã lên bản mới. */
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [community, setCommunity] = useState<CommunityState | null>(null);
  const [updDismissed, setUpdDismissed] = useState(false);
  const pageVer = useRef<string | null>(null);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [ownPrompts, setOwnPrompts] = useState<LibraryPrompt[]>([]);
  const [favPrompts, setFavPrompts] = useState<string[]>([]);
  /** Tối ưu lời nhắc: câu gốc (để hoàn tác), đang chạy hay xong, cho model nào. */
  const [opt, setOpt] = useState<{ id: string; original: string; running: boolean; model?: ModelChoice; error?: string } | null>(null);
  /** Tin của các lượt công cụ viết đi thẳng tới thẻ Viết, không vào khung trò chuyện. */
  const writeRoutes = useRef(new Map<string, (m: ServerMessage) => void>());
  const activeId = useRef<string | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const modelRestored = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const client = useMemo(() => new BridgeClient(BRIDGE_URL, () => ({ type: "hello", host, sessionId: sid, lang, doc: currentDocName() })), [host, sid, lang]);
  // Sổ nguồn và OCR PDF dùng chung đường truyền với chat.
  const nb = useMemo(() => new NbClient(client), [client]);
  useEffect(() => () => nb.dispose(), [nb]);
  const ocrPdf = useCallback((f: File) => nb.upload<{ text: string }>(f, { purpose: "ocr" }).then((r) => ({ ok: true as const, text: r.text }), (e: Error) => ({ ok: false as const, reason: e.message })), [nb]);

  // RAG từ tệp đang mở: add-in đọc tài liệu thành các đoạn, bridge dựng chỉ mục cục bộ rồi tự chèn đoạn liên quan vào câu hỏi.
  const [rag, setRag] = useState<RagStatus | null>(null);
  const [ragBusy, setRagBusy] = useState(false);
  const ragFp = useRef("");
  const ragAt = useRef(0);
  const ragDirty = useRef(false);
  const ragRun = useRef<Promise<void> | null>(null);
  const syncRag = useCallback(
    (force = false): Promise<void> => {
      if (ragRun.current) return ragRun.current;
      const p = (async () => {
        setRagBusy(true);
        try {
          const src = await readRagSource(host);
          ragAt.current = Date.now();
          ragDirty.current = false;
          if (!force && src.fp === ragFp.current) return; // tài liệu chưa đổi, khỏi gửi lại
          ragFp.current = src.fp;
          client.send({ type: "rag_build", name: currentDocName() || HOST_NAME[host], segments: src.segments, fp: src.fp });
        } catch {
          /* không đọc được tài liệu: vẫn chat bình thường, chỉ không có RAG */
        } finally {
          ragRun.current = null;
          setRagBusy(false);
        }
      })();
      ragRun.current = p;
      return p;
    },
    [host, client],
  );

  // Tự động ghép nối trực tiếp với PVTA Chat (cổng 52734) không cần mã key.
  useEffect(() => {
    let ws: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let working = false;
    const connect = () => {
      if (disposed) return;
      try {
        const socket = new WebSocket("wss://localhost:52734/office");
        ws = socket;
        const docUrl = typeof Office !== "undefined" ? (Office.context?.document?.url ?? "") : "";
        let ticket: string | undefined;
        try {
          const raw = typeof Office !== "undefined" ? Office.context?.document?.settings?.get?.("PVTA.LaunchTicket") : undefined;
          if (typeof raw === "string" && /^[a-f0-9]{64}$/.test(raw)) ticket = raw;
        } catch {
          /* ignore */
        }
        socket.onopen = () => {
          if (disposed || ws !== socket) return;
          socket.send(
            JSON.stringify({
              type: "pair",
              launchTicket: ticket,
              documentUrl: docUrl,
              host,
              name: currentDocName() || `${HOST_NAME[host]} · tài liệu đang mở`,
            }),
          );
        };
        socket.onmessage = async (e) => {
          if (disposed || ws !== socket) return;
          let m: { type?: string; id?: string; call?: ToolCall } | undefined;
          try {
            m = JSON.parse(String(e.data));
          } catch {
            return;
          }
          if (!m) return;
          if (m.type === "paired") {
            setChatLinked(true);
            if (ticket) {
              try {
                Office.context?.document?.settings?.remove?.("PVTA.LaunchTicket");
                Office.context?.document?.settings?.saveAsync?.();
              } catch {
                /* ignore */
              }
            }
            return;
          }
          if (m.type === "execute" && m.id && m.call) {
            const reply = (payload: Record<string, unknown>) => {
              if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "result", id: m.id, ...payload }));
            };
            if (working) {
              reply({ error: "Office đang xử lý thao tác trước." });
              return;
            }
            working = true;
            try {
              const result = await executeTool(host, m.call);
              if (!isReadTool(m.call.tool)) {
                ragDirty.current = true;
                setTimeout(() => void syncRag(), 400);
              }
              reply({ result });
            } catch (err) {
              reply({ error: err instanceof Error ? err.message : String(err) });
            } finally {
              working = false;
            }
          }
        };
        socket.onclose = () => {
          if (ws === socket) setChatLinked(false);
          if (!disposed) timer = setTimeout(connect, 3500);
        };
        socket.onerror = () => socket.close();
      } catch {
        if (!disposed) timer = setTimeout(connect, 3500);
      }
    };
    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [host, syncRag]);

  // Mới nối mà bridge chưa có chỉ mục: dựng ngay lúc rảnh (đọc tài liệu không chặn việc gõ câu hỏi).
  useEffect(() => {
    if (!online || !rag?.enabled || rag.ready) return;
    const id = setTimeout(() => void syncRag(), 700);
    return () => clearTimeout(id);
  }, [online, rag?.enabled, rag?.ready, syncRag]);

  /** Sửa tin nhắn trả lời theo mã; chưa có (vd panel tải lại giữa chừng) thì tạo mới. */
  const patchMsg = useCallback((id: string, fn: (m: Msg) => Msg) => {
    setMsgs((all) => {
      const i = all.findIndex((x) => x.id === id && x.role === "assistant");
      if (i < 0) return [...all, fn({ id, role: "assistant", text: "", tools: [] })];
      const next = all.slice();
      next[i] = fn(all[i]!);
      return next;
    });
  }, []);

  const [bf, setBf] = useState<{ phase: "research" | "working" | "waiting" | "learning"; label?: string; note?: string } | null>(null);
  const bfRun = useRef<string | null>(null);
  const bfBefore = useRef<ParaSig[] | null>(null);
  const bfStop = useRef<(() => void) | null>(null);
  /** Bản Word trước khi làm đẹp, để Hoàn tác. */
  const bfSnap = useRef<BodySnapshot | null>(null);
  /** Excel: bản chụp định dạng sheet trước khi làm đẹp, và chữ ký định dạng theo vai trò sau khi làm đẹp. */
  const bfSheet = useRef<SheetSnapshot | null>(null);
  const bfRoles = useRef<RoleSig[] | null>(null);
  const [bfUndoMsg, setBfUndoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bfCanUndo, setBfCanUndo] = useState(false);
  const bfOff = useCallback(() => {
    bfStop.current?.();
    bfStop.current = null;
    bfBefore.current = null;
    bfRun.current = null;
    bfSnap.current = null;
    bfSheet.current = null;
    bfRoles.current = null;
    setBfCanUndo(false);
    setBf(null);
  }, []);
  /** Người dùng đã lưu (hoặc bấm Học ngay): so sánh với bản PVTA làm đẹp rồi gửi đặc điểm đã chỉnh để học. */
  const bfLearn = useCallback(async () => {
    const before = bfBefore.current;
    const roles = bfRoles.current;
    bfStop.current?.();
    bfStop.current = null;
    bfBefore.current = null;
    bfRoles.current = null;
    if (!before && !roles) return;
    try {
      if (roles) client.send({ type: "beautify_learn", changes: diffRoleSigs(roles, await takeSheetSigs()).changes });
      else client.send({ type: "beautify_learn", changes: diffSigs(before!, await takeSigs()).changes });
    } catch {
      client.send({ type: "beautify_cancel" });
    }
  }, [client]);

  /** Hoàn tác "Làm đẹp": trả Word về bản chụp trước khi sửa, rồi bỏ việc học. */
  const bfUndo = useCallback(async () => {
    const snap = bfSnap.current;
    const sheetSnap = bfSheet.current;
    if (!snap && !sheetSnap) return;
    try {
      if (sheetSnap) {
        await restoreSheet(sheetSnap);
        setBfUndoMsg({ ok: true, text: t.bf.undone });
      } else {
        const r = await restoreBody(snap!);
        setBfUndoMsg({ ok: r.ok, text: r.ok ? t.bf.undone : t.bf.undoCheck });
      }
    } catch {
      setBfUndoMsg({ ok: false, text: t.bf.undoFail });
      return;
    }
    client.send({ type: "beautify_cancel" });
    bfOff();
  }, [client, bfOff, t]);

  const finish = useCallback(() => {
    setBusy(false);
    setApproval(null);
    activeId.current = null;
  }, []);

  useEffect(() => {
    const offStatus = client.onStatus((on) => {
      setOnline(on);
      if (!on) {
        setApproval(null);
        for (const [id,route] of writeRoutes.current) route({type:'error',id,kind:'other',message:'Mất kết nối PVTA. Kết nối lại rồi thử lại.'});
        writeRoutes.current.clear();
      }
    });
    const off = client.onMessage((m: ServerMessage) => {
      const rid = "id" in m && typeof m.id === "string" ? m.id : undefined;
      const route = rid ? writeRoutes.current.get(rid) : undefined;
      if (route && rid) {
        route(m);
        if (m.type === "done" || m.type === "error") writeRoutes.current.delete(rid);
        return;
      }
      switch (m.type) {
        case "learned":
          setLearned(m);
          break;
        case "community":
          setCommunity(m);
          break;
        case "prompt_shown": {
          const uid = `u${m.id}`;
          setMsgs((all) => all.map((x) => (x.id === uid ? { ...x, prompt: m.text } : x)));
          break;
        }
        case "beautify_state":
          if (m.phase === "off") {
            bfStop.current?.();
            bfStop.current = null;
            bfBefore.current = null;
            bfRun.current = null;
            setBf(null);
          } else {
            const phase = m.phase;
            setBf((cur) => ({ phase, label: m.label ?? cur?.label, note: m.note ?? cur?.note }));
          }
          break;
        case "rag":
          setRag(m);
          // Bridge chưa có chỉ mục (mới nối / khởi động lại): lần đồng bộ tới phải gửi đủ.
          ragFp.current = m.ready ? (m.fp ?? ragFp.current) : "";
          break;
        case "ipad":
          setIpad(m);
          break;
        case "hints_cfg":
          setHintsOn(m.enabled);
          if (!m.enabled) setHints(null);
          break;
        case "img_need": {
          const want = new Set(m.hashes);
          void scanWordImages(true)
            .then(({ images }) => {
              const items = images.filter((i) => want.has(i.hash) && i.data).map((i) => ({ hash: i.hash, data: i.data! }));
              for (let k = 0; k < items.length; k += 4) client.send({ type: "img_data", items: items.slice(k, k + 4) });
            })
            .catch(() => undefined);
          break;
        }
        case "img_status":
          setImgStatus(m.total ? { total: m.total, read: m.read } : null);
          break;
        case "refs":
          setRefs(m.items);
          break;
        case "ref_text":
          setRefBusy(null);
          setRefText({ refId: m.refId, ok: m.ok, title: m.title, text: m.text, truncated: m.truncated, error: m.error });
          break;
        case "basis_report":
          setBasis(m);
          break;
        case "hints":
          // Bản AI (đến sau) thay bản nhanh; không có gì thì giữ nguyên.
          setHints(m.hints);
          break;
        case "themes": {
          const { type: _t, ...cat } = m;
          setThemeCat(cat);
          setThemeCatalog(cat);
          break;
        }
        case "workspace": {
          const { type: _t, ...state } = m;
          setWs(state);
          // Tải lại panel: cửa sổ này vẫn đang ở một hội thoại thì hiện lại nó.
          if (!restored.current) {
            restored.current = true;
            if (state.active && !dirty.current) {
              chatId.current = state.active;
              client.send({ type: "ws_open", id: state.active });
            }
          }
          break;
        }
        case "ws_chat":
          chatId.current = m.id || newChatId();
          dirty.current = false;
          setMsgs(m.msgs as Msg[]);
          setApproval(null);
          activeId.current = null;
          setBusy(false);
          break;
        case "modes":
          setCustomModes(m.custom);
          // Chế độ đang chọn vừa bị xóa (ở panel này hay panel khác): về Sư phạm.
          setMode((md) => (isWritingMode(md) || m.custom.some((c) => c.id === md) ? md : "standard"));
          setModeStatus(m.saved || m.notice ? { saved: m.saved, notice: m.notice } : null);
          break;
        case "update":
          if (m.current !== "dev") {
            if (pageVer.current === null) pageVer.current = m.current;
            else if (pageVer.current !== m.current) {
              window.location.reload(); // bridge đã chạy bản mới: lấy giao diện mới
              break;
            }
          }
          setUpdate(m);
          break;
        case "standardized":
          setStandardized(m);
          break;
        case "skills":
          setSkills(m.items);
          setSkillScanning(false);
          if (m.notice) {
            setSkillNotice(m.notice);
            setSkillFound(null);
            setSkillError(null);
          }
          break;
        case "skills_found":
          setSkillFound({ source: m.source, items: m.items });
          setSkillScanning(false);
          setSkillError(null);
          setSkillNotice(null);
          break;
        case "prompts":
          setOwnPrompts(m.own);
          setFavPrompts(m.favorites);
          break;
        case "api_models":
          setApiModelsMsg({ provider: m.provider, ok: m.ok, models: m.models, saved: m.saved, error: m.error, at: Date.now() });
          break;
        case "capabilities": {
          const { type: _t, ...info } = m;
          setMachine(info);
          break;
        }
        case "ready": {
          const { type: _t, permission: p, model, effort: e, busy: b, mode: md, temperature: tp, ...info } = m;
          setMachine(info);
          const effPerm: PermissionLevel = p ?? "full";
          setPermission(effPerm);
          if (p === null) client.send({ type: "set_permission", level: "full" });
          setEffort(e);
          setPermLoaded(true);
          setMode(md);
          setTemperature(tp);
          setFirstRun(false);

          if (!modelRestored.current) {
            modelRestored.current = true; // model được ghim cho đến khi người dùng chọn lại
            setModelSel(model);
          }
          if (!b && activeId.current) {
            patchMsg(activeId.current, (x) => ({ ...x, error: x.error ?? { kind: "other", message: t.interrupted } }));
            finish();
          } else if (b) setBusy(true);
          break;
        }
        case "model_used":
          patchMsg(m.id, (x) => ({ ...x, model: m.model }));
          break;
        case "text_delta":
          patchMsg(m.id, (x) => ({ ...x, text: x.text + m.text }));
          break;
        case "tool_status":
          // PVTA vừa sửa tài liệu: chỉ mục cũ không còn đúng.
          if (m.status === "done" && !isReadTool(m.tool)) ragDirty.current = true;
          patchMsg(m.id, (x) => {
            const tools = [...x.tools];
            const i = tools.findIndex((l) => l.tool === m.tool && l.status === "running");
            const line: ToolLine = { tool: m.tool, status: m.status, detail: m.detail };
            if (i >= 0) tools[i] = line;
            else tools.push(line);
            return { ...x, tools };
          });
          break;
        case "approval_request":
          setApproval({ id: m.id, call: m.call });
          break;
        case "rpc_request":
          executeTool(host, m.call)
            .then((result) => client.send({ type: "rpc_response", id: m.id, ok: true, result }))
            .catch((e: unknown) => client.send({ type: "rpc_response", id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) }));
          break;
        case "done":
          patchMsg(m.id, (x) => ({ ...x, timings: m.timings, notes: m.notes, offer: m.offer }));
          if (ragDirty.current) setTimeout(() => void syncRag(), 400);
          if (bfRun.current === m.id) {
            bfRun.current = null;
            // Làm đẹp xong: chụp bản của PVTA, rồi chờ người dùng sửa/lưu.
            if (host === "powerpoint") { client.send({ type: "beautify_cancel" }); bfOff(); }
            else if (host === "excel") {
              void takeSheetSigs()
                .then((sigs) => {
                  bfRoles.current = sigs;
                  setBf((cur) => (cur ? { ...cur, phase: "waiting" } : cur));
                  bfStop.current = watchSaveExcel(() => void bfLearn());
                })
                .catch(() => client.send({ type: "beautify_cancel" }));
            } else
              void takeSigs()
                .then((sigs) => {
                  bfBefore.current = sigs;
                  setBf((cur) => (cur ? { ...cur, phase: "waiting" } : cur));
                  bfStop.current = watchSave(() => void bfLearn());
                })
                .catch(() => client.send({ type: "beautify_cancel" }));
          }
          finish();
          break;
        case "error":
          if (m.id === "modes") {
            setModeStatus({ error: m.message });
            break;
          }
          if (m.id === "workspace") break;
          if (m.id === "skills") {
            setSkillError(m.message);
            setSkillScanning(false);
            break;
          }
          if (m.id === "files") {
            setFileNote(m.message);
            break;
          }
          if (bfRun.current === m.id) {
            client.send({ type: "beautify_cancel" });
            bfOff();
          }
          patchMsg(m.id, (x) => ({ ...x, error: { kind: m.kind, message: m.message } }));
          // Lỗi của tin bị từ chối ngay (đang bận) không làm dừng tác vụ đang chạy.
          if (!activeId.current || activeId.current === m.id) finish();
          break;
      }
    });
    client.connect();
    return () => {
      off();
      offStatus();
      client.close();
    };
  }, [client, host, patchMsg, finish, t]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs, approval]);

  // Ô nhập tự giãn theo nội dung.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  // Esc: dừng tác vụ đang chạy.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settings) setSettings(null);
      else if (e.key === "Escape" && menu) setMenu(false);
      else if (e.key === "Escape" && skillsOpen) setSkillsOpen(false);
      else if (e.key === "Escape" && lib) setLib(null);
      else if (e.key === "Escape" && busy && !approval && !picker && !settings) stopRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, approval, picker, settings, client, lib, menu, skillsOpen]);

  const caps = machine?.capabilities;
  const api = machine?.api;
  const effective: ModelChoice | null = modelSel === "auto" ? machine?.auto ?? null : modelSel;
  const catalog = machine?.models;
  const shownEffort = effective ? effectiveEffort(effective, effort, caps, catalog) : undefined;
  const anyReady = machine ? readyBackends(caps, api).length > 0 : true;
  const scanning = machine?.scanning ?? true;
  // Model đã chọn thuộc backend chưa có trên máy (nhưng máy còn backend khác): nhắc, không gửi.
  const chosenMissing =
    modelSel !== "auto" && machine && !scanning && !isBackendReady(modelSel.backend, caps, api) && (modelSel.backend === "api" || caps?.[modelSel.backend] !== undefined);
  const noneReady = machine !== null && !scanning && !anyReady;
  const canChat = online && !noneReady && !chosenMissing;
  const canSend = online && !!input.trim() && !busy && !noneReady && !chosenMissing;

  /** Khởi động sẵn CLI khi thầy cô bắt đầu gõ (mỗi tổ hợp model / mức / chế độ / lượt chỉ một lần). */
  const lastWarm = useRef("");
  const prewarm = (kind: "chat" | "write") => {
    if (!online) return;
    const key = `${kind}|${modelKey(modelSel)}|${shownEffort ?? effort}|${mode}|${msgs.length}`;
    if (lastWarm.current === key) return;
    lastWarm.current = key;
    client.send({ type: "prewarm", kind, model: modelSel, effort: shownEffort ?? effort, mode });
  };

  /** Tin đang chờ đọc phần chọn (chưa gửi đi): bấm Dừng lúc này thì không gửi nữa. */
  const pendingSend = useRef<string | null>(null);
  /** Xin gợi ý đúng lúc: một lần sau khi kết nối, rồi khi người dùng quay lại cửa sổ (cách nhau ≥ 2 phút). Không chạy liên tục. */
  useEffect(() => {
    if (!online || !hintsOn) return;
    const ask = () => {
      const now = Date.now();
      if (now - hintAsked.current < 120_000) return;
      hintAsked.current = now;
      void Promise.all([analyzeDocument(host), documentHead(host).catch(() => "")])
        .then(([profile, head]) => {
          if (profile.trim()) client.send({ type: "hint_get", id: `h${now}`, profile, head });
        })
        .catch(() => undefined);
      // Đề có hình: gửi bản đồ hình–câu (chưa kèm ảnh); bridge xin ảnh của hình chưa đọc qua img_need.
      if (host === "word")
        void scanWordImages(false)
          .then(({ images }) => {
            if (images.length) client.send({ type: "img_map", items: images.map(({ id, hash, question, caption, context, w, h }) => ({ id, hash, question, caption, context, w, h })) });
          })
          .catch(() => undefined);
    };
    const first = window.setTimeout(ask, 3000);
    window.addEventListener("focus", ask);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("focus", ask);
    };
  }, [online, hintsOn, host, client]);

  /** Đối chiếu căn cứ với kho nhóm (trên máy, không AI, không mạng): khi mở tệp và khi quay lại cửa sổ, cách nhau ≥ 2 phút. */
  useEffect(() => {
    if (!online || host !== "word") return;
    const ask = () => {
      const now = Date.now();
      if (now - basisAsked.current < 120_000) return;
      basisAsked.current = now;
      void documentBasisText(host)
        .then((text) => {
          if (text.trim()) client.send({ type: "basis_check", id: `b${now}`, text });
        })
        .catch(() => undefined);
    };
    const first = window.setTimeout(ask, 4000);
    window.addEventListener("focus", ask);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("focus", ask);
    };
  }, [online, host, client]);

  /** Gợi ý bổ sung theo nội dung tệp; tác vụ mặc định nằm ở các thẻ phía trên. */
  const starterList = useMemo(() => {
    const base = SUGGESTIONS[lang][host];
    const smart = lang === "vi" && hintsOn ? (hints?.starters ?? []).slice(0, 2) : [];
    return smart.filter((prompt) => !base.includes(prompt));
  }, [lang, host, hints, hintsOn]);

  const startBeautify = async (design?: string) => {
    if (busy || !online || bf) throw new Error(!online ? 'Chưa kết nối PVTA. Hãy kết nối lại trước khi áp dụng.' : 'Một tác vụ đang chạy. Hãy chờ hoàn tất hoặc bấm Dừng.');
    if (permission === 'read') throw new Error('PVTA đang ở chế độ chỉ đọc. Đổi quyền trong Cài đặt trước khi áp dụng thiết kế.');
    if (!design) { setTab("theme"); return; }
    setBfUndoMsg(null);
    // Chụp bản gốc trước khi sửa: chưa ưng thì Hoàn tác về đúng bản này.
    const snapshot =
      host === "powerpoint" ? Promise.resolve().then(() => { bfSnap.current = null; bfSheet.current = null; setBfCanUndo(false); }) :
      host === "excel"
        ? captureSheet().then((s) => {
            bfSheet.current = s;
            bfSnap.current = null;
            setBfCanUndo(!!s);
          })
        : captureBody().then((s) => {
            bfSnap.current = s;
            bfSheet.current = null;
            setBfCanUndo(true);
          });
    await snapshot
      .catch(() => {
        bfSnap.current = null;
        bfSheet.current = null;
        setBfCanUndo(false);
      })
      .then(() => documentHead(host))
      .catch(() => "")
      .then((head) => send(design, { head, design }));
  };

  const send = (textArg?: string, beautify?: { head: string; design?: string }) => {
    const text = (textArg ?? input).trim();
    if (!text || busy || !online) return;
    const id = crypto.randomUUID();
    activeId.current = id;
    pendingSend.current = id;
    dirty.current = true;
    if (beautify) {
      bfRun.current = id;
      setBf({ phase: "research" });
    }
    setBusy(true);
    setInput("");
    setMsgs((all) => [
      ...all.map((x) => (x.offer ? { ...x, offer: undefined } : x)), // đề nghị cũ hết hiệu lực
      { id: `u${id}`, role: "user", text, tools: [] },
      { id, role: "assistant", text: "", tools: [], model: modelSel === "auto" ? undefined : modelSel },
    ]);
    // Gửi kèm phần đang chọn (đọc tối đa ~0,35 giây) để model khỏi tốn một vòng đọc tài liệu.
    void quickSelection(host).catch(()=>undefined).then(async (context) => {
      // Chỉ mục tài liệu cũ (PVTA hoặc thầy cô vừa sửa): làm mới trước khi hỏi, tối đa 1,5 giây.
      if (rag?.enabled && (ragDirty.current || Date.now() - ragAt.current > 90_000)) await Promise.race([syncRag(), new Promise<void>((r) => setTimeout(r, 1500))]);
      if (pendingSend.current !== id) return; // đã bấm Dừng
      pendingSend.current = null;
      if (!client.send({ type: "chat", id, text, model: modelSel, effort: shownEffort ?? effort, mode, temperature, context, beautify })) {
        patchMsg(id, (x) => ({ ...x, error: { kind: "other", message: t.offline } }));
        if (bfRun.current === id) bfOff();
        finish();
      }
    });
  };

  const stop = () => {
    if (pendingSend.current && pendingSend.current === activeId.current) {
      const id = pendingSend.current;
      pendingSend.current = null;
      patchMsg(id, (x) => ({ ...x, error: { kind: "other", message: t.cancelled } }));
      finish();
      return;
    }
    client.send({ type: "cancel", id: activeId.current ?? "" });
  };

  stopRef.current = stop;

  // Lưu hội thoại sau mỗi lượt xong (không lưu lại hội thoại vừa mở ra).
  useEffect(() => {
    if (busy || !dirty.current || msgs.length === 0 || !online) return;
    dirty.current = false;
    const clean = msgs.map(({ offer: _o, ...rest }) => rest);
    client.send({ type: "ws_save", id: chatId.current, msgs: clean });
  }, [busy, msgs, online, client]);

  /** Nhờ PVTA chọn chủ đề theo cấu trúc tệp (và mô tả của giáo viên): chạy như công cụ viết, không vào khung trò chuyện. */
  const suggestTheme = (profile: string, wish: string) =>
    new Promise<Suggestion>((resolve, reject) => {
      const id = crypto.randomUUID();
      let out = '';
      const timeout=setTimeout(()=>{
        writeRoutes.current.delete(id);
        client.send({type:'cancel',id});
        reject(new Error('AI chưa trả kết quả sau 2 phút. Hãy kiểm tra kết nối hoặc chọn AI khác rồi thử lại.'));
      },120000);
      const fail=(message:string)=>{clearTimeout(timeout);writeRoutes.current.delete(id);reject(new Error(message));};
      writeRoutes.current.set(id, m => {
        if(m.type==='write_result')out=m.text;
        else if(m.type==='done'){
          clearTimeout(timeout);writeRoutes.current.delete(id);
          try{resolve(JSON.parse(out) as Suggestion);}catch{reject(new Error(t.th.noPicks));}
        }else if(m.type==='error')fail(m.message);
      });
      if(!client.send({type:'theme_suggest',id,profile,wish,model:modelSel,effort:'low'}))fail(t.offline);
    });

  /** Đính kèm tệp vào hội thoại đang hiện (hội thoại mới thì dùng mã đã sinh sẵn). */
  const attach = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (fileInput.current) fileInput.current.value = "";
    if (!files.length) return;
    setFileNote(t.ws.reading);
    const pdf=files.find(f=>/\.pdf$/i.test(f.name));
    if(pdf&&pdf.size<=120*1024*1024)setPdfPreview(pdf);
    const r: AddResult = await addFiles(files, { scope: "chat", id: chatId.current }, (m) => client.send(m), { onProgress: setFileNote, ocr: ocrPdf });
    setFileNote(noteOf(r));
  };
  const noteOf = (r: AddResult) =>
    [t.ws.noteAdded(r.added.length, r.skipped.length), ...r.skipped.slice(0, 3).map((x) => `${t.ws.noteSkipped}: ${x.name} (${x.reason})`)].join(" · ");

  /** Mở hội thoại có sẵn, hoặc bắt đầu hội thoại mới (trong dự án nếu có). */
  const openChat = (id?: string, projectId?: string) => {
    setPdfPreview(null);
    if (id === undefined) {
      chatId.current = newChatId();
      dirty.current = false;
      setMsgs([]);
      setLongDismissed(false);
      finish();
    }
    client.send({ type: "ws_open", ...(id !== undefined ? { id } : {}), ...(projectId ? { projectId } : {}) });
    if (id === undefined) box.current?.focus();
  };

  /** Tối ưu lời nhắc: PVTA viết lại câu đang gõ cho rõ và hợp model sẽ chạy; kết quả vào ô nhập để xem lại. */
  const optimize = () => {
    const text = input.trim();
    if (!text || !online || opt?.running) {
      if (!text) setOpt({ id: "", original: "", running: false, error: t.opt.empty });
      return;
    }
    const id = crypto.randomUUID();
    const target = modelSel === "auto" ? (machine?.auto ?? undefined) : modelSel;
    let out = "";
    writeRoutes.current.set(id, (m) => {
      if (m.type === "text_delta") out += m.text;
      else if (m.type === "write_result") out = m.text;
      else if (m.type === "model_used") return;
      else if (m.type === "done") {
        setOpt((o) => (o && o.id === id ? { ...o, running: false } : o));
        if (out.trim()) {
          setInput(out.trim());
          // Có ô trống [ ] thì mở ngay màn hình điền.
          if (promptFields(out).length) setLib({ fillText: out.trim() });
        }
      } else if (m.type === "error") setOpt((o) => (o && o.id === id ? { ...o, running: false, error: m.message } : o));
    });
    setOpt({ id, original: input, running: true, model: target });
    void quickSelection(host, 200).then((ctx) => {
      if (!client.send({ type: "optimize", id, text, model: modelSel, hasSelection: !!ctx?.selection?.trim() })) {
        setOpt({ id, original: input, running: false, error: t.offline });
      }
    });
  };

  /** Trạng thái nút ✦: vàng (chờ), nhấp nháy (đang chạy), xanh (đã áp dụng), đỏ (lỗi). Sửa ô nhập thì opt về null nên nút về vàng. */
  const optState: "idle" | "running" | "applied" | "error" = !opt
    ? "idle"
    : opt.running
      ? "running"
      : opt.error
        ? "error"
        : opt.original
          ? "applied"
          : "idle";
  const optTitle =
    optState === "error" ? `${t.opt.button}: ${opt?.error ?? ""}` : optState === "applied" ? t.opt.applied : optState === "running" ? t.opt.busy : t.opt.button;

  const choosePermission = (level: PermissionLevel) => {
    client.send({ type: "set_permission", level });
    setPermission(level);
    setFirstRun(false);
  };

  const answer = (approved: boolean, all = false) => {
    if (approval) client.send({ type: "approval", id: approval.id, approved, all });
    setApproval(null);
  };

  const permShort = t.permShort[permission ?? "ask"];

  const scanSkills = (source: string) => {
    setSkillError(null);
    setSkillFound(null);
    setSkillNotice(null);
    setSkillScanning(true);
    if (!client.send({ type: "skills_scan", source })) {
      setSkillScanning(false);
      setSkillError(t.offline);
    }
  };
  const useSkill = (name: string) => {
    setSkillsOpen(false);
    setTab("chat");
    setInput((v) => (v.trim() ? `/${name} ${v}` : `/${name} `));
    setTimeout(() => box.current?.focus(), 0);
  };
  const flashMenu = (s: string) => {
    setMenuNote(s);
    setTimeout(() => setMenuNote(null), 1800);
  };
  const exportLabels = { title: t.more.chatLabel, you: t.more.you, ai: "PVTA" };
  const chatMd = () => chatToMarkdown(msgs, exportLabels);
  const menuAct = {
    download: () => {
      const md = chatMd();
      if (!md) return flashMenu(t.more.empty);
      if (downloadText(chatFileName(), md)) flashMenu(t.more.downloaded);
      else void copyText(md).then((ok) => flashMenu(ok ? t.more.copied : t.more.empty));
    },
    copy: async () => {
      const md = chatMd();
      if (!md) return flashMenu(t.more.empty);
      flashMenu((await copyText(md)) ? t.more.copied : t.more.empty);
    },
    insert: () => {
      const md = chatMd();
      if (!md) return flashMenu(t.more.empty);
      executeTool("word", { tool: "office_word_insert_text", args: { text: plainText(md), where: "cursor" } })
        .then(() => flashMenu(t.inserted))
        .catch(() => flashMenu(t.more.empty));
    },
  };
  const hasChat = msgs.some((m) => m.text.trim());
  const longChat = tab === "chat" && !longDismissed && msgs.length >= 40;
  // Gọn cho thanh bên hẹp: tên model thực sự chạy; chế độ viết (hoặc mức suy nghĩ) ở bên cạnh.
  const modelChip = modelSel === "auto" ? (machine?.auto ? modelLabel(machine.auto, catalog) : t.auto) : modelLabel(modelSel, catalog);
  const curMode = modeInfo(t, mode, customModes);
  const modeChip = (
    <button
      className={`pill mode-pill ${mode !== "standard" ? "on" : ""}`}
      onClick={() => {
        setModeStatus(null);
        setModeView("pick");
      }}
      title={`${t.m.title}: ${curMode.name}`}
      aria-label={`${t.m.title}: ${curMode.name}`}
    >
      <Icon name="pen" size={14} />
      <span className="pill-main">{curMode.name}</span>
    </button>
  );

  return (
    <div className="app">
      <header className="bar">
        <button
          className="brand"
          title={ws?.activeProject ? t.ws.brandTip : t.ws.brandTipHere}
          aria-label={ws?.activeProject ? t.ws.brandTip : t.ws.brandTipHere}
          onClick={() => {
            setTab("chat");
            if (ws?.activeProject) openChat();
            else box.current?.focus();
          }}
        >
          PVTA <span className="ver-pill">2.0</span>
        </button>
        <span className={online || chatLinked ? "dot on" : "dot"} role="status" aria-label={online || chatLinked ? t.online : t.offline} title={online || chatLinked ? t.online : t.offline} />
        <span className="host-name">{HOST_NAME[host]}</span>
        {chatLinked && <span className="chat-link-badge" title="Đã kết nối trực tiếp với PVTA Chat 2.0">Chat</span>}
        {busy && <span className="typing sm" role="status" aria-label={t.running(elapsed)} title={t.running(elapsed)}><i /><i /><i /></span>}
        <span className="spacer" />
        {ws?.activeProject && (
          <button className="proj-badge" title={t.ws.open} onClick={() => setDrawer(true)}>
            <Icon name="folder" size={14} /> {ws.projects.find((p) => p.id === ws.activeProject)?.name ?? ""}
          </button>
        )}
        {tab !== "chat" && (
          <button className="pill" onClick={() => setTab("chat")} title={t.tabs.chat}>
            <Icon name="chat" size={14} /> <span>{t.tabs.chat}</span>
          </button>
        )}
        <button
          className={`icon ${menu ? "on" : ""}`}
          title={t.more.more}
          aria-label={t.more.more}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <Icon name="more" size={18} />
        </button>
      </header>

      {!online && !chatLinked && <div className="banner warn">{env.ipad ? t.ipad.offline : t.offline}</div>}

      <DocumentContext host={host} files={[...(ws?.chatFiles??[]),...(ws?.projectFiles[ws.activeProject??'']??[])].map(f=>f.name)} ready={!!rag?.ready} docRules={ws?.docRules} onRefresh={()=>void syncRag(true)} onOpenRules={openDocRules}/>
      {tab === "suite" && (
        <main className="chat">
          <TeacherSuitePanel
            host={host}
            online={online && !busy && !noneReady && !chosenMissing}
            readOnly={permission === "read"}
            onSendPrompt={(prompt) => {
              setTab("chat");
              send(prompt);
            }}
          />
        </main>
      )}
      {tab === "write" && (
        <main className="chat">
          <WritePanel
            t={t}
            host={host}
            online={online}
            readOnly={permission === "read"}
            model={modelSel}
            catalog={catalog}
            effort={shownEffort}
            mode={mode}
            temperature={temperature}
            send={(m) => client.send(m)}
            register={(id, fn) => writeRoutes.current.set(id, fn)}
            prewarm={() => prewarm("write")}
            onSetup={() => setSettings("ai")}
          />
        </main>
      )}
      {tab === "theme" && (
        <main className="chat">
          <ThemePanel t={t} host={host} online={online && !busy && !bf && !noneReady && !chosenMissing} suggest={suggestTheme}
            disabledReason={!online?'Chưa kết nối dịch vụ PVTA.':noneReady||chosenMissing?'Chưa có AI sẵn sàng. Hãy chọn hoặc thiết lập AI trong Cài đặt.':permission==='read'?'Đang ở chế độ chỉ đọc; cần đổi quyền để áp dụng thiết kế.':busy||bf?'Đang xử lý tác vụ khác.':undefined}
            onChoose={async(text) => { await startBeautify(text); setTab("chat"); }} />
        </main>
      )}
      {tab === "chat" && (
      <main className="chat" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="empty">
            {noneReady ? (
              <NoBackend t={t} onSetup={(s) => setSettings(s)} />
            ) : (
              <>
                <span className="empty-eyebrow">PVTA 2.0 · {HOST_NAME[host].toUpperCase()}</span>
                <h1>{t.greeting(HOST_NAME[host])}</h1>
                <p className="sub">{t.greetingSub[host]}</p>
                <WelcomeActions host={host} lang={lang} onChoose={(prompt) => {
                  setInput(prompt.replace(/…\s*$/, ""));
                  box.current?.focus();
                }} />

      {bf && (
        <div className="bf-bar" role="status">
          <span>
            {bf.phase === "research"
              ? t.bf.research(bf.label ?? "…")
              : bf.phase === "working"
                ? t.bf.working(bf.label ?? "", bf.note)
                : bf.phase === "waiting"
                  ? t.bf.waiting
                  : t.bf.learning}
          </span>
          {bf.phase === "waiting" && (
            <>
              {bfCanUndo && (
                <button className="small" onClick={() => void bfUndo()}>
                  {t.bf.undo}
                </button>
              )}
              <button className="small" onClick={() => { bfSnap.current = null; setBfCanUndo(false); void bfLearn(); }}>
                {t.bf.learnNow}
              </button>
              <button className="link" onClick={() => { client.send({ type: "beautify_cancel" }); bfOff(); }}>
                {t.bf.cancel}
              </button>
            </>
          )}
        </div>
      )}

      {!bf && bfUndoMsg && (
        <div className="bf-bar" role="status">
          <span className={bfUndoMsg.ok ? undefined : "error"}>{bfUndoMsg.text}</span>
          <button className="link" onClick={() => setBfUndoMsg(null)}>
            {t.bf.dismiss}
          </button>
        </div>
      )}

      {hintsOn && refs.length > 0 && (
        <RefList
          t={t}
          items={refs}
          open={refText}
          busy={refBusy}
          onView={(refId) => {
            setRefBusy(refId);
            setRefText(null);
            client.send({ type: "ref_open", id: `ref${Date.now()}`, refId });
          }}
          onUse={(title, text) => {
            setInput((v) => `${v ? v + "\n\n" : ""}Dựa vào văn bản "${title}" dưới đây:\n"""\n${text}\n"""\n`);
            setRefText(null);
            box.current?.focus();
          }}
          onClose={() => setRefText(null)}
          onOpenLink={openUrl}
        />
      )}

      {hintsOn && imgStatus && <p className="opt-hint img-status">{t.hint.images(imgStatus.read, imgStatus.total)}</p>}

      {basis && (
        <BasisBar
          vi={lang === "vi"}
          changed={basis.changed}
          related={basis.related}
          disclaimer={basis.disclaimer}
          canFix={!!basis.fixPrompt}
          onFix={() => setInput((v) => `${v ? v + "\n\n" : ""}${basis.fixPrompt ?? ""}`)}
          onMute={(no) => {
            client.send({ type: "basis_mute", no });
            setBasis((b) => (b ? { ...b, changed: b.changed.filter((c) => c.no !== no) } : b));
          }}
          onDismiss={() => setBasis(null)}
          onOpenLink={openUrl}
        />
      )}
                {scanning && machine && <p className="sub">{t.scanning}</p>}
              </>
            )}
          </div>
        ) : (
          msgs.map((m) => (
            <MessageView
              key={m.id}
              m={m}
              t={t}
              lang={lang}
              host={host}
              catalog={catalog}
              working={m.role === "assistant" && busy && m.id === activeId.current}
              onSetup={(s) => setSettings(s)}
              onOffer={(ok) => {
                patchMsg(m.id, (x) => ({ ...x, offer: undefined }));
                if (ok && m.offer) send(t.offerYesText(m.offer.summary));
              }}
            />
          ))
        )}
        <div ref={bottom} />
      </main>
      )}

      <nav className="toolbar" aria-label="PVTA">
        <button className="tb" title={t.newChat} aria-label={t.newChat} disabled={msgs.length === 0 && !busy && tab === "chat"} onClick={() => { setTab("chat"); openChat(undefined, undefined); }}>
          <Icon name="plus" size={16} />
          <span className="tb-lab">{t.more.newShort}</span>
        </button>
        <button className="tb" title={t.ws.open} aria-label={t.ws.open} onClick={() => setDrawer(true)}>
          <Icon name="project" size={16} />
          <span className="tb-lab">{t.more.chats}</span>
        </button>
        <span className="spacer" />
        <button className="tb" title={`${t.permission}: ${permLoaded ? permShort : "…"}`} aria-label={t.permission} onClick={() => setSettings("perm")}>
          <Icon name={permission === "read" ? "eye" : permission === "full" ? "pen" : "mouth"} size={16} />
          <span className="tb-lab">{permLoaded ? permShort : t.more.perm}</span>
        </button>
        <button className={`tb ${menu ? "on" : ""}`} title={t.more.more} aria-label={t.more.more} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <Icon name="tools" size={16} />
          <span className="tb-lab">{t.more.title}</span>
        </button>
      </nav>

      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="menu" role="menu" aria-label={t.more.more}>
            <div className="menu-group-label">{lang === "vi" ? "Không gian & Công cụ" : "Workspaces & Tools"}</div>
            <button role="menuitem" className={tab === "chat" ? "on" : ""} onClick={() => (setMenu(false), setTab("chat"))}>
              <Icon name="chat" size={16} /> {t.tabs.chat}
            </button>
            <button role="menuitem" className={tab === "write" ? "on" : ""} onClick={() => (setMenu(false), setTab("write"))}>
              <Icon name="file" size={16} /> {t.tabs.write}
            </button>
            <button role="menuitem" className={tab === "theme" ? "on" : ""} onClick={() => (setMenu(false), setTab("theme"))}>
              <Icon name="spark" size={16} /> {t.tabs.theme}
            </button>
            <button role="menuitem" className={tab === "suite" ? "on" : ""} onClick={() => (setMenu(false), setTab("suite"))}>
              <Icon name="tools" size={16} /> {lang === "vi" ? "Bộ công cụ giáo viên" : "Teacher Suite"}
            </button>
            {host !== "powerpoint" && (
              <button
                role="menuitem"
                disabled={!online || busy || !!bf || chosenMissing === true}
                onClick={() => {
                  setMenu(false);
                  void startBeautify().catch((e) => setBfUndoMsg({ ok: false, text: String(e.message ?? e) }));
                }}
              >
                <Icon name="spark" size={16} /> {host === "excel" ? t.bf.buttonSheet : t.bf.button}
              </button>
            )}
            <hr />
            <div className="menu-group-label">{lang === "vi" ? "Thao tác nhanh trên tài liệu" : "Quick actions"}</div>
            <div className="menu-quick-grid">
              {(["summarize", "proofread", "translate", "table", "polish", "shorten"] as const).map((k) => (
                <button
                  key={k}
                  role="menuitem"
                  className="menu-qchip"
                  disabled={busy || !canChat}
                  title={t.chips[k].prompt}
                  onClick={() => {
                    setMenu(false);
                    setTab("chat");
                    send(t.chips[k].prompt);
                  }}
                >
                  {t.chips[k].label}
                </button>
              ))}
            </div>
            <hr />
            <div className="menu-group-label">{lang === "vi" ? "Nguồn & Thư viện" : "Sources & Library"}</div>
            <button role="menuitem" onClick={() => (setMenu(false), openDocRules())}>
              <Icon name="scale" size={16} /> {t.more.rules}{ws?.docRules ? ` · ${t.ws.rulesHas}` : ""}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setSettings("learn"))}>
              <Icon name="brain" size={16} /> {t.more.learned}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setLib({}))}>
              <Icon name="notebook" size={16} /> {t.more.library}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setSkillsOpen(true))}>
              <Icon name="skills" size={16} /> {t.more.skills}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setNbOpen(true))}>
              <Icon name="folder" size={16} /> {t.more.notebooks}
            </button>
            {rag?.enabled && (
              <button role="menuitem" disabled={!online || ragBusy} onClick={() => (setMenu(false), void syncRag(true))}>
                <Icon name="search" size={16} /> {ragBusy ? t.rag.building : t.rag.button}
              </button>
            )}
            <hr />
            <button role="menuitem" disabled={!hasChat} onClick={menuAct.download}>
              <Icon name="download" size={16} /> {t.more.download}
            </button>
            <button role="menuitem" disabled={!hasChat} onClick={() => void menuAct.copy()}>
              <Icon name="copy" size={16} /> {t.more.copyMd}
            </button>
            {host === "word" && (
              <button role="menuitem" disabled={!hasChat || permission === "read"} onClick={menuAct.insert}>
                <Icon name="pen" size={16} /> {t.more.insertDoc}
              </button>
            )}
            <hr />
            <button role="menuitem" onClick={() => (setMenu(false), setAddinPalette((p) => (p === "violet" ? "modern" : "violet")))}>
              <Icon name="palette" size={16} /> {addinPalette === "violet" ? "Giao diện: Sư phạm Hiện đại" : "Giao diện: Mực Tím Tinh Tế"}
            </button>
            <button role="menuitem" disabled={busy} onClick={() => location.assign(new URL("desktop.html", location.href).href)}>
              <Icon name="office" size={16} /> {chatLinked ? (lang === "vi" ? "Đã kết nối PVTA Chat 2.0 ✓" : "Connected to PVTA Chat 2.0 ✓") : (lang === "vi" ? "Kết nối PVTA Chat 2.0" : "Connect to PVTA Chat 2.0")}
            </button>
            <button role="menuitem" onClick={() => (setMenu(false), setSettings("perm"))}>
              <Icon name="gear" size={16} /> {t.more.settings}
            </button>
            {menuNote && (
              <div className="menu-note" role="status">
                {menuNote}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "write" && (
        <footer className="modelbar">
          <button className="pill" onClick={() => setPicker(true)} title={t.chooseModel}>
            <span className="pill-main">{modelChip}</span>
            <span className="pill-sub">{shownEffort ? t.efforts[shownEffort] : ""}</span>
            <span aria-hidden>▾</span>
          </button>
          {modeChip}
          <button
            className={`pill ${ws?.docRules ? "on" : ""}`}
            onClick={openDocRules}
            title={`${t.ws.rulesDoc}${ws?.docRules ? `: ${ws.docRules}` : ""}`}
            aria-label={t.ws.rulesDoc}
          >
            <Icon name="scale" size={14} />
            <span className="pill-main">{t.ws.rules}</span>
          </button>
        </footer>
      )}

      {tab === "chat" && (
      <footer className="composer">
        {chosenMissing && (
          <div className="notice">
            <span>{t.missingChosen(modelSel.backend === "api" ? t.sectionApi : BACKEND_INFO[modelSel.backend].product)}</span>
            {machine?.auto && (
              <button className="small primary" onClick={() => setModelSel("auto")}>
                {t.switchAuto(modelLabel(machine.auto, catalog))}
              </button>
            )}
            <button className="link" onClick={() => setSettings(modelSel.backend === "api" ? "api" : "ai")}>
              {modelSel.backend === "api" ? t.addApiKey : t.howToInstall}
            </button>
          </div>
        )}
        {update && update.available && !updDismissed && (
          <div className="optbar" role="status">
            <span>
              {update.state === "downloading"
                ? t.upd.downloading
                : update.state === "restarting"
                  ? t.upd.restarting
                  : update.state === "installing"
                    ? t.upd.installing
                    : t.upd.available(update.latest ?? "", update.current)}
            </span>
            {!update.state && (
              <>
                <button className="link" onClick={() => client.send({ type: "update_apply" })}>
                  {t.upd.now}
                </button>
                <button className="link" onClick={() => setUpdDismissed(true)}>
                  {t.more.later}
                </button>
              </>
            )}
            {update.error && <span className="error">{update.error}</span>}
          </div>
        )}
        {longChat && (
          <div className="optbar" role="status">
            <span>{t.more.long(msgs.length)}</span>
            <button className="link" onClick={() => openChat(undefined, undefined)}>
              {t.more.longNew}
            </button>
            <button className="link" onClick={() => setLongDismissed(true)}>
              {t.more.later}
            </button>
          </div>
        )}
        {opt && (opt.running || opt.error || opt.original) && (
          <div className={opt.error ? "notice" : "optbar"} role="status">
            <span>
              {opt.error
                ? opt.error
                : opt.running
                  ? t.opt.running(opt.model ? modelLabel(opt.model, catalog) : t.auto)
                  : t.opt.done(opt.model ? modelLabel(opt.model, catalog) : t.auto)}
            </span>
            {opt.running && (
              <button className="link" onClick={() => client.send({ type: "cancel", id: opt.id })}>
                {t.stop}
              </button>
            )}
            {!opt.running && !opt.error && opt.original && (
              <>
                {promptFields(input).length > 0 && (
                  <button className="link" onClick={() => setLib({ fillText: input })}>
                    {t.opt.fill}
                  </button>
                )}
                <button
                  className="link"
                  onClick={() => {
                    setInput(opt.original);
                    setOpt(null);
                  }}
                >
                  {t.opt.undo}
                </button>
              </>
            )}
            {opt.error && (
              <button className="link" onClick={() => setOpt(null)}>
                {t.close}
              </button>
            )}
          </div>
        )}
        {pdfPreview&&<Suspense fallback={<p role="status">Đang chuẩn bị xem trước PDF…</p>}><PdfPreview file={pdfPreview} onClose={()=>setPdfPreview(null)}/></Suspense>}
        {(ws?.chatFiles.length || fileNote) && (
          <div className="file-row" role="group" aria-label={t.ws.attached(ws?.chatFiles.length ?? 0)}>
            {ws?.chatFiles.map((f) => (
              <span key={f.name} className="file-chip" title={`${f.name} · ${f.chars.toLocaleString()}`}>
                <span className="file-name"><Icon name="file" size={14} /> {f.name}</span>
                <button className="x" aria-label={`${t.ws.removeFile}: ${f.name}`} onClick={() => client.send({ type: "file_remove", scope: "chat", id: chatId.current, name: f.name })}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            {fileNote && (
              <span className="file-note sub" role="status" onClick={() => setFileNote(null)} title={t.close}>
                {fileNote}
              </span>
            )}
          </div>
        )}
        <div className="inputbox">
          <textarea
            ref={box}
            rows={2}
            placeholder={t.placeholder}
            title={t.placeholderTip}
            aria-label={`${t.placeholder} ${t.placeholderTip}`}
            value={input}
            readOnly={opt?.running === true}
            onChange={(e) => {
              // Gõ "/" ở ô trống: mở thư viện lời nhắc (giống Monica).
              if (!input && e.target.value === "/") {
                setLib({});
                return;
              }
              if (!input && e.target.value) prewarm("chat");
              if (opt && !opt.running) setOpt(null);
              setInput(e.target.value);
            }}
            onFocus={() => prewarm("chat")}
            onKeyDown={(e) => {
              // Tab (không Shift) khi đã gõ: tối ưu lời nhắc. Ô trống thì Tab vẫn chuyển ô như thường.
              if (e.key === "Tab" && !e.shiftKey && input.trim() && !e.nativeEvent.isComposing) {
                e.preventDefault();
                optimize();
                return;
              }
              // Đang gõ dấu (bộ gõ đang ghép chữ): Enter để chốt chữ, không phải để gửi.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                if (canSend) send();
              }
            }}
          />
          <div className="tools-row">
            <button className="pill" onClick={() => setPicker(true)} title={t.chooseModel}>
              <span className="pill-main">{modelChip}</span>
              <span className="pill-sub">{shownEffort ? t.efforts[shownEffort] : ""}</span>
              <span aria-hidden>▾</span>
            </button>
            {modeChip}
            <button
              className={`icon ${ws?.docRules ? "on" : ""}`}
              title={`${t.ws.rulesDoc}${ws?.docRules ? `: ${ws.docRules}` : ""}`}
              aria-label={t.ws.rulesDoc}
              disabled={!online}
              onClick={openDocRules}
            >
              <Icon name="scale" size={18} />
            </button>
            <span className="spacer" />
            <input ref={fileInput} type="file" multiple hidden accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.html,.htm,.tex,.srt,.yaml,.yml,.docx,.xlsx,.pptx,.pdf" onChange={(e) => void attach(e.target.files)} />
            <button className="icon" title={`${t.ws.attach}. ${t.ws.attachTip}`} aria-label={t.ws.attach} disabled={!online} onClick={() => fileInput.current?.click()}>
              <Icon name="attach" size={18} />
            </button>
            <button
              className={`icon opt-btn ${optState}`}
              title={optTitle}
              aria-label={optTitle}
              aria-busy={optState === "running"}
              disabled={optState === "running"}
              onClick={optimize}
            >
              <Icon name="spark" size={18} inheritColor />
              {optState === "applied" && <span className="opt-tick" aria-hidden>✓</span>}
            </button>
            {busy ? (
              <button className="send stop" onClick={stop} title={t.stop} aria-label={t.stop}>
                <Icon name="stop" size={16} inheritColor />
              </button>
            ) : (
              <button className="send" disabled={!canSend} onClick={() => send()} title={t.send} aria-label={t.send}>
                <Icon name="send" size={16} inheritColor />
              </button>
            )}
          </div>
        </div>
      </footer>
      )}

      {picker && (
        <ModelPicker
          t={t}
          machine={machine}
          value={modelSel}
          effort={shownEffort ?? effort}
          onPick={setModelSel}
          onEffort={setEffort}
          onClose={() => setPicker(false)}
          onSetup={(s) => {
            setPicker(false);
            setSettings(s);
          }}
        />
      )}

      {modeView && (
        <ModeSheet
          t={t}
          custom={customModes}
          mode={mode}
          temperature={temperature}
          effective={effective}
          view={modeView}
          status={modeStatus}
          send={(m) => client.send(m)}
          onMode={(md) => {
            setMode(md);
            setTemperature(null); // đổi chế độ thì dùng nhiệt độ của chế độ đó
            const e = resolveMode(md, customModes)?.effort;
            if (e) setEffort(e);
          }}
          onTemperature={setTemperature}
          onView={(v) => {
            setModeStatus(null);
            setModeView(v);
          }}
          onClose={() => setModeView(null)}
        />
      )}

      {drawer && ws && (
        <SessionsDrawer
          standardized={standardized}
          t={t}
          host={host}
          ws={ws}
          activeChatId={chatId.current}
          docName={currentDocName()}
          initialRulesFor={drawerRulesFor}
          send={(m) => client.send(m)}
          onOpen={openChat}
          onClose={() => {
            setDrawer(false);
            setDrawerRulesFor(null);
          }}
          note={fileNote}
          onNote={setFileNote}
          noteOf={noteOf}
          ocr={ocrPdf}
        />
      )}

      {nbOpen && <NotebookPanel t={t} nb={nb} onClose={() => setNbOpen(false)} />}

      {skillsOpen && (
        <SkillsPanel
          standardized={standardized}
          t={t}
          items={skills}
          found={skillFound}
          notice={skillNotice}
          error={skillError}
          scanning={skillScanning}
          send={(m) => client.send(m)}
          onScan={scanSkills}
          onUse={useSkill}
          onClose={() => setSkillsOpen(false)}
        />
      )}

      {lib && (
        <PromptLibrary
          t={t}
          host={host}
          own={ownPrompts}
          favorites={favPrompts}
          draft={input}
          fillText={lib.fillText}
          send={(m) => client.send(m)}
          onUse={(text, now) => {
            setTab("chat");
            setOpt(null);
            if (now) send(text);
            else {
              setInput(text);
              setTimeout(() => box.current?.focus(), 0);
            }
          }}
          onClose={() => setLib(null)}
        />
      )}

      {settings && (
        <Settings
          t={t}
          host={host}
          language={lang}
          onLanguage={value=>{localStorage.setItem("pvta.lang",value);window.location.reload();}}
          machine={machine}
          permission={permission}
          learned={learned}
          hintsOn={hintsOn}
          update={update}
          community={community}
          apiModelsMsg={apiModelsMsg}
          ipad={ipad}
          rag={rag}
          ragBusy={ragBusy}
          onRagRefresh={() => void syncRag(true)}
          focus={settings}
          send={(m) => client.send(m)}
          onPermission={choosePermission}
          onModes={() => {
            setSettings(null);
            setModeStatus(null);
            setModeView("manage");
          }}
          onClose={() => setSettings(null)}
        />
      )}

      {firstRun && !settings && (
        <div className="overlay">
          <div className="dialog" role="dialog" aria-label={t.permTitle}>
            <h2>{t.permTitle}</h2>
            <p className="sub">{t.permIntro}</p>
            <PermissionChoices t={t} value={permission} onChoose={choosePermission} />
          </div>
        </div>
      )}

      {approval && <Approval t={t} lang={lang} call={approval.call} onAnswer={answer} />}
    </div>
  );
}

function NoBackend({ t, onSetup }: { t: typeof STRINGS.vi; onSetup(s: SettingsSection): void }) {
  return (
    <div className="none">
      <h1>{t.noneTitle}</h1>
      <p className="sub">{t.noneBody}</p>
      <div className="row">
        <button className="primary" onClick={() => onSetup("ai")}>
          {t.howToInstall}
        </button>
        <button onClick={() => onSetup("api")}>{t.addApiKey}</button>
      </div>
    </div>
  );
}

function MessageView({
  m,
  t,
  lang,
  host,
  catalog,
  working,
  onSetup,
  onOffer,
}: {
  m: Msg;
  t: typeof STRINGS.vi;
  lang: "vi" | "en";
  host: OfficeHost;
  catalog?: ModelCatalog;
  working: boolean;
  onSetup(s: SettingsSection): void;
  onOffer(ok: boolean): void;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const note = (s: string) => {
    setFlash(s);
    setTimeout(() => setFlash(null), 1500);
  };
  if (m.role === "user")
    return m.prompt ? (
      <div className="msg-user-wrap">
        <div className="msg user">{m.text}</div>
        <details className="prompt-peek">
          <summary>{t.bf.showPrompt}</summary>
          <pre>{m.prompt}</pre>
        </details>
      </div>
    ) : (
      <div className="msg user">{m.text}</div>
    );
  const missing = m.error?.kind === "missing";
  return (
    <div className="msg assistant">
      {m.tools.length > 0 && (
        <ul className="steps">
          {m.tools.map((l, i) => (
            <li key={i} className={`step ${l.status}`} title={l.detail}>
              <span className="step-mark" aria-hidden />
              {toolLabel(l.tool, lang)}
              {l.detail && l.status !== "running" && <span className="step-detail"> · {l.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {m.text ? <Markdown text={m.text} onCite={(r) => void gotoRef(host, r).then((ok) => !ok && note(t.rag.notFound))} /> : working && <div className="working">{t.thinking}</div>}
      {m.error && (
        <div className={missing ? "notice" : "error"} role="alert">
          <span>{m.error.message}</span>
          {missing && (
            <button className="link" onClick={() => onSetup(/API/.test(m.error!.message) ? "api" : "ai")}>
              {t.openSettings}
            </button>
          )}
        </div>
      )}
      {!working && m.offer && (
        <div className="offer" role="group" aria-label={t.offerTitle}>
          <span>
            {t.offerTitle} <strong>{m.offer.summary}</strong>?
          </span>
          <div className="row">
            <button className="primary small" onClick={() => onOffer(true)}>
              {t.offerYes}
            </button>
            <button className="small" onClick={() => onOffer(false)}>
              {t.offerNo}
            </button>
          </div>
        </div>
      )}
      {!working && m.notes?.map((n) => (
        <p key={n} className="note">{n}</p>
      ))}
      {!working && (m.text || m.timings) && (
        <div className="meta">
          {m.model && <span>{modelLabel(m.model, catalog)}</span>}
          {m.timings && (
            <span>
              {(m.timings.totalMs / 1000).toFixed(1)}s{m.timings.rounds > 1 ? ` · ${m.timings.rounds} ${t.rounds}` : ""}
            </span>
          )}
          <span className="spacer" />
          {m.text && (
            <button className="link" onClick={async () => (await copyText(m.text)) && note(t.copied)}>
              {flash === t.copied ? t.copied : t.copy}
            </button>
          )}
          {m.text && host === "word" && (
            <button
              className="link"
              onClick={() =>
                executeTool("word", { tool: "office_word_insert_text", args: { text: plainText(m.text), where: "cursor" } })
                  .then(() => note(t.inserted))
                  .catch(() => undefined)
              }
            >
              {flash === t.inserted ? t.inserted : t.insert}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Approval({ t, lang, call, onAnswer }: { t: typeof STRINGS.vi; lang: "vi" | "en"; call: ToolCall; onAnswer(ok: boolean, all?: boolean): void }) {
  const { text, rest } = argsPreview(call.args);
  const restJson = Object.entries(rest)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n")
    .slice(0, 600);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAnswer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);
  return (
    <div className="overlay">
      <div className="dialog" role="alertdialog" aria-label={t.approveTitle}>
        <p className="sub">{t.approveTitle}</p>
        <h2>{toolLabel(call.tool, lang)}</h2>
        {text !== undefined && <blockquote className="preview">{text.length > 1500 ? `${text.slice(0, 1500)}…` : text}</blockquote>}
        {restJson && <pre className="args">{restJson}</pre>}
        <div className="row">
          <button className="primary" autoFocus onClick={() => onAnswer(true)}>
            {t.approve}
          </button>
          <button onClick={() => onAnswer(true, true)} title={t.approveAllHint}>
            {t.approveAll}
          </button>
          <button onClick={() => onAnswer(false)}>{t.deny}</button>
        </div>
        <p className="keys">{t.approveKeys}</p>
      </div>
    </div>
  );
}
