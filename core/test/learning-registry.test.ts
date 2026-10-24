import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  migrateLearningBundle,
  learningHash,
  type LegacyLearningBundle,
} from "../src/desktop/learning-migration.js";
import {
  readLearningRegistry,
  validateLearningRegistry,
  parseLearningJson,
} from "../src/desktop/learning-registry.js";
import { LearningStore } from "../src/desktop/learning-store.js";

const at = "2026-10-24T03:00:00.000Z";
const rule = (extra: Record<string, unknown> = {}) => ({
  id: "old-rule",
  rule: "Tách dữ kiện và giả định.",
  source: "Lời dặn",
  at: 1,
  status: "active",
  ...extra,
});
const bundle = (
  learned: unknown[] = [rule()],
  drafts: unknown[] = [],
  queue: unknown[] = [],
  skills: Record<string, string> = {},
): LegacyLearningBundle => ({
  state: JSON.stringify({
    version: 1,
    chats: [{ id: "preserve" }],
    projects: [],
    attachments: [],
    preferences: { learning: true },
    learned,
    learnedDrafts: drafts,
  }),
  queue: JSON.stringify(queue),
  skills,
});
const directories: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-learning-"));
  directories.push(dir);
  return dir;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("learning migration and validation", () => {
  it("preserves exact originals and limits legacy active to Chat without fabricating approval", () => {
    const input = bundle();
    const copy = structuredClone(input);
    const result = migrateLearningBundle(input, at);
    expect(input).toEqual(copy);
    expect(result.backup).toEqual(copy);
    expect(result.quarantine).toEqual([]);
    const migrated = result.registry.rules[0];
    expect(migrated.classification.groupIds).toEqual(["chat"]);
    expect(migrated.scope).toEqual({ kind: "global" });
    expect(migrated.review).toMatchObject({
      status: "active",
      approval: null,
      activation: { basis: "legacy" },
    });
    expect(migrated.reviewDueAt).toBe("2026-11-23T03:00:00.000Z");
    expect(migrated.legacyRef?.id).toBe("old-rule");
    expect(readLearningRegistry(JSON.stringify(result.registry))).toEqual(
      result.registry,
    );
  });
  it.each([undefined, "approved", "proposed", "rejected"])(
    "never promotes old status %s",
    (status) => {
      const r = migrateLearningBundle(bundle([rule({ status })]), at).registry
        .rules[0];
      expect(r.review.status).toBe(
        status === "rejected" ? "rejected" : "proposed",
      );
      expect(r.review.approval).toBeNull();
      expect(r.scope.kind).toBe("unresolved");
    },
  );
  it("quarantines malformed and duplicate records independently without dangling refs", () => {
    const r = migrateLearningBundle(
      bundle([
        null,
        rule(),
        rule(),
        rule({ id: "long", rule: "x".repeat(161) }),
        rule({ id: "later", status: "rejected" }),
      ]),
      at,
    );
    expect(r.registry.rules.map((x) => x.legacyRef?.id)).toEqual([
      "old-rule",
      "later",
    ]);
    expect(r.quarantine).toHaveLength(3);
    expect(r.registry.sources).toHaveLength(2);
    validateLearningRegistry(r.registry);
  });
  it("preserves exhausted retries, duplicate observations and unknown context", () => {
    const item = {
      chatId: "c",
      text: "Nhớ điều này",
      about: "",
      retries: 3,
      kind: "feedback",
    };
    const r = migrateLearningBundle(
      bundle([], [], [item, item, { ...item, retries: -1 }]),
      at,
    );
    expect(r.queue.items).toHaveLength(2);
    expect(r.queue.items.map((x) => x.retries)).toEqual([3, 3]);
    expect(r.queue.items[0].capturedContext).toBeNull();
    expect(r.queue.items[0].idempotencyKey).not.toBe(
      r.queue.items[1].idempotencyKey,
    );
    expect(r.quarantine).toHaveLength(1);
    expect(
      migrateLearningBundle(
        bundle([], [], [item, item, { ...item, retries: -1 }]),
        at,
      ).queue,
    ).toEqual(r.queue);
  });
  it("preserves skill bytes and suspends active skills with missing/mismatched hashes", () => {
    const md = "# Skill\nNội dung\n";
    const draft = {
      id: "s",
      name: "learned-example",
      description: "Mô tả",
      body: md,
      source: "Cũ",
      at: 1,
      status: "active",
      existingHash: learningHash(md),
    };
    const r = migrateLearningBundle(
      bundle([], [draft], [], { "learned-example/SKILL.md": md }),
      at,
    );
    expect(r.registry.skills[0].review.status).toBe("active");
    expect(r.backup.skills["learned-example/SKILL.md"]).toBe(md);
    expect(
      migrateLearningBundle(bundle([], [draft]), at).registry.skills[0].review
        .status,
    ).toBe("suspended");
    expect(
      migrateLearningBundle(
        bundle([], [draft], [], { "learned-example/SKILL.md": "edited" }),
        at,
      ).registry.skills[0].review.status,
    ).toBe("suspended");
  });
  it.each(["{", "null", '{"version":99,"learned":[]}'])(
    "refuses broken source %s",
    (state) => {
      expect(() => migrateLearningBundle({ ...bundle(), state }, at)).toThrow();
    },
  );
  it("rejects malformed queue envelope instead of replacing it with empty data", () => {
    expect(() =>
      migrateLearningBundle({ ...bundle(), queue: "{}" }, at),
    ).toThrow("LEGACY_QUEUE");
  });
  it.each([
    [
      "schemaVersion",
      (r: any) => {
        r.schemaVersion = 99;
      },
    ],
    [
      "SCHEMA",
      (r: any) => {
        r.rules[0].unexpected = true;
      },
    ],
    [
      "SCHEMA",
      (r: any) => {
        r.rules[0].createdAt = "2026-02-30T00:00:00Z";
      },
    ],
    [
      "SCHEMA",
      (r: any) => {
        r.rules[0].scope = { kind: "project" };
      },
    ],
    [
      "RESEARCH_SUBTYPE",
      (r: any) => {
        r.rules[0].classification.groupIds = ["research"];
      },
    ],
    [
      "MISSING_REF",
      (r: any) => {
        r.sources = [];
      },
    ],
    [
      "REVISION_CHAIN",
      (r: any) => {
        r.rules[0].revision = 2;
      },
    ],
    [
      "DUPLICATE_REVISION",
      (r: any) => {
        r.rules.push(structuredClone(r.rules[0]));
      },
    ],
    [
      "EVENT_SEQUENCE",
      (r: any) => {
        r.events[0].sequence = 9;
      },
    ],
    [
      "APPROVAL_REVISION_MISMATCH",
      (r: any) => {
        r.rules[0].review.approval = {
          revision: 9,
          by: "user",
          at,
          groupIds: ["chat"],
          scope: { kind: "global" },
        };
      },
    ],
    [
      "INVALID_LEGACY",
      (r: any) => {
        r.rules[0].reviewDueAt = "2030-01-01T00:00:00Z";
      },
    ],
    [
      "DEPENDENCY_CYCLE",
      (r: any) => {
        r.rules[0].supersedes = [
          { kind: "rule", id: r.rules[0].id, revision: 1 },
        ];
      },
    ],
  ])("rejects invalid registry: %s", (message, change) => {
    const r = migrateLearningBundle(bundle(), at).registry;
    change(r);
    expect(() => readLearningRegistry(JSON.stringify(r))).toThrow(message);
  });
  it("enforces JSON input byte/depth limits", () => {
    expect(() => parseLearningJson(" ".repeat(10 * 1024 * 1024 + 1))).toThrow(
      "SIZE_LIMIT",
    );
    expect(() =>
      parseLearningJson("[".repeat(34) + "0" + "]".repeat(34)),
    ).toThrow("DEPTH_LIMIT");
  });
  it("accepts classified planning proposals with source and evidence, without approval", () => {
    const r = migrateLearningBundle(
      bundle([rule({ status: "proposed" })]),
      at,
    ).registry;
    const x = r.rules[0];
    x.classification = {
      state: "classified",
      groupIds: ["planning"],
      researchSubtype: null,
      reason: "Phản hồi kế hoạch",
    };
    x.scope = { kind: "chat", chatId: "fixture-chat", projectId: null };
    const source = r.sources[0];
    source.kind = "user_feedback";
    source.locator = { chatId: "fixture-chat", messageId: "fixture-message" };
    source.version = "message-v1";
    const id = crypto.randomUUID();
    r.evidence.push({
      id,
      sourceId: source.id,
      kind: "explicit_preference",
      claim: "Lời dặn",
      locator: { messageId: "fixture-message" },
      result: "passed",
      verifiedAt: at,
      verifiedBy: { kind: "user", id: "fixture-user" },
      method: "Đối chiếu fixture",
    });
    x.evidenceIds = [id];
    expect(validateLearningRegistry(r).rules[0].review.status).toBe("proposed");
    x.review.status = "approved";
    x.reviewDueAt = "2026-11-01T00:00:00Z";
    x.review.approval = {
      revision: 1,
      by: "fixture-user",
      at,
      groupIds: ["planning"],
      scope: x.scope,
    };
    expect(() => validateLearningRegistry(r)).toThrow("APPROVAL_EVENT");
    r.events.push({
      id: crypto.randomUUID(),
      sequence: r.events.length + 1,
      transactionId: crypto.randomUUID(),
      at,
      actor: { kind: "user", id: "fixture-user" },
      action: "approve",
      target: { kind: "rule", id: x.id, revision: 1 },
      fromStatus: "proposed",
      toStatus: "approved",
      reason: "Duyệt fixture",
      relatedRefs: [],
    });
    expect(validateLearningRegistry(r).rules[0].review.status).toBe("approved");
  });
  it("rejects wrong source locator types and unnamespaced extensions", () => {
    const r = migrateLearningBundle(bundle(), at).registry;
    r.sources[0].locator.legacyId = null;
    expect(() => validateLearningRegistry(r)).toThrow("SCHEMA");
    r.sources[0].locator.legacyId = "old-rule";
    r.rules[0].extensions.plain = true;
    expect(() => validateLearningRegistry(r)).toThrow("EXTENSION_NAMESPACE");
  });
});

describe("prepared learning store", () => {
  it.each(["learning-queue.json", "quarantine.json", "legacy-backup.json"])(
    "does not publish corrupted staging artifact %s",
    (name) => {
      const store = new LearningStore(temp());
      const input = bundle([null, rule()]);
      const original = fs.writeFileSync;
      const spy = vi
        .spyOn(fs, "writeFileSync")
        .mockImplementation((file, ...args) => {
          if (String(file).includes(`${name}.`)) args[0] = "{}";
          return original(file, ...args);
        });
      expect(() => store.prepare(input, at)).toThrow("STAGING_VERIFY");
      expect(fs.existsSync(store.directory)).toBe(false);
      spy.mockRestore();
      store.prepare(input, at);
      const recovery = path.join(store.desktopDirectory, "recovered");
      store.exportRecovery(recovery);
      expect(fs.readFileSync(path.join(recovery, "state.json"), "utf8")).toBe(
        input.state,
      );
    },
  );
  it("refuses an unrestorable skill path before publishing", () => {
    const store = new LearningStore(temp());
    expect(() =>
      store.prepare(bundle([], [], [], { "../escape": "source" }), at),
    ).toThrow("UNSAFE_PATH");
    expect(fs.existsSync(store.directory)).toBe(false);
  });
  it.each(["null", "{", '{"fingerprint":"bad","bundle":{}}'])(
    "refuses malformed backup %s without creating recovery",
    (raw) => {
      const store = new LearningStore(temp());
      store.prepare(bundle(), at);
      fs.writeFileSync(path.join(store.directory, "legacy-backup.json"), raw);
      const destination = path.join(store.desktopDirectory, "recovered");
      expect(() => store.exportRecovery(destination)).toThrow(
        /SCHEMA|INVALID_JSON/,
      );
      expect(fs.existsSync(destination)).toBe(false);
    },
  );
  it("accepts the updated signal namespace without granting review rights", () => {
    const r = migrateLearningBundle(
      bundle([rule({ status: "proposed" })]),
      at,
    ).registry;
    r.rules[0].extensions["pvta:signal"] = {
      inboxId: "fixture-signal",
      sourceId: "fixture-source",
      sourceVersion: null,
    };
    expect(validateLearningRegistry(r).rules[0].review).toEqual({
      status: "proposed",
      approval: null,
      activation: null,
    });
    expect(() =>
      readLearningRegistry(JSON.stringify({ schemaVersion: 1, items: [] })),
    ).toThrow("SCHEMA");
  });
  it("publishes once, retries idempotently, reopens, refuses changed source and restores exact bytes", () => {
    const root = temp();
    const store = new LearningStore(root);
    const input = bundle();
    const first = store.prepare(input, at);
    expect(store.prepare(input, "2026-10-25T00:00:00Z")).toEqual(first);
    expect(new LearningStore(root).read()).toEqual(first);
    expect(() =>
      store.prepare(bundle([rule({ rule: "Đổi nội dung" })]), at),
    ).toThrow("MIGRATION_SOURCE_CHANGED");
    const recovery = path.join(root, "recovery");
    store.exportRecovery(recovery);
    expect(fs.readFileSync(path.join(recovery, "state.json"), "utf8")).toBe(
      input.state,
    );
    expect(
      fs.readFileSync(path.join(recovery, "learning-queue.json"), "utf8"),
    ).toBe(input.queue);
    expect(() => store.exportRecovery(recovery)).toThrow();
  });
  it("reads legacy files without modifying state, queue or skill", () => {
    const root = temp(),
      state = path.join(root, "state.json"),
      queue = path.join(root, "learning-queue.json");
    const input = bundle();
    fs.writeFileSync(state, input.state);
    fs.writeFileSync(queue, input.queue!);
    const store = new LearningStore(root);
    store.prepareFromFiles(state, queue, path.join(root, "skills"), at);
    expect(fs.readFileSync(state, "utf8")).toBe(input.state);
    expect(fs.readFileSync(queue, "utf8")).toBe(input.queue);
  });
  it("does not publish a partial migration after a write failure and can retry", () => {
    const root = temp();
    const store = new LearningStore(root);
    const original = fs.writeFileSync;
    const spy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, ...args) => {
        if (String(file).includes("learning-queue.json"))
          throw Error("disk full");
        return original(file, ...args);
      });
    expect(() => store.prepare(bundle(), at)).toThrow("disk full");
    expect(fs.existsSync(store.directory)).toBe(false);
    expect(fs.existsSync(store.lock)).toBe(false);
    spy.mockRestore();
    expect(store.prepare(bundle(), at).generation).toBe(1);
  });
  it("keeps the previous generation on rename failure", () => {
    const store = new LearningStore(temp());
    store.prepare(bundle(), at);
    const original = fs.renameSync;
    const spy = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith("learning-registry.json"))
        throw Error("rename denied");
      return original(from, to);
    });
    expect(() => store.transaction(1, () => {})).toThrow("rename denied");
    expect(store.read().generation).toBe(1);
    spy.mockRestore();
    expect(store.transaction(1, () => {}).generation).toBe(2);
  });
  it("serializes writers and rejects stale snapshots or history changes", () => {
    const store = new LearningStore(temp());
    store.prepare(bundle(), at);
    const other = new LearningStore(store.desktopDirectory);
    expect(store.transaction(1, () => {}).generation).toBe(2);
    expect(() => other.transaction(1, () => {})).toThrow("STALE_GENERATION");
    expect(() =>
      store.transaction(2, (r) => {
        r.rules[0].text = "Overwrite";
      }),
    ).toThrow("IMMUTABLE_REVISION");
    expect(() =>
      store.transaction(2, (r) => {
        r.events = [];
      }),
    ).toThrow("IMMUTABLE_HISTORY");
    expect(() =>
      store.transaction(2, () => other.transaction(2, () => {})),
    ).toThrow("STORE_LOCKED");
    expect(store.read().generation).toBe(2);
  });
  it("saves a revised proposal only after suspending the old active revision with an event", () => {
    const store = new LearningStore(temp());
    const input = bundle();
    store.prepare(input, at);
    const result = store.transaction(1, (r) => {
      const old = r.rules[0];
      old.review.status = "suspended";
      r.events.push({
        id: crypto.randomUUID(),
        sequence: r.events.length + 1,
        transactionId: crypto.randomUUID(),
        at,
        actor: { kind: "user", id: "fixture-user" },
        action: "suspend",
        target: { kind: "rule", id: old.id, revision: 1 },
        fromStatus: "active",
        toStatus: "suspended",
        reason: "Có bản sửa",
        relatedRefs: [],
      });
      const next = structuredClone(old);
      next.revision = 2;
      next.previousRevision = 1;
      next.text = "Nội dung sửa cần duyệt lại";
      next.review = { status: "proposed", approval: null, activation: null };
      r.rules.push(next);
      r.events.push({
        id: crypto.randomUUID(),
        sequence: r.events.length + 1,
        transactionId: crypto.randomUUID(),
        at,
        actor: { kind: "user", id: "fixture-user" },
        action: "revise",
        target: { kind: "rule", id: old.id, revision: 2 },
        fromStatus: null,
        toStatus: "proposed",
        reason: "Sửa nội dung",
        relatedRefs: [],
      });
    });
    expect(result.rules.map((x) => x.review.status)).toEqual([
      "suspended",
      "proposed",
    ]);
    expect(store.prepare(input, at)).toEqual(result);
  });
  it("reports uncertain commit after rename and prevents repeating against the old generation", () => {
    const store = new LearningStore(temp());
    store.prepare(bundle(), at);
    const original = fs.chmodSync;
    const spy = vi.spyOn(fs, "chmodSync").mockImplementation((file, mode) => {
      if (String(file).endsWith("learning-registry.json"))
        throw Error("post-rename failure");
      return original(file, mode);
    });
    expect(() => store.transaction(1, () => {})).toThrow("COMMIT_UNCERTAIN");
    spy.mockRestore();
    expect(store.read().generation).toBe(2);
    expect(() => store.transaction(1, () => {})).toThrow("STALE_GENERATION");
  });
  it("refuses damaged registry and backup without resetting either", () => {
    const store = new LearningStore(temp());
    store.prepare(bundle(), at);
    const backup = path.join(store.directory, "legacy-backup.json");
    const saved = JSON.parse(fs.readFileSync(backup, "utf8"));
    saved.bundle.state = "tampered";
    fs.writeFileSync(backup, JSON.stringify(saved));
    expect(() =>
      store.exportRecovery(path.join(store.desktopDirectory, "recovery")),
    ).toThrow("BACKUP_HASH");
    expect(fs.existsSync(path.join(store.desktopDirectory, "recovery"))).toBe(
      false,
    );
    fs.writeFileSync(path.join(store.directory, "learning-registry.json"), "{");
    expect(() => store.read()).toThrow("INVALID_JSON");
    expect(
      fs.readFileSync(
        path.join(store.directory, "learning-registry.json"),
        "utf8",
      ),
    ).toBe("{");
  });
  it("refuses symlink storage and skill traversal", () => {
    const root = temp(),
      outside = temp();
    fs.symlinkSync(outside, path.join(root, "learning-v1"));
    expect(() => new LearningStore(root).prepare(bundle(), at)).toThrow(
      "UNSAFE_PATH",
    );
    const r = migrateLearningBundle(
      bundle(
        [],
        [
          {
            id: "s",
            name: "../escape",
            description: "d",
            body: "b",
            source: "s",
            at: 1,
            status: "active",
          },
        ],
      ),
      at,
    );
    expect(r.registry.skills).toHaveLength(0);
    expect(r.quarantine).toHaveLength(1);
  });
  it("preserves live data and marks incomplete recovery on write failure, then recovers to a new folder", () => {
    const store = new LearningStore(temp());
    const md = "# Skill\nOriginal\n";
    const input = bundle(
      [],
      [
        {
          id: "skill",
          name: "learned-test",
          description: "Mô tả",
          body: md,
          source: "Nguồn",
          at: 1,
          status: "active",
          existingHash: learningHash(md),
        },
      ],
      [],
      { "learned-test/SKILL.md": md },
    );
    store.prepare(input, at);
    const original = fs.writeFileSync;
    const failed = path.join(store.desktopDirectory, "failed");
    const spy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((file, ...args) => {
        if (String(file) === path.join(failed, "state.json"))
          throw Error("disk full");
        return original(file, ...args);
      });
    expect(() => store.exportRecovery(failed)).toThrow("disk full");
    expect(fs.existsSync(path.join(failed, "RECOVERY-INCOMPLETE.txt"))).toBe(
      true,
    );
    spy.mockRestore();
    const recovered = path.join(store.desktopDirectory, "recovered");
    store.exportRecovery(recovered);
    expect(
      fs.readFileSync(
        path.join(recovered, "skills/learned-test/SKILL.md"),
        "utf8",
      ),
    ).toBe(md);
    expect(fs.existsSync(path.join(recovered, "RECOVERY-INCOMPLETE.txt"))).toBe(
      false,
    );
    expect(store.read().generation).toBe(1);
  });
  it("refuses corrupt queue versions and does not reset retries on reopen", () => {
    const store = new LearningStore(temp());
    store.prepare(
      bundle([], [], [{ chatId: "c", text: "t", about: "", retries: 7 }]),
      at,
    );
    expect(
      new LearningStore(store.desktopDirectory).readQueue().items[0].retries,
    ).toBe(7);
    const file = path.join(store.directory, "learning-queue.json");
    const q = JSON.parse(fs.readFileSync(file, "utf8"));
    q.schemaVersion = 99;
    fs.writeFileSync(file, JSON.stringify(q));
    expect(() => store.readQueue()).toThrow("SCHEMA");
  });
});
