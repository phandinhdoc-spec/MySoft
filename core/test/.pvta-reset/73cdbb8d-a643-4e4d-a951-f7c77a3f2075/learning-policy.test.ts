import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LearningStore } from "../src/desktop/learning-store.js";
import {
  proposeFoundation,
  learningFoundations,
  importSignalProposal,
  type ProposalOrigin,
} from "../src/desktop/learning-proposals.js";
import {
  reviseLearning,
  resource,
  resourceHash,
  type ResourceRef,
  type ReviewAuthority,
} from "../src/desktop/learning-policy.js";
import type {
  LearningSkill,
  LearningLesson,
} from "../src/desktop/learning-registry.js";
import type { LearningSignal } from "../src/desktop/learning-signals.js";

const now = "2026-10-24T04:00:00.000Z";
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
function setup(id: (typeof learningFoundations)[number]["id"] = "planning") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-policy-"));
  directories.push(dir);
  const store = new LearningStore(dir);
  store.prepare(
    {
      state: JSON.stringify({ version: 1, learned: [], learnedDrafts: [] }),
      queue: null,
      skills: {},
    },
    now,
  );
  const sourceId = randomUUID();
  const spec = learningFoundations.find((x) => x.id === id)!;
  const origin: ProposalOrigin = {
    scope: { kind: "project", projectId: "p" },
    source: {
      id: sourceId,
      kind: "user_request",
      capturedAt: now,
      locator: { chatId: "c", messageId: "m" },
      version: "1",
      excerpt: "Yêu cầu nền trong fixture",
      privacy: { redacted: true, exportable: false },
    },
    evidence: [
      {
        id: randomUUID(),
        sourceId,
        kind: "explicit_preference",
        claim: "Yêu cầu trong fixture",
        locator: { messageId: "m" },
        result: "passed",
        verifiedAt: now,
        verifiedBy: { kind: "user", id: "local" },
        method: "Đối chiếu lời yêu cầu fixture",
      },
    ],
  };
  const authority: ReviewAuthority = {
    actor: { kind: "user", id: "local" },
    canReview: () => true,
    context: {
      now,
      groups: [spec.group],
      researchSubtype: spec.subtype ?? undefined,
      projectId: "p",
      chatId: "c",
      canAccess: () => true,
      sourceAvailable: () => true,
      readArtifact: () => null,
    },
  };
  let refs: ResourceRef[] = [];
  store.transaction(store.read().generation, (r) => {
    refs = proposeFoundation(r, id, origin, authority.actor, now);
  });
  const review = (
    ref: ResourceRef,
    action: "approve" | "activate" | "suspend" | "reject" | "archive",
  ) =>
    store.review(store.read().generation, ref, action, authority, "Kiểm thử");
  const activate = () => {
    for (const ref of refs) {
      review(ref, "approve");
      review(ref, "activate");
    }
  };
  return { dir, store, refs, origin, authority, review, activate };
}
describe("learning review and selection", () => {
  it("restores through the authorized store API and preserves concurrent changes on conflict", () => {
    const { store, refs, authority, activate } = setup();
    activate();
    const first = structuredClone(resource(store.read(), refs[2]));
    const snapshot = store.read();
    store.revise(
      snapshot.generation,
      refs[2],
      { ...first, bodyMarkdown: "# Nội dung mới" } as LearningSkill,
      authority,
    );
    const second = { ...refs[2], revision: 2 };
    const before = store.read();
    expect(() =>
      store.restore(snapshot.generation, second, 1, authority),
    ).toThrow("STALE_GENERATION");
    expect(store.read()).toEqual(before);
    store.restore(before.generation, second, 1, authority);
    const restored = resource(store.read(), {
      ...second,
      revision: 3,
    }) as LearningSkill;
    expect(restored.bodyMarkdown).toBe((first as LearningSkill).bodyMarkdown);
    expect(restored.review).toEqual({
      status: "proposed",
      approval: null,
      activation: null,
    });
    expect(
      store.select(authority.context, { ...second, revision: 3 }).selected,
    ).toEqual([]);
  });
  it("does not allow extending review intervals or reading artifacts through symlinks", () => {
    const { store, refs, authority, activate, review, dir } = setup();
    activate();
    const skill = resource(store.read(), refs[2]) as LearningSkill;
    const file = path.join(
      store.directory,
      "artifacts",
      `${resourceHash(skill.bodyMarkdown)}.md`,
    );
    const outside = path.join(dir, "external.md");
    fs.writeFileSync(outside, skill.bodyMarkdown);
    fs.unlinkSync(file);
    fs.symlinkSync(outside, file);
    expect(store.select(authority.context, refs[2]).denied[0].reason).toBe(
      "ARTIFACT_HASH",
    );
    const old = structuredClone(resource(store.read(), refs[0]));
    store.revise(
      store.read().generation,
      refs[0],
      { ...old, reviewDueAt: "2030-01-01T00:00:00.000Z" },
      authority,
    );
    expect(() => review({ ...refs[0], revision: 2 }, "approve")).toThrow(
      "REVIEW_INTERVAL",
    );
  });
  it.each(learningFoundations.map((x) => x.id))(
    "creates valid, idempotent, proposed foundation %s",
    (id) => {
      const { store, refs, origin, authority } = setup(id);
      expect(store.select(authority.context).selected).toEqual([]);
      const before = store.read();
      store.transaction(before.generation, (r) =>
        expect(proposeFoundation(r, id, origin, authority.actor, now)).toEqual(
          refs,
        ),
      );
      expect(store.read().events).toEqual(before.events);
      expect(store.read().skills).toHaveLength(1);
      expect(store.read().skills[0].bodyMarkdown).toContain("---\nname:");
    },
  );
  it("requires separate approval/use and persists immutable artifacts across restart", () => {
    const { store, refs, authority, review, activate, dir } = setup();
    expect(() => review(refs[1], "activate")).toThrow("NOT_APPROVED");
    review(refs[0], "approve");
    review(refs[0], "activate");
    review(refs[1], "approve");
    expect(store.select(authority.context).selected).toEqual([]);
    review(refs[1], "activate");
    review(refs[2], "approve");
    review(refs[2], "activate");
    expect(
      new LearningStore(dir)
        .select(authority.context)
        .selected.map((x) => x.ref.kind),
    ).toEqual(["rule", "skill"]);
    expect(store.select(authority.context, refs[2]).selected).toHaveLength(1);
  });
  it("blocks wrong scope, denied permission, group, suspended, due and unavailable sources", () => {
    const { store, refs, authority, review, activate } = setup();
    activate();
    for (const patch of [
      { projectId: "other" },
      { canAccess: () => false },
      { groups: ["workflow" as const] },
      { now: "2027-10-24T04:00:00.000Z" },
      { sourceAvailable: () => false },
      {
        blockedRefs: new Set(
          refs.map((x) => `${x.kind}:${x.id}:${x.revision}`),
        ),
      },
    ])
      expect(store.select({ ...authority.context, ...patch }).selected).toEqual(
        [],
      );
    review(refs[0], "suspend");
    expect(store.select(authority.context).selected).toEqual([]);
  });
  it("checks latest group configuration and research subtype", () => {
    const { store, authority, activate } = setup("research-news");
    activate();
    expect(
      store.select({ ...authority.context, researchSubtype: "legal" }).selected,
    ).toEqual([]);
    store.transaction(store.read().generation, (r) => {
      const old = r.groups.filter((g) => g.id === "research").at(-1)!;
      r.groups.push({
        ...old,
        revision: old.revision + 1,
        previousRevision: old.revision,
        enabled: false,
      });
    });
    expect(store.select(authority.context).selected).toEqual([]);
  });
  it("rejects model authority, missing evidence and stale generation without changing the store", () => {
    const { store, refs, authority, review } = setup();
    const before = store.read();
    expect(() =>
      store.review(
        before.generation,
        refs[0],
        "approve",
        { ...authority, actor: { kind: "model", id: "ai" } },
        "",
      ),
    ).toThrow("REVIEW_AUTH");
    expect(() =>
      store.review(
        before.generation,
        refs[0],
        "approve",
        { ...authority, canReview: () => false },
        "",
      ),
    ).toThrow("REVIEW_AUTH");
    expect(store.read()).toEqual(before);
    review(refs[0], "approve");
    expect(() =>
      store.review(before.generation, refs[0], "activate", authority, "test"),
    ).toThrow("STALE_GENERATION");
  });
  it("edit stops the old version; restore copies exact old payload into a new proposal", () => {
    const { store, refs, authority, activate, review } = setup();
    activate();
    const old = structuredClone(resource(store.read(), refs[1]));
    let edited!: ResourceRef, restored!: ResourceRef;
    store.transaction(store.read().generation, (r) => {
      edited = reviseLearning(
        r,
        refs[1],
        { ...old, text: "Nội dung chỉnh sửa" } as typeof old,
        authority.actor,
        now,
      );
    });
    expect(store.select(authority.context, refs[1]).selected).toEqual([]);
    expect(store.select(authority.context, edited).selected).toEqual([]);
    review(edited, "approve");
    review(edited, "activate");
    store.transaction(store.read().generation, (r) => {
      restored = reviseLearning(r, edited, old, authority.actor, now, true);
    });
    expect(resource(store.read(), restored)).toMatchObject({
      text: "text" in old ? old.text : "",
      revision: 3,
      review: { status: "proposed", approval: null, activation: null },
    });
    expect(store.select(authority.context, restored).selected).toEqual([]);
    review(restored, "approve");
    review(restored, "activate");
    expect(store.select(authority.context, restored).selected[0].content).toBe(
      "text" in old ? old.text : "",
    );
    expect(resource(store.read(), refs[1])).toMatchObject({
      text: "text" in old ? old.text : "",
    });
  });
  it("hash mismatch blocks both direct and automatic skill loads; failed materialization keeps approved", () => {
    const { store, refs, authority, review } = setup();
    review(refs[0], "approve");
    review(refs[0], "activate");
    review(refs[2], "approve");
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
      throw Error("disk full");
    });
    expect(() => review(refs[2], "activate")).toThrow("disk full");
    spy.mockRestore();
    expect(resource(store.read(), refs[2]).review.status).toBe("approved");
    review(refs[2], "activate");
    const skill = resource(store.read(), refs[2]) as LearningSkill;
    fs.writeFileSync(
      path.join(
        store.directory,
        "artifacts",
        `${resourceHash(skill.bodyMarkdown)}.md`,
      ),
      "modified",
    );
    expect(store.select(authority.context, refs[2]).denied[0].reason).toBe(
      "ARTIFACT_HASH",
    );
    expect(store.select(authority.context).selected).toEqual([]);
    review(refs[2], "suspend");
    expect(() => review(refs[2], "activate")).toThrow("ARTIFACT_CONFLICT");
  });
  it("refuses unclassified, unresolved, failed evidence, and unverified execution", () => {
    for (const variant of [
      "unclassified",
      "unresolved",
      "evidence",
      "execution",
    ]) {
      const { store, refs, authority, review } = setup();
      let revised!: ResourceRef;
      store.transaction(store.read().generation, (r) => {
        const old = structuredClone(resource(r, refs[0])) as LearningLesson;
        if (variant === "unclassified")
          old.classification = {
            state: "unclassified",
            groupIds: ["unclassified"],
            researchSubtype: null,
            reason: "chưa rõ",
          };
        if (variant === "unresolved")
          old.scope = { kind: "unresolved", reason: "chưa rõ" };
        if (variant === "evidence") old.evidenceIds = [];
        if (variant === "execution") old.claimKind = "execution";
        revised = reviseLearning(r, refs[0], old, authority.actor, now);
      });
      expect(() => review(revised, "approve")).toThrow();
      expect(store.select(authority.context).selected).toEqual([]);
    }
  });
  it("factual legal claims require full primary source and per-invocation verification", () => {
    const { store, refs, authority, origin, review } = setup("research-legal");
    let ref!: ResourceRef;
    const sourceId = randomUUID();
    store.transaction(store.read().generation, (r) => {
      r.sources.push({
        id: sourceId,
        kind: "web_document",
        version: "v1",
        capturedAt: now,
        excerpt: "fixture",
        privacy: { redacted: true, exportable: false },
        locator: {
          url: "https://example.test/law",
          title: "fixture",
          publisher: "fixture",
          retrievedAt: now,
          verifiedAt: now,
          publishedAt: null,
          documentVersion: "v1",
          effectiveFrom: null,
          effectiveTo: null,
          jurisdiction: "fixture",
          sourceClass: "primary",
          readState: "full",
        },
      });
      const e = {
        ...origin.evidence[0],
        id: randomUUID(),
        sourceId,
        kind: "source_check",
      };
      r.evidence.push(e);
      const old = structuredClone(resource(r, refs[0])) as LearningLesson;
      old.claimKind = "factual";
      old.sourceIds = [sourceId];
      old.evidenceIds = [e.id];
      ref = reviseLearning(r, refs[0], old, authority.actor, now);
    });
    expect(() => review(ref, "approve")).toThrow("VERIFY_EACH_USE");
    authority.context.verifiedSourceIds = new Set([sourceId]);
    review(ref, "approve");
    review(ref, "activate");
    expect(store.select(authority.context, ref).selected).toHaveLength(1);
    expect(
      store.select({ ...authority.context, verifiedSourceIds: new Set() }, ref)
        .selected,
    ).toEqual([]);
  });
  it("blocks conflicting rules and rejects stale or terminal activation", () => {
    const { store, refs, authority, review, activate } = setup();
    activate();
    let other!: ResourceRef;
    store.transaction(store.read().generation, (r) => {
      const old = r.rules[0];
      const x = {
        ...structuredClone(old),
        id: randomUUID(),
        text: "Nội dung trái ngược",
        review: {
          status: "proposed" as const,
          approval: null,
          activation: null,
        },
      };
      r.rules.push(x);
      other = { kind: "rule", id: x.id, revision: 1 };
      r.events.push({
        id: randomUUID(),
        sequence: r.events.length + 1,
        transactionId: randomUUID(),
        actor: authority.actor,
        at: now,
        action: "create",
        target: other,
        fromStatus: null,
        toStatus: "proposed",
        reason: "test",
        relatedRefs: [],
      });
    });
    expect(() => review(other, "approve")).toThrow("CONFLICT");
    review(other, "reject");
    expect(() => review(other, "approve")).toThrow("TERMINAL_REVIEW");
  });
  it("imports a signal atomically and idempotently, leaves insufficient locator pending", () => {
    const { store, origin, authority } = setup();
    const signal: LearningSignal = {
      id: randomUUID(),
      key: "a".repeat(64),
      capturedAt: now,
      group: "planning",
      kind: "feedback",
      sourceId: "c:m",
      chatId: "c",
      projectId: "p",
      outcome: "unverified",
      text: "Tách dữ kiện",
      status: "processed",
      retries: 0,
      proposal: { status: "proposed", rule: "Tách dữ kiện và giả định" },
    };
    const resolved = {
      ...origin,
      source: { ...origin.source, id: randomUUID(), kind: "user_feedback" },
      evidence: [],
    };
    store.transaction(store.read().generation, (r) =>
      expect(importSignalProposal(r, signal, () => null, now).status).toBe(
        "waiting",
      ),
    );
    let refs: ResourceRef[] = [];
    store.transaction(store.read().generation, (r) => {
      refs = importSignalProposal(r, signal, () => resolved, now).refs;
    });
    const before = store.read();
    store.transaction(before.generation, (r) =>
      expect(importSignalProposal(r, signal, () => null, now).refs).toEqual(
        refs,
      ),
    );
    expect(store.read().events).toEqual(before.events);
    expect(resource(store.read(), refs[0]).review.status).toBe("proposed");
    expect(store.select(authority.context).selected).toEqual([]);
  });
});
