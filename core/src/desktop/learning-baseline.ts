import { randomUUID } from "node:crypto";
import { recordEvent } from "./learning-policy.js";
import type { LearningStore } from "./learning-store.js";
import type {
  Actor,
  LearningEvidence,
  LearningGroup,
  LearningLesson,
  LearningRule,
  LearningSkill,
  LearningSource,
} from "./learning-registry.js";

/**
 * Baseline skills/rules for the workflow, research and planning groups.
 * Everything here is created as `proposed`. Nothing is approved or active until a user
 * approves and activates it through LearningStore.review().
 */
export const BASELINE_KEY = "pvta.baseline";
export const BASELINE_VERSION = "2026-10-24.1";
const BASELINE_CHAT = "67f8bd58-835b-4c86-acfc-efe1887e402a";
const BASELINE_PLAN = "9bc04df0-a5f5-43a6-bab5-830be6f2ae00";

export interface BaselineDef {
  /** Stable key across revisions; used for idempotent seeding. */
  key: string;
  group: Exclude<LearningGroup, "chat" | "unclassified">;
  subtype: "legal" | "news" | "professional" | null;
  lesson: { title: string; statement: string };
  skill: { name: string; description: string; body: string };
  rules: { key: string; title: string; text: string }[];
  /** Phrases the body/rules must contain; the check refuses to mark evidence passed otherwise. */
  required: string[];
}

export const BASELINE_DEFS: BaselineDef[] = [
  {
    key: "workflow",
    group: "workflow",
    subtype: null,
    lesson: {
      title: "Thiết kế và chạy quy trình có bằng chứng",
      statement:
        "Quy trình tốt khai báo rõ đầu vào, đầu ra, phụ thuộc và cách phục hồi; chỉ kết quả chạy thật mới chứng minh thành công.",
    },
    skill: {
      name: "tu-hoc-quy-trinh-nen",
      description:
        "Phân tích đầu vào/đầu ra, chia nút, kiểm tra phụ thuộc và phục hồi khi thiết kế quy trình.",
      body: [
        "# Thiết kế quy trình",
        "",
        "1. Đầu vào và đầu ra: ghi từng nút nhận gì, trả gì, ở đâu; không để nút sau đoán.",
        "2. Chia nút: mỗi nút một mục tiêu kiểm tra được; tách bước đọc, bước sửa và bước kiểm chứng.",
        "3. Phụ thuộc: kiểm tra dependsOn không có vòng và mỗi đầu vào có nút tạo ra nó.",
        "4. Phục hồi: nêu việc làm khi lỗi, nút nào được chạy lại, tệp nào đã bị tác động.",
        "5. Bằng chứng: chỉ báo thành công khi có kết quả chạy thật, không dựa vào lời tự nhận.",
        "",
        "Chạy lặp, quy tắc riêng của một quy trình hoặc dữ liệu riêng không được mở rộng thành quy tắc chung.",
      ].join("\n"),
    },
    rules: [
      {
        key: "workflow.run-evidence",
        title: "Cần bằng chứng chạy thật",
        text: "Chỉ coi nút quy trình thành công khi có kết quả chạy thật hoặc tệp đầu ra đã kiểm tra; không dùng lời tự nhận.",
      },
      {
        key: "workflow.no-repeat",
        title: "Chống chạy lặp",
        text: "Không chạy lại nút đã xong; đối chiếu trạng thái và tệp trước khi thử lại nút bị ngắt.",
      },
      {
        key: "workflow.no-generalize",
        title: "Không mở rộng dữ liệu riêng",
        text: "Không biến dữ liệu hay tên riêng của một quy trình thành quy tắc chung cho quy trình khác.",
      },
    ],
    required: ["Đầu vào", "dependsOn", "Phục hồi", "chạy thật"],
  },
  {
    key: "planning",
    group: "planning",
    subtype: null,
    lesson: {
      title: "Lập kế hoạch tách dữ kiện, giả định và kết quả",
      statement:
        "Kế hoạch cần phân biệt dữ kiện đã xác minh với giả định, và phân biệt duyệt kế hoạch với việc đã thực hiện.",
    },
    skill: {
      name: "tu-hoc-ke-hoach-nen",
      description:
        "Khảo sát dữ kiện, chia bước, phân bổ nguồn lực và phản biện khi lập kế hoạch.",
      body: [
        "# Lập kế hoạch",
        "",
        "1. Khảo sát dữ kiện: liệt kê điều đã đọc kèm nguồn; điều chưa đọc ghi là chưa xác minh.",
        "2. Giả định: tách riêng, đánh dấu có thể sửa, nêu cách kiểm tra.",
        "3. Chia bước: mỗi bước có đầu vào, đầu ra, tiêu chí hoàn thành và cách xử lí lỗi.",
        "4. Nguồn lực: phân bổ thời gian, tệp và công cụ; nêu rủi ro chính.",
        "5. Phản biện: tìm điểm yếu của kế hoạch trước khi trình duyệt.",
        "",
        "Duyệt kế hoạch không có nghĩa đã chạy. Kế hoạch không phải kết quả thực tế.",
      ].join("\n"),
    },
    rules: [
      {
        key: "planning.facts-vs-assumptions",
        title: "Tách dữ kiện và giả định",
        text: "Ghi riêng dữ kiện có nguồn và giả định chưa kiểm chứng; không trình bày giả định như đã xác minh.",
      },
      {
        key: "planning.approve-not-run",
        title: "Duyệt không bằng chạy",
        text: "Duyệt kế hoạch chỉ là đồng ý nội dung; không coi bước nào đã chạy nếu chưa có kết quả thực hiện.",
      },
      {
        key: "planning.plan-vs-result",
        title: "Kế hoạch khác kết quả",
        text: "Không báo kết quả thực tế dựa trên kế hoạch; chỉ báo khi có bằng chứng đã thực hiện.",
      },
    ],
    required: ["Khảo sát dữ kiện", "Giả định", "Phản biện", "Duyệt kế hoạch"],
  },
  ...(
    [
      [
        "legal",
        "tu-hoc-tim-van-ban-phap-luat",
        "Tìm văn bản pháp luật: nguồn gốc, hiệu lực và đối chiếu phiên bản.",
        "văn bản pháp luật",
        "Tìm văn bản pháp luật",
        "Ưu tiên nguồn chính thức; ghi số hiệu, cơ quan ban hành, ngày hiệu lực và văn bản sửa đổi.",
      ],
      [
        "news",
        "tu-hoc-tim-tin-tuc",
        "Tìm tin tức: nguồn gốc, thời điểm đăng và đối chiếu nhiều nguồn.",
        "tin tức",
        "Tìm tin tức",
        "Ghi thời điểm đăng và thời điểm kiểm tra; đối chiếu với ít nhất hai nguồn độc lập khi có thể.",
      ],
      [
        "professional",
        "tu-hoc-tim-tai-lieu-chuyen-mon",
        "Tìm tài liệu chuyên môn: tác giả, phiên bản và phạm vi áp dụng.",
        "tài liệu chuyên môn",
        "Tìm tài liệu chuyên môn",
        "Ghi tác giả, đơn vị phát hành, phiên bản và phạm vi áp dụng; phân biệt hướng dẫn chính thức với bài viết tham khảo.",
      ],
    ] as const
  ).map(
    ([subtype, name, description, label, heading, detail]): BaselineDef => ({
      key: `research-${subtype}`,
      group: "research",
      subtype,
      lesson: {
        title: `Tìm ${label} có nguồn và ngày kiểm tra`,
        statement: `Khi tìm ${label}, phải truy về nguồn gốc, đối chiếu phiên bản và lưu ngày kiểm tra; đoạn tìm kiếm không thay cho toàn văn.`,
      },
      skill: {
        name,
        description,
        body: [
          `# ${heading}`,
          "",
          "1. Tìm nguồn gốc: đi từ kết quả tìm kiếm đến trang gốc; đọc toàn văn trước khi trích.",
          `2. Đặc thù: ${detail}`,
          "3. Đối chiếu phiên bản: so ngày đăng, ngày hiệu lực hoặc số phiên bản giữa các nguồn.",
          "4. Lưu nguồn: ghi địa chỉ, tiêu đề, ngày kiểm tra và trạng thái đã đọc toàn văn hay chỉ đoạn trích.",
          "5. Thông tin có thể thay đổi: yêu cầu xác minh lại trước khi dùng cho quyết định mới.",
        ].join("\n"),
      },
      rules: [
        {
          key: `research.${subtype}.source-date`,
          title: "Lưu nguồn và ngày kiểm tra",
          text: `Khi dùng ${label}, ghi địa chỉ nguồn và ngày kiểm tra; không trích từ đoạn tìm kiếm khi chưa đọc nguồn.`,
        },
        {
          key: `research.${subtype}.reverify`,
          title: "Xác minh lại khi có thể đổi",
          text: `Thông tin ${label} có thể thay đổi: xác minh lại nguồn trước khi dùng cho việc mới.`,
        },
      ],
      required: ["nguồn gốc", "phiên bản", "ngày kiểm tra", "xác minh lại"],
    }),
  ),
];

/** Deterministic check. Evidence is marked passed only when this returns no problems. */
export function checkBaselineDef(def: BaselineDef): string[] {
  const problems: string[] = [];
  const haystack = [
    def.skill.body,
    ...def.rules.map((r) => r.text),
    def.skill.description,
  ].join("\n");
  for (const phrase of def.required)
    if (!haystack.toLowerCase().includes(phrase.toLowerCase()))
      problems.push(`Thiếu nội dung bắt buộc: ${phrase}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.skill.name))
    problems.push("Tên skill sai định dạng");
  if (Buffer.byteLength(def.skill.body) > 64 * 1024)
    problems.push("Skill vượt 64 KiB");
  if (!def.rules.length) problems.push("Không có quy tắc");
  for (const r of def.rules)
    if ([...r.text].length > 160)
      problems.push(`Quy tắc ${r.key} dài quá 160 ký tự`);
  if ((def.group === "research") !== (def.subtype !== null))
    problems.push("Nhóm research cần subtype riêng");
  return problems;
}

const DAY = 86400000;
export interface SeedResult {
  created: string[];
  skipped: string[];
  generation: number;
}

/**
 * Idempotent: a baseline whose key already has any revision is skipped, so reruns never
 * duplicate content or reset a user's review decisions. New records are `proposed` only.
 */
export function seedBaseline(
  store: LearningStore,
  options: { now: string; actor?: Actor; defs?: BaselineDef[] },
): SeedResult {
  const actor: Actor = options.actor ?? { kind: "system", id: "pvta-baseline" };
  const defs = options.defs ?? BASELINE_DEFS;
  const current = store.read();
  const created: string[] = [],
    skipped: string[] = [];
  const todo = defs.filter((d) => {
    const exists = [
      ...current.skills,
      ...current.rules,
      ...current.lessons,
    ].some(
      (x) =>
        (x.extensions[BASELINE_KEY] as { key?: string } | undefined)?.key ===
        d.key,
    );
    if (exists) skipped.push(d.key);
    return !exists;
  });
  if (!todo.length) return { created, skipped, generation: current.generation };
  const next = store.transaction(current.generation, (draft) => {
    const at = options.now;
    for (const d of todo) {
      const group = draft.groups
        .filter((g) => g.id === d.group)
        .sort((a, b) => b.revision - a.revision)[0];
      const interval = Math.min(
        group?.policy.reviewIntervalDays ?? 90,
        d.subtype === "news" ? 1 : d.subtype === "legal" ? 30 : Infinity,
      );
      const reviewDueAt = new Date(
        Date.parse(at) + interval * DAY,
      ).toISOString();
      const problems = checkBaselineDef(d);
      const source: LearningSource = {
        id: randomUUID(),
        kind: "user_request",
        capturedAt: at,
        locator: {
          chatId: BASELINE_CHAT,
          messageId: `plan-${BASELINE_PLAN}`,
          planId: BASELINE_PLAN,
        },
        version: BASELINE_VERSION,
        excerpt: `Yêu cầu bổ sung skill/rules nền cho nhóm ${d.group}${d.subtype ? `/${d.subtype}` : ""}.`,
        privacy: { redacted: true, exportable: true },
      };
      const evidence: LearningEvidence = {
        id: randomUUID(),
        sourceId: source.id,
        kind: "plan_review",
        claim: problems.length
          ? `Chưa đạt kiểm tra nội dung: ${problems.join("; ")}`
          : "Nội dung nền chứa đủ các mục bắt buộc theo đặc tả kế hoạch.",
        locator: { baselineKey: d.key, required: d.required },
        result: problems.length ? "failed" : "passed",
        verifiedAt: at,
        verifiedBy: { kind: "system", id: "pvta-baseline-check" },
        method:
          "Kiểm tra tự động bằng chuỗi bắt buộc; không thay cho duyệt của người dùng.",
      };
      draft.sources.push(source);
      draft.evidence.push(evidence);
      const common = {
        previousRevision: null,
        revision: 1,
        createdAt: at,
        createdBy: actor,
        classification: {
          state: "classified" as const,
          groupIds: [d.group],
          researchSubtype: d.subtype,
          reason: "Nhóm cố định theo đặc tả kế hoạch tự học.",
        },
        scope: { kind: "global" as const },
        sourceIds: [source.id],
        evidenceIds: [evidence.id],
        review: {
          status: "proposed" as const,
          approval: null,
          activation: null,
        },
        reviewDueAt,
        supersedes: [],
        legacyRef: null,
        extensions: {
          [BASELINE_KEY]: { key: d.key, version: BASELINE_VERSION },
        },
      };
      const lesson: LearningLesson = {
        ...common,
        id: randomUUID(),
        title: d.lesson.title,
        statement: d.lesson.statement,
        claimKind: "procedure",
        limitations: [
          "Bản nền chưa được thử với AI thật; cần người dùng duyệt trước khi dùng.",
        ],
        relatedLessonRefs: [],
      };
      const lessonRef = { kind: "lesson" as const, id: lesson.id, revision: 1 };
      const skill: LearningSkill = {
        ...common,
        id: randomUUID(),
        name: d.skill.name,
        description: d.skill.description,
        bodyMarkdown: d.skill.body,
        lessonRefs: [lessonRef],
        dependencyRefs: [],
        artifact: {
          relativePath: `${d.skill.name}/SKILL.md`,
          expectedExistingHash: null,
        },
      };
      const rules: LearningRule[] = d.rules.map((r) => ({
        ...common,
        id: randomUUID(),
        key: r.key,
        title: r.title,
        text: r.text,
        lessonRefs: [lessonRef],
        conflictKey: r.key,
        trigger: "automatic",
      }));
      draft.lessons.push(lesson);
      draft.skills.push(skill);
      draft.rules.push(...rules);
      const tx = randomUUID();
      const all = [
        { kind: "lesson" as const, id: lesson.id },
        { kind: "skill" as const, id: skill.id },
        ...rules.map((r) => ({ kind: "rule" as const, id: r.id })),
      ];
      for (const t of all)
        recordEvent(
          draft,
          { ...t, revision: 1 },
          actor,
          at,
          "create",
          null,
          "proposed",
          `Bản nền ${d.key}; chờ người dùng duyệt`,
          tx,
        );
      created.push(d.key);
    }
  });
  return { created, skipped, generation: next.generation };
}
