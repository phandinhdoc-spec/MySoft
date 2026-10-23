import { API_PROVIDERS, cleanModelList, splitApiModel, type ApiModelEntry, type ApiProvider } from "@pvta/shared";
import type { RunRequest, RunResult } from "./engine.js";
import { EngineError } from "./errors.js";
import { Stopwatch } from "./timing.js";

/** Cấu hình API lưu trong config.json (tệp chỉ người dùng đọc được). */
export type ApiSettings = Partial<Record<ApiProvider, { key?: string; baseUrl?: string; model?: string; models?: ApiModelEntry[] }>>;

export interface ApiDeps {
  settings: () => ApiSettings | undefined;
  fetch?: typeof fetch;
}

/** Đọc luồng SSE (data: …) theo từng sự kiện. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield data;
    }
    if (done) {
      const rest = buf.trim();
      if (rest.startsWith("data:")) yield rest.slice(5).trim();
      return;
    }
  }
}

function classifyHttp(status: number, message: string): EngineError {
  const m = message.slice(0, 400) || `HTTP ${status}`;
  if (status === 401 || status === 403) return new EngineError("auth", `Khóa API không hợp lệ hoặc không có quyền: ${m}`);
  if (status === 404 || ((status === 400 || status === 422) && /model/i.test(message))) return new EngineError("model", `Model không dùng được: ${m}`);
  if (status === 429) return new EngineError("other", `Đã chạm hạn mức của API (quá nhiều yêu cầu hoặc hết tiền): ${m}`);
  return new EngineError("other", `API báo lỗi (${status}): ${m}`);
}

async function errorText(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === "string") return j.error;
    return j.error?.message ?? j.message ?? raw;
  } catch {
    return raw;
  }
}

/** Describe transport failures without exposing request headers or raw nested errors. */
function connectionFailure(error: unknown): string {
  const codes = new Set<string>();
  function collect(value: unknown, depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return;
    const e = value as {code?: unknown; cause?: unknown; errors?: unknown[]};
    if (typeof e.code === "string") codes.add(e.code);
    collect(e.cause, depth + 1);
    if (Array.isArray(e.errors)) for (const child of e.errors) collect(child, depth + 1);
  }
  collect(error);
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN")) return "Không phân giải được tên máy chủ (DNS). Thử lại hoặc kiểm tra DNS của mạng.";
  if (codes.has("ETIMEDOUT") || codes.has("UND_ERR_CONNECT_TIMEOUT") || codes.has("ENETUNREACH") || codes.has("EHOSTUNREACH")) return "Không thiết lập được kết nối mạng tới máy chủ trong thời gian chờ. Chưa kiểm tra được khóa API. Hãy thử lại hoặc kiểm tra VPN/proxy và đường truyền.";
  if ([...codes].some(code => /CERT|TLS|SSL/.test(code))) return "Không xác minh được kết nối bảo mật TLS. Kiểm tra ngày giờ máy và chứng chỉ của mạng/VPN.";
  if (codes.has("ECONNREFUSED")) return "Máy chủ từ chối kết nối mạng. Kiểm tra dịch vụ và cổng kết nối.";
  return "Kết nối mạng bị gián đoạn trước khi nhận phản hồi. Chưa kiểm tra được khóa API. Hãy thử lại.";
}

/**
 * Backend "api": gọi thẳng API bằng khóa người dùng nhập. Không giữ phiên (mỗi lần gửi bản đầy đủ),
 * không có công cụ gốc nào: model chỉ thao tác văn bản qua khối office-tool như các backend khác.
 */
export class ApiClient {
  /** Tham số tùy chọn mà từng model đã từ chối (temperature, effort). */
  private unsupported = new Map<string, Set<string>>();
  constructor(private d: ApiDeps) {}

  private usageCache?:{key:string;value:import('@pvta/shared').ProviderUsage};
  private usageRead?:{key:string;promise:Promise<import('@pvta/shared').ProviderUsage>};
  /** Same read-only billing routes used by Command Code /usage (CLI 1.81).
   * Only use the saved key on its configured official origin; never follow redirects. */
  async readUsage(provider:string,force=false):Promise<import('@pvta/shared').ProviderUsage>{
    if(provider!=="commandcode")throw Error("Nguồn API này chưa cung cấp truy vấn hạn mức.");
    const settings=this.d.settings()?.commandcode;
    if(!settings?.key)throw Error("Chưa cấu hình khóa Command Code.");
    const base=new URL(settings.baseUrl||API_PROVIDERS.commandcode.baseUrl);
    if(base.origin!=="https://api.commandcode.ai")throw Error("Chỉ đọc hạn mức từ máy chủ Command Code chính thức đã cấu hình.");
    const key=base.origin+settings.key;
    if(this.usageRead?.key===key)return this.usageRead.promise;
    if(!force&&this.usageCache?.key===key&&Date.now()-(this.usageCache.value.checkedAt??0)<60000)return this.usageCache.value;
    const promise=(async()=>{
      const signal=AbortSignal.timeout(15000),doFetch=this.d.fetch??fetch;
      const get=async(path:string)=>{
        let response:Response;
        try{response=await doFetch(base.origin+path,{headers:{authorization:`Bearer ${settings.key}`,accept:'application/json'},redirect:'error',signal});}catch{throw Error("Chưa kết nối được Command Code để đọc hạn mức. Bấm làm mới để thử lại.");}
        if(!response.ok)throw Error(response.status===401||response.status===403?"Khóa Command Code chưa có quyền đọc hạn mức.":"Command Code chưa trả dữ liệu hạn mức. Bấm làm mới để thử lại.");
        const text=await response.text();if(text.length>2000000)throw Error("Phản hồi hạn mức quá lớn.");
        try{return JSON.parse(text);}catch{throw Error("Command Code trả dữ liệu hạn mức không hợp lệ.");}
      };
      const who=await get('/alpha/whoami?limits=1');
      const org=who?.org?.id;
      const credits=await get('/alpha/billing/credits'+(typeof org==='string'||typeof org==='number'?'?orgId='+encodeURIComponent(String(org)):''));
      const limits=credits?.windowLimits;
      if(!limits||typeof limits.limited!=='boolean')throw Error("Command Code chưa cung cấp phần trăm 5h/tuần cho tài khoản này.");
      const now=Date.now(),value:import('@pvta/shared').ProviderUsage={updatedAt:now,checkedAt:now};
      if(!limits.limited)value.unlimited=true;
      else for(const [field,out] of [['fiveHour','fiveHour'],['weekly','week']] as const){
        const w=limits[field];if(!w||typeof w.used!=='number'||!Number.isFinite(w.used)||w.used<0||typeof w.cap!=='number'||!Number.isFinite(w.cap)||w.cap<=0)continue;
        const reset=typeof w.resetAt==='number'?w.resetAt:Date.parse(w.resetAt);
        value[out]={usedPercent:Math.min(100,w.used/w.cap*100),resetsAt:Number.isFinite(reset)&&reset>0?reset:undefined,updatedAt:now};
      }
      if(!value.unlimited&&!value.fiveHour&&!value.week)throw Error("Command Code chưa cung cấp phần trăm 5h/tuần cho tài khoản này.");
      this.usageCache={key,value};return value;
    })();
    this.usageRead={key,promise};try{return await promise;}finally{if(this.usageRead?.promise===promise)this.usageRead=undefined;}
  }

  configured(provider: ApiProvider): boolean {
    const s = this.d.settings()?.[provider];
    return !!s && (!API_PROVIDERS[provider].needsKey || !!s.key) && (provider !== "compatible" || !!s.baseUrl);
  }

  /**
   * Lấy danh sách model của nhà cung cấp (GET /models). o.key / o.baseUrl là giá trị đang gõ, chưa lưu.
   * Khóa đã lưu chỉ được gửi tới đúng địa chỉ đã lưu (hoặc mặc định), không bao giờ tới địa chỉ lạ mới gõ.
   */
  async listModels(provider: ApiProvider, o: { key?: string; baseUrl?: string } = {}): Promise<ApiModelEntry[]> {
    const info = API_PROVIDERS[provider];
    const saved = this.d.settings()?.[provider];
    const savedBase = (saved?.baseUrl || info.baseUrl).replace(/\/+$/, "");
    const base = (o.baseUrl?.trim() || savedBase).replace(/\/+$/, "");
    const key = o.key?.trim() || (base.toLowerCase() === savedBase.toLowerCase() ? saved?.key : undefined);
    if (info.needsKey && !info.publicModels && !key) throw new Error(`Chưa có khóa API cho ${info.label}. Dán khóa vào ô Khóa API rồi bấm lại.`);
    if (provider === "compatible" && !o.baseUrl?.trim() && !saved?.baseUrl) throw new Error("Chưa có địa chỉ máy chủ. Dán địa chỉ (vd http://localhost:11434/v1) rồi bấm lại.");
    const doFetch = this.d.fetch ?? fetch;
    const headers: Record<string, string> = { accept: "application/json" };
    if (info.protocol === "anthropic") {
      headers["x-api-key"] = key!;
      headers["anthropic-version"] = "2023-06-01";
    } else if (key) headers.authorization = `Bearer ${key}`;

    const raw: ApiModelEntry[] = [];
    let after = "";
    for (let page = 0; page < 5; page++) {
      const url = info.protocol === "anthropic" ? `${base}/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}` : `${base}/models`;
      let res: Response;
      try {
        res = await doFetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        if ((e as Error).name === "TimeoutError") throw new Error(`${base} không trả lời trong 20 giây.`);
        throw new Error(`Không kết nối được ${base}: ${connectionFailure(e)}`);
      }
      if (!res.ok) {
        const m = (await errorText(res)).slice(0, 300);
        if ((res.status === 401 || res.status === 403) && !key) throw new Error(`${info.label} cần khóa để xem danh sách model. Dán khóa vào ô Khóa API rồi bấm lại.`);
        if (res.status === 401 || res.status === 403) throw new Error(`Khóa API không hợp lệ hoặc không có quyền xem danh sách model: ${m}`);
        if (res.status === 404) throw new Error(`Địa chỉ này không có danh sách model (${base}/models). Kiểm tra lại địa chỉ; bạn vẫn có thể gõ tên model bằng tay.`);
        if (res.status === 429) throw new Error(`Đã chạm hạn mức của API: ${m}`);
        throw new Error(`API báo lỗi (${res.status}): ${m}`);
      }
      let body: any;
      try {
        body = await res.json();
      } catch {
        throw new Error("Máy chủ trả về dữ liệu không đọc được (không phải JSON). Kiểm tra lại địa chỉ.");
      }
      const list: any[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : Array.isArray(body) ? body : [];
      for (const m of list) {
        const id = typeof m === "string" ? m : m?.id ?? m?.name;
        if (typeof id === "string") raw.push({ id, label: typeof m?.display_name === "string" ? m.display_name : undefined });
      }
      if (info.protocol === "anthropic" && body?.has_more && typeof body?.last_id === "string") after = body.last_id;
      else break;
    }
    const out = cleanModelList(provider, raw);
    if (out.length === 0) throw new Error("Máy chủ không trả về model nào dùng để trò chuyện được. Bạn vẫn có thể gõ tên model bằng tay.");
    return out;
  }

  async run(req: RunRequest): Promise<RunResult> {
    const parsed = splitApiModel(req.model);
    if (!parsed) throw new EngineError("model", `Mã model API phải có dạng <nhà cung cấp>/<model>, nhận được '${req.model}'.`);
    const info = API_PROVIDERS[parsed.provider];
    const s = this.d.settings()?.[parsed.provider];
    if (!this.configured(parsed.provider)) {
      throw new EngineError("missing", `Chưa nhập khóa API cho ${info.label}. Mở ⚙ Cài đặt → API để thêm.`);
    }
    const base = (s?.baseUrl || info.baseUrl).replace(/\/+$/, "");
    const prompt = req.buildPrompt(false, !!req.system);
    const sw = new Stopwatch();
    const signals: AbortSignal[] = req.timeoutMs === 0 ? [] : [AbortSignal.timeout(req.timeoutMs ?? 900_000)];
    if (req.signal) signals.push(req.signal);
    const signal = AbortSignal.any(signals);
    const doFetch = this.d.fetch ?? fetch;

    // Tham số tùy chọn: model không nhận thì bỏ đi, gửi lại một lần và nhớ cho các lần sau.
    const key = `${parsed.provider}/${parsed.model}`;
    const skip = this.unsupported.get(key) ?? new Set<string>();
    const notes: string[] = [];
    const wantTemp = req.temperature !== undefined;
    let res!: Response;
    for (let attempt = 0; attempt < 3; attempt++) {
      const useTemp = wantTemp && !skip.has("temperature") && !(parsed.provider === "openai" && /^(gpt-5|o\d)/i.test(parsed.model));
      const useEffort = !!req.effort && !skip.has("effort");
      try {
        if (info.protocol === "anthropic") {
          const body: Record<string, unknown> = { model: parsed.model, max_tokens: 8192, stream: true, messages: [{ role: "user", content: prompt }] };
          // Phần cố định ở system + đánh dấu cache: các lượt sau đọc lại từ cache, nhanh và rẻ hơn.
          if (req.system) body.system = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
          if (useTemp) body.temperature = req.temperature;
          if (useEffort) body.output_config = { effort: req.effort };
          res = await doFetch(`${base}/messages`, {
            method: "POST",
            signal,
            headers: { "content-type": "application/json", "x-api-key": s!.key!, "anthropic-version": "2023-06-01" },
            body: JSON.stringify(body),
          });
        } else {
          const messages = req.system ? [{ role: "system", content: req.system }, { role: "user", content: prompt }] : [{ role: "user", content: prompt }];
          const body: Record<string, unknown> = { model: parsed.model, stream: true, messages };
          if (useTemp) body.temperature = req.temperature;
          if (parsed.provider === "commandcode" && /^deepseek\/deepseek-(v4(?:[.-]|$)|flash$)/i.test(parsed.model) && useEffort) {body.thinking={type:"enabled"};body.reasoning_effort=req.effort;}
          if (parsed.provider === "openai" && useEffort) body.reasoning_effort = req.effort === "xhigh" || req.effort === "max" ? "high" : req.effort;
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (s?.key) headers.authorization = `Bearer ${s.key}`;
          res = await doFetch(`${base}/chat/completions`, { method: "POST", signal, headers, body: JSON.stringify(body) });
        }
      } catch (e) {
        if (req.signal?.aborted) throw new EngineError("other", "Đã hủy.");
        if ((e as Error).name === "TimeoutError") throw new EngineError("timeout", "API trả lời quá thời gian cho phép.");
        throw new EngineError("other", `Không kết nối được ${base}: ${connectionFailure(e)}`);
      }
      if (res.status !== 400 && res.status !== 422) break;
      const msg = await errorText(res);
      let dropped = false;
      if (useTemp && /temperature|top_p|sampling/i.test(msg)) (skip.add("temperature"), (dropped = true));
      else if (useEffort && /effort|output_config|reasoning/i.test(msg)) (skip.add("effort"), (dropped = true));
      if (!dropped) throw classifyHttp(res.status, msg);
      this.unsupported.set(key, skip);
    }
    if (wantTemp && (skip.has("temperature") || (parsed.provider === "openai" && /^(gpt-5|o\d)/i.test(parsed.model)))) {
      notes.push("Model này không nhận nhiệt độ: đã dùng mặc định của model (chế độ viết vẫn áp dụng qua chỉ dẫn).");
    }
    sw.mark("spawn");
    if (!res.ok || !res.body) throw classifyHttp(res.status, await errorText(res));

    let text = "";
    const emit = (t: string) => {
      if (!t) return;
      sw.mark("firstToken");
      text += t;
      req.onDelta?.(t);
    };
    try {
      for await (const data of sseEvents(res.body)) {
        if (data === "[DONE]") break;
        let ev: Record<string, any>;
        try {
          ev = JSON.parse(data) as Record<string, any>;
        } catch {
          continue;
        }
        if (ev.error) throw new EngineError("other", `API báo lỗi: ${ev.error.message ?? JSON.stringify(ev.error)}`);
        if (info.protocol === "anthropic") {
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") emit(String(ev.delta.text ?? ""));
        } else {
          const c = ev.choices?.[0]?.delta?.content;
          if (typeof c === "string") emit(c);
        }
      }
    } catch (e) {
      if (e instanceof EngineError) throw e;
      if (req.signal?.aborted) throw new EngineError("other", "Đã hủy.");
      if ((e as Error).name === "TimeoutError") throw new EngineError("timeout", "API trả lời quá thời gian cho phép.");
      throw new EngineError("other", `Mất kết nối khi đang nhận trả lời: ${(e as Error).message}`);
    }
    return {
      text,
      conversationId: undefined, // API không giữ phiên: lượt sau gửi lại bản đầy đủ
      fullPrompt: true,
      attempts: 1,
      timings: { spawnMs: sw.get("spawn"), firstTokenMs: sw.get("firstToken"), totalMs: sw.elapsed() },
      notes: notes.length ? notes : undefined,
    };
  }
}
