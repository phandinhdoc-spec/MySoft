import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LearningStore } from "../src/desktop/learning-store.js";
import {
  BASELINE_DEFS,
  checkBaselineDef,
  seedBaseline,
} from "../src/desktop/learning-baseline.js";
import type {
  LearningGroup,
  LearningRegistry,
  LearningRule,
  LearningSkill,
} from "../src/desktop/learning-registry.js";
import type {
  LearningContext,
  ResourceRef,
  ReviewAuthority,
} from "../src/desktop/learning-policy.js";

const t0 = "2026-10-24T03:00:00.000Z";
const directories: string[] = [];
afterEach(() => {
  for (const d of directories.splice(0))
    fs.rmSync(d, { recursive: true, force: true });
});
function newStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-baseline-"));
  directories.push(dir);
  const store = new LearningStore(dir);
  store.prepare(
    {
      state: JSON.stringify({
        version: 1,
        chats: [],
        projects: [],
        attachments: [],
        preferences: {},
        learned: [],
        learnedDrafts: [],
      }),
      queue: JSON.stringify([]),
      skills: {},
    },
    t0,
  );
  return { store, dir };
}
const ctx = (
  groups: LearningGroup[],
  now = t0,
  extra: Partial<LearningContext> = {},
): LearningContext => ({
  now,
  groups,
  canAccess: () => true,
  sourceAvailable: () => true,
  readArtifact: () => null,
  ...extra,
});
const user = (context: LearningContext): ReviewAuthority => ({
  actor: { kind: "user", id: "giao-vien" },
  context,
  canReview: () => true,
});
const ref = (kind: ResourceRef["kind"], x: { id: string; revision: number }) =>
  ({ kind, id: x.id, revision: x.revision }) as ResourceRef;
/** Lesson first: rules and skills depend on it being active. */
function activateAll(
  store: LearningStore,
  key: string,
  context: LearningContext,
) {
  const items = () => {
    const r = store.read();
    const has = (x: { extensions: Record<string, unknown> }) =>
      (x.extensions["pvta.baseline"] as { key: string }).key === key;
    return [
      ...r.lessons.filter(has).map((x) => ref("lesson", x)),
      ...r.skills.filter(has).map((x) => ref("skill", x)),
      ...r.rules.filter(has).map((x) => ref("rule", x)),
    ];
  };
  for (const item of items())
    for (const action of ["approve", "activate"] as const)
      store.review(
        store.read().generation,
        item,
        action,
        user(context),
        "Thầy cô duyệt bản nền",
      );
}
const selectedNames = (
  store: LearningStore,
  context: ReturnType<typeof ctx>,
) => {
  const r = store.read();
  return store
    .select(context)
    .selected.map((s) =>
      s.ref.kind === "skill"
        ? r.skills.find((x) => x.id === s.ref.id)!.name
        : r.rules.find((x) => x.id === s.ref.id)!.key,
    )
    .sort();
};

describe("baseline skills and rules", () => {
  it("defines skill and rules for workflow, planning and each research subtype", () => {
    const groups = BASELINE_DEFS.map((d) => `${d.group}/${d.subtype ?? "-"}`);
    expect(groups).toEqual([
      "workflow/-",
      "planning/-",
      "research/legal",
      "research/news",
      "research/professional",
    ]);
    for (const d of BASELINE_DEFS) {
      expect(checkBaselineDef(d)).toEqual([]);
      expect(d.rules.length).toBeGreaterThanOrEqual(2);
    }
    expect(
      checkBaselineDef({
        ...BASELINE_DEFS[0],
        required: ["cụm-không-tồn-tại"],
      }),
    ).toHaveLength(1);
  });

  it("seeds only proposed records with evidence, is idempotent and keeps legacy data", () => {
    const { store } = newStore();
    const before = store.read();
    const first = seedBaseline(store, { now: t0 });
    expect(first.created).toHaveLength(5);
    const r = store.read();
    expect(r.skills).toHaveLength(5);
    expect(r.rules).toHaveLength(12);
    for (const x of [...r.lessons, ...r.skills, ...r.rules]) {
      expect(x.review).toEqual({
        status: "proposed",
        approval: null,
        activation: null,
      });
      expect(x.classification.state).toBe("classified");
      expect(x.sourceIds.length).toBeGreaterThan(0);
      expect(x.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(r.migration).toEqual(before.migration);
    const again = seedBaseline(store, { now: "2026-10-25T03:00:00.000Z" });
    expect(again.created).toEqual([]);
    expect(again.skipped).toHaveLength(5);
    expect(store.read().generation).toBe(r.generation);
    // Nothing is usable before approval.
    const picked = store.select(ctx(["workflow", "planning", "research"]));
    expect(picked.selected).toEqual([]);
    expect(picked.denied.length).toBe(17);
    expect(new Set(picked.denied.map((d) => d.reason))).toEqual(
      new Set(["NOT_ACTIVE", "SUBTYPE"]),
    );
  });

  it("marks evidence failed when baseline content fails its check", () => {
    const { store } = newStore();
    const bad = { ...BASELINE_DEFS[0], required: ["không tồn tại"] };
    seedBaseline(store, { now: t0, defs: [bad] });
    const r = store.read();
    expect(r.evidence[0].result).toBe("failed");
    expect(() =>
      store.review(
        r.generation,
        ref("lesson", r.lessons[0]),
        "approve",
        user(ctx(["workflow"])),
        "thử",
      ),
    ).toThrow();
    expect(store.read().lessons[0].review.status).toBe("proposed");
  });

  it("refuses approval from a model or an unauthorized reviewer", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const r = store.read();
    const lesson = ref("lesson", r.lessons[0]);
    const context = ctx(["workflow", "planning", "research"]);
    expect(() =>
      store.review(
        r.generation,
        lesson,
        "approve",
        { ...user(context), actor: { kind: "model", id: "nhe" } },
        "x",
      ),
    ).toThrow(/quyền/i);
    expect(() =>
      store.review(
        r.generation,
        lesson,
        "approve",
        { ...user(context), canReview: () => false },
        "x",
      ),
    ).toThrow();
    expect(store.read().lessons[0].review.status).toBe("proposed");
  });

  it("only loads approved, active, in-group content", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const all = ctx(["workflow", "planning", "research"]);
    activateAll(store, "workflow", all);
    // Planning is still proposed; research is not requested.
    const workflowNames = [
      "tu-hoc-quy-trinh-nen",
      "workflow.no-generalize",
      "workflow.no-repeat",
      "workflow.run-evidence",
    ];
    expect(selectedNames(store, ctx(["workflow"]))).toEqual(workflowNames);
    // Wrong group: workflow content is not loaded for planning or Chat.
    expect(selectedNames(store, ctx(["planning"]))).toEqual([]);
    expect(selectedNames(store, ctx(["chat"]))).toEqual([]);
    const denied = store.select(ctx(["planning"])).denied;
    expect(denied.some((d) => d.reason === "GROUP")).toBe(true);
    expect(denied.some((d) => d.reason === "NOT_ACTIVE")).toBe(true);
  });

  it("separates research subtypes", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const legal = ctx(["research"], t0, { researchSubtype: "legal" });
    activateAll(store, "research-legal", legal);
    expect(selectedNames(store, legal)).toEqual([
      "research.legal.reverify",
      "research.legal.source-date",
      "tu-hoc-tim-van-ban-phap-luat",
    ]);
    expect(
      selectedNames(store, ctx(["research"], t0, { researchSubtype: "news" })),
    ).toEqual([]);
    expect(selectedNames(store, ctx(["research"]))).toEqual([]);
    expect(
      store
        .select(ctx(["research"], t0, { researchSubtype: "news" }))
        .denied.some((d) => d.reason === "SUBTYPE"),
    ).toBe(true);
  });

  it("denies wrong scope, unavailable sources and expired review", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const c = ctx(["planning"]);
    activateAll(store, "planning", c);
    expect(selectedNames(store, c)).toHaveLength(4);
    expect(
      selectedNames(store, ctx(["planning"], t0, { canAccess: () => false })),
    ).toEqual([]);
    expect(
      selectedNames(
        store,
        ctx(["planning"], t0, { sourceAvailable: () => false }),
      ),
    ).toEqual([]);
    const late = "2027-02-01T03:00:00.000Z";
    const expired = store.select(ctx(["planning"], late));
    expect(expired.selected).toEqual([]);
    expect(expired.denied.some((d) => d.reason === "REVIEW_DUE")).toBe(true);
  });

  it("suspends a rule and stops loading it, others stay", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const c = ctx(["planning"]);
    activateAll(store, "planning", c);
    const rule = store
      .read()
      .rules.find((x) => x.key === "planning.approve-not-run")!;
    store.review(
      store.read().generation,
      ref("rule", rule),
      "suspend",
      user(c),
      "Tạm dừng",
    );
    const names = selectedNames(store, c);
    expect(names).not.toContain("planning.approve-not-run");
    expect(names).toContain("planning.plan-vs-result");
    expect(names).toHaveLength(3);
  });

  it("edits need re-approval and rollback restores the exact earlier content", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const c = ctx(["workflow"]);
    activateAll(store, "workflow", c);
    const v1 = store.read().rules.find((x) => x.key === "workflow.no-repeat")!;
    const original = v1.text;
    // Edit: a new proposed revision; v1 is suspended and nothing loads it.
    const edited: LearningRule = {
      ...structuredClone(v1),
      text: "Không chạy lại nút đã xong; luôn xóa kết quả cũ trước.",
    };
    store.revise(store.read().generation, ref("rule", v1), edited, user(c));
    let r = store.read();
    const v2 = r.rules.find((x) => x.id === v1.id && x.revision === 2)!;
    expect(v2.review.status).toBe("proposed");
    expect(v2.review.approval).toBeNull();
    expect(
      r.rules.find((x) => x.id === v1.id && x.revision === 1)!.review.status,
    ).toBe("suspended");
    expect(selectedNames(store, c)).not.toContain("workflow.no-repeat");
    for (const action of ["approve", "activate"] as const)
      store.review(
        store.read().generation,
        ref("rule", v2),
        action,
        user(c),
        "duyệt bản sửa",
      );
    const text = () =>
      store
        .select(c)
        .selected.filter((s) => s.ref.id === v1.id)
        .map((s) => s.content);
    expect(text()).toEqual([edited.text]);
    // Rollback to revision 1: creates revision 3 as proposed with v1 content.
    r = store.read();
    store.restore(r.generation, ref("rule", v2), 1, user(c));
    r = store.read();
    const v3 = r.rules.find((x) => x.id === v1.id && x.revision === 3)!;
    expect(v3.text).toBe(original);
    expect(v3.review.status).toBe("proposed");
    expect(
      r.rules.find((x) => x.id === v1.id && x.revision === 2)!.review.status,
    ).toBe("suspended");
    expect(text()).toEqual([]); // not loaded until re-approved
    for (const action of ["approve", "activate"] as const)
      store.review(
        store.read().generation,
        ref("rule", v3),
        action,
        user(c),
        "duyệt phục hồi",
      );
    expect(text()).toEqual([original]);
    // History is preserved.
    const final = store.read();
    expect(
      final.rules.filter((x) => x.id === v1.id).map((x) => x.revision),
    ).toEqual([1, 2, 3]);
    expect(final.events.some((e) => e.action === "restore")).toBe(true);
  });

  it("restores a version whose original review window already passed", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const c = ctx(["planning"]);
    activateAll(store, "planning", c);
    const v1 = store
      .read()
      .rules.find((x) => x.key === "planning.plan-vs-result")!;
    const later = ctx(["planning"], "2027-03-01T00:00:00.000Z");
    store.revise(
      store.read().generation,
      ref("rule", v1),
      { ...structuredClone(v1), text: "Bản sửa." },
      user(later),
    );
    store.restore(
      store.read().generation,
      ref("rule", { id: v1.id, revision: 2 }),
      1,
      user(later),
    );
    const v3 = store
      .read()
      .rules.find((x) => x.id === v1.id && x.revision === 3)!;
    expect(Date.parse(v3.reviewDueAt!)).toBeGreaterThan(Date.parse(later.now));
    expect(() =>
      store.review(
        store.read().generation,
        ref("rule", v3),
        "approve",
        user(later),
        "x",
      ),
    ).toThrow(/dependenc|Chưa đủ|DEPENDENCY/i);
  });

  it("rejects stale generations and keeps the valid version on failure", () => {
    const { store } = newStore();
    seedBaseline(store, { now: t0 });
    const stale = store.read().generation;
    const c = ctx(["workflow"]);
    const lesson = ref(
      "lesson",
      store
        .read()
        .lessons.find(
          (x) =>
            (x.extensions["pvta.baseline"] as { key: string }).key ===
            "workflow",
        )!,
    );
    store.review(stale, lesson, "approve", user(c), "a");
    expect(() => store.review(stale, lesson, "activate", user(c), "b")).toThrow(
      /Kho đã đổi/,
    );
    expect(
      store.read().lessons.find((x) => x.id === lesson.id)!.review.status,
    ).toBe("approved");
  });

  it("does not let imported or hand-edited JSON grant approval", () => {
    const { store, dir } = newStore();
    seedBaseline(store, { now: t0 });
    const file = path.join(dir, "learning-v1", "learning-registry.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LearningRegistry;
    const skill = raw.skills[0] as LearningSkill;
    skill.review.status = "active";
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(() => store.read()).toThrow();
  });
});
