import fs from 'node:fs';
import path from 'node:path';
import { findModelInfo, modelsOf, type BackendId, type Effort, type ModelCatalog, type ModelChoice, type ProviderUsage } from '@pvta/shared';
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
    return { kind: 'background', complexity: 'low', signals: ['background'] };
  }

  if (input.planningMode === 'pro' || input.proStep) {
    signals.push('plan-pro');
    return { kind: 'pro', complexity: 'high', signals };
  }

  if (/\[pvta:exam:plan-pro\]|ma trận|đặc tả|đề kiểm tra|đề thi|trộn đề|kiểm định đề|thang điểm|đáp án chi tiết/i.test(lower)) {
    signals.push('exam');
    return { kind: 'exam', complexity: len > 600 || attCount > 0 ? 'high' : 'medium', signals };
  }

  if (input.planMode || input.planningMode === 'plan') {
    signals.push('plan');
    return { kind: 'planning', complexity: len > 500 || attCount > 1 ? 'high' : 'medium', signals };
  }

  if (input.workflow || /!bien\b|!gan\b|!ham\b|!goi\b|!dau-vao\b|!dau-ra\b|!lap-lai\b|quy trình tự động/i.test(lower)) {
    signals.push('workflow');
    return { kind: 'workflow', complexity: len > 600 ? 'high' : 'medium', signals };
  }

  if (
    /```|\b(typescript|javascript|python|rust|golang|java|c\+\+|html|css|sql|typst|latex|debug|refactor|stack trace|lỗi mã|viết hàm|thuật toán|regex)\b|\.(ts|tsx|js|jsx|py|rs|typ|sh|json|yaml)\b/i.test(
      lower,
    )
  ) {
    signals.push('coding');
    const complexity =
      len < 80 && attCount === 0 && !/debug|refactor|chi tiết|kiểm thử|tối ưu|thuật toán/i.test(lower)
        ? 'low'
        : len > 900 || attCount > 1
          ? 'high'
          : 'medium';
    return { kind: 'coding', complexity, signals };
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
    const complexity =
      len > 1200 || attCount > 2
        ? 'high'
        : len < 70 && attCount === 0 && !/giáo án|kế hoạch bài dạy|khbd|chi tiết|đầy đủ|5512|báo cáo|tờ trình/i.test(lower)
          ? 'low'
          : 'medium';
    return { kind: 'office', complexity, signals };
  }

  if (
    /suy luận|phân tích chuyên sâu|chứng minh|tối ưu hóa|so sánh chi tiết|phản biện|kiến trúc|đa chiều|phức tạp|bài toán khó|nghiên cứu sâu/i.test(
      lower,
    ) ||
    len > 1800
  ) {
    signals.push('deep-reasoning');
    return { kind: 'pro', complexity: 'high', signals };
  }

  if (len <= 220 && attCount === 0 && !/\n.*\n/.test(text) && !/phân tích|tổng hợp|lập bảng|so sánh|chi tiết/i.test(lower)) {
    signals.push('short');
    return { kind: 'simple', complexity: len <= 100 ? 'low' : 'medium', signals };
  }

  signals.push('standard');
  return { kind: 'standard', complexity: len < 260 ? 'low' : len > 1200 ? 'high' : 'medium', signals };
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

/** Quản lý lịch sử người dùng đổi model (tất định, không cần AI) và đồng bộ với skill `choice-model`. */
export class ModelChoiceTracker {
  private file: string;
  private data: ModelChoiceFileData;

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
    if (rec.backend === 'agy' && rec.taskKind !== 'background') {
      const preferred = this.computePreferredAgyModel(rec.taskKind);
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
        if (s.backend === 'agy' && s.taskKind !== 'background') {
          const preferred = this.computePreferredAgyModel(s.taskKind);
          if (preferred) this.data.routingOverrides[s.taskKind] = preferred;
        }
        this.save();
        return true;
      }
      break;
    }
    return false;
  }

  /** Kiểm tra xem loại việc này đã có lựa chọn riêng từ lịch sử người dùng hoặc bài học chưa. */
  hasOverride(kind: TaskKind): boolean {
    return Boolean(this.data.routingOverrides[kind] || this.computePreferredAgyModel(kind));
  }

  /** Tính model agy được người dùng ưu tiên cho một loại việc dựa trên lịch sử đổi model (ưu tiên lần chọn gần nhất + tần suất). */
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
        const slug = input.routing[kind]?.trim();
        if (slug && AGY_MODEL_VARIANTS.some((v) => v.slug === slug)) {
          if (this.data.routingOverrides[kind] !== slug) {
            this.data.routingOverrides[kind] = slug;
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
      const byHistory = this.computePreferredAgyModel(kind);
      if (byHistory && AGY_MODEL_VARIANTS.some((v) => v.slug === byHistory)) out[kind] = byHistory;
      const override = this.data.routingOverrides[kind];
      if (override && AGY_MODEL_VARIANTS.some((v) => v.slug === override)) out[kind] = override;
    }
    return out;
  }

  /** Tóm tắt gọn lịch sử người dùng đổi model để đưa vào lời nhắc của cơ chế tự học. */
  summaryForLearning(limit = 12): Array<{
    taskKind: TaskKind;
    model: string;
    fromModel?: string;
    promptSample?: string;
    promptLength?: number;
    attachmentCount?: number;
  }> {
    return this.data.switches
      .filter((s) => s.backend === 'agy')
      .slice(-limit)
      .map((s) => ({
        taskKind: s.taskKind,
        model: s.model,
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
  const re = /^\s*[-*]\s*`?(background|simple|standard|office|coding|workflow|planning|pro|exam)`?\s*:\s*`?([a-z0-9.-]+)`?/gim;
  for (const m of text.matchAll(re)) {
    const kind = m[1]!.toLowerCase() as TaskKind;
    const slug = m[2]!.toLowerCase();
    if (AGY_MODEL_VARIANTS.some((v) => v.slug === slug)) {
      out[kind] = slug;
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
    m.set(s.model, (m.get(s.model) ?? 0) + 1);
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
    '- Dùng khi hội thoại hoặc quy trình đặt ở chế độ Tự động chọn AI để chọn đúng biến thể model phù hợp với độ khó của yêu cầu.',
    '- Dùng khi cơ chế tự học cập nhật thói quen chọn model của người dùng từ lịch sử đổi model và kết quả hội thoại.',
    '',
    '## Khi nào không dùng',
    '- Không ghi đè khi người dùng đã khóa cứng một model cụ thể cho hội thoại hiện tại, trừ lúc lưu lại lựa chọn đó để học thói quen.',
    '',
    '## Quy định',
    '- Việc nền, câu hỏi ngắn hoặc định dạng đơn giản ưu tiên họ nhẹ `gemini-3.8-flash-low` hoặc `gemini-3.8-flash-medium` để phản hồi tức thì và tiết kiệm hạn mức (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc soạn thảo giáo án, văn bản hành chính và xử lý tài liệu Office thông thường ưu tiên `gemini-4-argon-low` hoặc `gemini-4-argon-medium` (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc lập trình, sửa mã, viết Typst/LaTeX hoặc thiết kế quy trình ưu tiên họ `claude-sonnet-5-5` theo mức độ phức tạp (Nguồn: Thiết kế điều phối PVTA)',
    '- Việc lập kế hoạch lớn, Plan Pro, kiểm định ma trận đặc tả đề thi hoặc suy luận nhiều tầng ưu tiên `gemini-4-argon-high` hoặc `claude-opus-5-5-high` (Nguồn: Thiết kế điều phối PVTA)',
    '- Khi một nhóm model chạm hạn mức 5h hoặc tuần, tự động chuyển sang nhóm model còn hạn mức tương đương gần nhất (Nguồn: Thiết kế điều phối PVTA)',
    '',
    '## Quy trình',
    '1. Phân loại yêu cầu đầu vào theo độ dài, từ khóa chuyên môn, số tệp đính kèm và chế độ làm việc (Chat, Plan, Plan Pro, Quy trình).',
    '2. Tra bảng ánh xạ model theo loại việc và lịch sử đổi model của người dùng đã lưu trong bộ nhớ.',
    '3. Kiểm tra hạn mức còn lại của nhóm Gemini và nhóm Claude/GPT trước khi chốt biến thể model.',
    '4. Hiển thị ngay biến thể model và mức suy nghĩ được chọn trên thanh trạng thái model của hội thoại.',
    '5. Ghi nhận các lần người dùng tự đổi model và kết quả hội thoại để cập nhật lại bảng ánh xạ trong kỹ năng này.',
    '',
    '## Danh sách kiểm tra',
    '- [ ] Đã chọn biến thể `low` hoặc `gemini-3.8-flash` cho yêu cầu đơn giản, ngắn gọn.',
    '- [ ] Đã chọn model suy luận cao (`high`, `gemini-4-argon`, `claude-sonnet-5-5`, `claude-opus-5-5`) cho yêu cầu phức tạp.',
    '- [ ] Đã cập nhật ngay tên model và mức suy nghĩ trên thanh thông tin model.',
    '- [ ] Đã lưu lịch sử đổi model của người dùng mà không cần gọi AI.',
    '',
    '## Tài liệu tham chiếu',
    '- Danh mục 13 model Antigravity (agy):',
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
  const check = (w?: ProviderUsage['fiveHour']) =>
    !!w && (w.status === 'rejected' || (typeof w.usedPercent === 'number' && w.usedPercent >= 99));
  return check(usage.fiveHour) || check(usage.week);
}

/** Điều chỉnh mức biến thể (-low/-medium/-high) theo độ phức tạp thực tế của lượt hỏi nếu người dùng chưa khóa biến thể riêng. */
function adjustVariantForComplexity(slug: string, complexity: 'low' | 'medium' | 'high', hasUserOverride: boolean): string {
  if (hasUserOverride) return slug;
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

/**
 * Lựa chọn model thông minh cho chế độ `auto`:
 * kết hợp phân loại công việc, bảng ánh xạ trong skill `choice-model`, lịch sử chọn model của người dùng và hạn mức còn lại.
 */
export function selectSmartModel(input: {
  task: TaskClassificationInput;
  tracker?: ModelChoiceTracker;
  skillsDir?: string;
  catalog?: ModelCatalog;
  agyUsage?: ProviderUsage;
  preferredEffort?: Effort | null;
}): { choice: ModelChoice; effort: Effort; taskKind: TaskKind; label: string } {
  const classified = classifyTask(input.task);
  const skillRouting = input.skillsDir ? readRoutingFromSkill(input.skillsDir) : {};
  const routing = input.tracker
    ? input.tracker.effectiveRouting(input.skillsDir)
    : { ...DEFAULT_TASK_ROUTING, ...skillRouting };

  const userOverrodeKind =
    Boolean(input.tracker?.hasOverride(classified.kind)) ||
    Boolean(skillRouting[classified.kind] && skillRouting[classified.kind] !== DEFAULT_TASK_ROUTING[classified.kind]);

  let targetSlug = routing[classified.kind] ?? DEFAULT_TASK_ROUTING[classified.kind];
  targetSlug = adjustVariantForComplexity(targetSlug, classified.complexity, userOverrodeKind);

  // Nếu người dùng có chọn mức suy nghĩ chung trên thanh trạng thái ở chế độ auto (và không phải việc nền), tôn trọng mức đó.
  if (!input.task.light && classified.kind !== 'background' && input.preferredEffort) {
    const info = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
    if (info) {
      const sibling = AGY_MODEL_VARIANTS.find((v) => v.baseId === info.baseId && v.effort === input.preferredEffort);
      if (sibling) targetSlug = sibling.slug;
    }
  }

  // Nếu nhóm model đang chọn đã cạn hạn mức, chuyển sang model tương đương ở nhóm còn lại.
  const targetMeta = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
  if (targetMeta && isQuotaExhausted(input.agyUsage)) {
    if (targetMeta.quotaGroup === '3p') {
      targetSlug =
        classified.complexity === 'high'
          ? 'gemini-4-argon-high'
          : classified.complexity === 'low'
            ? 'gemini-3.8-flash-low'
            : 'gemini-4-argon-medium';
    } else {
      targetSlug =
        classified.complexity === 'high'
          ? 'claude-sonnet-5-5-high'
          : classified.complexity === 'low'
            ? 'claude-sonnet-5-5-low'
            : 'gpt-oss-120b-medium';
    }
  }

  // Kiểm tra danh mục thực tế của agy (nếu máy có danh mục riêng) để bảo đảm model tồn tại.
  const available = modelsOf(input.catalog, 'agy');
  if (available.length > 0 && !findModelInfo(available, targetSlug)) {
    const base = targetMeta?.baseId;
    const foundBase = base ? findModelInfo(available, base)?.info : undefined;
    if (foundBase?.variants) {
      const eff = targetMeta?.effort ?? 'medium';
      targetSlug = foundBase.variants[eff] ?? Object.values(foundBase.variants)[0] ?? foundBase.id;
    } else {
      const fallback = available[0]!;
      targetSlug = fallback.variants?.low && classified.complexity === 'low'
        ? fallback.variants.low
        : fallback.variants?.medium ?? fallback.id;
    }
  }

  const finalMeta = AGY_MODEL_VARIANTS.find((v) => v.slug === targetSlug);
  const effort: Effort = finalMeta?.effort ?? findModelInfo(available, targetSlug)?.effort ?? 'medium';
  const choice: ModelChoice = { backend: 'agy', model: targetSlug };
  return {
    choice,
    effort,
    taskKind: classified.kind,
    label: formatModelChoiceLabel(choice, effort, input.catalog),
  };
}
