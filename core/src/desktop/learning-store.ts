import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  transitionLearning,
  selectLearning,
  resourceHash,
  reviseLearning,
  resource,
  type Resource,
  type ResourceRef,
  type ReviewAction,
  type ReviewAuthority,
  type LearningContext,
} from "./learning-policy.js";
import type { LearningSkill } from "./learning-registry.js";
import { atomicJson } from "./storage.js";
import { canonical, fail, validateSchema } from "./learning-schema.js";
import {
  readLearningRegistry,
  validateLearningRegistry,
  parseLearningJson,
  type LearningRegistry,
  type Actor,
} from "./learning-registry.js";
import {
  learningHash,
  migrateLearningBundle,
  validateLegacyLearningBundle,
  type LegacyLearningBundle,
  type LearningQueueV1,
} from "./learning-migration.js";

function safeFile(file: string): void {
  if (
    fs.existsSync(file) &&
    (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
  )
    fail("UNSAFE_PATH", file, "Cần tệp thường, không symlink");
}
function read(file: string): string {
  safeFile(file);
  return fs.readFileSync(file, "utf8");
}
function syncDirectory(directory: string): void {
  if (process.platform === "win32") return;
  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function validateQueue(value: unknown): asserts value is LearningQueueV1 {
  const string = { type: "string" };
  validateSchema(value, {
    type: "object",
    required: ["schemaVersion", "items"],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 1 },
      items: {
        type: "array",
        items: {
          type: "object",
          required: [
            "chatId",
            "text",
            "about",
            "retries",
            "kind",
            "idempotencyKey",
            "capturedContext",
            "sourceIds",
            "proposedGroupIds",
          ],
          additionalProperties: false,
          properties: {
            chatId: { ...string, minLength: 1 },
            text: { ...string, minLength: 1 },
            about: string,
            retries: { type: "integer", minimum: 0 },
            kind: { enum: ["feedback", "praise", "habit"] },
            idempotencyKey: { ...string, pattern: "^[a-f0-9]{64}$" },
            capturedContext: { type: "null" },
            sourceIds: { const: [] },
            proposedGroupIds: { const: ["unclassified"] },
          },
        },
      },
    },
  });
  const q = value as LearningQueueV1;
  if (new Set(q.items.map((x) => x.idempotencyKey)).size !== q.items.length)
    fail("QUEUE_DUPLICATE", "", "Trùng idempotencyKey");
  if (q.items.some((x) => x.sourceIds.length))
    fail("QUEUE_SOURCE", "", "Hàng đợi chuyển đổi chưa có source đã xác minh");
}
/** Prepared v1 storage. Runtime cutover must be explicit after all consumers support review. */
export class LearningStore {
  readonly directory: string;
  readonly lock: string;
  constructor(readonly desktopDirectory: string) {
    if (
      fs.existsSync(desktopDirectory) &&
      fs.lstatSync(desktopDirectory).isSymbolicLink()
    )
      fail("UNSAFE_PATH", desktopDirectory, "Không dùng thư mục symlink");
    this.directory = path.join(desktopDirectory, "learning-v1");
    this.lock = path.join(desktopDirectory, ".learning-v1.lock");
  }
  private exclusive<T>(run: () => T): T {
    fs.mkdirSync(this.desktopDirectory, { recursive: true, mode: 0o700 });
    try {
      fs.mkdirSync(this.lock, { mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        fail(
          "STORE_LOCKED",
          this.lock,
          "Writer khác hoặc lượt trước bị ngắt; cần đối chiếu trước khi gỡ khóa",
        );
      throw e;
    }
    try {
      return run();
    } finally {
      fs.rmdirSync(this.lock);
    }
  }
  private checkDirectory(): void {
    if (
      fs.existsSync(this.directory) &&
      (!fs.lstatSync(this.directory).isDirectory() ||
        fs.lstatSync(this.directory).isSymbolicLink())
    )
      fail("UNSAFE_PATH", this.directory, "Kho không phải thư mục thường");
  }
  read(): LearningRegistry {
    this.checkDirectory();
    return readLearningRegistry(
      read(path.join(this.directory, "learning-registry.json")),
    );
  }
  readQueue(): LearningQueueV1 {
    this.checkDirectory();
    const q = parseLearningJson(
      read(path.join(this.directory, "learning-queue.json")),
    );
    validateQueue(q);
    return q;
  }
  /** Stage registry, queue, quarantine and exact source bytes together, then publish one directory. */
  prepare(bundle: LegacyLearningBundle, now?: string): LearningRegistry {
    validateLegacyLearningBundle(bundle);
    return this.exclusive(() => {
      this.checkDirectory();
      const fingerprint = learningHash(canonical(bundle));
      if (fs.existsSync(this.directory)) {
        const current = this.read();
        this.verifyBackup();
        this.readQueue();
        if (current.migration?.sourceFingerprint !== fingerprint)
          fail(
            "MIGRATION_SOURCE_CHANGED",
            "",
            "Nguồn cũ đã đổi; không ghi đè kho đã chuyển",
          );
        return current;
      }
      const result = migrateLearningBundle(bundle, now);
      validateQueue(result.queue);
      const stage = path.join(
        this.desktopDirectory,
        `.learning-v1-${crypto.randomUUID()}.tmp`,
      );
      fs.mkdirSync(stage, { mode: 0o700 });
      try {
        atomicJson(path.join(stage, "legacy-backup.json"), {
          fingerprint: result.fingerprint,
          bundle: result.backup,
        });
        atomicJson(path.join(stage, "quarantine.json"), {
          schemaVersion: 1,
          items: result.quarantine,
        });
        atomicJson(path.join(stage, "learning-queue.json"), result.queue);
        atomicJson(path.join(stage, "learning-registry.json"), result.registry);
        readLearningRegistry(read(path.join(stage, "learning-registry.json")));
        // Verify every published artifact, including quarantined originals.
        for (const [name, expected] of Object.entries({
          "legacy-backup.json": {
            fingerprint: result.fingerprint,
            bundle: result.backup,
          },
          "quarantine.json": { schemaVersion: 1, items: result.quarantine },
          "learning-queue.json": result.queue,
          "learning-registry.json": result.registry,
        }))
          if (
            read(path.join(stage, name)) !== JSON.stringify(expected, null, 2)
          )
            fail(
              "STAGING_VERIFY",
              name,
              "Dữ liệu ghi không khớp; chưa công bố kho",
            );
        fs.renameSync(stage, this.directory);
        try {
          syncDirectory(this.desktopDirectory);
        } catch {
          fail(
            "COMMIT_UNCERTAIN",
            this.directory,
            "Đã rename nhưng chưa xác nhận fsync; đọc lại kho trước khi thử lại",
          );
        }
        return this.read();
      } finally {
        // Only remove files in this invocation's private staging directory.
        if (fs.existsSync(stage)) {
          for (const file of fs.readdirSync(stage))
            fs.unlinkSync(path.join(stage, file));
          fs.rmdirSync(stage);
        }
      }
    });
  }
  /** Exact source snapshot. Does not read arbitrary paths supplied in legacy records. */
  prepareFromFiles(
    stateFile: string,
    queueFile: string,
    skillsDirectory: string,
    now?: string,
  ): LearningRegistry {
    const state = read(stateFile),
      queue = fs.existsSync(queueFile) ? read(queueFile) : null;
    const data = parseLearningJson(state) as { learnedDrafts?: unknown[] };
    const skills: Record<string, string> = {};
    if (
      fs.existsSync(skillsDirectory) &&
      fs.lstatSync(skillsDirectory).isSymbolicLink()
    )
      fail("UNSAFE_PATH", skillsDirectory, "Không dùng thư mục skill symlink");
    for (const item of Array.isArray(data?.learnedDrafts)
      ? data.learnedDrafts
      : []) {
      if (!item || typeof item !== "object") continue;
      const name = (item as { name?: unknown }).name;
      if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name))
        continue;
      const dir = path.join(skillsDirectory, name);
      if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
        fail("UNSAFE_PATH", dir, "Không đọc skill qua symlink");
      const file = path.join(dir, "SKILL.md");
      if (fs.existsSync(file)) skills[`${name}/SKILL.md`] = read(file);
    }
    return this.prepare({ state, queue, skills }, now);
  }
  private verifyBackup(): LegacyLearningBundle {
    this.checkDirectory();
    let saved: { fingerprint: string; bundle: LegacyLearningBundle };
    try {
      saved = JSON.parse(read(path.join(this.directory, "legacy-backup.json")));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      fail(
        "INVALID_JSON",
        "/backup",
        "JSON bản sao không hợp lệ; giữ nguyên nguồn",
      );
    }
    validateSchema(
      saved,
      {
        type: "object",
        required: ["fingerprint", "bundle"],
        additionalProperties: false,
        properties: {
          fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
          bundle: { type: "object" },
        },
      },
      "/backup",
    );
    validateLegacyLearningBundle(saved.bundle);
    if (
      !saved.bundle ||
      learningHash(canonical(saved.bundle)) !== saved.fingerprint ||
      saved.fingerprint !== this.read().migration?.sourceFingerprint
    )
      fail("BACKUP_HASH", "", "Nguồn phục hồi không khớp fingerprint");
    return saved.bundle;
  }
  /** CAS plus cross-process exclusive lock; caller mutates a detached snapshot. */
  transaction(
    expectedGeneration: number,
    change: (draft: LearningRegistry) => void,
  ): LearningRegistry {
    return this.commit(expectedGeneration, change, false);
  }
  /** Only this explicit, locally authorized transition may grant review rights. */
  review(
    expectedGeneration: number,
    ref: ResourceRef,
    action: ReviewAction,
    authority: ReviewAuthority,
    reason: string,
  ): LearningRegistry {
    return this.commit(
      expectedGeneration,
      (draft) => {
        transitionLearning(
          draft,
          ref,
          action,
          {
            ...authority,
            context: {
              ...authority.context,
              readArtifact: (skill) => this.readArtifact(skill),
            },
          },
          reason,
          (skill) => this.materialize(skill),
        );
      },
      true,
    );
  }
  select(
    context: Omit<LearningContext, "readArtifact">,
    explicit?: ResourceRef,
  ) {
    return selectLearning(
      this.read(),
      { ...context, readArtifact: (skill) => this.readArtifact(skill) },
      explicit,
    );
  }
  revise(
    expectedGeneration: number,
    ref: ResourceRef,
    replacement: Resource,
    authority: ReviewAuthority,
  ): LearningRegistry {
    return this.transaction(expectedGeneration, (draft) => {
      if (
        authority.actor.kind !== "user" ||
        !authority.canReview(resource(draft, ref).scope) ||
        !authority.canReview(replacement.scope)
      )
        fail("REVIEW_AUTH", ref.id, "Cần quyền trong cả phạm vi cũ và mới");
      reviseLearning(
        draft,
        ref,
        replacement,
        authority.actor,
        authority.context.now,
      );
    });
  }
  restore(
    expectedGeneration: number,
    current: ResourceRef,
    revision: number,
    authority: ReviewAuthority,
  ): LearningRegistry {
    return this.transaction(expectedGeneration, (draft) => {
      const previous = resource(draft, { ...current, revision });
      if (revision >= current.revision)
        fail("RESTORE_REVISION", current.id, "Chọn phiên bản cũ hơn");
      if (
        authority.actor.kind !== "user" ||
        !authority.canReview(resource(draft, current).scope) ||
        !authority.canReview(previous.scope)
      )
        fail(
          "REVIEW_AUTH",
          current.id,
          "Cần quyền khôi phục trong cả hai phạm vi",
        );
      reviseLearning(
        draft,
        current,
        previous,
        authority.actor,
        authority.context.now,
        true,
      );
    });
  }
  private artifactFile(skill: LearningSkill, create = false): string {
    this.checkDirectory();
    // Immutable, registry-owned versions cannot overwrite a user's ordinary skill.
    const dir = path.join(this.directory, "artifacts");
    if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
    if (
      fs.existsSync(dir) &&
      (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink())
    )
      fail("UNSAFE_PATH", dir, "Thư mục artifact không hợp lệ");
    return path.join(dir, `${resourceHash(skill.bodyMarkdown)}.md`);
  }
  private readArtifact(skill: LearningSkill): string | null {
    try {
      return read(this.artifactFile(skill));
    } catch {
      return null;
    }
  }
  private materialize(skill: LearningSkill): string {
    const file = this.artifactFile(skill, true);
    if (!fs.existsSync(file))
      fs.writeFileSync(file, skill.bodyMarkdown, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
    if (read(file) !== skill.bodyMarkdown)
      fail("ARTIFACT_CONFLICT", file, "Giữ tệp hiện có; chưa kích hoạt skill");
    syncDirectory(path.dirname(file));
    return resourceHash(skill.bodyMarkdown);
  }
  private commit(
    expectedGeneration: number,
    change: (draft: LearningRegistry) => void,
    authorizedReview: boolean,
  ): LearningRegistry {
    return this.exclusive(() => {
      const current = this.read();
      if (current.generation !== expectedGeneration)
        fail("STALE_GENERATION", "", "Kho đã đổi; đọc lại trước khi lưu");
      const next = structuredClone(current);
      change(next);
      next.generation = current.generation + 1;
      if (
        next.registryId !== current.registryId ||
        canonical(next.migration) !== canonical(current.migration)
      )
        fail("IMMUTABLE_IDENTITY", "", "Không thay danh tính/migration");
      for (const field of ["sources", "evidence", "events"] as const)
        if (
          canonical(next[field].slice(0, current[field].length)) !==
          canonical(current[field])
        )
          fail("IMMUTABLE_HISTORY", `/${field}`, "Không sửa/xóa lịch sử");
      for (const field of ["lessons", "rules", "skills", "groups"] as const)
        for (const old of current[field]) {
          const updated = next[field].find(
            (x) => x.id === old.id && x.revision === old.revision,
          );
          if (!updated)
            fail("IMMUTABLE_REVISION", `/${field}`, "Không xóa revision cũ");
          if (field === "groups") {
            if (canonical(updated) !== canonical(old))
              fail(
                "IMMUTABLE_REVISION",
                `/${field}`,
                "Cấu hình nhóm cần revision mới",
              );
            continue;
          }
          const previous =
            old as import("./learning-registry.js").LearningRecord;
          const revised =
            updated as import("./learning-registry.js").LearningRecord;
          if (
            canonical({ ...revised, review: previous.review }) !==
            canonical(previous)
          )
            fail(
              "IMMUTABLE_REVISION",
              `/${field}`,
              "Payload cũ bất biến; tạo revision mới",
            );
          if (canonical(revised.review) !== canonical(previous.review)) {
            if (
              previous.review.status === "archived" ||
              (previous.review.status === "rejected" &&
                revised.review.status !== "archived")
            )
              fail(
                "TERMINAL_REVIEW",
                `/${field}`,
                "Không hồi sinh bản đã bác bỏ/lưu trữ; cần revision mới",
              );
            // Payload/history checks still apply. Only review() enters this branch.
            if (authorizedReview) continue;
            if (
              !["suspended", "rejected", "archived"].includes(
                revised.review.status,
              ) ||
              canonical({
                ...revised.review,
                status: previous.review.status,
              }) !== canonical(previous.review)
            )
              fail(
                "REVIEW_AUTH_REQUIRED",
                `/${field}`,
                "API lưu trữ chỉ cho phép dừng áp dụng; duyệt/kích hoạt cần dịch vụ xác thực riêng",
              );
            const action = {
              suspended: "suspend",
              rejected: "reject",
              archived: "archive",
            }[revised.review.status as "suspended" | "rejected" | "archived"];
            if (
              !next.events
                .slice(current.events.length)
                .some(
                  (e) =>
                    e.action === action &&
                    e.target.id === old.id &&
                    e.target.revision === old.revision &&
                    e.fromStatus === previous.review.status &&
                    e.toStatus === revised.review.status,
                )
            )
              fail("REVIEW_EVENT", `/${field}`, "Thiếu sự kiện dừng áp dụng");
          }
        }
      for (const field of ["lessons", "rules", "skills"] as const)
        for (const added of next[field])
          if (
            !current[field].some(
              (x) => x.id === added.id && x.revision === added.revision,
            ) &&
            added.review.status !== "proposed"
          )
            fail("NEW_REVIEW", `/${field}`, "Bản mới chỉ được proposed");
      validateLearningRegistry(next);
      readLearningRegistry(JSON.stringify(next));
      const file = path.join(this.directory, "learning-registry.json");
      safeFile(file);
      try {
        atomicJson(file, next);
      } catch (e) {
        if (read(file) === JSON.stringify(next, null, 2))
          fail(
            "COMMIT_UNCERTAIN",
            file,
            "Bản mới đã được ghi; đọc lại generation trước khi thử lại",
          );
        throw e;
      }
      return this.read();
    });
  }
  /** Recovery exports exact originals into a NEW directory; never overwrites live or newer data. */
  exportRecovery(destination: string): void {
    this.exclusive(() => {
      const bundle = this.verifyBackup();
      // Validate all paths before creating even the first recovery file.
      for (const relative of Object.keys(bundle.skills))
        if (!/^[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(relative))
          fail("UNSAFE_PATH", relative, "Đường dẫn backup không hợp lệ");
      fs.mkdirSync(destination, { mode: 0o700 }); // EEXIST is intentional: no overwrite.
      const incomplete = path.join(destination, "RECOVERY-INCOMPLETE.txt");
      fs.writeFileSync(
        incomplete,
        "Phục hồi chưa hoàn tất. Không dùng thư mục này thay dữ liệu đang chạy.",
        { flag: "wx", mode: 0o600, flush: true },
      );
      fs.writeFileSync(path.join(destination, "state.json"), bundle.state, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      if (bundle.queue !== null)
        fs.writeFileSync(
          path.join(destination, "learning-queue.json"),
          bundle.queue,
          { flag: "wx", mode: 0o600, flush: true },
        );
      for (const [relative, content] of Object.entries(bundle.skills)) {
        if (!/^[a-z0-9][a-z0-9-]*\/SKILL\.md$/.test(relative))
          fail("UNSAFE_PATH", relative, "Đường dẫn backup không hợp lệ");
        const file = path.join(destination, "skills", relative);
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, content, {
          flag: "wx",
          mode: 0o600,
          flush: true,
        });
      }
      if (
        read(path.join(destination, "state.json")) !== bundle.state ||
        (bundle.queue !== null &&
          read(path.join(destination, "learning-queue.json")) !== bundle.queue)
      )
        fail("RECOVERY_VERIFY", "", "Nội dung phục hồi không khớp");
      for (const [relative, content] of Object.entries(bundle.skills))
        if (read(path.join(destination, "skills", relative)) !== content)
          fail("RECOVERY_VERIFY", relative, "Skill phục hồi không khớp");
      fs.unlinkSync(incomplete);
    });
  }
  /**
   * Imports learning records from an external JSON string, file path, or object.
   * Sanitizes all imported records to review.status = 'proposed' with null approvals/activations.
   * Never trusts external active/approved state.
   */
  import(
    rawInput: unknown,
    options?: { expectedGeneration?: number; actor?: Actor; now?: string },
  ): {
    registry: LearningRegistry;
    imported: { lessons: number; rules: number; skills: number; sources: number; evidence: number };
  } {
    let raw: any;
    if (typeof rawInput === "string") {
      let content = rawInput;
      if (fs.existsSync(rawInput) && fs.lstatSync(rawInput).isFile()) {
        content = read(rawInput);
      }
      raw = parseLearningJson(content);
    } else if (rawInput && typeof rawInput === "object") {
      raw = rawInput;
    } else {
      fail("INVALID_IMPORT", "", "Dữ liệu nhập không hợp lệ");
    }
    if (raw && typeof raw === "object" && "registry" in raw && raw.registry) {
      raw = raw.registry;
    }
    if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1) {
      fail("INVALID_SCHEMA", "", "Dữ liệu nhập cần schemaVersion 1");
    }

    const now = options?.now ?? new Date().toISOString();
    const actor: Actor = options?.actor ?? { kind: "user", id: "current-user" };

    const sanitizeRecord = (item: any) => {
      const cloned = structuredClone(item);
      cloned.review = {
        status: "proposed",
        approval: null,
        activation: null,
      };
      cloned.reviewDueAt = null;
      if (!cloned.extensions || typeof cloned.extensions !== "object") {
        cloned.extensions = {};
      }
      cloned.extensions["pvta.import"] = { at: now, sanitized: true };
      return cloned;
    };

    const transactionId = crypto.randomUUID();
    const imported = { lessons: 0, rules: 0, skills: 0, sources: 0, evidence: 0 };
    const currentGen = options?.expectedGeneration ?? this.read().generation;

    const next = this.transaction(currentGen, (draft) => {
      for (const src of (raw.sources ?? []) as import("./learning-registry.js").LearningSource[]) {
        if (!draft.sources.some((s) => s.id === src.id)) {
          draft.sources.push(structuredClone(src));
          imported.sources++;
        }
      }
      for (const evi of (raw.evidence ?? []) as import("./learning-registry.js").LearningEvidence[]) {
        if (!draft.evidence.some((e) => e.id === evi.id)) {
          draft.evidence.push(structuredClone(evi));
          imported.evidence++;
        }
      }
      for (const field of ["lessons", "rules", "skills"] as const) {
        const kind = field === "lessons" ? "lesson" : field === "rules" ? "rule" : "skill";
        for (const rawItem of (raw[field] ?? []) as any[]) {
          const item = sanitizeRecord(rawItem);
          const exists = draft[field].some(
            (x) => x.id === item.id && x.revision === item.revision,
          );
          if (exists) continue;
          draft[field].push(item);
          draft.events.push({
            id: crypto.randomUUID(),
            sequence: draft.events.length + 1,
            transactionId,
            at: now,
            actor,
            action: "import",
            target: { kind, id: item.id, revision: item.revision },
            fromStatus: null,
            toStatus: "proposed",
            reason: "Khử trùng trạng thái duyệt từ tệp nhập; đặt trạng thái proposed",
            relatedRefs: [],
          });
          imported[field]++;
        }
      }
    });

    return { registry: next, imported };
  }
}
