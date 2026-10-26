/** Executable Draft 2020-12 schema. Only the keywords implemented below are used. */
export type Schema = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minItems?: number;
  uniqueItems?: boolean;
  minimum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  oneOf?: Schema[];
  $schema?: string;
};
const str: Schema = { type: "string", minLength: 1 };
const text: Schema = { type: "string" };
const integer: Schema = { type: "integer", minimum: 1 };
const bool: Schema = { type: "boolean" };
const nil: Schema = { type: "null" };
const uuid: Schema = { ...str, format: "uuid" };
const time: Schema = { ...str, format: "date-time" };
const nullable = (s: Schema): Schema => ({ oneOf: [s, nil] });
const enumeration = (...values: string[]): Schema => ({ enum: values });
const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: Schema, minItems = 0): Schema => ({
  type: "array",
  items,
  minItems,
});
const unique = (items: Schema, minItems = 0): Schema => ({
  ...array(items, minItems),
  uniqueItems: true,
});
export const learningGroups = [
  "chat",
  "workflow",
  "research",
  "planning",
  "unclassified",
] as const;
const group = enumeration(...learningGroups);
const actor = object({ kind: enumeration("user", "model", "system"), id: str });
const ref = object({
  kind: enumeration("lesson", "skill", "rule", "group"),
  id: str,
  revision: integer,
});
const scope = {
  oneOf: [
    object({ kind: { const: "global" } }),
    object({ kind: { const: "project" }, projectId: str }),
    object({ kind: { const: "chat" }, chatId: str, projectId: nullable(str) }),
    object({
      kind: { const: "workflow" },
      workflowId: str,
      projectId: nullable(str),
    }),
    object({
      kind: { const: "plan" },
      planId: str,
      chatId: str,
      projectId: nullable(str),
    }),
    object({ kind: { const: "unresolved" }, reason: str }),
  ],
};
const hash: Schema = { ...str, pattern: "^[a-f0-9]{64}$" };
const status = enumeration(
  "proposed",
  "approved",
  "active",
  "suspended",
  "rejected",
  "archived",
);
const legacyRef = object({ store: str, kind: str, id: str });
const common = {
  id: uuid,
  revision: integer,
  previousRevision: nullable(integer),
  createdAt: time,
  createdBy: actor,
  classification: object({
    state: enumeration("classified", "unclassified"),
    groupIds: unique(group, 1),
    researchSubtype: nullable(enumeration("legal", "news", "professional")),
    reason: str,
  }),
  scope,
  sourceIds: unique(uuid),
  evidenceIds: unique(uuid),
  review: object({
    status,
    approval: nullable(
      object({
        revision: integer,
        by: str,
        at: time,
        groupIds: unique(group, 1),
        scope,
      }),
    ),
    activation: nullable(
      object({
        revision: integer,
        at: time,
        basis: enumeration("approval", "legacy"),
        artifactHash: nullable(hash),
      }),
    ),
  }),
  reviewDueAt: nullable(time),
  supersedes: unique(ref),
  legacyRef: nullable(legacyRef),
  extensions: { type: "object", additionalProperties: true } as Schema,
};
export const learningRecordSchemas = {
  lesson: object({
    ...common,
    title: str,
    statement: str,
    claimKind: enumeration("preference", "procedure", "factual", "execution"),
    limitations: array(str),
    relatedLessonRefs: unique(ref),
  }),
  skill: object({
    ...common,
    name: { ...str, pattern: "^[a-z0-9][a-z0-9-]*$" },
    description: str,
    bodyMarkdown: str,
    lessonRefs: unique(ref, 1),
    dependencyRefs: unique(ref),
    artifact: object({
      relativePath: str,
      expectedExistingHash: nullable(hash),
    }),
  }),
  rule: object({
    ...common,
    key: str,
    title: str,
    text: { ...str, maxLength: 160 },
    lessonRefs: unique(ref, 1),
    conflictKey: nullable(str),
    trigger: enumeration("automatic", "explicit"),
  }),
};
const sourceKinds = enumeration(
  "user_feedback",
  "user_request",
  "workflow_design",
  "workflow_run",
  "web_document",
  "plan_revision",
  "legacy_snapshot",
);
const sourceBase = {
  id: uuid,
  capturedAt: time,
  version: nullable(str),
  excerpt: { ...text, maxLength: 2000 },
  privacy: object({ redacted: bool, exportable: bool }),
};
const sourceLocator = (
  fields: Record<string, Schema>,
  optional: Record<string, Schema> = {},
): Schema => ({
  ...object(fields),
  properties: { ...fields, versionReason: str, ...optional },
});
const sourceSchema: Schema = {
  oneOf: [
    ...["user_feedback", "user_request"].map((kind) =>
      object({
        ...sourceBase,
        kind: { const: kind },
        locator: sourceLocator(
          { chatId: str, messageId: str },
          { workflowId: str, planId: str },
        ),
      }),
    ),
    object({
      ...sourceBase,
      kind: { const: "workflow_design" },
      locator: sourceLocator({ workflowId: str, revision: integer }),
    }),
    object({
      ...sourceBase,
      kind: { const: "workflow_run" },
      locator: sourceLocator({
        workflowId: str,
        runId: str,
        stepId: str,
        outcome: str,
        artifactRefs: unique(str),
      }),
    }),
    object({
      ...sourceBase,
      kind: { const: "plan_revision" },
      locator: sourceLocator({ planId: str, revision: integer, chatId: str }),
    }),
    object({
      ...sourceBase,
      kind: { const: "web_document" },
      locator: sourceLocator(
        {
          url: str,
          title: str,
          publisher: str,
          retrievedAt: time,
          verifiedAt: nullable(time),
          publishedAt: nullable(time),
          documentVersion: nullable(str),
          effectiveFrom: nullable(time),
          effectiveTo: nullable(time),
          jurisdiction: nullable(str),
          sourceClass: enumeration("primary", "secondary", "unknown"),
          readState: enumeration("snippet", "full", "partial"),
        },
        { eventAt: time },
      ),
    }),
    object({
      ...sourceBase,
      kind: { const: "legacy_snapshot" },
      locator: sourceLocator({
        migrationId: str,
        legacyStore: str,
        legacyId: str,
        originalStatus: nullable(
          enumeration("proposed", "approved", "active", "rejected"),
        ),
        fingerprint: hash,
      }),
    }),
  ],
};
// Evidence locators carry method-specific observation coordinates, not executable paths.
const locator: Schema = { type: "object", additionalProperties: true };
export const learningRegistrySchema: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...object({
    schemaVersion: { const: 1 },
    registryId: uuid,
    generation: integer,
    groups: array(
      object({
        id: group,
        revision: integer,
        previousRevision: nullable(integer),
        title: str,
        enabled: bool,
        allowedSourceKinds: unique(sourceKinds),
        skillRefs: unique(ref),
        ruleRefs: unique(ref),
        policy: object({
          reviewRequired: { const: true },
          reviewIntervalDays: integer,
          verifyEachUse: bool,
        }),
        updatedAt: time,
      }),
    ),
    lessons: array(learningRecordSchemas.lesson),
    skills: array(learningRecordSchemas.skill),
    rules: array(learningRecordSchemas.rule),
    sources: array(sourceSchema),
    evidence: array(
      object({
        id: uuid,
        sourceId: uuid,
        kind: enumeration(
          "explicit_preference",
          "repeated_observation",
          "artifact_check",
          "source_check",
          "plan_review",
          "legacy_capture",
        ),
        claim: str,
        locator,
        result: enumeration("passed", "failed", "unverified"),
        verifiedAt: nullable(time),
        verifiedBy: nullable(actor),
        method: str,
      }),
    ),
    events: array(
      object({
        id: uuid,
        sequence: integer,
        transactionId: uuid,
        at: time,
        actor,
        action: enumeration(
          "create",
          "revise",
          "classify",
          "approve",
          "activate",
          "suspend",
          "reject",
          "archive",
          "restore",
          "migrate",
          "import",
          "conflict_resolve",
          "group_update",
        ),
        target: ref,
        fromStatus: nullable(status),
        toStatus: nullable(status),
        reason: str,
        relatedRefs: unique(ref),
      }),
    ),
    migration: nullable(
      object({
        migrationId: str,
        sourceFingerprint: hash,
        completedAt: time,
        mapping: array(
          object({
            legacyRef,
            id: uuid,
            kind: enumeration("lesson", "skill", "rule"),
          }),
        ),
      }),
    ),
  }),
};
export class LearningDataError extends Error {
  constructor(
    readonly code: string,
    readonly pointer: string,
    detail: string,
  ) {
    super(`${code} ${pointer || "/"}: ${detail}`);
    this.name = "LearningDataError";
  }
}
export function fail(code: string, pointer: string, detail: string): never {
  throw new LearningDataError(code, pointer, detail);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function validateSchema(
  value: unknown,
  schema: Schema,
  pointer = "",
): void {
  const bad = (detail: string): never => fail("SCHEMA", pointer, detail);
  if (schema.oneOf) {
    let matches = 0;
    for (const s of schema.oneOf) {
      try {
        validateSchema(value, s, pointer);
        matches++;
      } catch (e) {
        if (!(e instanceof LearningDataError)) throw e;
      }
    }
    if (matches !== 1) bad("Không khớp đúng một kiểu cho phép");
    return;
  }
  if ("const" in schema && canonical(value) !== canonical(schema.const))
    bad("Giá trị/phiên bản không được hỗ trợ");
  if (schema.enum && !schema.enum.includes(value))
    bad("Giá trị enum không hợp lệ");
  if (schema.type === "null" && value !== null) bad("Phải là null");
  if (schema.type === "boolean" && typeof value !== "boolean")
    bad("Phải là boolean");
  if (
    schema.type === "integer" &&
    (!Number.isSafeInteger(value) ||
      typeof value !== "number" ||
      value < (schema.minimum ?? 0))
  )
    bad("Số nguyên ngoài giới hạn");
  if (schema.type === "string") {
    if (typeof value !== "string") bad("Phải là chuỗi");
    const s = value as string;
    if (
      [...s].length < (schema.minLength ?? 0) ||
      [...s].length > (schema.maxLength ?? Infinity)
    )
      bad("Độ dài chuỗi ngoài giới hạn");
    if (schema.pattern && !new RegExp(schema.pattern).test(s))
      bad("Chuỗi sai định dạng");
    if (
      schema.format === "uuid" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        s,
      )
    )
      bad("UUID không hợp lệ");
    if (schema.format === "date-time") {
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s) ||
        !Number.isFinite(Date.parse(s))
      )
        bad("Cần thời gian UTC RFC3339");
      if (new Date(s).toISOString().slice(0, 19) !== s.slice(0, 19))
        bad("Ngày không tồn tại");
    }
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) bad("Phải là mảng");
    const a = value as unknown[];
    if (a.length < (schema.minItems ?? 0)) bad("Thiếu phần tử");
    if (schema.uniqueItems && new Set(a.map(canonical)).size !== a.length)
      bad("Phần tử trùng");
    a.forEach((v, i) =>
      validateSchema(v, schema.items ?? {}, `${pointer}/${i}`),
    );
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      bad("Phải là object");
    const o = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(o, key))
        fail("SCHEMA", `${pointer}/${key}`, "Thiếu trường bắt buộc");
    for (const [key, v] of Object.entries(o)) {
      const p = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (schema.properties && Object.hasOwn(schema.properties, key))
        validateSchema(v, schema.properties[key]!, p);
      else if (schema.additionalProperties === false)
        fail("SCHEMA", p, "Trường không được hỗ trợ");
      else if (typeof schema.additionalProperties === "object")
        validateSchema(v, schema.additionalProperties, p);
    }
  }
}
