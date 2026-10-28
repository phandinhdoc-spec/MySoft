import fs from 'node:fs';
import path from 'node:path';
import { findModelInfo, modelsOf, type BackendId, type CliBackendId, type Effort, type ModelCatalog, type ModelChoice, type ProviderUsage } from '@pvta/shared';
import { maskPersonal } from '../learner.js';
import { findUnsafe } from '../skills.js';
import { atomicJson, uid } from './storage.js';

export const CHOICE_MODEL_SKILL_NAME = 'choice-model';

/** Danh sách 13 biến thể model của Antigravity (agy) và tên hiển thị chuẩn. */
export const AGY_MODEL_VARIANTS: ReadonlyArray<{
  slug: string;
  baseId: string;
  label: string;
  effort?: Effort;
  family: 'gemini-flash' | 'gemini-argon' | 'claude-sonnet' | 'claude-opus' | 'gpt-oss';
  quotaGroup: 'gemini' | '3p';
}> = [
  { slug: 'gemini-3.8-flash-low', baseId: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Low)', effort: 'low', family: 'gemini-flash', quotaGroup: 'gemini' },
  { slug: 'gemini-3.8-flash-medium', baseId: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Medium)', effort: 'medium', family: 'gemini-flash', quotaGroup: 'gemini' },
  { slug: 'gemini-3.8-flash-high', baseId: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (High)', effort: 'high', family: 'gemini-flash', quotaGroup: 'gemini' },
  { slug: 'gemini-4-argon-low', baseId: 'gemini-4-argon', label: 'Gemini 4 Argon (Low)', effort: 'low', family: 'gemini-argon', quotaGroup: 'gemini' },
  { slug: 'gemini-4-argon-medium', baseId: 'gemini-4-argon', label: 'Gemini 4 Argon (Medium)', effort: 'medium', family: 'gemini-argon', quotaGroup: 'gemini' },
  { slug: 'gemini-4-argon-high', baseId: 'gemini-4-argon', label: 'Gemini 4 Argon (High)', effort: 'high', family: 'gemini-argon', quotaGroup: 'gemini' },
  { slug: 'claude-sonnet-5-5-low', baseId: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Low)', effort: 'low', family: 'claude-sonnet', quotaGroup: '3p' },
  { slug: 'claude-sonnet-5-5-medium', baseId: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Medium)', effort: 'medium', family: 'claude-sonnet', quotaGroup: '3p' },
  { slug: 'claude-sonnet-5-5-high', baseId: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (High)', effort: 'high', family: 'claude-sonnet', quotaGroup: '3p' },
  { slug: 'claude-opus-5-5-low', baseId: 'claude-opus-5-5', label: 'Claude Opus 5.5 (Low)', effort: 'low', family: 'claude-opus', quotaGroup: '3p' },
  { slug: 'claude-opus-5-5-medium', baseId: 'claude-opus-5-5', label: 'Claude Opus 5.5 (Medium)', effort: 'medium', family: 'claude-opus', quotaGroup: '3p' },
  { slug: 'claude-opus-5-5-high', baseId: 'claude-opus-5-5', label: 'Claude Opus 5.5 (High)', effort: 'high', family: 'claude-opus', quotaGroup: '3p' },
  { slug: 'gpt-oss-120b-medium', baseId: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)', effort: 'medium', family: 'gpt-oss', quotaGroup: '3p' },
] as const;

export type TaskKind =
  | 'background'
  | 'simple'
  | 'standard'
  | 'office'
  | 'coding'
  | 'workflow'
  | 'planning'
  | 'pro'
  | 'exam';

export const TASK_KINDS: readonly TaskKind[] = [
  'background',
  'simple',
  'standard',
  'office',
  'coding',
  'workflow',
  'planning',
  'pro',
  'exam',
] as const;

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  background: 'Tác vụ nền (tóm tắt, đặt tên, gợi ý, chuẩn hóa nhanh)',
  simple: 'Việc đơn giản, hỏi đáp ngắn, tra cứu hoặc dịch nhanh',
  standard: 'Trao đổi, giải thích và soạn thảo văn bản thông thường',
  office: 'Soạn thảo và xử lý tài liệu Word, Excel, PowerPoint, PDF',
  coding: 'Lập trình, sửa mã nguồn, công thức LaTeX hoặc dàn trang Typst',
  workflow: 'Thiết kế và vận hành quy trình tự động nhiều bước',
  planning: 'Lập kế hoạch công việc nhiều bước (Plan)',
  pro: 'Suy luận chuyên sâu, bài toán khó hoặc kế hoạch kiểm định (Plan Pro)',
  exam: 'Xây dựng ma trận, đặc tả, ra đề và kiểm định đề kiểm tra',
};

/** Bảng điều phối mặc định theo loại việc khi chưa có ghi đè từ người dùng. */
export const DEFAULT_TASK_ROUTING: Record<TaskKind, string> = {
  background: 'gemini-3.8-flash-low',
  simple: 'gemini-3.8-flash-low',
  standard: 'gemini-4-argon-medium',
  office: 'gemini-4-argon-medium',
  coding: 'claude-sonnet-5-5-medium',
  workflow: 'claude-sonnet-5-5-medium',
  planning: 'gemini-4-argon-high',
  pro: 'claude-opus-5-5-high',
  exam: 'claude-opus-5-5-high',
};

export interface TaskClassificationInput {
  text?: string;
  metaKind?: string;
  light?: boolean;
  planMode?: boolean;
  planningMode?: 'chat' | 'plan' | 'pro';
  proStep?: boolean;
  workflow?: boolean;
  attachmentCount?: number;
  attachmentNames?: string[];
}

export interface TaskClassification {
  kind: TaskKind;
  complexity: 'low' | 'medium' | 'high';
  signals: string[];
  /** Lệnh làm ngay: ưu tiên mô hình sinh token nhanh, độ trễ thấp, không cần suy luận sâu. */
  immediate?: boolean;
  /** Gợi ý chuyển sang Plan hoặc Plan Pro khi tác vụ cần nhiều công đoạn. */
  suggestedPlanningMode?: 'plan' | 'pro';
  suggestedPlanningReason?: string;
}

const MULTI_STAGE_RE =
  /(?:^|\n)\s*(?:1[.)]|bước\s*1|giai\s*đoạn\s*1|phần\s*1)\b[\s\S]{8,}(?:\n\s*(?:2[.)]|bước\s*2|giai\s*đoạn\s*2|phần\s*2)\b)[\s\S]{8,}(?:\n\s*(?:3[.)]|bước\s*3|giai\s*đoạn\s*3|phần\s*3)\b)|\b(trước tiên|đầu tiên)\b[\s\S]{10,}\b(sau đó|tiếp theo)\b[\s\S]{10,}\b(cuối cùng|hoàn thiện|tổng hợp)\b|\b(nhiều công đoạn|chia thành các bước|quy trình nhiều bước|trọn bộ hồ sơ|lập kế hoạch chi tiết)\b/i;

const IMMEDIATE_COMMAND_RE =
  /^(?:hãy\s+|làm ơn\s+|giúp\s+(?:tôi|mình|thầy|cô)\s+)?(?:làm ngay|sửa nhanh|viết nhanh|dịch nhanh|tóm tắt nhanh|in đậm|in nghiêng|gạch chân|căn lề|căn giữa|căn đều|đổi phông|đổi font|đổi cỡ chữ|sửa lỗi chính tả|viết lại câu|rút gọn câu|thêm dòng|xóa dòng|thêm cột|xóa cột|đổi tên|đổi màu|định dạng nhanh|chèn công thức|tính nhanh|tra cứu nhanh|trả lời ngắn)\b/i;

/**
 * Gợi ý chuyển sang chế độ `Plan` hoặc `Plan Pro` cho các tác vụ nhiều công đoạn,
 * kết hợp phân tích yêu cầu, lịch sử tự học của PVTA và nhận xét từ AI.
 */
export function suggestPlanningMode(
  input: TaskClassificationInput & {
    learnedRules?: readonly string[];
    insights?: readonly LearnedModelInsight[];
    switches?: readonly ModelSwitchRecord[];
  },
): { mode: 'plan' | 'pro'; reason: string } | undefined {
  if (input.light || input.planMode || input.planningMode === 'plan' || input.planningMode === 'pro' || input.proStep || input.workflow) {
    return undefined;
  }
  const text = (input.text ?? '').trim();
  if (!text || text.length < 40) return undefined;
  const lower = text.toLocaleLowerCase('vi');
  const attCount = input.attachmentCount ?? input.attachmentNames?.length ?? 0;

  if (IMMEDIATE_COMMAND_RE.test(lower) && text.length <= 280 && !MULTI_STAGE_RE.test(lower)) {
    return undefined;
  }

  // 1. Tác vụ đề thi / ma trận / đặc tả hoặc kiểm định nhiều tầng -> gợi ý Plan Pro
  if (/\[pvta:exam:plan-pro\]|ma trận.*đặc tả|đặc tả.*đề kiểm tra|ma trận.*đề thi|kiểm định đề|ra đề.*đáp án.*thang điểm/i.test(lower)) {
    return {
      mode: 'pro',
      reason: 'Tác vụ xây dựng ma trận, đặc tả và đề kiểm tra nhiều công đoạn cần kiểm định chéo — nên chuyển sang ◇ Plan Pro.',
    };
  }

  if (
    (/kiểm định|đối chiếu chéo|phản biện nhiều vòng|kiến trúc hệ thống|tối ưu toàn diện|rà soát toàn bộ dự án/i.test(lower) &&
      (text.length > 260 || attCount >= 2)) ||
    (MULTI_STAGE_RE.test(lower) && (text.length > 700 || attCount >= 2))
  ) {
    return {
      mode: 'pro',
      reason: 'Tác vụ phức tạp gồm nhiều công đoạn và cần kiểm tra chất lượng từng bước — gợi ý chuyển sang ◇ Plan Pro.',
    };
  }

  // 2. Kết hợp chế độ tự học của PVTA (bài học đã lưu + nhận xét trong choice-model + lịch sử chọn Plan)
  const learnedText = [...(input.learnedRules ?? []), ...(input.insights ?? []).map((i) => i.note)].join('\n').toLocaleLowerCase('vi');
  if (learnedText) {
    if (/plan\s*pro/i.test(learnedText) && text.length > 220 && /giáo án|khbd|đề|báo cáo|dự án|refactor|kiểm thử/i.test(lower)) {
      return {
        mode: 'pro',
        reason: 'Theo kinh nghiệm tự học của PVTA: tác vụ này nhiều công đoạn và đạt kết quả tốt nhất khi dùng ◇ Plan Pro.',
      };
    }
    if (/\bplan\b|lập kế hoạch/i.test(learnedText) && text.length > 200 && /giáo án|khbd|báo cáo|slide|quy trình|refactor/i.test(lower)) {
      return {
        mode: 'plan',
        reason: 'Theo kinh nghiệm tự học của PVTA: tác vụ có nhiều bước — gợi ý chuyển sang ◇ Plan để duyệt từng công đoạn.',
      };
    }
  }

  // 3. Phát hiện danh sách nhiều công đoạn / nhiều đầu ra liên tiếp
  const bulletCount = (text.match(/(?:^|\n)\s*(?:\d+[.)]|[-*•])\s+\S+/g) ?? []).length;
  if (MULTI_STAGE_RE.test(lower) || bulletCount >= 3 || (text.length > 450 && attCount >= 2)) {
    return {
      mode: 'plan',
      reason: 'Yêu cầu gồm nhiều công đoạn liên tiếp — gợi ý chuyển sang ◇ Plan để PVTA lập kế hoạch và thực hiện chắc chắn từng bước.',
    };
  }

  return undefined;
}

/** Phát hiện nhận xét/gợi ý chuyển sang Plan hoặc Plan Pro từ phản hồi của AI. */
export function extractAiPlanningSuggestion(text: string): { mode: 'plan' | 'pro'; reason: string } | undefined {
  if (!text) return undefined;
  const tagMatch = /\[\[\s*GOI_Y_(PLAN_PRO|PLAN)\s*(?::\s*([^\]]+))?\]\]/i.exec(text);
  if (tagMatch) {
    const isPro = tagMatch[1]!.toUpperCase() === 'PLAN_PRO';
    return {
      mode: isPro ? 'pro' : 'plan',
      reason: tagMatch[2]?.trim() || (isPro ? 'AI nhận xét tác vụ này cần lập kế hoạch và kiểm định bằng ◇ Plan Pro.' : 'AI nhận xét tác vụ này có nhiều công đoạn, nên chuyển sang ◇ Plan.'),
    };
  }
  if (
    /(?:gợi ý|khuyên|nên)\s+(?:thầy cô\s+|bạn\s+)?chuyển\s+sang\s+(?:chế độ\s+)?(?:◇\s*)?plan\s*pro\b/i.test(text)
  ) {
    return {
      mode: 'pro',
      reason: 'AI nhận xét tác vụ này gồm nhiều công đoạn cần kiểm định — gợi ý chuyển sang ◇ Plan Pro.',
    };
  }
  if (/(?:gợi ý|khuyên|nên)\s+(?:thầy cô\s+|bạn\s+)?chuyển\s+sang\s+(?:chế độ\s+)?(?:◇\s*)?plan\b/i.test(text)) {
    return {
      mode: 'plan',
      reason: 'AI nhận xét tác vụ này gồm nhiều công đoạn — gợi ý chuyển sang ◇ Plan.',
    };
  }
  return undefined;
}

/** Phân loại yêu cầu tất định (không cần gọi AI) để chọn model nhanh và ghi nhận ngữ cảnh khi người dùng đổi model. */
export function classifyTask(input: TaskClassificationInput): TaskClassification {
  const text = (input.text ?? '').trim();
  const lower = text.toLocaleLowerCase('vi');
  const len = text.length;
  const attCount = input.attachmentCount ?? input.attachmentNames?.length ?? 0;
  const signals: string[] = [];

  if (
    input.light ||
    (input.metaKind && ['title', 'summary', 'feedback-extraction', 'self-advice', 'skill-discovery', 'beautifyMarkdown'].includes(input.metaKind))
  ) {
    return { kind: 'background', complexity: 'low', signals: ['background', 'immediate'], immediate: true };
  }

  if (input.planningMode === 'pro' || input.proStep) {
    signals.push('plan-pro');
    return { kind: 'pro', complexity: 'high', signals };
  }

  const planSuggestion = suggestPlanningMode(input);
  const attachSuggestion = (res: TaskClassification): TaskClassification => {
    if (planSuggestion && !res.immediate) {
      res.suggestedPlanningMode = planSuggestion.mode;
      res.suggestedPlanningReason = planSuggestion.reason;
      if (!res.signals.includes('suggest-plan')) res.signals.push('suggest-plan');
    }
    return res;
  };

  // Lệnh làm ngay rõ ràng (in đậm, sửa nhanh, dịch nhanh, căn giữa...): chọn model sinh token nhanh, ít suy luận
  if (IMMEDIATE_COMMAND_RE.test(lower) && len <= 280 && !MULTI_STAGE_RE.test(lower)) {
    signals.push('immediate');
    return { kind: 'simple', complexity: 'low', signals, immediate: true };
  }

  if (/\[pvta:exam:plan-pro\]|ma trận|đặc tả|đề kiểm tra|đề thi|trộn đề|kiểm định đề|thang điểm|đáp án chi tiết/i.test(lower)) {
    signals.push('exam');
    return attachSuggestion({ kind: 'exam', complexity: len > 600 || attCount > 0 ? 'high' : 'medium', signals });
  }

  if (input.planMode || input.planningMode === 'plan') {
    signals.push('plan');
    return { kind: 'planning', complexity: len > 500 || attCount > 1 ? 'high' : 'medium', signals };
  }

  if (input.workflow || /!bien\b|!gan\b|!ham\b|!goi\b|!dau-vao\b|!dau-ra\b|!lap-lai\b|quy trình tự động/i.test(lower)) {
    signals.push('workflow');
    return attachSuggestion({ kind: 'workflow', complexity: len > 600 ? 'high' : 'medium', signals });
  }

  if (
    /```|\b(typescript|javascript|python|rust|golang|java|c\+\+|html|css|sql|typst|latex|debug|refactor|stack trace|lỗi mã|viết hàm|thuật toán|regex)\b|\.(ts|tsx|js|jsx|py|rs|typ|sh|json|yaml)\b/i.test(
      lower,
    )
  ) {
    signals.push('coding');
    const isQuickCode = len < 80 && attCount === 0 && !/debug|refactor|chi tiết|kiểm thử|tối ưu|thuật toán/i.test(lower);
    if (isQuickCode) signals.push('immediate');
    const complexity = isQuickCode ? 'low' : len > 900 || attCount > 1 ? 'high' : 'medium';
    return attachSuggestion({ kind: 'coding', complexity, signals, ...(isQuickCode ? { immediate: true } : {}) });
  }

  const hasOfficeFiles = (input.attachmentNames ?? []).some((n) => /\.(docx|xlsx|pptx|pdf)$/i.test(n));
  if (
    hasOfficeFiles ||
    attCount > 0 ||
    /\.(docx|xlsx|pptx|pdf)\b|\b(word|excel|powerpoint|slide|bảng tính|giáo án|kế hoạch bài dạy|khbd|công văn|tờ trình|báo cáo|biên bản|nhận xét học bạ)\b/i.test(
      lower,
    )
  ) {
    signals.push('office');
    const isQuickOffice =
      len < 70 && attCount === 0 && !/giáo án|kế hoạch bài dạy|khbd|chi tiết|đầy đủ|5512|báo cáo|tờ trình/i.test(lower);
    if (isQuickOffice) signals.push('immediate');
    const complexity = len > 1200 || attCount > 2 ? 'high' : isQuickOffice ? 'low' : 'medium';
    return attachSuggestion({ kind: 'office', complexity, signals, ...(isQuickOffice ? { immediate: true } : {}) });
  }

  if (
    /suy luận|phân tích chuyên sâu|chứng minh|tối ưu hóa|so sánh chi tiết|phản biện|kiến trúc|đa chiều|phức tạp|bài toán khó|nghiên cứu sâu/i.test(
      lower,
    ) ||
    len > 1800
  ) {
    signals.push('deep-reasoning');
    return attachSuggestion({ kind: 'pro', complexity: 'high', signals });
  }

  if (len <= 220 && attCount === 0 && !/\n.*\n/.test(text) && !/phân tích|tổng hợp|lập bảng|so sánh|chi tiết/i.test(lower)) {
    signals.push('short');
    const immediate = len <= 120;
    if (immediate) signals.push('immediate');
    return { kind: 'simple', complexity: len <= 100 ? 'low' : 'medium', signals, ...(immediate ? { immediate: true } : {}) };
  }

  signals.push('standard');
  return attachSuggestion({ kind: 'standard', complexity: len < 260 ? 'low' : len > 1200 ? 'high' : 'medium', signals });
}

/** Chuẩn hóa mã model + mức suy nghĩ về đúng biến thể cụ thể (vd gemini-4-argon + high -> gemini-4-argon-high). */
export function resolveChoiceVariant(
  choice: ModelChoice,
  effort?: Effort | null,
  light = false,
  catalog?: ModelCatalog,
): { choice: ModelChoice; effort?: Effort } {
  if (choice.backend === 'api') return { choice, effort: effort ?? undefined };
  const models = modelsOf(catalog, choice.backend);
  const hit = findModelInfo(models, choice.model);
  const info = hit?.info;
  if (info?.variants) {
    const levels = Object.keys(info.variants) as Effort[];
    const level = light
      ? levels.includes('low')
        ? 'low'
        : levels[0]!
      : effort && levels.includes(effort)
        ? effort
        : hit?.effort && levels.includes(hit.effort)
          ? hit.effort
          : info.defaultEffort ?? levels[0]!;
    const variantSlug = info.variants[level] ?? choice.model;
    return { choice: { ...choice, model: variantSlug }, effort: level };
  }
  return { choice, effort: hit?.effort ?? (effort ?? undefined) };
}

/** Nhãn hiển thị đầy đủ của model kèm mức suy nghĩ (vd "Gemini 3.8 Flash (Low)", "Claude Opus 5.5 (High)"). */
export function formatModelChoiceLabel(choice: ModelChoice, effort?: Effort | null, catalog?: ModelCatalog): string {
  if (choice.backend === 'agy') {
    const exact = AGY_MODEL_VARIANTS.find((v) => v.slug === choice.model);
    if (exact && (!effort || effort === exact.effort)) return exact.label;
    const byBase = AGY_MODEL_VARIANTS.find((v) => v.baseId === choice.model && v.effort === (effort ?? 'medium'));
    if (byBase) return byBase.label;
  }
  if (choice.backend !== 'api') {
    const hit = findModelInfo(modelsOf(catalog, choice.backend), choice.model);
    if (hit?.info) {
      const eff = effort ?? hit.effort ?? hit.info.defaultEffort;
      if (hit.info.variants && eff) {
        const cap = eff === 'low' ? 'Low' : eff === 'medium' ? 'Medium' : eff === 'high' ? 'High' : eff;
        return /\((low|medium|high)\)\s*$/i.test(hit.info.label) ? hit.info.label : `${hit.info.label} (${cap})`;
      }
      return hit.info.label;
    }
  }
  return choice.model;
}

export interface ModelSwitchRecord {
  id: string;
  at: number;
  scope: 'chat' | 'default';
  chatId?: string;
  fromModel?: string;
  backend: BackendId;
  /** Mã model cụ thể đã chọn (vd gemini-3.8-flash-low, claude-opus-5-5-high). */
  model: string;
  effort?: Effort | null;
  taskKind: TaskKind;
  promptSample?: string;
  promptLength?: number;
  attachmentCount?: number;
  learned?: boolean;
}

export interface LearnedModelInsight {
  at: number;
  note: string;
  taskKind?: TaskKind;
  model?: string;
}

interface ModelChoiceFileData {
  version: 1;
  switches: ModelSwitchRecord[];
  routingOverrides: Partial<Record<TaskKind, string>>;
  insights: LearnedModelInsight[];
}

const MAX_SWITCHES = 200;
const MAX_INSIGHTS = 25;

/** Chuẩn hóa lựa chọn model thành chuỗi định tuyến (`<model>` cho agy để tương thích ngược, hoặc `<backend>:<model>` cho codex/claude/opencode/api). */
export function formatRoutingSpec(choice: ModelChoice): string {
  return choice.backend === 'agy' ? choice.model : `${choice.backend}:${choice.model}`;
}

/** Giải mã chuỗi định tuyến thành `ModelChoice`. */
export function parseRoutingSpec(spec: string): ModelChoice | undefined {
  const clean = spec.trim();
  if (!clean) return undefined;
  const m = /^(agy|claude|codex|opencode|api):(.+)$/i.exec(clean);
  if (m) {
    const backend = m[1]!.toLowerCase() as BackendId;
    const model = m[2]!.trim();
    if (model) return { backend, model };
  }
  if (/^[a-z0-9][\w.:/@+-]{0,99}$/i.test(clean)) {
    return { backend: 'agy', model: clean };
  }
  return undefined;
}

/** Nhận diện lỗi chạm hạn mức (quota / rate limit / 429 / quá tải) từ nhà cung cấp AI. */
export function isProviderLimitError(message: string): boolean {
  return /\b429\b|rate.?limit|quota|too many requests|quá nhiều yêu cầu|vượt hạn mức|hết hạn mức|chạm hạn mức|exhausted|overloaded|capacity|credit balance|insufficient_quota|billing|limit exceeded|try again in/i.test(
    message,
  );
}

/** Quản lý lịch sử người dùng đổi model (tất định, không cần AI), trạng thái chạm limit của từng provider/model và đồng bộ với skill `choice-model`. */
export class ModelChoiceTracker {
  private file: string;
  private data: ModelChoiceFileData;
  private cooldowns = new Map<string, number>();

  constructor(home: string) {
    this.file = path.join(home, 'chatbox', 'model-choices.json');
    this.data = this.read();
  }

  private read(): ModelChoiceFileData {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<ModelChoiceFileData>;
      return {
        version: 1,
        switches: Array.isArray(raw.switches) ? raw.switches.slice(-MAX_SWITCHES) : [],
        routingOverrides: raw.routingOverrides && typeof raw.routingOverrides === 'object' ? raw.routingOverrides : {},
        insights: Array.isArray(raw.insights) ? raw.insights.slice(-MAX_INSIGHTS) : [],
      };
    } catch {
      return { version: 1, switches: [], routingOverrides: {}, insights: [] };
    }
  }

  private save(): void {
    atomicJson(this.file, this.data);
  }

  switches(): readonly ModelSwitchRecord[] {
    return this.data.switches;
  }

  insights(): readonly LearnedModelInsight[] {
    return this.data.insights;
  }

  /** Ghi lại một lần người dùng chủ động đổi model hoặc mức suy nghĩ (không cần AI). */
  recordSwitch(input: {
    scope: 'chat' | 'default';
    chatId?: string;
    previous?: ModelChoice | 'auto';
    previousEffort?: Effort | null;
    choice: ModelChoice;
    effort?: Effort | null;
    catalog?: ModelCatalog;
    context?: TaskClassificationInput;
    now?: number;
  }): ModelSwitchRecord {
    const resolved = resolveChoiceVariant(input.choice, input.effort, false, input.catalog);
    const prevResolved =
      input.previous && input.previous !== 'auto'
        ? resolveChoiceVariant(input.previous, input.previousEffort, false, input.catalog).choice.model
        : input.previous === 'auto'
          ? 'auto'
          : undefined;
    const classified = classifyTask(input.context ?? {});
    const sample = input.context?.text ? maskPersonal(input.context.text).replace(/\s+/g, ' ').trim().slice(0, 120) : undefined;
    const rec: ModelSwitchRecord = {
      id: uid(),
      at: input.now ?? Date.now(),
      scope: input.scope,
      ...(input.chatId ? { chatId: input.chatId } : {}),
      ...(prevResolved ? { fromModel: prevResolved } : {}),
      backend: resolved.choice.backend,
      model: resolved.choice.model,
      effort: resolved.effort ?? input.effort ?? null,
      taskKind: classified.kind,
      ...(sample ? { promptSample: sample, promptLength: input.context!.text!.length } : {}),
      ...(input.context?.attachmentCount !== undefined ? { attachmentCount: input.context.attachmentCount } : {}),
      learned: false,
    };
    this.data.switches = [...this.data.switches, rec].slice(-MAX_SWITCHES);
    if (rec.taskKind !== 'background') {
      const preferred = this.computePreferredModelSpec(rec.taskKind);
      if (preferred) this.data.routingOverrides[rec.taskKind] = preferred;
    }
    this.save();
    return rec;
  }

  /**
   * Khi người dùng đổi model ở đầu cuộc hội thoại trống rồi mới gửi tin nhắn,
   * gắn loại việc thực tế của tin nhắn đó vào bản ghi đổi model gần nhất.
   */
  bindPrompt(chatId: string, context: TaskClassificationInput, now = Date.now()): boolean {
    const classified = classifyTask(context);
    for (let i = this.data.switches.length - 1; i >= 0; i--) {
      const s = this.data.switches[i]!;
      if (s.chatId !== chatId || now - s.at > 30 * 60_000) continue;
      if (!s.promptSample && context.text?.trim()) {
        s.taskKind = classified.kind;
        s.promptSample = maskPersonal(context.text).replace(/\s+/g, ' ').trim().slice(0, 120);
        s.promptLength = context.text.trim().length;
        if (context.attachmentCount !== undefined) s.attachmentCount = context.attachmentCount;
        if (s.taskKind !== 'background') {
          const preferred = this.computePreferredModelSpec(s.taskKind);
          if (preferred) this.data.routingOverrides[s.taskKind] = preferred;
        }
        this.save();
        return true;
      }
      break;
    }
    return false;
  }

  /** Ghi nhận một model/provider vừa bị lỗi hạn mức (rate limit / quota) để tạm tránh điều phối vào đó. */
  recordLimitError(choice: ModelChoice, errorText = '', now = Date.now(), cooldownMs = 10 * 60_000): void {
    const until = now + Math.max(10_000, cooldownMs);
    this.cooldowns.set(`${choice.backend}:${choice.model}`, until);
    if (choice.backend === 'agy') {
      const meta = AGY_MODEL_VARIANTS.find((v) => v.slug === choice.model || v.baseId === choice.model);
      if (meta && (isProviderLimitError(errorText) || !errorText)) {
        this.cooldowns.set(`agy:group:${meta.quotaGroup}`, until);
      }
    } else if (isProviderLimitError(errorText) || !errorText) {
      this.cooldowns.set(`${choice.backend}:*`, until);
    }
  }

  /** Xóa các trạng thái tạm khóa hạn mức (dùng khi làm mới hoặc kiểm thử). */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  /** Kiểm tra xem một model hoặc nhóm hạn mức của nó có đang trong thời gian chờ hồi phục limit không. */
  isInCooldown(choice: ModelChoice, now = Date.now()): boolean {
    const checkKey = (key: string) => {
      const until = this.cooldowns.get(key);
      if (!until) return false;
      if (now >= until) {
        this.cooldowns.delete(key);
        return false;
      }
      return true;
    };
    if (checkKey(`${choice.backend}:${choice.model}`) || checkKey(`${choice.backend}:*`)) return true;
    if (choice.backend === 'agy') {
      const meta = AGY_MODEL_VARIANTS.find((v) => v.slug === choice.model || v.baseId === choice.model);
      if (meta && checkKey(`agy:group:${meta.quotaGroup}`)) return true;
    }
    return false;
  }

  /** Kiểm tra xem loại việc này đã có lựa chọn riêng từ lịch sử người dùng hoặc bài học chưa. */
  hasOverride(kind: TaskKind): boolean {
    return Boolean(this.data.routingOverrides[kind] || this.computePreferredModelSpec(kind));
  }

  /** Tính model (trên mọi provider agy, codex, claude, opencode, api) được người dùng ưu tiên cho một loại việc. */
  computePreferredModelSpec(kind: TaskKind): string | undefined {
    const relevant = this.data.switches.filter((s) => s.taskKind === kind);
    if (!relevant.length) return undefined;
    const scores = new Map<string, number>();
    relevant.forEach((s, idx) => {
      const recencyWeight = 1 + idx / Math.max(1, relevant.length);
      const spec = formatRoutingSpec({ backend: s.backend, model: s.model });
      scores.set(spec, (scores.get(spec) ?? 0) + recencyWeight);
    });
    return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  /** Tính model agy được người dùng ưu tiên cho một loại việc dựa trên lịch sử đổi model (tương thích ngược). */
  computePreferredAgyModel(kind: TaskKind): string | undefined {
    const relevant = this.data.switches.filter((s) => s.backend === 'agy' && s.taskKind === kind);
    if (!relevant.length) return undefined;
    const scores = new Map<string, number>();
    relevant.forEach((s, idx) => {
      const recencyWeight = 1 + idx / Math.max(1, relevant.length);
      scores.set(s.model, (scores.get(s.model) ?? 0) + recencyWeight);
    });
    return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  /** Ghi nhận bài học/quy tắc chọn model từ cơ chế tự học (hội thoại + lịch sử chọn model). */
  applyLearnedRouting(input: {
    routing?: Partial<Record<TaskKind, string>>;
    note?: string;
    now?: number;
  }): boolean {
    let changed = false;
    const now = input.now ?? Date.now();
    if (input.routing && typeof input.routing === 'object') {
      for (const kind of TASK_KINDS) {
        const rawSpec = input.routing[kind]?.trim();
        const parsed = rawSpec ? parseRoutingSpec(rawSpec) : undefined;
        if (parsed && (parsed.backend !== 'agy' || AGY_MODEL_VARIANTS.some((v) => v.slug === parsed.model) || /^[a-z0-9][\w.:/@+-]+$/i.test(parsed.model))) {
          const normalized = formatRoutingSpec(parsed);
          if (this.data.routingOverrides[kind] !== normalized) {
            this.data.routingOverrides[kind] = normalized;
            changed = true;
          }
        }
      }
    }
    if (input.note && typeof input.note === 'string') {
      const clean = maskPersonal(input.note).replace(/\s+/g, ' ').trim().slice(0, 220);
      if (clean && !findUnsafe(clean) && !this.data.insights.some((x) => x.note === clean)) {
        this.data.insights = [...this.data.insights, { at: now, note: clean }].slice(-MAX_INSIGHTS);
        changed = true;
      }
    }
    for (const s of this.data.switches) s.learned = true;
    this.save();
    return changed;
  }

  /** Bảng định tuyến hiệu lực (kết hợp mặc định + lịch sử người dùng chọn + tệp skill `choice-model`). */
  effectiveRouting(skillsDir?: string): Record<TaskKind, string> {
    const out: Record<TaskKind, string> = { ...DEFAULT_TASK_ROUTING };
    if (skillsDir) {
      const fromSkill = readRoutingFromSkill(skillsDir);
      for (const [k, v] of Object.entries(fromSkill)) {
        if (v) out[k as TaskKind] = v;
      }
    }
    for (const kind of TASK_KINDS) {
      const byHistory = this.computePreferredModelSpec(kind);
      if (byHistory) out[kind] = byHistory;
      const override = this.data.routingOverrides[kind];
      if (override) out[kind] = override;
    }
    return out;
  }

  /** Tóm tắt gọn lịch sử người dùng đổi model (mọi provider) để đưa vào lời nhắc của cơ chế tự học. */
  summaryForLearning(limit = 12): Array<{
    taskKind: TaskKind;
    backend?: BackendId;
    model: string;
    fromModel?: string;
    promptSample?: string;
    promptLength?: number;
    attachmentCount?: number;
  }> {
    return this.data.switches
      .slice(-limit)
      .map((s) => ({
        taskKind: s.taskKind,
        ...(s.backend !== 'agy' ? { backend: s.backend } : {}),
        model: s.backend === 'agy' ? s.model : `${s.backend}:${s.model}`,
        ...(s.fromModel ? { fromModel: s.fromModel } : {}),
        ...(s.promptSample ? { promptSample: s.promptSample } : {}),
        ...(s.promptLength !== undefined ? { promptLength: s.promptLength } : {}),
        ...(s.attachmentCount !== undefined ? { attachmentCount: s.attachmentCount } : {}),
      }));
  }

  /** Đồng bộ nội dung skill `choice-model` trên đĩa từ lịch sử đổi model và các bài học đã rút ra. */
  syncSkill(skillsDir: string, now = Date.now()): string {
    const dir = path.join(skillsDir, CHOICE_MODEL_SKILL_NAME);
    const file = path.join(dir, 'SKILL.md');
    let existingLoad: string | undefined;
    if (fs.existsSync(file)) {
      try {
        const m = /^load:\s*(always|demand|manual|off)\s*$/im.exec(fs.readFileSync(file, 'utf8'));
        existingLoad = m?.[1]?.toLowerCase();
      } catch {}
    }
    const routing = this.effectiveRouting(skillsDir);
    let md = buildChoiceModelSkillMd({
      routing,
      switches: this.data.switches,
      insights: this.data.insights,
    });
    if (existingLoad && existingLoad !== 'demand') {
      md = md.replace(/^load:\s*demand$/m, `load: ${existingLoad}`);
    }
    if (fs.existsSync(file)) {
      const prev = fs.readFileSync(file, 'utf8');
      if (prev.trim() === md.trim()) return md;
      const backupDir = path.join(skillsDir, '.backup', `${CHOICE_MODEL_SKILL_NAME}-${now}`);
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, 'SKILL.md'), prev);
      const backups = fs
        .readdirSync(path.join(skillsDir, '.backup'))
        .filter((n) => n.startsWith(`${CHOICE_MODEL_SKILL_NAME}-`))
        .sort();
      for (const old of backups.slice(0, Math.max(0, backups.length - 3))) {
        fs.rmSync(path.join(skillsDir, '.backup', old), { recursive: true, force: true });
      }
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, md, { mode: 0o600 });
    return md;
  }
}

/** Đọc bảng ánh xạ `- \`<taskKind>\`: <model-slug>` từ `<skillsDir>/choice-model/SKILL.md`. */
export function readRoutingFromSkill(skillsDir: string): Partial<Record<TaskKind, string>> {
  const file = path.join(skillsDir, CHOICE_MODEL_SKILL_NAME, 'SKILL.md');
  if (!fs.existsSync(file)) return {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (/^load:\s*off\s*$/im.test(text)) return {};
    return parseRoutingFromSkillText(text);
  } catch {
    return {};
  }
}

export function parseRoutingFromSkillText(text: string): Partial<Record<TaskKind, string>> {
  const out: Partial<Record<TaskKind, string>> = {};
  const re =
    /^\s*[-*]\s*`?(background|simple|standard|office|coding|workflow|planning|pro|exam)`?\s*:\s*`?((?:(?:agy|claude|codex|opencode|api):)?[a-z0-9][\w.:/@+-]*)`?/gim;
  for (const m of text.matchAll(re)) {
    const kind = m[1]!.toLowerCase() as TaskKind;
    const raw = m[2]!.trim();
    const parsed = parseRoutingSpec(raw);
    if (!parsed) continue;
    if (parsed.backend === 'agy') {
      const slug = parsed.model.toLowerCase();
      if (AGY_MODEL_VARIANTS.some((v) => v.slug === slug)) out[kind] = slug;
    } else {
      out[kind] = formatRoutingSpec(parsed);
    }
  }
  return out;
}

/** Dựng nội dung chuẩn của `choice-model/SKILL.md` theo đúng khuôn 7 mục của PVTA. */
export function buildChoiceModelSkillMd(input: {
  routing?: Partial<Record<TaskKind, string>>;
  switches?: readonly ModelSwitchRecord[];
  insights?: readonly LearnedModelInsight[];
} = {}): string {
  const routing: Record<TaskKind, string> = { ...DEFAULT_TASK_ROUTING, ...(input.routing ?? {}) };
  const switches = input.switches ?? [];
  const insights = input.insights ?? [];

  const statsByKind = new Map<TaskKind, Map<string, number>>();
  for (const s of switches) {
    if (!statsByKind.has(s.taskKind)) statsByKind.set(s.taskKind, new Map());
    const m = statsByKind.get(s.taskKind)!;
    const spec = formatRoutingSpec({ backend: s.backend, model: s.model });
    m.set(spec, (m.get(spec) ?? 0) + 1);
  }

  const learnedLines: string[] = [];
  for (const kind of TASK_KINDS) {
    const counts = statsByKind.get(kind);
    if (!counts || counts.size === 0) continue;
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => `${model} (${count} lần)`)
      .join(', ');
    learnedLines.push(`- Nhóm việc ${kind}: người dùng đã chọn ${top}.`);
  }
  for (const item of insights.slice(-10)) {
    learnedLines.push(`- Kinh nghiệm hội thoại: ${item.note}`);
  }
  if (!learnedLines.length) {
    learnedLines.push('- Chưa có lịch sử đổi model thủ công; áp dụng bảng phân tầng mặc định theo độ phức tạp.');
  }

  const routingLines = TASK_KINDS.map((k) => {
    const slug = routing[k];
    const label = AGY_MODEL_VARIANTS.find((v) => v.slug === slug)?.label ?? slug;
    return `- \`${k}\`: ${slug} — ${label} (${TASK_KIND_LABELS[k]})`;
  });

  return [
    '---',
    `name: ${CHOICE_MODEL_SKILL_NAME}`,
    'description: Dùng khi tự động lựa chọn và điều phối model thông minh theo độ phức tạp công việc và thói quen chọn model của người dùng',
    'load: demand',
    '---',
    '# Điều phối và lựa chọn model thông minh (choice-model)',
    '',
    '## Khi nào dùng',
    '- Dùng khi hội thoại hoặc quy trình đặt ở chế độ Tự động chọn AI để chọn đúng biến thể model phù hợp với độ khó của yêu cầu trên tất cả provider đã cài (`agy`, `codex`, `claude`, `opencode`, `api`).',
    '- Dùng khi cơ chế tự học cập nhật thói quen chọn model của người dùng từ lịch sử đổi model và kết quả hội thoại.',
    '',
    '## Khi nào không dùng',
    '- Không ghi đè khi người dùng đã khóa cứng một model cụ thể cho hội thoại hiện tại, trừ lúc lưu lại lựa chọn đó để học thói quen.',
    '',
    '## Quy định',
    '- Việc nền, lệnh làm ngay (`immediate`), câu hỏi ngắn hoặc định dạng đơn giản ưu tiên model sinh token nhanh, ít suy luận (`gemini-3.8-flash-low`, `claude:haiku`, `codex:gpt-5.4-mini`, `opencode:...-flash-free`) để phản hồi tức thì và tiết kiệm hạn mức (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc soạn thảo giáo án, văn bản hành chính và xử lý tài liệu Office thông thường ưu tiên `gemini-4-argon-low` hoặc `gemini-4-argon-medium` (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc lập trình, sửa mã, viết Typst/LaTeX hoặc thiết kế quy trình ưu tiên họ `claude-sonnet-5-5`, `codex` hoặc `claude:sonnet` theo mức độ phức tạp (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc lập kế hoạch lớn, Plan Pro, kiểm định ma trận đặc tả đề thi hoặc suy luận nhiều tầng ưu tiên `gemini-4-argon-high`, `claude-opus-5-5-high`, `claude:opus` hoặc `codex` mức `high` (Nguồn: Thiết kế điều phối PVTA)',
    '- Khi một provider hoặc nhóm model chạm hạn mức 5h/tuần hoặc báo lỗi API limit (429 / quota), tự động chuyển sang provider/model còn hạn mức tương đương trên máy (Nguồn: Thiết kế điều phối PVTA)',
    '',
    '## Quy trình',
    '1. Phân loại yêu cầu đầu vào theo độ dài, lệnh làm ngay (`immediate`), từ khóa chuyên môn, số tệp đính kèm và chế độ làm việc (Chat, Plan, Plan Pro, Quy trình).',
    '2. Nếu phát hiện tác vụ nhiều công đoạn đang ở chế độ Chat, gợi ý người dùng chuyển sang `◇ Plan` hoặc `◇ Plan Pro`.',
    '3. Tra bảng ánh xạ model theo loại việc và lịch sử đổi model của người dùng trên mọi provider (`agy`, `codex`, `claude`, `opencode`, `api`).',
    '4. Kiểm tra hạn mức còn lại và trạng thái lỗi limit của các provider trước khi chốt model.',
    '5. Hiển thị ngay biến thể model và mức suy nghĩ được chọn trên thanh trạng thái model của hội thoại.',
    '6. Ghi nhận các lần người dùng tự đổi model và kết quả hội thoại để cập nhật lại bảng ánh xạ trong kỹ năng này.',
    '',
    '## Danh sách kiểm tra',
    '- [ ] Đã chọn biến thể `low` hoặc model sinh token nhanh (`flash`, `haiku`, `mini`) cho lệnh làm ngay và yêu cầu đơn giản.',
    '- [ ] Đã chọn model suy luận cao (`high`, `gemini-4-argon`, `claude-sonnet-5-5`, `claude-opus-5-5`, `codex`, `claude`) cho yêu cầu phức tạp.',
    '- [ ] Đã tự động tránh model/provider đang chạm limit hoặc hết hạn mức 5h/tuần.',
    '- [ ] Đã cập nhật ngay tên model và mức suy nghĩ trên thanh thông tin model.',
    '- [ ] Đã lưu lịch sử đổi model của người dùng mà không cần gọi AI.',
    '',
    '## Tài liệu tham chiếu',
    '- Danh mục 13 model Antigravity (agy) và các provider mở rộng (`codex:<model>`, `claude:<model>`, `opencode:<model>`):',
    '  - `gemini-4-argon-low` — Gemini 4 Argon (Low)',
    '  - `gemini-4-argon-medium` — Gemini 4 Argon (Medium)',
    '  - `gemini-4-argon-high` — Gemini 4 Argon (High)',
    '  - `gemini-3.8-flash-low` — Gemini 3.8 Flash (Low)',
    '  - `gemini-3.8-flash-medium` — Gemini 3.8 Flash (Medium)',
    '  - `gemini-3.8-flash-high` — Gemini 3.8 Flash (High)',
    '  - `claude-opus-5-5-low` — Claude Opus 5.5 (Low)',
    '  - `claude-opus-5-5-medium` — Claude Opus 5.5 (Medium)',
    '  - `claude-opus-5-5-high` — Claude Opus 5.5 (High)',
    '  - `claude-sonnet-5-5-low` — Claude Sonnet 5.5 (Low)',
    '  - `claude-sonnet-5-5-medium` — Claude Sonnet 5.5 (Medium)',
    '  - `claude-sonnet-5-5-high` — Claude Sonnet 5.5 (High)',
    '  - `gpt-oss-120b-medium` — GPT-OSS 120B (Medium)',
    '',
    '## Kiểm tra bàn giao',
    '- Bảng ánh xạ dưới đây được bộ điều phối đọc trực tiếp và được cơ chế tự học cập nhật tự động.',
    '',
    '## Bảng ánh xạ model theo loại việc',
    ...routingLines,
    '',
    '## Thói quen chọn model đã học',
    ...learnedLines,
    '',
  ].join('\n');
}

function isQuotaExhausted(usage?: ProviderUsage): boolean {
  if (!usage) return false;
  if (usage.error && isProviderLimitError(usage.error)) return true;
  const check = (w?: ProviderUsage['fiveHour']) =>
    !!w && (w.status === 'rejected' || (typeof w.usedPercent === 'number' && w.usedPercent >= 99));
  return check(usage.fiveHour) || check(usage.week);
}

/** Điều chỉnh mức biến thể (-low/-medium/-high) theo độ phức tạp thực tế của lượt hỏi nếu người dùng chưa khóa biến thể riêng. */
function adjustVariantForComplexity(
  slug: string,
  complexity: 'low' | 'medium' | 'high',
  hasUserOverride: boolean,
  immediate = false,
): string {
  if (hasUserOverride && !immediate) return slug;
  if (immediate && !hasUserOverride) return 'gemini-3.8-flash-low';
  const v = AGY_MODEL_VARIANTS.find((x) => x.slug === slug);
  if (!v || !v.effort) return slug;
  if (v.family === 'gemini-flash') {
    if (complexity === 'low') return 'gemini-3.8-flash-low';
    if (complexity === 'medium') return 'gemini-3.8-flash-medium';
    return 'gemini-3.8-flash-high';
  }
  if (v.family === 'gemini-argon') {
    if (complexity === 'low') return 'gemini-4-argon-low';
    if (complexity === 'high') return 'gemini-4-argon-high';
    return 'gemini-4-argon-medium';
  }
  if (v.family === 'claude-sonnet') {
    if (complexity === 'low') return 'claude-sonnet-5-5-low';
    if (complexity === 'high') return 'claude-sonnet-5-5-high';
    return 'claude-sonnet-5-5-medium';
  }
  if (v.family === 'claude-opus') {
    if (complexity === 'low') return 'claude-opus-5-5-low';
    if (complexity === 'medium') return 'claude-opus-5-5-medium';
    return 'claude-opus-5-5-high';
  }
  return slug;
}

export type ModelTier = 'fast' | 'balanced' | 'deep';

/** Phân tầng tốc độ/suy luận cho bất kỳ model nào của `agy`, `codex`, `claude`, `opencode`, `api`. */
export function classifyModelTier(backend: BackendId, modelId: string, label = '', hint = ''): ModelTier {
  const s = `${modelId} ${label} ${hint}`.toLowerCase();
  if (backend === 'agy') {
    const v = AGY_MODEL_VARIANTS.find((x) => x.slug === modelId);
    if (v) {
      if (v.family === 'gemini-flash' && v.effort !== 'high') return 'fast';
      if (v.effort === 'low') return 'fast';
      if (v.family === 'claude-opus' && v.effort === 'high') return 'deep';
      if (v.effort === 'high') return 'deep';
      return 'balanced';
    }
  }
  if (/\b(haiku|flash|mini|spark|lightning|lite|nano|small|instant|fast)\b|-low$/i.test(s)) return 'fast';
  if (/\b(opus|ultra|super|pro|max|o3|o1|reasoner|thinking)\b|-high$/i.test(s)) return 'deep';
  return 'balanced';
}

export interface SmartBackendStatus {
  id: CliBackendId;
  installed: boolean;
  auth?: 'ready' | 'missing' | 'unknown';
  efforts?: Effort[];
}

export interface SmartApiProviderStatus {
  id: string;
  configured: boolean;
  defaultModel?: string;
  models?: ReadonlyArray<{ id: string; label?: string }>;
}

/**
 * Chọn model phù hợp nhất trên một provider cụ thể (`claude`, `codex`, `opencode`, `agy`, `api`)
 * theo độ phức tạp công việc và loại việc, đồng thời bỏ qua các model đang bị lỗi limit.
 */
function pickFromBackendCatalog(input: {
  backend: CliBackendId;
  catalog?: ModelCatalog;
  desiredTier: ModelTier;
  taskKind: TaskKind;
  complexity: 'low' | 'medium' | 'high';
  preferredEffort?: Effort | null;
  tracker?: ModelChoiceTracker;
  exclude?: ReadonlySet<string>;
  now?: number;
}): { choice: ModelChoice; effort: Effort } | undefined {
  const models = modelsOf(input.catalog, input.backend);
  if (!models.length) return undefined;
  const candidates: Array<{ choice: ModelChoice; effort: Effort; tier: ModelTier; score: number }> = [];

  const desiredEffort: Effort =
    input.preferredEffort ??
    (input.desiredTier === 'fast' || input.complexity === 'low'
      ? 'low'
      : input.desiredTier === 'deep' || input.complexity === 'high'
        ? 'high'
        : 'medium');

  const concreteModels = models.filter((m) => m.id !== 'default');
  const pool = concreteModels.length > 0 ? concreteModels : models;

  for (const m of pool) {
    if (m.variants && Object.keys(m.variants).length > 0) {
      for (const [eff, slug] of Object.entries(m.variants) as [Effort, string][]) {
        const choice: ModelChoice = { backend: input.backend, model: slug };
        const key = `${choice.backend}:${choice.model}`;
        if (input.exclude?.has(key) || input.tracker?.isInCooldown(choice, input.now)) continue;
        const tier = classifyModelTier(input.backend, slug, m.label, m.hint);
        let score = 0;
        if (tier === input.desiredTier) score += 30;
        else if (input.desiredTier === 'fast' && tier === 'balanced') score += 12;
        else if (input.desiredTier === 'deep' && tier === 'balanced') score += 12;
        else if (input.desiredTier === 'balanced') score += 10;
        if (eff === desiredEffort) score += 15;
        if ((input.taskKind === 'coding' || input.taskKind === 'workflow') && /sonnet|codex|code/i.test(slug)) score += 12;
        if ((input.taskKind === 'pro' || input.taskKind === 'exam') && /opus|argon-high|pro|ultra/i.test(slug)) score += 12;
        if (input.desiredTier === 'fast' && /flash|haiku|mini|spark|lightning/i.test(slug)) score += 15;
        candidates.push({ choice, effort: eff, tier, score });
      }
    } else {
      const choice: ModelChoice = { backend: input.backend, model: m.id };
      const key = `${choice.backend}:${choice.model}`;
      if (input.exclude?.has(key) || input.tracker?.isInCooldown(choice, input.now)) continue;
      const tier = classifyModelTier(input.backend, m.id, m.label, m.hint);
      const eff: Effort =
        m.efforts && m.efforts.includes(desiredEffort)
          ? desiredEffort
          : m.defaultEffort ?? desiredEffort;
      let score = 0;
      if (tier === input.desiredTier) score += 30;
      else if (input.desiredTier === 'fast' && tier === 'balanced') score += 12;
      else if (input.desiredTier === 'deep' && tier === 'balanced') score += 12;
      else if (input.desiredTier === 'balanced') score += 10;
      if ((input.taskKind === 'coding' || input.taskKind === 'workflow') && /codex|sonnet|deepseek|qwen/i.test(m.id)) score += 12;
      if ((input.taskKind === 'pro' || input.taskKind === 'exam') && /opus|gpt-5\.4|gpt-5\.3|ultra|super|pro/i.test(m.id)) score += 12;
      if (input.desiredTier === 'fast' && /haiku|mini|spark|flash|lightning|lite|fast/i.test(m.id)) score += 18;
      if (m.fast && input.desiredTier === 'fast') score += 8;
      candidates.push({ choice, effort: eff, tier, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? { choice: candidates[0].choice, effort: candidates[0].effort } : undefined;
}

/**
 * Lựa chọn model thông minh cho chế độ `auto`:
 * kết hợp phân loại công việc (phân biệt lệnh làm ngay `immediate` vs việc phức tạp),
 * bảng ánh xạ trong skill `choice-model`, lịch sử chọn model của người dùng trên mọi provider (`agy`, `codex`, `claude`, `opencode`, `api`),
 * và tự động tránh các provider/model đang chạm hạn mức (quota / rate-limit).
 */
export function selectSmartModel(input: {
  task: TaskClassificationInput;
  tracker?: ModelChoiceTracker;
  skillsDir?: string;
  catalog?: ModelCatalog;
  agyUsage?: ProviderUsage;
  usageByBackend?: Partial<Record<BackendId, ProviderUsage>>;
  backends?: readonly SmartBackendStatus[];
  apiProviders?: readonly SmartApiProviderStatus[];
  preferredEffort?: Effort | null;
  /** Cờ xanh (Chế độ Tự động): khóa mức suy nghĩ của lệnh làm ngay / việc đơn giản để tránh hết quota. */
  greenModeCap?: boolean;
  excludeModels?: ReadonlySet<string>;
  now?: number;
}): {
  choice: ModelChoice;
  effort: Effort;
  taskKind: TaskKind;
  label: string;
  immediate?: boolean;
  suggestedPlanningMode?: 'plan' | 'pro';
  suggestedPlanningReason?: string;
} {
  const classified = classifyTask(input.task);
  const now = input.now ?? Date.now();
  const usageMap: Partial<Record<BackendId, ProviderUsage>> = {
    ...(input.usageByBackend ?? {}),
    ...(input.agyUsage ? { agy: input.agyUsage } : {}),
  };

  // Danh sách các CLI backend sẵn sàng trên máy (nếu không truyền thì mặc định agy sẵn sàng để tương thích ngược).
  const readyBackends: CliBackendId[] = input.backends
    ? input.backends.filter((b) => b.installed && b.auth !== 'missing').map((b) => b.id)
    : ['agy'];

  const isBackendReady = (b: BackendId): boolean => {
    if (b === 'api') return Boolean(input.apiProviders?.some((p) => p.configured));
    return readyBackends.includes(b);
  };

  const isBackendLimited = (b: BackendId): boolean => {
    if (isQuotaExhausted(usageMap[b])) return true;
    if (input.tracker?.isInCooldown({ backend: b, model: '*' }, now)) return true;
    return false;
  };

  const desiredTier: ModelTier =
    classified.immediate || classified.kind === 'background' || classified.kind === 'simple' || classified.complexity === 'low'
      ? 'fast'
      : classified.kind === 'pro' || classified.kind === 'exam' || classified.kind === 'planning' || classified.complexity === 'high'
        ? 'deep'
        : 'balanced';

  // Trong Cờ xanh (greenModeCap): lệnh làm ngay hoặc việc đơn giản khóa ở mức suy nghĩ 'low' để tránh đốt quota.
  const effectivePreferredEffort: Effort | null | undefined =
    input.greenModeCap && (classified.immediate || classified.kind === 'simple' || classified.kind === 'background')
      ? 'low'
      : input.preferredEffort;

  const skillRouting = input.skillsDir ? readRoutingFromSkill(input.skillsDir) : {};
  const routing = input.tracker
    ? input.tracker.effectiveRouting(input.skillsDir)
    : { ...DEFAULT_TASK_ROUTING, ...skillRouting };

  const userOverrodeKind =
    Boolean(input.tracker?.hasOverride(classified.kind)) ||
    Boolean(skillRouting[classified.kind] && skillRouting[classified.kind] !== DEFAULT_TASK_ROUTING[classified.kind]);

  const rawTargetSpec = routing[classified.kind] ?? DEFAULT_TASK_ROUTING[classified.kind];
  const parsedTarget = parseRoutingSpec(rawTargetSpec) ?? { backend: 'agy', model: DEFAULT_TASK_ROUTING[classified.kind] };

  // 1. Nếu bảng định tuyến trỏ tới một provider cụ thể khác agy (do người dùng đã chọn và PVTA đã học) và provider đó sẵn sàng + chưa chạm limit:
  if (
    parsedTarget.backend !== 'agy' &&
    isBackendReady(parsedTarget.backend) &&
    !isBackendLimited(parsedTarget.backend) &&
    !input.tracker?.isInCooldown(parsedTarget, now) &&
    !input.excludeModels?.has(`${parsedTarget.backend}:${parsedTarget.model}`)
  ) {
    const resolved = resolveChoiceVariant(parsedTarget, effectivePreferredEffort, Boolean(input.task.light || classified.immediate), input.catalog);
    const effort: Effort =
      resolved.effort ??
      effectivePreferredEffort ??
      (desiredTier === 'fast' ? 'low' : desiredTier === 'deep' ? 'high' : 'medium');
    return {
      choice: resolved.choice,
      effort,
      taskKind: classified.kind,
      label: formatModelChoiceLabel(resolved.choice, effort, input.catalog),
      ...(classified.immediate ? { immediate: true } : {}),
      ...(classified.suggestedPlanningMode ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason } : {}),
    };
  }

  // 2. Nếu agy sẵn sàng trên máy, xét các biến thể agy trước (kèm chuyển đổi nhóm hạn mức Gemini <-> 3P hoặc sang provider khác khi chạm limit).
  if (isBackendReady('agy')) {
    let targetSlug = parsedTarget.backend === 'agy' ? parsedTarget.model : DEFAULT_TASK_ROUTING[classified.kind];
    targetSlug = adjustVariantForComplexity(targetSlug, classified.complexity, userOverrodeKind, Boolean(classified.immediate));

    if (!input.task.light && classified.kind !== 'background' && effectivePreferredEffort) {
      const info = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
      if (info) {
        const sibling = AGY_MODEL_VARIANTS.find((v) => v.baseId === info.baseId && v.effort === effectivePreferredEffort);
        if (sibling) targetSlug = sibling.slug;
      }
    }

    const targetMeta = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
    const agyExhausted = isQuotaExhausted(usageMap.agy);
    const targetBlocked =
      agyExhausted ||
      Boolean(input.tracker?.isInCooldown({ backend: 'agy', model: targetSlug }, now)) ||
      Boolean(input.excludeModels?.has(`agy:${targetSlug}`));

    if (targetMeta && targetBlocked) {
      // Thử nhóm hạn mức còn lại trong agy trước
      const altSlug =
        targetMeta.quotaGroup === '3p'
          ? classified.complexity === 'high'
            ? 'gemini-4-argon-high'
            : classified.complexity === 'low' || classified.immediate
              ? 'gemini-3.8-flash-low'
              : 'gemini-4-argon-medium'
          : classified.complexity === 'high'
            ? 'claude-sonnet-5-5-high'
            : classified.complexity === 'low' || classified.immediate
              ? 'claude-sonnet-5-5-low'
              : 'gpt-oss-120b-medium';

      const altBlocked =
        Boolean(input.tracker?.isInCooldown({ backend: 'agy', model: altSlug }, now)) ||
        Boolean(input.excludeModels?.has(`agy:${altSlug}`));

      if (!altBlocked && (!agyExhausted || readyBackends.length === 1)) {
        targetSlug = altSlug;
      } else if (readyBackends.some((b) => b !== 'agy' && !isBackendLimited(b))) {
        // agy đã chạm limit cả 2 nhóm (hoặc toàn provider) và máy có provider khác (codex, claude, opencode) -> chuyển sang provider khỏe mạnh tiếp theo!
        targetSlug = '';
      } else {
        targetSlug = altSlug;
      }
    }

    if (targetSlug) {
      const available = modelsOf(input.catalog, 'agy');
      if (available.length > 0 && !findModelInfo(available, targetSlug)) {
        const base = targetMeta?.baseId;
        const foundBase = base ? findModelInfo(available, base)?.info : undefined;
        if (foundBase?.variants) {
          const eff = targetMeta?.effort ?? 'medium';
          targetSlug = foundBase.variants[eff] ?? Object.values(foundBase.variants)[0] ?? foundBase.id;
        } else {
          const fallback = available[0]!;
          targetSlug =
            fallback.variants?.low && (classified.complexity === 'low' || classified.immediate)
              ? fallback.variants.low
              : fallback.variants?.medium ?? fallback.id;
        }
      }

      if (
        !input.excludeModels?.has(`agy:${targetSlug}`) &&
        (!input.tracker?.isInCooldown({ backend: 'agy', model: targetSlug }, now) || readyBackends.length === 1)
      ) {
        const finalMeta = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
        const effort: Effort = finalMeta?.effort ?? findModelInfo(available, targetSlug)?.effort ?? 'medium';
        const choice: ModelChoice = { backend: 'agy', model: targetSlug };
        return {
          choice,
          effort,
          taskKind: classified.kind,
          label: formatModelChoiceLabel(choice, effort, input.catalog),
          ...(classified.immediate ? { immediate: true } : {}),
          ...(classified.suggestedPlanningMode
            ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason }
            : {}),
        };
      }
    }
  }

  // 3. Tự động nhận diện và chọn model phù hợp nhất từ tất cả các provider khác trên máy (`codex`, `claude`, `opencode`, `agy`, `api`)
  const providerOrder: CliBackendId[] =
    classified.kind === 'coding' || classified.kind === 'workflow'
      ? ['codex', 'claude', 'agy', 'opencode']
      : desiredTier === 'fast'
        ? ['claude', 'codex', 'opencode', 'agy']
        : ['claude', 'codex', 'agy', 'opencode'];

  for (const pass of ['healthy', 'any'] as const) {
    for (const backend of providerOrder) {
      if (!isBackendReady(backend)) continue;
      if (pass === 'healthy' && isBackendLimited(backend)) continue;
      const picked = pickFromBackendCatalog({
        backend,
        catalog: input.catalog,
        desiredTier,
        taskKind: classified.kind,
        complexity: classified.complexity,
        preferredEffort: effectivePreferredEffort,
        tracker: pass === 'healthy' ? input.tracker : undefined,
        exclude: input.excludeModels,
        now,
      });
      if (picked) {
        return {
          choice: picked.choice,
          effort: picked.effort,
          taskKind: classified.kind,
          label: formatModelChoiceLabel(picked.choice, picked.effort, input.catalog),
          ...(classified.immediate ? { immediate: true } : {}),
          ...(classified.suggestedPlanningMode
            ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason }
            : {}),
        };
      }
    }
  }

  // 4. Dự phòng sang các API provider đã cấu hình (ưu tiên CommandCode, sau đó các API khác)
  const configuredApis = [...(input.apiProviders ?? []).filter((p) => p.configured)].sort(
    (a, b) => (a.id === 'commandcode' ? -1 : 0) - (b.id === 'commandcode' ? -1 : 0),
  );
  for (const apiProv of configuredApis) {
    if (apiProv.defaultModel) {
      const fullDefault = apiProv.defaultModel.startsWith(`${apiProv.id}/`)
        ? apiProv.defaultModel
        : `${apiProv.id}/${apiProv.defaultModel}`;
      const defaultChoice: ModelChoice = { backend: 'api', model: fullDefault };
      if (!input.excludeModels?.has(`api:${fullDefault}`) && !input.tracker?.isInCooldown(defaultChoice, now)) {
        const effort: Effort = desiredTier === 'fast' ? 'low' : desiredTier === 'deep' ? 'high' : 'medium';
        return {
          choice: defaultChoice,
          effort,
          taskKind: classified.kind,
          label: fullDefault,
          ...(classified.immediate ? { immediate: true } : {}),
          ...(classified.suggestedPlanningMode
            ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason }
            : {}),
        };
      }
    }
    const apiModels = apiProv.models?.length ? apiProv.models : [];
    for (const m of apiModels) {
      const fullId = m.id.startsWith(`${apiProv.id}/`) ? m.id : `${apiProv.id}/${m.id}`;
      const choice: ModelChoice = { backend: 'api', model: fullId };
      if (input.excludeModels?.has(`api:${fullId}`) || input.tracker?.isInCooldown(choice, now)) continue;
      const tier = classifyModelTier('api', fullId, m.label);
      if (tier === desiredTier || apiModels.length === 1) {
        const effort: Effort = desiredTier === 'fast' ? 'low' : desiredTier === 'deep' ? 'high' : 'medium';
        return {
          choice,
          effort,
          taskKind: classified.kind,
          label: m.label ?? fullId,
          ...(classified.immediate ? { immediate: true } : {}),
          ...(classified.suggestedPlanningMode
            ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason }
            : {}),
        };
      }
    }
  }

  // Cuối cùng: dự phòng mặc định
  const fallbackChoice: ModelChoice = { backend: readyBackends[0] ?? 'agy', model: DEFAULT_TASK_ROUTING[classified.kind] };
  return {
    choice: fallbackChoice,
    effort: 'medium',
    taskKind: classified.kind,
    label: formatModelChoiceLabel(fallbackChoice, 'medium', input.catalog),
    ...(classified.immediate ? { immediate: true } : {}),
    ...(classified.suggestedPlanningMode
      ? { suggestedPlanningMode: classified.suggestedPlanningMode, suggestedPlanningReason: classified.suggestedPlanningReason }
      : {}),
  };
}
