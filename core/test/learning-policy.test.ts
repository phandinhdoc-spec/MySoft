import { describe, expect, it } from "vitest";
import {
  classifyContext,
  createUnclassifiedSignal,
  resolveUnclassifiedSignal,
  learningDenial,
  selectLearning,
  type SourceContext,
  type LearningContext,
  type ResourceRef,
} from "../src/desktop/learning-policy.js";
import type {
  LearningRegistry,
  LearningRecord,
  LearningRule,
} from "../src/desktop/learning-registry.js";

describe("Learning Policy - Context Classification into 4 Functional Groups", () => {
  it("classifies Chat context when explicitly flagged or isolated chat session", () => {
    const res1 = classifyContext({ chat: true });
    expect(res1.state).toBe("classified");
    expect(res1.groupIds).toEqual(["chat"]);
    expect(res1.researchSubtype).toBeNull();

    const res2 = classifyContext({ chatId: "chat-123" });
    expect(res2.state).toBe("classified");
    expect(res2.groupIds).toEqual(["chat"]);
    expect(res2.researchSubtype).toBeNull();
  });

  it("classifies Workflow context for workflow design, step, and execution", () => {
    const res1 = classifyContext({ workflow: true });
    expect(res1.state).toBe("classified");
    expect(res1.groupIds).toEqual(["workflow"]);
    expect(res1.researchSubtype).toBeNull();

    const res2 = classifyContext({ workflowId: "wf-abc" });
    expect(res2.state).toBe("classified");
    expect(res2.groupIds).toEqual(["workflow"]);

    const res3 = classifyContext({ runId: "run-1", stepId: "step-2" });
    expect(res3.state).toBe("classified");
    expect(res3.groupIds).toEqual(["workflow"]);
  });

  it("classifies Planning context for planning sessions, plan drafts, and plan steps", () => {
    const res1 = classifyContext({ planning: true });
    expect(res1.state).toBe("classified");
    expect(res1.groupIds).toEqual(["planning"]);
    expect(res1.researchSubtype).toBeNull();

    const res2 = classifyContext({ planId: "plan-xyz", chatId: "chat-1" });
    expect(res2.state).toBe("classified");
    expect(res2.groupIds).toEqual(["planning"]);
    expect(res2.researchSubtype).toBeNull();
  });

  it("classifies Research context with 3 valid sub-branches: legal, news, and professional", () => {
    const legalRes = classifyContext({
      research: true,
      researchSubtype: "legal",
    });
    expect(legalRes.state).toBe("classified");
    expect(legalRes.groupIds).toEqual(["research"]);
    expect(legalRes.researchSubtype).toBe("legal");

    const newsRes = classifyContext({
      toolCall: "office_web_search",
      researchSubtype: "news",
    });
    expect(newsRes.state).toBe("classified");
    expect(newsRes.groupIds).toEqual(["research"]);
    expect(newsRes.researchSubtype).toBe("news");

    const profRes = classifyContext({
      toolCall: "office_web_read",
      researchSubtype: "professional",
    });
    expect(profRes.state).toBe("classified");
    expect(profRes.groupIds).toEqual(["research"]);
    expect(profRes.researchSubtype).toBe("professional");
  });

  it("holds Research in unclassified queue when research subtype is missing or ambiguous", () => {
    const missingSubtype1 = classifyContext({ research: true });
    expect(missingSubtype1.state).toBe("unclassified");
    expect(missingSubtype1.groupIds).toEqual(["unclassified"]);
    expect(missingSubtype1.researchSubtype).toBeNull();
    expect(missingSubtype1.reason).toContain("nhánh con");

    const missingSubtype2 = classifyContext({
      toolCall: "office_web_search",
      researchSubtype: null,
    });
    expect(missingSubtype2.state).toBe("unclassified");
    expect(missingSubtype2.groupIds).toEqual(["unclassified"]);
    expect(missingSubtype2.researchSubtype).toBeNull();

    const invalidSubtype = classifyContext({
      research: true,
      researchSubtype: "invalid" as any,
    });
    expect(invalidSubtype.state).toBe("unclassified");
    expect(invalidSubtype.groupIds).toEqual(["unclassified"]);
    expect(invalidSubtype.researchSubtype).toBeNull();
  });

  it("isolates ambiguous, conflicting, or missing context into unclassified queue", () => {
    // Empty context
    const emptyRes = classifyContext({});
    expect(emptyRes.state).toBe("unclassified");
    expect(emptyRes.groupIds).toEqual(["unclassified"]);
    expect(emptyRes.researchSubtype).toBeNull();
    expect(emptyRes.reason).toContain("Thiếu ngữ cảnh nguồn");

    // Multiple conflicting flags
    const conflict1 = classifyContext({ planning: true, workflow: true });
    expect(conflict1.state).toBe("unclassified");
    expect(conflict1.groupIds).toEqual(["unclassified"]);
    expect(conflict1.reason).toContain("mâu thuẫn");

    const conflict2 = classifyContext({
      chat: true,
      workflow: true,
      research: true,
    });
    expect(conflict2.state).toBe("unclassified");
    expect(conflict2.groupIds).toEqual(["unclassified"]);

    const conflict3 = classifyContext({
      planId: "p1",
      workflowId: "w1",
    });
    expect(conflict3.state).toBe("unclassified");
    expect(conflict3.groupIds).toEqual(["unclassified"]);
  });

  it("never infers functional groups from prose or text without metadata (chống đoán mò)", () => {
    const textWithKeywords: SourceContext = {
      chatId: "chat-only",
      metadata: {
        rawText:
          "Hãy lập kế hoạch quy trình tra cứu văn bản pháp luật số 5512",
      },
    };
    // Even though text has words "kế hoạch", "quy trình", "pháp luật", without flags/tools it stays chat
    const res = classifyContext(textWithKeywords);
    expect(res.state).toBe("classified");
    expect(res.groupIds).toEqual(["chat"]);
    expect(res.researchSubtype).toBeNull();

    // If without chatId or any context, does not guess:
    const emptyWithText: SourceContext = {
      metadata: {
        prompt: "Nghị định 30/2020/NĐ-CP và kế hoạch kiểm tra",
      },
    };
    const resEmpty = classifyContext(emptyWithText);
    expect(resEmpty.state).toBe("unclassified");
    expect(resEmpty.groupIds).toEqual(["unclassified"]);
  });

  it("manages unclassified signals queue and supports explicit manual resolution", () => {
    const now = "2026-10-24T12:00:00.000Z";
    const signal = createUnclassifiedSignal(
      "source-msg-01",
      { toolCall: "office_web_search" },
      now,
    );

    expect(signal.id).toBeDefined();
    expect(signal.status).toBe("unclassified");
    expect(signal.classification.state).toBe("unclassified");
    expect(signal.classification.groupIds).toEqual(["unclassified"]);

    // Manual resolution to legal research
    const resolvedLegal = resolveUnclassifiedSignal(
      signal,
      "research",
      "legal",
    );
    expect(resolvedLegal.state).toBe("classified");
    expect(resolvedLegal.groupIds).toEqual(["research"]);
    expect(resolvedLegal.researchSubtype).toBe("legal");

    // Manual resolution to planning
    const resolvedPlanning = resolveUnclassifiedSignal(signal, "planning");
    expect(resolvedPlanning.state).toBe("classified");
    expect(resolvedPlanning.groupIds).toEqual(["planning"]);
    expect(resolvedPlanning.researchSubtype).toBeNull();

    // Manual resolution to research without subtype fails
    expect(() => resolveUnclassifiedSignal(signal, "research", null)).toThrow();
  });

  it("enforces policy denial UNCLASSIFIED and SUBTYPE on learning resources", () => {
    const now = "2026-10-24T12:00:00.000Z";
    const rule: LearningRule = {
      id: "rule-1",
      revision: 1,
      previousRevision: null,
      createdAt: now,
      createdBy: { kind: "user", id: "u1" },
      classification: {
        state: "unclassified",
        groupIds: ["unclassified"],
        researchSubtype: null,
        reason: "Chờ phân loại",
      },
      scope: { kind: "global" },
      sourceIds: ["s1"],
      evidenceIds: ["e1"],
      review: { status: "proposed", approval: null, activation: null },
      reviewDueAt: "2026-11-24T12:00:00.000Z",
      supersedes: [],
      legacyRef: null,
      extensions: {},
      key: "test.rule",
      title: "Test Rule",
      text: "Test text",
      lessonRefs: [],
      conflictKey: null,
      trigger: "automatic",
    };

    const mockRegistry = {
      schemaVersion: 1,
      generation: 1,
      groups: [
        {
          id: "planning",
          revision: 1,
          enabled: true,
          allowedSourceKinds: ["user_request"],
          skillRefs: [],
          ruleRefs: [],
          policy: {
            reviewRequired: true,
            reviewIntervalDays: 90,
            verifyEachUse: false,
          },
          updatedAt: now,
        },
      ],
      rules: [rule],
      lessons: [],
      skills: [],
      sources: [
        {
          id: "s1",
          kind: "user_request",
          capturedAt: now,
          locator: {},
          version: null,
          excerpt: "ex",
          privacy: { redacted: true, exportable: true },
        },
      ],
      evidence: [],
      events: [],
    } as unknown as LearningRegistry;

    const mockContext: LearningContext = {
      now,
      groups: ["planning"],
      canAccess: () => true,
      sourceAvailable: () => true,
      readArtifact: () => null,
    };

    const ref: ResourceRef = { kind: "rule", id: "rule-1", revision: 1 };
    expect(learningDenial(mockRegistry, ref, mockContext)).toBe("UNCLASSIFIED");
  });
});
