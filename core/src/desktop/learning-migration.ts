import crypto from "node:crypto";
import {
  canonical,
  fail,
  learningGroups,
  LearningDataError,
  validateSchema,
} from "./learning-schema.js";
import {
  parseLearningJson,
  validateLearningRegistry,
  type LearningRegistry,
  type LearningRecord,
  type LearningLesson,
  type LegacyRef,
} from "./learning-registry.js";

export const learningHash = (data: string) =>
  crypto.createHash("sha256").update(data).digest("hex");
export interface LegacyLearningBundle {
  state: string;
  queue: string | null;
  skills: Record<string, string>;
}
/** Reject bundles that could be saved but could not be safely restored. */
export function validateLegacyLearningBundle(
  value: unknown,
): asserts value is LegacyLearningBundle {
  validateSchema(value, {
    type: "object",
    required: ["state", "queue", "skills"],
    additionalProperties: false,
    properties: {
      state: { type: "string" },
      queue: { oneOf: [{ type: "string" }, { type: "null" }] },
      skills: { type: "object", additionalProperties: { type: "string" } },
    },
  });
  for (const relative of Object.keys((value as LegacyLearningBundle).skills))
    if (!/^[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(relative))
      fail("UNSAFE_PATH", relative, "Đường dẫn backup không hợp lệ");
}
export interface QuarantinedLearning {
  store: string;
  index: number;
  reason: string;
  raw: unknown;
}
export interface LearningQueueV1 {
  schemaVersion: 1;
  items: {
    chatId: string;
    text: string;
    about: string;
    retries: number;
    kind: "feedback" | "praise" | "habit";
    idempotencyKey: string;
    capturedContext: null;
    sourceIds: string[];
    proposedGroupIds: ["unclassified"];
  }[];
}
export interface LearningMigration {
  registry: LearningRegistry;
  queue: LearningQueueV1;
  quarantine: QuarantinedLearning[];
  backup: LegacyLearningBundle;
  fingerprint: string;
}
const uid = () => crypto.randomUUID();
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const requiredString = (v: Record<string, unknown>, k: string) => {
  if (typeof v[k] !== "string" || !v[k])
    fail("LEGACY_RECORD", `/${k}`, "Thiếu chuỗi");
  return v[k] as string;
};
/** Pure conversion. Never writes source data, creates approvals, or executes a skill. */
export function migrateLearningBundle(
  bundle: LegacyLearningBundle,
  now = new Date().toISOString(),
): LearningMigration {
  validateLegacyLearningBundle(bundle);
  const data = parseLearningJson(bundle.state);
  if (
    !isObject(data) ||
    data.version !== 1 ||
    !Array.isArray(data.learned) ||
    (data.learnedDrafts !== undefined && !Array.isArray(data.learnedDrafts))
  )
    fail("LEGACY_STATE", "", "Không nhận diện state v1");
  const oldQueue = bundle.queue === null ? [] : parseLearningJson(bundle.queue);
  if (!Array.isArray(oldQueue))
    fail("LEGACY_QUEUE", "", "Hàng đợi cũ phải là mảng");
  if (
    data.learned.length +
      ((data.learnedDrafts ?? []) as unknown[]).length +
      oldQueue.length >
    10000
  )
    fail("RECORD_LIMIT", "", "Nguồn chuyển đổi vượt 10.000 bản ghi");
  const fingerprint = learningHash(canonical(bundle)),
    migrationId = `legacy-v1-${fingerprint}`;
  const registry: LearningRegistry = {
    schemaVersion: 1,
    registryId: uid(),
    generation: 1,
    groups: learningGroups.map((id) => ({
      id,
      revision: 1,
      previousRevision: null,
      title: id,
      enabled: id !== "unclassified",
      allowedSourceKinds: [
        "user_feedback",
        "user_request",
        "workflow_design",
        "workflow_run",
        "web_document",
        "plan_revision",
        "legacy_snapshot",
      ],
      skillRefs: [],
      ruleRefs: [],
      policy: {
        reviewRequired: true,
        reviewIntervalDays: id === "chat" ? 180 : 90,
        verifyEachUse: id === "research",
      },
      updatedAt: now,
    })),
    lessons: [],
    rules: [],
    skills: [],
    sources: [],
    evidence: [],
    events: [],
    migration: {
      migrationId,
      sourceFingerprint: fingerprint,
      completedAt: now,
      mapping: [],
    },
  };
  const quarantine: QuarantinedLearning[] = [];
  const queue: LearningQueueV1 = { schemaVersion: 1, items: [] };
  const seen = new Set<string>(),
    names = new Set<string>();
  const transactionId = uid();
  const records = (values: unknown[], kind: "rule" | "skill") =>
    values.forEach((raw, index) => {
      const store = kind === "rule" ? "learned" : "learnedDrafts";
      // Convert into an isolated candidate so one malformed item cannot leave dangling references.
      const candidate = structuredClone(registry);
      try {
        if (!isObject(raw))
          fail("LEGACY_RECORD", "", "Bản ghi không phải object");
        const oldId = requiredString(raw, "id");
        const source = requiredString(raw, "source");
        if (seen.has(`${store}:${oldId}`))
          fail("DUPLICATE_LEGACY_ID", "", "ID cũ trùng");
        if (
          typeof raw.at !== "number" ||
          !Number.isFinite(raw.at) ||
          !Number.isFinite(new Date(raw.at).getTime())
        )
          fail("LEGACY_DATE", "/at", "Thời gian cũ không hợp lệ");
        if (
          raw.status !== undefined &&
          !["proposed", "approved", "active", "rejected"].includes(
            String(raw.status),
          )
        )
          fail("LEGACY_STATUS", "/status", "Trạng thái cũ không hợp lệ");
        const content = requiredString(raw, kind === "rule" ? "rule" : "body");
        const name = kind === "skill" ? requiredString(raw, "name") : "";
        if (kind === "skill" && names.has(name))
          fail("SKILL_COLLISION", "/name", "Tên skill trùng trong dữ liệu cũ");
        const active = raw.status === "active";
        const originalSkill =
          kind === "skill" ? bundle.skills[`${name}/SKILL.md`] : undefined;
        const skillHash =
          originalSkill === undefined ? null : learningHash(originalSkill);
        const skillMatches =
          kind !== "skill" ||
          (typeof raw.existingHash === "string" &&
            skillHash === raw.existingHash);
        const status =
          raw.status === "rejected"
            ? "rejected"
            : active
              ? skillMatches
                ? "active"
                : "suspended"
              : "proposed";
        const legacyRef: LegacyRef = {
          store: "state.json",
          kind: store,
          id: oldId,
        };
        const sourceId = uid();
        candidate.sources.push({
          id: sourceId,
          kind: "legacy_snapshot",
          capturedAt: now,
          locator: {
            migrationId,
            legacyStore: store,
            legacyId: oldId,
            originalStatus: raw.status ?? null,
            fingerprint,
          },
          version: fingerprint,
          excerpt: "",
          privacy: { redacted: true, exportable: false },
        });
        const base: LearningRecord = {
          id: uid(),
          revision: 1,
          previousRevision: null,
          createdAt: new Date(raw.at).toISOString(),
          createdBy: { kind: "system", id: migrationId },
          classification: active
            ? {
                state: "classified",
                groupIds: ["chat"],
                researchSubtype: null,
                reason: "Bảo toàn phạm vi Chat cũ",
              }
            : {
                state: "unclassified",
                groupIds: ["unclassified"],
                researchSubtype: null,
                reason: "Chưa xác minh ngữ cảnh dữ liệu cũ",
              },
          scope: active
            ? { kind: "global" }
            : { kind: "unresolved", reason: "Không suy scope từ chatId nguồn" },
          sourceIds: [sourceId],
          evidenceIds: [],
          review: {
            status,
            approval: null,
            activation:
              status === "active"
                ? {
                    revision: 1,
                    at: now,
                    basis: "legacy",
                    artifactHash: kind === "skill" ? skillHash : null,
                  }
                : null,
          },
          reviewDueAt: active
            ? new Date(Date.parse(now) + 30 * 86400000).toISOString()
            : null,
          supersedes: [],
          legacyRef,
          extensions: {
            "pvta.legacy": { ...raw, source },
            ...(active && !skillMatches
              ? {
                  "pvta.migrationIssue":
                    "Thiếu skill hoặc hash không khớp; chưa được dùng",
                }
              : {}),
          },
        };
        const lesson: LearningLesson = {
          ...structuredClone(base),
          id: uid(),
          title: kind === "rule" ? content : name,
          statement: content,
          claimKind: "preference",
          limitations: [
            "Nguồn cũ được giữ để đối chiếu; không có bằng chứng duyệt mới.",
          ],
          relatedLessonRefs: [],
        };
        candidate.lessons.push(lesson);
        const lessonRefs = [
          { kind: "lesson" as const, id: lesson.id, revision: 1 },
        ];
        if (kind === "rule")
          candidate.rules.push({
            ...base,
            key: `legacy-${base.id}`,
            title: content,
            text: content,
            lessonRefs,
            conflictKey: null,
            trigger: "automatic",
          });
        else
          candidate.skills.push({
            ...base,
            name,
            description: requiredString(raw, "description"),
            bodyMarkdown: content,
            lessonRefs,
            dependencyRefs: [],
            artifact: {
              relativePath: `${name}/SKILL.md`,
              expectedExistingHash: skillHash,
            },
          });
        for (const [recordKind, record] of [
          ["lesson", lesson],
          [kind, base],
        ] as const) {
          candidate.migration!.mapping.push({
            legacyRef,
            id: record.id,
            kind: recordKind,
          });
          candidate.events.push({
            id: uid(),
            sequence: candidate.events.length + 1,
            transactionId,
            at: now,
            actor: { kind: "system", id: migrationId },
            action: "migrate",
            target: { kind: recordKind, id: record.id, revision: 1 },
            fromStatus: null,
            toStatus: status,
            reason: "Chuyển bản ghi cũ; không tạo approval",
            relatedRefs: [],
          });
        }
        validateLearningRegistry(candidate);
        Object.assign(registry, candidate);
        seen.add(`${store}:${oldId}`);
        if (kind === "skill") names.add(name);
      } catch (e) {
        if (!(e instanceof LearningDataError) || e.code === "RECORD_LIMIT")
          throw e;
        quarantine.push({ store, index, reason: e.message, raw });
      }
    });
  records(data.learned as unknown[], "rule");
  records((data.learnedDrafts ?? []) as unknown[], "skill");
  oldQueue.forEach((raw, index) => {
    try {
      if (!isObject(raw))
        fail("LEGACY_QUEUE_ITEM", "", "Mục hàng đợi không phải object");
      const chatId = requiredString(raw, "chatId"),
        text = requiredString(raw, "text");
      if (
        typeof raw.about !== "string" ||
        !Number.isSafeInteger(raw.retries) ||
        (raw.retries as number) < 0
      )
        fail("LEGACY_QUEUE_ITEM", "", "Sai about/retries");
      const kind = raw.kind ?? "feedback";
      if (!["feedback", "praise", "habit"].includes(String(kind)))
        fail("LEGACY_QUEUE_ITEM", "", "Sai kind");
      queue.items.push({
        chatId,
        text,
        about: raw.about,
        retries: raw.retries as number,
        kind: kind as "feedback" | "praise" | "habit",
        idempotencyKey: learningHash(`${fingerprint}:queue:${index}`),
        capturedContext: null,
        sourceIds: [],
        proposedGroupIds: ["unclassified"],
      });
    } catch (e) {
      if (!(e instanceof LearningDataError)) throw e;
      quarantine.push({
        store: "learning-queue.json",
        index,
        reason: e.message,
        raw,
      });
    }
  });
  validateLearningRegistry(registry);
  return {
    registry,
    queue,
    quarantine,
    backup: structuredClone(bundle),
    fingerprint,
  };
}
