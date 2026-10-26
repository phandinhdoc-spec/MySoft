import { randomUUID } from "node:crypto";
import type {
  Actor,
  LearningRegistry,
  LearningRecord,
  LearningLesson,
  LearningRule,
  LearningSkill,
  LearningSource,
  LearningEvidence,
  LearningScope,
} from "./learning-registry.js";
import { recordEvent, type ResourceRef } from "./learning-policy.js";
import type { LearningSignal } from "./learning-signals.js";
import { canonical, fail } from "./learning-schema.js";

/** Versioned catalog; importing it creates proposals, never evidence or approval. */
export const learningFoundations = [
  {
    id: "chat",
    group: "chat",
    subtype: null,
    title: "Sở thích hội thoại",
    days: 180,
    rule: "Chỉ học sở thích từ lời người dùng có nguồn; áp dụng trong phạm vi đã duyệt, ưu tiên yêu cầu hiện tại.",
    steps: [
      "Đọc lời sửa hoặc yêu cầu của người dùng và ghi vị trí nguồn.",
      "Tách sở thích khỏi nội dung tài liệu và lời AI; chưa rõ thì giữ chờ phân loại.",
      "Đề xuất cách diễn đạt với phạm vi cụ thể. Hoàn thành khi có nguồn, giới hạn và nội dung để người dùng duyệt.",
    ],
  },
  {
    id: "workflow",
    group: "workflow",
    subtype: null,
    title: "Thiết kế và phục hồi quy trình",
    days: 90,
    rule: "Phân biệt thiết kế và chạy thật; kiểm checkpoint, đầu ra và tác động đã xảy ra trước khi thử lại; không mở rộng dữ liệu riêng.",
    steps: [
      "Xác định đầu vào, đầu ra, quyền truy cập và tiêu chí kiểm định từng nút.",
      "Chia nút theo trách nhiệm, nối phụ thuộc và chỉ rõ điều kiện dừng khi lỗi.",
      "Trước chạy lại, đối chiếu checkpoint và tệp đã sinh để tránh lặp tác động.",
      "Chỉ báo kết quả đã kiểm tra bằng bằng chứng chạy và artifact; kết thúc bằng phần đạt, lỗi và việc còn thiếu.",
    ],
  },
  {
    id: "planning",
    group: "planning",
    subtype: null,
    title: "Lập kế hoạch có kiểm định",
    days: 90,
    rule: "Tách dữ kiện với giả định, duyệt kế hoạch với cho phép chạy, đầu ra dự kiến với kết quả thực tế; nêu rõ phần chưa xác minh.",
    steps: [
      "Khảo sát dữ kiện, ràng buộc và nguồn lực; ghi riêng giả định cần xác minh.",
      "Chia bước có đầu vào, đầu ra, phụ thuộc, trách nhiệm và tiêu chí hoàn thành.",
      "Phản biện tính khả thi, rủi ro và phương án phục hồi; cập nhật phần thiếu.",
      "Kết thúc bằng kế hoạch để duyệt. Chỉ chuyển sang thực thi khi có yêu cầu cho phép chạy.",
    ],
  },
  {
    id: "research-legal",
    group: "research",
    subtype: "legal",
    title: "Đối chiếu văn bản pháp luật",
    days: 30,
    rule: "Lưu nguồn gốc, phiên bản, ngày kiểm tra và hiệu lực văn bản; xác minh lại dữ kiện pháp lý mỗi lần dùng, đọc đủ phần liên quan.",
    steps: [
      "Xác định vấn đề, thời điểm áp dụng và phạm vi pháp lý.",
      "Tìm nguồn ban hành; đọc toàn văn phần liên quan và văn bản sửa đổi, thay thế.",
      "Đối chiếu hiệu lực, phiên bản và trích dẫn vị trí; đoạn tìm kiếm chỉ giúp định vị.",
      "Hoàn thành khi mỗi kết luận có nguồn và ngày kiểm tra; nêu xung đột hoặc giới hạn chưa xác minh.",
    ],
  },
  {
    id: "research-news",
    group: "research",
    subtype: "news",
    title: "Kiểm chứng tin tức",
    days: 1,
    rule: "Phân biệt ngày đăng và ngày sự kiện; đối chiếu nguồn sơ cấp, xác minh lại mỗi lần dùng; không coi snippet là toàn văn.",
    steps: [
      "Xác định sự kiện và mốc thời gian cần tra.",
      "Tìm nguồn sơ cấp và đọc bài gốc; tách thông tin xác nhận với nhận định.",
      "Đối chiếu ngày sự kiện, ngày đăng và cập nhật; giữ riêng thông tin mâu thuẫn.",
      "Kết thúc bằng kết luận có liên kết, ngày kiểm tra và phần chưa được xác nhận.",
    ],
  },
  {
    id: "research-professional",
    group: "research",
    subtype: "professional",
    title: "Tra cứu tài liệu chuyên môn",
    days: 90,
    rule: "Đọc tài liệu gốc, ghi phiên bản và ngày kiểm tra; phân biệt kết quả nguồn với suy luận và kiểm lại thông tin có thể thay đổi.",
    steps: [
      "Xác định câu hỏi và phiên bản tài liệu cần đối chiếu.",
      "Tìm tài liệu gốc; đọc phương pháp, kết quả và giới hạn trong phạm vi câu hỏi.",
      "So sánh các nguồn, ghi rõ phiên bản, vị trí và ngày kiểm tra.",
      "Hoàn thành khi kết luận truy nguyên được; đánh dấu suy luận và nội dung cần kiểm chứng thêm.",
    ],
  },
] as const;

export interface ProposalOrigin {
  source: LearningSource;
  evidence: LearningEvidence[];
  scope: LearningScope;
}
function addOrigin(r: LearningRegistry, origin: ProposalOrigin) {
  for (const [items, incoming] of [
    [r.sources, [origin.source]],
    [r.evidence, origin.evidence],
  ] as const) {
    for (const row of incoming) {
      const old = items.find((x) => x.id === row.id);
      if (old && canonical(old) !== canonical(row))
        fail("SOURCE_CONFLICT", row.id, "Nguồn bất biến đã có nội dung khác");
      if (!old)
        (items as (LearningSource | LearningEvidence)[]).push(
          structuredClone(row),
        );
    }
  }
  if (origin.evidence.some((e) => e.sourceId !== origin.source.id))
    fail("EVIDENCE_SOURCE", "", "Bằng chứng không thuộc nguồn");
}
function base(
  origin: ProposalOrigin,
  classification: LearningRecord["classification"],
  actor: Actor,
  now: string,
  due: string | null,
  extensions: Record<string, unknown>,
): LearningRecord {
  return {
    id: randomUUID(),
    revision: 1,
    previousRevision: null,
    createdAt: now,
    createdBy: actor,
    classification,
    scope: structuredClone(origin.scope),
    sourceIds: [origin.source.id],
    evidenceIds: origin.evidence.map((e) => e.id),
    review: { status: "proposed", approval: null, activation: null },
    reviewDueAt: due,
    supersedes: [],
    legacyRef: null,
    extensions,
  };
}
function append(
  r: LearningRegistry,
  lesson: LearningLesson,
  rule: LearningRule,
  skill?: LearningSkill,
): ResourceRef[] {
  r.lessons.push(lesson);
  r.rules.push(rule);
  if (skill) r.skills.push(skill);
  const refs: ResourceRef[] = [
    { kind: "lesson", id: lesson.id, revision: 1 },
    { kind: "rule", id: rule.id, revision: 1 },
    ...(skill ? [{ kind: "skill" as const, id: skill.id, revision: 1 }] : []),
  ];
  const transactionId = randomUUID();
  for (const ref of refs)
    recordEvent(
      r,
      ref,
      lesson.createdBy,
      lesson.createdAt,
      "create",
      null,
      "proposed",
      "Đề xuất cần duyệt riêng",
      transactionId,
    );
  return refs;
}
/** Must run inside LearningStore.transaction. Source is a real user request supplied by the host. */
export function proposeFoundation(
  r: LearningRegistry,
  id: (typeof learningFoundations)[number]["id"],
  origin: ProposalOrigin,
  actor: Actor,
  now: string,
): ResourceRef[] {
  const spec =
    learningFoundations.find((x) => x.id === id) ??
    fail("FOUNDATION", "", "Không có mẫu nền");
  const marker = {
    id,
    version: 1,
    sourceId: origin.source.id,
    scope: origin.scope,
  };
  const existing = r.lessons.find(
    (x) => canonical(x.extensions["pvta:foundation"]) === canonical(marker),
  );
  if (existing)
    return [
      { kind: "lesson", id: existing.id, revision: existing.revision },
      ...r.rules
        .filter((x) => x.lessonRefs.some((y) => y.id === existing.id))
        .map((x) => ({
          kind: "rule" as const,
          id: x.id,
          revision: x.revision,
        })),
      ...r.skills
        .filter((x) => x.lessonRefs.some((y) => y.id === existing.id))
        .map((x) => ({
          kind: "skill" as const,
          id: x.id,
          revision: x.revision,
        })),
    ];
  addOrigin(r, origin);
  const common = () =>
    base(
      origin,
      {
        state: "classified",
        groupIds: [spec.group],
        researchSubtype: spec.subtype,
        reason: "Bộ nền theo yêu cầu, cần duyệt trước khi dùng",
      },
      actor,
      now,
      new Date(Date.parse(now) + spec.days * 86400000).toISOString(),
      { "pvta:foundation": marker },
    );
  const lesson: LearningLesson = {
    ...common(),
    title: spec.title,
    statement: spec.rule,
    claimKind: "procedure",
    limitations: [
      "Nội dung nền là đề xuất quy trình; không chứng nhận kết quả thực thi.",
    ],
    relatedLessonRefs: [],
  };
  const lessonRefs: ResourceRef[] = [
    { kind: "lesson", id: lesson.id, revision: 1 },
  ];
  const name = `learning-${id}`;
  const rule: LearningRule = {
    ...common(),
    title: spec.title,
    key: name,
    text: spec.rule,
    lessonRefs,
    conflictKey: name,
    trigger: "automatic",
  };
  const skill: LearningSkill = {
    ...common(),
    name,
    description: spec.title,
    bodyMarkdown: `---\nname: ${name}\ndescription: ${spec.title}; dùng trong nhóm và phạm vi đã duyệt.\n---\n\n# ${spec.title}\n\n${spec.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n`,
    lessonRefs,
    dependencyRefs: [],
    artifact: { relativePath: `${name}/SKILL.md`, expectedExistingHash: null },
  };
  const refs = append(r, lesson, rule, skill);
  const group = r.groups
    .filter((g) => g.id === spec.group)
    .sort((a, b) => b.revision - a.revision)[0]!;
  r.groups.push({
    ...structuredClone(group),
    revision: group.revision + 1,
    previousRevision: group.revision,
    updatedAt: now,
    skillRefs: [...group.skillRefs, refs[2]!],
    ruleRefs: [...group.ruleRefs, refs[1]!],
  });
  r.events.push({
    id: randomUUID(),
    sequence: r.events.length + 1,
    transactionId: randomUUID(),
    at: now,
    actor,
    action: "group_update",
    target: { kind: "group", id: group.id, revision: group.revision + 1 },
    fromStatus: null,
    toStatus: null,
    reason: "Thêm tài nguyên nền vào danh mục; chưa cấp quyền áp dụng",
    relatedRefs: refs,
  });
  return refs;
}

/** A resolver supplies verified locators from application objects; missing metadata stays in the inbox. */
export function importSignalProposal(
  r: LearningRegistry,
  signal: LearningSignal,
  resolve: (signal: LearningSignal) => ProposalOrigin | null,
  now: string,
): { status: "waiting" | "imported"; refs: ResourceRef[] } {
  const marker = {
    inboxId: signal.id,
    key: signal.key,
    sourceVersion: signal.sourceVersion ?? null,
  };
  const old = r.lessons.find(
    (x) => canonical(x.extensions["pvta:signal"]) === canonical(marker),
  );
  if (old)
    return {
      status: "imported",
      refs: [
        { kind: "lesson", id: old.id, revision: old.revision },
        ...r.rules
          .filter((x) => x.lessonRefs.some((y) => y.id === old.id))
          .map((x) => ({
            kind: "rule" as const,
            id: x.id,
            revision: x.revision,
          })),
      ],
    };
  if (
    !signal.proposal ||
    signal.status !== "processed" ||
    signal.group === "unclassified" ||
    (signal.group === "research" && !signal.researchSubtype)
  )
    return { status: "waiting", refs: [] };
  const origin = resolve(signal);
  if (!origin || origin.scope.kind === "unresolved")
    return { status: "waiting", refs: [] };
  const s = origin.source;
  const matches =
    signal.kind === "feedback"
      ? s.kind === "user_feedback" && s.locator.chatId === signal.chatId
      : signal.kind === "draft"
        ? (signal.group === "workflow" &&
            s.kind === "workflow_design" &&
            s.locator.workflowId === signal.workflowId) ||
          (signal.group === "planning" &&
            s.kind === "plan_revision" &&
            s.locator.planId === signal.planId)
        : signal.kind === "execution"
          ? s.kind === "workflow_run" &&
            s.locator.workflowId === signal.workflowId &&
            s.locator.runId === signal.runId &&
            s.locator.stepId === signal.stepId &&
            s.locator.outcome === signal.outcome
          : s.kind === "web_document" &&
            (signal.kind !== "search" || s.locator.readState === "snippet");
  if (!matches) return { status: "waiting", refs: [] };
  addOrigin(r, origin);
  const actor: Actor = { kind: "system", id: "signal-adapter" };
  const common = () =>
    base(
      origin,
      {
        state: "classified",
        groupIds: [signal.group],
        researchSubtype: signal.researchSubtype ?? null,
        reason: "Phân loại từ ngữ cảnh ứng dụng",
      },
      actor,
      now,
      null,
      { "pvta:signal": marker },
    );
  const lesson: LearningLesson = {
    ...common(),
    title: "Đề xuất từ tín hiệu",
    statement: signal.proposal.rule,
    claimKind: "procedure",
    limitations: [
      "Quan sát chưa đủ chứng nhận kết quả; cần rà soát nguồn, bằng chứng và hạn trước khi duyệt.",
    ],
    relatedLessonRefs: [],
  };
  const rule: LearningRule = {
    ...common(),
    key: `signal-${signal.id}`,
    title: lesson.title,
    text: signal.proposal.rule,
    lessonRefs: [{ kind: "lesson", id: lesson.id, revision: 1 }],
    conflictKey: null,
    trigger: "automatic",
  };
  return { status: "imported", refs: append(r, lesson, rule) };
}
