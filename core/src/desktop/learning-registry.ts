import {
  canonical,
  fail,
  learningRegistrySchema,
  validateSchema,
} from "./learning-schema.js";

export type LearningGroup =
  "chat" | "workflow" | "research" | "planning" | "unclassified";
export type ReviewStatus =
  "proposed" | "approved" | "active" | "suspended" | "rejected" | "archived";
export type Actor = { kind: "user" | "model" | "system"; id: string };
export type LearningRef = {
  kind: "lesson" | "skill" | "rule" | "group";
  id: string;
  revision: number;
};
export type LearningScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "chat"; chatId: string; projectId: string | null }
  | { kind: "workflow"; workflowId: string; projectId: string | null }
  | { kind: "plan"; planId: string; chatId: string; projectId: string | null }
  | { kind: "unresolved"; reason: string };
export type LegacyRef = { store: string; kind: string; id: string };
export interface LearningRecord {
  id: string;
  revision: number;
  previousRevision: number | null;
  createdAt: string;
  createdBy: Actor;
  classification: {
    state: "classified" | "unclassified";
    groupIds: LearningGroup[];
    researchSubtype: "legal" | "news" | "professional" | null;
    reason: string;
  };
  scope: LearningScope;
  sourceIds: string[];
  evidenceIds: string[];
  review: {
    status: ReviewStatus;
    approval: null | {
      revision: number;
      by: string;
      at: string;
      groupIds: LearningGroup[];
      scope: LearningScope;
    };
    activation: null | {
      revision: number;
      at: string;
      basis: "approval" | "legacy";
      artifactHash: string | null;
    };
  };
  reviewDueAt: string | null;
  supersedes: LearningRef[];
  legacyRef: LegacyRef | null;
  extensions: Record<string, unknown>;
}
export interface LearningLesson extends LearningRecord {
  title: string;
  statement: string;
  claimKind: "preference" | "procedure" | "factual" | "execution";
  limitations: string[];
  relatedLessonRefs: LearningRef[];
}
export interface LearningRule extends LearningRecord {
  key: string;
  title: string;
  text: string;
  lessonRefs: LearningRef[];
  conflictKey: string | null;
  trigger: "automatic" | "explicit";
}
export interface LearningSkill extends LearningRecord {
  name: string;
  description: string;
  bodyMarkdown: string;
  lessonRefs: LearningRef[];
  dependencyRefs: LearningRef[];
  artifact: { relativePath: string; expectedExistingHash: string | null };
}
export interface LearningGroupRecord {
  id: LearningGroup;
  revision: number;
  previousRevision: number | null;
  title: string;
  enabled: boolean;
  allowedSourceKinds: string[];
  skillRefs: LearningRef[];
  ruleRefs: LearningRef[];
  policy: {
    reviewRequired: true;
    reviewIntervalDays: number;
    verifyEachUse: boolean;
  };
  updatedAt: string;
}
export interface LearningSource {
  id: string;
  kind: string;
  capturedAt: string;
  locator: Record<string, unknown>;
  version: string | null;
  excerpt: string;
  privacy: { redacted: boolean; exportable: boolean };
}
export interface LearningEvidence {
  id: string;
  sourceId: string;
  kind: string;
  claim: string;
  locator: Record<string, unknown>;
  result: "passed" | "failed" | "unverified";
  verifiedAt: string | null;
  verifiedBy: Actor | null;
  method: string;
}
export interface LearningEvent {
  id: string;
  sequence: number;
  transactionId: string;
  at: string;
  actor: Actor;
  action: string;
  target: LearningRef;
  fromStatus: ReviewStatus | null;
  toStatus: ReviewStatus | null;
  reason: string;
  relatedRefs: LearningRef[];
}
export interface LearningRegistry {
  schemaVersion: 1;
  registryId: string;
  generation: number;
  groups: LearningGroupRecord[];
  lessons: LearningLesson[];
  skills: LearningSkill[];
  rules: LearningRule[];
  sources: LearningSource[];
  evidence: LearningEvidence[];
  events: LearningEvent[];
  migration: null | {
    migrationId: string;
    sourceFingerprint: string;
    completedAt: string;
    mapping: {
      legacyRef: LegacyRef;
      id: string;
      kind: "lesson" | "skill" | "rule";
    }[];
  };
}
export const LEARNING_MAX_BYTES = 10 * 1024 * 1024;
export function parseLearningJson(raw: string): unknown {
  if (Buffer.byteLength(raw) > LEARNING_MAX_BYTES)
    fail("SIZE_LIMIT", "", "JSON vượt 10 MiB");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("INVALID_JSON", "", "JSON không hợp lệ; giữ nguyên nguồn");
  }
  const walk = (v: unknown, depth: number): void => {
    if (depth > 32) fail("DEPTH_LIMIT", "", "JSON vượt độ sâu 32");
    if (v && typeof v === "object")
      for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(value, 0);
  return value;
}
const key = (r: LearningRef) => `${r.kind}:${r.id}:${r.revision}`;
export function validateLearningRegistry(value: unknown): LearningRegistry {
  // Object callers obey the same byte/depth limits as JSON imports.
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail("INVALID_JSON", "", "Dữ liệu không tuần tự hóa được");
  }
  parseLearningJson(serialized!);
  validateSchema(value, learningRegistrySchema);
  const r = value as LearningRegistry;
  const count =
    r.groups.length +
    r.lessons.length +
    r.skills.length +
    r.rules.length +
    r.sources.length +
    r.evidence.length +
    r.events.length;
  if (count > 10000) fail("RECORD_LIMIT", "", "Kho vượt 10.000 bản ghi");
  const refs = new Map<string, unknown>();
  const entries = (
    [
      ["group", r.groups],
      ["lesson", r.lessons],
      ["skill", r.skills],
      ["rule", r.rules],
    ] as const
  ).flatMap(([kind, items]) =>
    items.map((item, i) => ({
      kind,
      item,
      p: `/${kind === "group" ? "groups" : kind === "lesson" ? "lessons" : kind === "skill" ? "skills" : "rules"}/${i}`,
    })),
  );
  for (const { kind, item, p } of entries) {
    const k = key({ kind, ...item });
    if (refs.has(k)) fail("DUPLICATE_REVISION", p, k);
    refs.set(k, item);
  }
  for (const { kind, item, p } of entries) {
    if (
      item.previousRevision !== (item.revision === 1 ? null : item.revision - 1)
    )
      fail("REVISION_CHAIN", p, "previousRevision sai");
    if (
      item.previousRevision &&
      !refs.has(key({ kind, id: item.id, revision: item.previousRevision }))
    )
      fail("REVISION_CHAIN", p, "Thiếu revision trước");
  }
  const requireRef = (
    ref: LearningRef,
    p: string,
    kind?: LearningRef["kind"],
  ) => {
    if (kind && ref.kind !== kind) fail("REF_KIND", p, "Sai loại tham chiếu");
    if (!refs.has(key(ref))) fail("MISSING_REF", p, key(ref));
  };
  const uniqueIds = (items: { id: string }[], p: string) => {
    const ids = new Set<string>();
    items.forEach((x, i) => {
      if (ids.has(x.id)) fail("DUPLICATE_ID", `${p}/${i}`, x.id);
      ids.add(x.id);
    });
    return ids;
  };
  const sources = uniqueIds(r.sources, "/sources"),
    evidence = uniqueIds(r.evidence, "/evidence");
  uniqueIds(r.events, "/events");
  for (const [i, s] of r.sources.entries()) {
    if (s.version === null && !s.locator.versionReason)
      fail(
        "SOURCE_VERSION",
        `/sources/${i}/locator/versionReason`,
        "Nguồn chưa rõ phiên bản cần lý do",
      );
    const required: Record<string, string[]> = {
      user_feedback: ["chatId", "messageId"],
      user_request: ["chatId", "messageId"],
      workflow_design: ["workflowId", "revision"],
      workflow_run: [
        "workflowId",
        "runId",
        "stepId",
        "outcome",
        "artifactRefs",
      ],
      plan_revision: ["planId", "revision", "chatId"],
      web_document: [
        "url",
        "title",
        "publisher",
        "retrievedAt",
        "verifiedAt",
        "publishedAt",
        "documentVersion",
        "effectiveFrom",
        "effectiveTo",
        "jurisdiction",
        "sourceClass",
        "readState",
      ],
      legacy_snapshot: [
        "migrationId",
        "legacyStore",
        "legacyId",
        "originalStatus",
        "fingerprint",
      ],
    };
    for (const k of required[s.kind] ?? [])
      if (!Object.hasOwn(s.locator, k))
        fail(
          "SOURCE_LOCATOR",
          `/sources/${i}/locator/${k}`,
          "Thiếu vị trí nguồn",
        );
    if (s.kind === "web_document") {
      try {
        if (
          !["https:", "http:"].includes(new URL(String(s.locator.url)).protocol)
        )
          throw Error();
      } catch {
        fail("SOURCE_URL", `/sources/${i}/locator/url`, "Cần URL http/https");
      }
      if (
        !["primary", "secondary", "unknown"].includes(
          String(s.locator.sourceClass),
        ) ||
        !["snippet", "full", "partial"].includes(String(s.locator.readState))
      )
        fail(
          "SOURCE_LOCATOR",
          `/sources/${i}/locator`,
          "Sai loại nguồn/trạng thái đọc",
        );
    }
  }
  r.evidence.forEach((e, i) => {
    if (!sources.has(e.sourceId))
      fail("MISSING_REF", `/evidence/${i}/sourceId`, e.sourceId);
    if (
      e.result === "passed" &&
      (!e.verifiedAt ||
        !e.verifiedBy ||
        (e.verifiedBy.kind === "model" && e.kind === "artifact_check"))
    )
      fail(
        "UNVERIFIED_EVIDENCE",
        `/evidence/${i}`,
        "Chưa có kiểm chứng phù hợp",
      );
  });
  const dependencies = new Map<string, string[]>();
  for (const { kind, item, p } of entries) {
    if (kind === "group") {
      const g = item as LearningGroupRecord;
      g.skillRefs.forEach((x) => requireRef(x, p, "skill"));
      g.ruleRefs.forEach((x) => requireRef(x, p, "rule"));
      continue;
    }
    const x = item as LearningRecord;
    const c = x.classification;
    for (const name of Object.keys(x.extensions))
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*[.:][a-zA-Z0-9_.-]+$/.test(name))
        fail(
          "EXTENSION_NAMESPACE",
          `${p}/extensions`,
          "Extension cần namespace",
        );
    if (
      c.state === "unclassified"
        ? canonical(c.groupIds) !== '["unclassified"]' ||
          c.researchSubtype !== null
        : c.groupIds.includes("unclassified")
    )
      fail("CLASSIFICATION", `${p}/classification`, "Phân nhóm không hợp lệ");
    if (c.groupIds.includes("research") !== (c.researchSubtype !== null))
      fail(
        "RESEARCH_SUBTYPE",
        `${p}/classification`,
        "Nhóm research cần subtype riêng",
      );
    for (const g of c.groupIds)
      if (!r.groups.some((x) => x.id === g)) fail("MISSING_GROUP", p, g);
    for (const id of x.sourceIds)
      if (!sources.has(id)) fail("MISSING_REF", `${p}/sourceIds`, id);
    for (const id of x.evidenceIds) {
      if (!evidence.has(id)) fail("MISSING_REF", `${p}/evidenceIds`, id);
      if (!x.sourceIds.includes(r.evidence.find((e) => e.id === id)!.sourceId))
        fail("EVIDENCE_SOURCE", p, id);
    }
    const links = [...x.supersedes];
    if (kind === "lesson") {
      for (const ref of (item as LearningLesson).relatedLessonRefs)
        requireRef(ref, p, "lesson");
    } else {
      const resource = item as LearningRule | LearningSkill;
      resource.lessonRefs.forEach((ref) => requireRef(ref, p, "lesson"));
      links.push(...resource.lessonRefs);
    }
    if (kind === "skill") {
      const s = item as LearningSkill;
      if (Buffer.byteLength(s.bodyMarkdown) > 64 * 1024)
        fail("SIZE_LIMIT", `${p}/bodyMarkdown`, "Skill vượt 64 KiB");
      if (s.artifact.relativePath !== `${s.name}/SKILL.md`)
        fail(
          "ARTIFACT_PATH",
          `${p}/artifact/relativePath`,
          "Cần đường dẫn tên-skill/SKILL.md",
        );
      for (const ref of s.dependencyRefs) {
        if (!["skill", "rule"].includes(ref.kind))
          fail("REF_KIND", p, "Dependency phải là skill/rule");
        links.push(ref);
      }
    }
    links.forEach((ref) => requireRef(ref, p));
    dependencies.set(key({ kind, ...x }), links.map(key));
    const { status, approval, activation } = x.review;
    if (status === "proposed" && (approval || activation))
      fail(
        "PROPOSED_REVIEW",
        `${p}/review`,
        "Đề xuất không mang quyền duyệt/kích hoạt",
      );
    if (approval) {
      if (approval.revision !== x.revision)
        fail(
          "APPROVAL_REVISION_MISMATCH",
          `${p}/review/approval`,
          "Duyệt sai revision",
        );
      if (
        canonical([...approval.groupIds].sort()) !==
          canonical([...c.groupIds].sort()) ||
        canonical(approval.scope) !== canonical(x.scope)
      )
        fail("APPROVAL_SCOPE_MISMATCH", p, "Duyệt sai nhóm/phạm vi");
    }
    if (activation && activation.revision !== x.revision)
      fail("ACTIVATION_REVISION_MISMATCH", p, "Kích hoạt sai revision");
    if (["approved", "active"].includes(status)) {
      if (
        !x.reviewDueAt ||
        c.state === "unclassified" ||
        x.scope.kind === "unresolved"
      )
        fail("REVIEW_NOT_READY", p, "Thiếu nhóm/phạm vi/hạn rà soát");
      const legacy = activation?.basis === "legacy";
      if (legacy) {
        const m = r.migration;
        if (
          !m ||
          approval ||
          !x.legacyRef ||
          x.revision !== 1 ||
          canonical(c.groupIds) !== '["chat"]' ||
          x.scope.kind !== "global" ||
          status !== "active" ||
          !m.mapping.some(
            (a) =>
              a.id === x.id &&
              a.kind === kind &&
              canonical(a.legacyRef) === canonical(x.legacyRef),
          ) ||
          Date.parse(x.reviewDueAt!) > Date.parse(m.completedAt) + 30 * 86400000
        )
          fail("INVALID_LEGACY", p, "Ngoại lệ cũ không hợp lệ");
        if (
          !x.sourceIds.some((id) =>
            r.sources.some(
              (s) =>
                s.id === id &&
                s.kind === "legacy_snapshot" &&
                s.locator.originalStatus === "active" &&
                s.locator.fingerprint === m.sourceFingerprint,
            ),
          )
        )
          fail("INVALID_LEGACY", p, "Không có bằng chứng active cũ");
      } else {
        if (!approval || !x.sourceIds.length || !x.evidenceIds.length)
          fail("REVIEW_NOT_READY", p, "Thiếu duyệt/nguồn/bằng chứng");
        if (
          !x.evidenceIds.some((id) =>
            r.evidence.some(
              (e) =>
                e.id === id &&
                e.kind !== "legacy_capture" &&
                e.result === "passed",
            ),
          )
        )
          fail("REVIEW_NOT_READY", p, "Chưa có bằng chứng hỗ trợ đã xác minh");
        if (
          !r.events.some(
            (e) =>
              e.action === "approve" &&
              e.target.kind === kind &&
              e.target.id === x.id &&
              e.target.revision === x.revision &&
              e.actor.kind === "user" &&
              e.actor.id === approval!.by &&
              e.at === approval!.at,
          )
        )
          fail("APPROVAL_EVENT", p, "Thiếu sự kiện duyệt tương ứng");
      }
      if (status === "active" && !activation)
        fail("ACTIVATION_REQUIRED", p, "Thiếu kích hoạt");
      if (
        status === "active" &&
        activation?.basis === "approval" &&
        !r.events.some(
          (e) =>
            e.action === "activate" &&
            e.target.kind === kind &&
            e.target.id === x.id &&
            e.target.revision === x.revision &&
            e.at === activation.at &&
            e.actor.kind === "user",
        )
      )
        fail("ACTIVATION_EVENT", p, "Thiếu sự kiện kích hoạt");
      if (status === "active" && kind === "skill" && !activation?.artifactHash)
        fail("ARTIFACT_HASH", p, "Thiếu hash skill");
    }
    const last = r.events
      .filter(
        (e) =>
          e.target.kind === kind &&
          e.target.id === x.id &&
          e.target.revision === x.revision,
      )
      .at(-1);
    if (!last || last.toStatus !== status)
      fail("REVIEW_EVENT", p, "Trạng thái không khớp sự kiện cuối");
    if (
      status === "active" &&
      entries.some(
        (e) =>
          e.kind === kind && e.item.id === x.id && e.item.revision > x.revision,
      )
    )
      fail(
        "SUPERSEDED_ACTIVE",
        p,
        "Revision cũ phải dừng trước khi lưu bản mới",
      );
  }
  const visiting = new Set<string>(),
    done = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail("DEPENDENCY_CYCLE", "", id);
    if (done.has(id)) return;
    visiting.add(id);
    for (const next of dependencies.get(id) ?? []) visit(next);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of dependencies.keys()) visit(id);
  r.events.forEach((e, i) => {
    if (e.sequence !== i + 1)
      fail("EVENT_SEQUENCE", `/events/${i}`, "Sequence phải liên tục");
    requireRef(e.target, `/events/${i}/target`);
    e.relatedRefs.forEach((x) => requireRef(x, `/events/${i}/relatedRefs`));
  });
  if (r.migration) {
    const mapped = new Set<string>();
    for (const [i, m] of r.migration.mapping.entries()) {
      requireRef(
        { kind: m.kind, id: m.id, revision: 1 },
        `/migration/mapping/${i}`,
      );
      const identity = `${m.kind}:${m.id}`;
      if (mapped.has(identity))
        fail("MIGRATION_MAPPING", `/migration/mapping/${i}`, "Ánh xạ trùng");
      mapped.add(identity);
    }
  }
  return r;
}
export function readLearningRegistry(raw: string): LearningRegistry {
  return validateLearningRegistry(parseLearningJson(raw));
}
