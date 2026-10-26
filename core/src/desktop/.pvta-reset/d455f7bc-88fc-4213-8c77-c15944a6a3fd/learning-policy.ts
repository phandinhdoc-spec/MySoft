import { randomUUID, createHash } from "node:crypto";
import { canonical, fail } from "./learning-schema.js";
import {
  validateLearningRegistry,
  type Actor,
  type LearningRegistry,
  type LearningRef,
  type LearningScope,
  type LearningGroup,
  type LearningRecord,
  type LearningLesson,
  type LearningRule,
  type LearningSkill,
  type LearningSource,
} from "./learning-registry.js";

export type Resource = LearningLesson | LearningRule | LearningSkill;
export type ResourceRef = LearningRef & { kind: "lesson" | "rule" | "skill" };
/** Supplied by the application, never by model output or imported JSON. Fail closed by default. */
export interface LearningContext {
  now: string;
  groups: LearningGroup[];
  researchSubtype?: "legal" | "news" | "professional";
  projectId?: string | null;
  chatId?: string;
  workflowId?: string;
  planId?: string;
  canAccess(scope: LearningScope): boolean;
  sourceAvailable(source: LearningSource): boolean;
  /** Fresh verification for this invocation, not a persisted "verified" flag. */
  verifiedSourceIds?: ReadonlySet<string>;
  blockedRefs?: ReadonlySet<string>;
  readArtifact(skill: LearningSkill): string | null;
}
export const refKey = (ref: LearningRef) =>
  `${ref.kind}:${ref.id}:${ref.revision}`;
export const resourceHash = (body: string) =>
  createHash("sha256").update(body).digest("hex");
export function records(
  r: LearningRegistry,
  kind: ResourceRef["kind"],
): Resource[] {
  return kind === "lesson" ? r.lessons : kind === "rule" ? r.rules : r.skills;
}
export function resource(r: LearningRegistry, ref: ResourceRef): Resource {
  return (
    records(r, ref.kind).find(
      (x) => x.id === ref.id && x.revision === ref.revision,
    ) ?? fail("MISSING_REF", refKey(ref), "Không tìm thấy phiên bản")
  );
}
function scopeMatches(scope: LearningScope, c: LearningContext): boolean {
  if (!c.canAccess(scope)) return false;
  switch (scope.kind) {
    case "global":
      return true;
    case "project":
      return scope.projectId === c.projectId;
    case "chat":
      return (
        scope.chatId === c.chatId && scope.projectId === (c.projectId ?? null)
      );
    case "workflow":
      return (
        scope.workflowId === c.workflowId &&
        scope.projectId === (c.projectId ?? null)
      );
    case "plan":
      return (
        scope.planId === c.planId &&
        scope.chatId === c.chatId &&
        scope.projectId === (c.projectId ?? null)
      );
    case "unresolved":
      return false;
  }
}
export function recordEvent(
  r: LearningRegistry,
  ref: ResourceRef,
  actor: Actor,
  at: string,
  action: string,
  fromStatus: LearningRecord["review"]["status"] | null,
  toStatus: LearningRecord["review"]["status"],
  reason: string,
  transactionId = randomUUID(),
) {
  r.events.push({
    id: randomUUID(),
    sequence: r.events.length + 1,
    transactionId,
    actor,
    at,
    action,
    target: ref,
    fromStatus,
    toStatus,
    reason,
    relatedRefs: [],
  });
}
/** Returns the first actionable denial. Both direct skill reads and automatic prompts use this gate. */
export function learningDenial(
  r: LearningRegistry,
  ref: ResourceRef,
  c: LearningContext,
  mode: "use" | "approve" | "activate" = "use",
  visiting = new Set<string>(),
): string | null {
  const x = resource(r, ref),
    key = refKey(ref);
  if (visiting.has(key)) return "DEPENDENCY_CYCLE";
  const seen = new Set(visiting).add(key);
  if (!Number.isFinite(Date.parse(c.now))) return "INVALID_TIME";
  if (
    records(r, ref.kind).some((y) => y.id === x.id && y.revision > x.revision)
  )
    return "SUPERSEDED";
  if (x.classification.state !== "classified") return "UNCLASSIFIED";
  if (!scopeMatches(x.scope, c)) return "SCOPE";
  const groups = x.classification.groupIds.map(
    (id) =>
      r.groups
        .filter((g) => g.id === id)
        .sort((a, b) => b.revision - a.revision)[0],
  );
  if (
    groups.some((g) => !g?.enabled) ||
    !x.classification.groupIds.some((g) => c.groups.includes(g))
  )
    return "GROUP";
  if (
    x.classification.groupIds.includes("research") &&
    x.classification.researchSubtype !== c.researchSubtype
  )
    return "SUBTYPE";
  if (!x.reviewDueAt || Date.parse(x.reviewDueAt) <= Date.parse(c.now))
    return "REVIEW_DUE";
  const interval = Math.min(
    ...groups.map((g) => g!.policy.reviewIntervalDays),
    x.classification.researchSubtype === "news"
      ? 1
      : x.classification.researchSubtype === "legal"
        ? 30
        : Infinity,
  );
  if (Date.parse(x.reviewDueAt) > Date.parse(x.createdAt) + interval * 86400000)
    return "REVIEW_INTERVAL";
  if (c.blockedRefs?.has(key)) return "CONFLICT";
  if (mode === "use" && x.review.status !== "active") return "NOT_ACTIVE";
  if (
    mode === "activate" &&
    !["approved", "suspended"].includes(x.review.status)
  )
    return "NOT_APPROVED";
  if (mode === "approve" && x.review.status !== "proposed")
    return "NOT_PROPOSED";
  if (
    mode !== "approve" &&
    (!x.review.approval ||
      x.review.approval.revision !== x.revision ||
      canonical(x.review.approval.scope) !== canonical(x.scope) ||
      canonical([...x.review.approval.groupIds].sort()) !==
        canonical([...x.classification.groupIds].sort()))
  )
    return "APPROVAL";
  const sources = x.sourceIds.map((id) => r.sources.find((s) => s.id === id));
  if (
    !sources.length ||
    sources.some(
      (s) =>
        !s ||
        !c.sourceAvailable(s) ||
        groups.some((g) => !g!.allowedSourceKinds.includes(s.kind)),
    )
  )
    return "SOURCE";
  const evidence = x.evidenceIds.map((id) =>
    r.evidence.find((e) => e.id === id),
  );
  if (
    evidence.some((e) => !e || e.result === "failed") ||
    !evidence.some(
      (e) =>
        e?.result === "passed" &&
        e.verifiedBy?.kind !== "model" &&
        e.kind !== "legacy_capture" &&
        e.verifiedAt &&
        Date.parse(e.verifiedAt) <= Date.parse(c.now),
    )
  )
    return "EVIDENCE";
  if (
    "claimKind" in x &&
    x.claimKind === "execution" &&
    !evidence.some(
      (e) =>
        e?.kind === "artifact_check" &&
        e.result === "passed" &&
        e.verifiedBy?.kind !== "model",
    )
  )
    return "EXECUTION_UNVERIFIED";
  if (
    "claimKind" in x &&
    x.claimKind === "factual" &&
    x.classification.groupIds.includes("research")
  ) {
    if (
      !sources.some(
        (s) =>
          s?.kind === "web_document" &&
          s.locator.readState === "full" &&
          s.locator.sourceClass === "primary",
      )
    )
      return "FULL_SOURCE_REQUIRED";
    if (
      sources.some(
        (s) =>
          s?.kind === "web_document" &&
          ((s.locator.effectiveFrom &&
            Date.parse(String(s.locator.effectiveFrom)) > Date.parse(c.now)) ||
            (s.locator.effectiveTo &&
              Date.parse(String(s.locator.effectiveTo)) <= Date.parse(c.now))),
      )
    )
      return "SOURCE_EXPIRED";
    if (
      ["legal", "news"].includes(x.classification.researchSubtype!) &&
      sources.some((s) => !c.verifiedSourceIds?.has(s!.id))
    )
      return "VERIFY_EACH_USE";
  }
  if ("lessonRefs" in x)
    for (const dep of [
      ...x.lessonRefs,
      ...("dependencyRefs" in x ? x.dependencyRefs : []),
    ]) {
      if (dep.kind === "group") return "DEPENDENCY";
      if (learningDenial(r, dep as ResourceRef, c, "use", seen))
        return "DEPENDENCY";
    }
  if (
    "conflictKey" in x &&
    x.conflictKey &&
    r.rules.some(
      (y) =>
        y.id !== x.id &&
        y.conflictKey === x.conflictKey &&
        y.text !== x.text &&
        ["approved", "active"].includes(y.review.status) &&
        scopeMatches(y.scope, c) &&
        y.classification.groupIds.some((g) => c.groups.includes(g)) &&
        records(r, "rule").every(
          (z) => z.id !== y.id || z.revision <= y.revision,
        ),
    )
  )
    return "CONFLICT";
  if (mode === "use" && "bodyMarkdown" in x) {
    const body = c.readArtifact(x);
    if (
      body === null ||
      resourceHash(body) !== x.review.activation?.artifactHash ||
      body !== x.bodyMarkdown
    )
      return "ARTIFACT_HASH";
  }
  return null;
}
export function selectLearning(
  r: LearningRegistry,
  c: LearningContext,
  explicit?: ResourceRef,
) {
  validateLearningRegistry(r);
  const selected: { ref: ResourceRef; content: string }[] = [],
    denied: { ref: ResourceRef; reason: string }[] = [];
  const candidates = explicit
    ? [{ ref: explicit, item: resource(r, explicit) }]
    : [
        ...r.rules
          .filter((x) => x.trigger === "automatic")
          .map((item) => ({
            ref: {
              kind: "rule" as const,
              id: item.id,
              revision: item.revision,
            },
            item,
          })),
        ...r.skills.map((item) => ({
          ref: { kind: "skill" as const, id: item.id, revision: item.revision },
          item,
        })),
      ];
  for (const { ref, item } of candidates) {
    const reason = learningDenial(r, ref, c);
    if (reason) denied.push({ ref, reason });
    else
      selected.push({
        ref,
        content:
          "text" in item
            ? item.text
            : "bodyMarkdown" in item
              ? item.bodyMarkdown
              : item.statement,
      });
  }
  return { selected, denied };
}

export type ReviewAction =
  "approve" | "activate" | "suspend" | "reject" | "archive";
export interface ReviewAuthority {
  actor: Actor;
  context: LearningContext;
  canReview(scope: LearningScope): boolean;
}
export function transitionLearning(
  r: LearningRegistry,
  ref: ResourceRef,
  action: ReviewAction,
  auth: ReviewAuthority,
  reason: string,
  materialize: (skill: LearningSkill) => string,
) {
  const x = resource(r, ref),
    from = x.review.status,
    at = auth.context.now;
  if (auth.actor.kind !== "user" || !auth.actor.id || !auth.canReview(x.scope))
    fail(
      "REVIEW_AUTH",
      refKey(ref),
      "Cần người dùng có quyền trong phạm vi này",
    );
  if (from === "archived" || (from === "rejected" && action !== "archive"))
    fail("TERMINAL_REVIEW", refKey(ref), "Tạo phiên bản mới để xét lại");
  if (action === "approve" || action === "activate") {
    const denial = learningDenial(r, ref, auth.context, action);
    if (denial)
      fail(
        denial,
        refKey(ref),
        "Chưa đủ điều kiện; giữ nguyên phiên bản đang lưu",
      );
  }
  if (action === "approve")
    x.review = {
      status: "approved",
      approval: {
        revision: x.revision,
        by: auth.actor.id,
        at,
        groupIds: [...x.classification.groupIds],
        scope: structuredClone(x.scope),
      },
      activation: null,
    };
  else if (action === "activate") {
    const artifactHash = "bodyMarkdown" in x ? materialize(x) : null;
    x.review.status = "active";
    x.review.activation = {
      revision: x.revision,
      at,
      basis: "approval",
      artifactHash,
    };
  } else
    x.review.status =
      action === "suspend"
        ? "suspended"
        : action === "reject"
          ? "rejected"
          : "archived";
  recordEvent(r, ref, auth.actor, at, action, from, x.review.status, reason);
}

/** Edits and restores copy payload into a new proposed revision; approval is never inherited. */
export function reviseLearning(
  r: LearningRegistry,
  ref: ResourceRef,
  replacement: Resource,
  actor: Actor,
  at: string,
  restore = false,
): ResourceRef {
  const current = resource(r, ref);
  if (
    records(r, ref.kind).some(
      (x) => x.id === ref.id && x.revision > ref.revision,
    )
  )
    fail("STALE_REVISION", refKey(ref), "Đọc lại phiên bản hiện hành");
  const transactionId = randomUUID();
  if (["active", "approved"].includes(current.review.status)) {
    const from = current.review.status;
    current.review.status = "suspended";
    recordEvent(
      r,
      ref,
      actor,
      at,
      "suspend",
      from,
      "suspended",
      "Có phiên bản mới cần duyệt",
      transactionId,
    );
  }
  const next = structuredClone(replacement);
  Object.assign(next, {
    id: current.id,
    revision: current.revision + 1,
    previousRevision: current.revision,
    createdAt: at,
    createdBy: actor,
    review: { status: "proposed", approval: null, activation: null },
    legacyRef: null,
  });
  records(r, ref.kind).push(next);
  const nextRef = { kind: ref.kind, id: next.id, revision: next.revision };
  recordEvent(
    r,
    nextRef,
    actor,
    at,
    restore ? "restore" : "revise",
    null,
    "proposed",
    restore
      ? `Phục hồi nội dung revision ${replacement.revision}; cần duyệt lại`
      : "Đề xuất cập nhật",
    transactionId,
  );
  return nextRef;
}
