/**
 * Bộ 5 tính năng sư phạm mới (PVTA v1.4.1) dùng chung cho cả PVTA Chat (Desktop) và Office Add-in:
 * 1. Trình tạo Đề thi & Ma trận 4 bước theo CT GDPT 2018 (Assessment Wizard)
 * 2. Công cụ Trộn đề trắc nghiệm hoán vị & Xuất bảng đáp án chấm tự động (Exam Mixer)
 * 3. Trình xem Diff View rà soát thể thức văn bản hành chính NĐ 30/2020 & căn cứ pháp lý (Admin Diff Reviewer)
 * 4. Trợ lý Nhận xét Học bạ & Sổ điểm thông minh theo Thông tư 22/27 (Gradebook Assistant)
 * 5. Chuyển đổi Giáo án Word (5512) sang Slide PowerPoint 1-Click (Lesson-to-Slide Bridge)
 */

import {readAssessmentRows} from './assessment-source.js';
export type FeatureKey = "assessment" | "mixer" | "diff" | "gradebook" | "slides";

export interface FeatureMeta {
  key: FeatureKey;
  title: string;
  shortTitle: string;
  badge: string;
  tone: "indigo" | "violet" | "amber" | "emerald" | "rose";
  icon: string;
  desc: string;
}

export const TEACHER_FEATURES: readonly FeatureMeta[] = [
  {
    key: "assessment",
    title: "Ma trận & Đề kiểm tra GDPT 2018",
    shortTitle: "Ma trận & Đề",
    badge: "GDPT 2018",
    tone: "indigo",
    icon: "exam",
    desc: "Thiết lập 4 bước ma trận, bản đặc tả và sinh đề thi định dạng mới (Nhiều lựa chọn, Đúng/Sai, Trả lời ngắn, Tự luận).",
  },
  {
    key: "mixer",
    title: "Trộn đề trắc nghiệm & Phiếu đáp án",
    shortTitle: "Trộn đề",
    badge: "Hoán vị",
    tone: "violet",
    icon: "shuffle",
    desc: "Hoán vị câu hỏi và phương án A/B/C/D ra nhiều mã đề (101, 102…), xuất bảng đáp án chuẩn chấm tự động.",
  },
  {
    key: "diff",
    title: "Diff View Rà soát Thể thức NĐ 30 & Pháp lý",
    shortTitle: "Rà soát NĐ30",
    badge: "NĐ 30/2020",
    tone: "amber",
    icon: "diff",
    desc: "Đối chiếu trực quan 2 cột lỗi thể thức hành chính, ngày tháng, quốc hiệu và cảnh báo thông tư hết hiệu lực.",
  },
  {
    key: "gradebook",
    title: "Nhận xét Học bạ & Phân tích điểm TT 22/27",
    shortTitle: "Sổ điểm TT22/27",
    badge: "TT 22 & 27",
    tone: "emerald",
    icon: "grade",
    desc: "Tính ĐTBmhk tự động, thống kê phổ điểm và sinh nhận xét học bạ cá nhân hóa không trùng lặp.",
  },
  {
    key: "slides",
    title: "Chuyển Giáo án 5512 sang Slide 1-Click",
    shortTitle: "Giáo án → Slide",
    badge: "CV 5512",
    tone: "rose",
    icon: "slides",
    desc: "Tự động bóc tách 4 hoạt động dạy học từ Kế hoạch bài dạy 5512 thành kịch bản trình chiếu PowerPoint 16:9.",
  },
] as const;

// ============================================================================
// 1. TRÌNH TẠO ĐỀ THI & MA TRẬN 4 BƯỚC (ASSESSMENT WIZARD - GDPT 2018)
// ============================================================================

export interface AssessmentTopicUnit {
  name: string;
  mcqNB: number;
  mcqTH: number;
  mcqVD: number;
  tfCount: number; // Mỗi câu Đúng/Sai gồm 4 ý a,b,c,d (1.0 điểm)
  shortNB: number;
  shortTH: number;
  shortVD: number;
  essayTH: number;
  essayVD: number;
  essayPoints: number;
}

export interface AssessmentSpec {
  subject: string;
  grade: string;
  textbook: "Kết nối tri thức với cuộc sống" | "Chân trời sáng tạo" | "Cánh diều";
  examType: "Giữa kì I" | "Cuối kì I" | "Giữa kì II" | "Cuối kì II" | "Thường xuyên (15 phút)" | " định kì (45 phút)";
  durationMinutes: number;
  mcqPointEach: number;
  tfPointEach: number;
  shortPointEach: number;
  topics: AssessmentTopicUnit[];
}

export interface AssessmentSummary {
  totalQuestions: number;
  totalPoints: number;
  nbPoints: number;
  thPoints: number;
  vdPoints: number;
  nbPercent: number;
  thPercent: number;
  vdPercent: number;
  matrixMarkdown: string;
  promptForAi: string;
}

export const DEFAULT_ASSESSMENT_SPEC: AssessmentSpec = {
  subject: "Khoa học tự nhiên",
  grade: "8",
  textbook: "Kết nối tri thức với cuộc sống",
  examType: "Giữa kì I",
  durationMinutes: 60,
  mcqPointEach: 0.25,
  tfPointEach: 1.0,
  shortPointEach: 0.5,
  topics: [
    {
      name: "Chủ đề 1: Phản ứng hóa học và năng lượng",
      mcqNB: 4,
      mcqTH: 2,
      mcqVD: 0,
      tfCount: 1,
      shortNB: 1,
      shortTH: 1,
      shortVD: 0,
      essayTH: 1,
      essayVD: 0,
      essayPoints: 1.5,
    },
    {
      name: "Chủ đề 2: Khối lượng riêng và áp suất",
      mcqNB: 4,
      mcqTH: 2,
      mcqVD: 0,
      tfCount: 1,
      shortNB: 0,
      shortTH: 1,
      shortVD: 1,
      essayTH: 0,
      essayVD: 1,
      essayPoints: 1.5,
    },
  ],
};

export function buildAssessmentMatrix(spec: AssessmentSpec): AssessmentSummary {
  let nbPoints = 0;
  let thPoints = 0;
  let vdPoints = 0;
  let totalQuestions = 0;

  const rows: string[] = [];
  spec.topics.forEach((t, idx) => {
    const pMcqNB = t.mcqNB * spec.mcqPointEach;
    const pMcqTH = t.mcqTH * spec.mcqPointEach;
    const pMcqVD = t.mcqVD * spec.mcqPointEach;
    // Câu Đúng/Sai (4 ý): phân bổ chuẩn 2 ý NB (0.5đ), 1 ý TH (0.25đ), 1 ý VD (0.25đ)
    const pTfNB = t.tfCount * spec.tfPointEach * 0.5;
    const pTfTH = t.tfCount * spec.tfPointEach * 0.25;
    const pTfVD = t.tfCount * spec.tfPointEach * 0.25;
    const pShortNB = t.shortNB * spec.shortPointEach;
    const pShortTH = t.shortTH * spec.shortPointEach;
    const pShortVD = t.shortVD * spec.shortPointEach;

    const essayTotalCount = t.essayTH + t.essayVD;
    const pEssayTH = essayTotalCount > 0 ? (t.essayPoints * t.essayTH) / essayTotalCount : 0;
    const pEssayVD = essayTotalCount > 0 ? (t.essayPoints * t.essayVD) / essayTotalCount : 0;

    nbPoints += pMcqNB + pTfNB + pShortNB;
    thPoints += pMcqTH + pTfTH + pShortTH + pEssayTH;
    vdPoints += pMcqVD + pTfVD + pShortVD + pEssayVD;

    const unitQ =
      t.mcqNB + t.mcqTH + t.mcqVD + t.tfCount + t.shortNB + t.shortTH + t.shortVD + t.essayTH + t.essayVD;
    const unitPts =
      pMcqNB + pMcqTH + pMcqVD + t.tfCount * spec.tfPointEach + pShortNB + pShortTH + pShortVD + t.essayPoints;
    totalQuestions += unitQ;

    rows.push(
      `| ${idx + 1} | ${t.name} | ${t.mcqNB}/${t.mcqTH}/${t.mcqVD} | ${t.tfCount} câu (${t.tfCount * 4} ý) | ${t.shortNB}/${t.shortTH}/${t.shortVD} | ${t.essayTH}/${t.essayVD} (${t.essayPoints.toFixed(2)}đ) | **${unitPts.toFixed(2)}đ** |`,
    );
  });

  const totalPoints = Number((nbPoints + thPoints + vdPoints).toFixed(2));
  const safeTotal = totalPoints > 0 ? totalPoints : 10;
  const nbPercent = Math.round((nbPoints / safeTotal) * 100);
  const thPercent = Math.round((thPoints / safeTotal) * 100);
  const vdPercent = Math.max(0, 100 - nbPercent - thPercent);

  const matrixMarkdown = [
    `### BẢNG MA TRẬN ĐẶC TẢ ĐỀ KIỂM TRA ${spec.examType.toUpperCase()}`,
    `- **Môn học:** ${spec.subject} · **Khối lớp:** ${spec.grade} · **Bộ sách:** ${spec.textbook}`,
    `- **Thời gian làm bài:** ${spec.durationMinutes} phút · **Tổng điểm:** ${totalPoints.toFixed(2)} điểm (${totalQuestions} câu)`,
    `- **Tỷ lệ mức độ nhận thức:** Nhận biết **${nbPercent}%** (${nbPoints.toFixed(2)}đ) · Thông hiểu **${thPercent}%** (${thPoints.toFixed(2)}đ) · Vận dụng **${vdPercent}%** (${vdPoints.toFixed(2)}đ)`,
    "",
    "| TT | Chủ đề / Nội dung | Phần I: Nhiều lựa chọn (NB/TH/VD) | Phần II: Đúng/Sai | Phần III: Trả lời ngắn (NB/TH/VD) | Phần IV: Tự luận (TH/VD) | Tổng điểm |",
    "| :---: | :--- | :---: | :---: | :---: | :---: | :---: |",
    ...rows,
  ].join("\n");

  const promptForAi = [
    `/office-dap-an Hãy biên soạn trọn bộ hồ sơ đề kiểm tra chuẩn Chương trình GDPT 2018 cho môn ${spec.subject} lớp ${spec.grade} (Bộ sách ${spec.textbook}), kỳ kiểm tra ${spec.examType}, thời gian ${spec.durationMinutes} phút.`,
    "",
    "Yêu cầu xuất đầy đủ 4 phần rõ ràng theo ma trận dưới đây:",
    "1. Bảng Ma trận đề kiểm tra & Bản đặc tả yêu cầu cần đạt theo từng chủ đề.",
    "2. Đề kiểm tra chính thức gồm: Phần I (Trắc nghiệm nhiều lựa chọn 4 phương án A, B, C, D), Phần II (Trắc nghiệm Đúng/Sai mỗi câu 4 ý a, b, c, d), Phần III (Trắc nghiệm trả lời ngắn), Phần IV (Tự luận).",
    "3. Bảng Đáp án và Hướng dẫn chấm chi tiết kèm thang điểm từng ý.",
    "",
    matrixMarkdown,
  ].join("\n");

  return {
    totalQuestions,
    totalPoints,
    nbPoints: Number(nbPoints.toFixed(2)),
    thPoints: Number(thPoints.toFixed(2)),
    vdPoints: Number(vdPoints.toFixed(2)),
    nbPercent,
    thPercent,
    vdPercent,
    matrixMarkdown,
    promptForAi,
  };
}

// ============================================================================
// 2. CÔNG CỤ TRỘN ĐỀ TRẮC NGHIỆM HOÁN VỊ & XUẤT ĐÁP ÁN (EXAM MIXER)
// ============================================================================

export interface ParsedMcqQuestion {
  index: number;
  stem: string;
  options: [string, string, string, string];
  correctIndex: number; // 0 = A, 1 = B, 2 = C, 3 = D
}

export interface MixedExamVariant {
  code: string;
  questions: {
    number: number;
    stem: string;
    options: { label: "A" | "B" | "C" | "D"; text: string }[];
    answer: "A" | "B" | "C" | "D";
  }[];
  formattedText: string;
}

export interface MixedExamResult {
  variants: MixedExamVariant[];
  answerMatrixMarkdown: string;
  answerCsv: string;
}

export const SAMPLE_RAW_EXAM = `Câu 1: Đơn vị đo áp suất trong hệ đo lường quốc tế SI là gì?
*A. Pascal (Pa)
B. Newton (N)
C. Joule (J)
D. Watt (W)

Câu 2: Trong phản ứng hóa học, đại lượng nào sau đây luôn được bảo toàn theo định luật bảo toàn khối lượng?
A. Số phân tử của các chất
B. Thể tích của hỗn hợp khí
*C. Tổng khối lượng của các chất tham gia và sản phẩm
D. Số mol của các chất phản ứng

Câu 3: Khi tăng diện tích mặt bị ép lên 2 lần và giữ nguyên áp lực thì áp suất tác dụng lên mặt bị ép sẽ thay đổi như thế nào?
A. Tăng lên 2 lần
*B. Giảm đi 2 lần
C. Không thay đổi
D. Tăng lên 4 lần

Câu 4: Dấu hiệu nào sau đây chứng tỏ chắc chắn đã có phản ứng hóa học xảy ra?
A. Chất rắn hòa tan vào nước tạo dung dịch trong suốt
B. Nước đá tan chảy thành nước lỏng ở nhiệt độ phòng
*C. Xuất hiện chất kết tủa mới hoặc có khí sủi bọt thoát ra
D. Dây tóc bóng đèn nóng sáng khi có dòng điện chạy qua`;

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function parseMcqQuestions(raw: string): ParsedMcqQuestion[] {
  const fullSource = raw.trim() || SAMPLE_RAW_EXAM;
  // Cắt bỏ phần Đúng/Sai (Phần II), Tự luận (Phần III) hoặc Hướng dẫn chấm nếu người dùng tải cả tệp đề tổng hợp
  const cutoffMatch = fullSource.match(/\n\s*(?:PHẦN\s+II\b|PHẦN\s+2\b|II\.\s*TRẮC\s+NGHIỆM\s+ĐÚNG|PHẦN\s+III\b|III\.\s*TỰ\s+LUẬN|HƯỚNG\s+DẪN\s+CHẤM)/i);
  const source = cutoffMatch && cutoffMatch.index ? fullSource.slice(0, cutoffMatch.index) : fullSource;

  const blocks = source
    .split(/(?:^|\n)(?=\s*(?:\*\*)?(?:Câu|Question)\s*\d+\s*[:.])/i)
    .map((b) => b.trim())
    .filter((b) => /^(?:\*\*)?(?:Câu|Question)\s*\d+\s*[:.]/i.test(b));

  const parsed: ParsedMcqQuestion[] = [];
  blocks.forEach((block) => {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return;

    const stemParts: string[] = [
      lines[0]!.replace(/^(?:\*\*)?(?:Câu|Question)\s*\d+\s*[:.](?:\*\*)?\s*/i, "").trim(),
    ];
    const optMap: Record<string, string> = {};
    let correctIndex = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.replace(/\*\*/g, "");
      const ansHint = /^Đáp\s*án\s*[:=]\s*([A-D])/i.exec(line);
      if (ansHint) {
        correctIndex = "ABCD".indexOf(ansHint[1]!.toUpperCase());
        continue;
      }
      // Hỗ trợ nhiều đáp án trên cùng 1 dòng (VD: A. từ trường. B. điện trường. C. ... D. ...)
      const inlineMatches = Array.from(
        line.matchAll(/(?:^|\s+)(\*)?([A-D])\s*[.)]\s*(.+?)(?=\s+\*?[A-D]\s*[.)]\s+|$)/g),
      );
      if (inlineMatches.length > 0) {
        for (const m of inlineMatches) {
          const isStar = Boolean(m[1]);
          const letter = m[2]!.toUpperCase();
          const content = m[3]!.trim();
          optMap[letter] = content;
          if (isStar) {
            correctIndex = "ABCD".indexOf(letter);
          }
        }
      } else if (Object.keys(optMap).length === 0) {
        stemParts.push(line);
      }
    }

    // Chỉ nhận câu hỏi có ít nhất 2 phương án lựa chọn thực sự
    if (Object.keys(optMap).length < 2) return;

    const options: [string, string, string, string] = [
      optMap.A ?? "Phương án A",
      optMap.B ?? "Phương án B",
      optMap.C ?? "Phương án C",
      optMap.D ?? "Phương án D",
    ];

    parsed.push({
      index: parsed.length + 1,
      stem: stemParts.join(" ").trim(),
      options,
      correctIndex: Math.max(0, Math.min(3, correctIndex)),
    });
  });

  return parsed;
}

export function mixExamVariants(
  rawText: string,
  options: {
    variantCount: number;
    startCode?: number;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    examTitle?: string;
  },
): MixedExamResult {
  const questions = parseMcqQuestions(rawText);
  const count = Math.max(1, Math.min(24, options.variantCount || 4));
  const startCode = options.startCode ?? 101;
  const doShuffleQ = options.shuffleQuestions !== false;
  const doShuffleOpt = options.shuffleOptions !== false;
  const title = options.examTitle?.trim() || "ĐỀ KIỂM TRA TRẮC NGHIỆM";
  const labels: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  const variants: MixedExamVariant[] = [];

  for (let v = 0; v < count; v++) {
    const code = String(startCode + v);
    const rng = seededRng(10007 * (v + 1) + startCode);
    const orderedQuestions = doShuffleQ ? shuffleWithRng(questions, rng) : [...questions];

    const mixedQs = orderedQuestions.map((q, qIdx) => {
      const indexedOpts = q.options.map((text, origIdx) => ({
        text,
        isCorrect: origIdx === q.correctIndex,
      }));
      const finalOpts = doShuffleOpt ? shuffleWithRng(indexedOpts, rng) : indexedOpts;
      const correctPos = Math.max(
        0,
        finalOpts.findIndex((o) => o.isCorrect),
      );

      return {
        number: qIdx + 1,
        stem: q.stem,
        options: finalOpts.map((o, i) => ({
          label: labels[i]!,
          text: o.text,
        })),
        answer: labels[correctPos]!,
      };
    });

    const formattedText = [
      `${title.toUpperCase()} — MÃ ĐỀ: ${code}`,
      `Họ và tên học sinh: .................................................... Lớp: .............`,
      "",
      ...mixedQs.map((mq) =>
        [
          `Câu ${mq.number}: ${mq.stem}`,
          ...mq.options.map((o) => `  ${o.label}. ${o.text}`),
        ].join("\n"),
      ),
    ].join("\n\n");

    variants.push({ code, questions: mixedQs, formattedText });
  }

  const headerCodes = variants.map((v) => `Mã ${v.code}`).join(" | ");
  const sepCodes = variants.map(() => ":---:").join(" | ");
  const maxQ = questions.length;
  const matrixRows: string[] = [];
  const csvRows: string[] = [["Cau", ...variants.map((v) => `Ma_${v.code}`)].join(",")];

  for (let i = 0; i < maxQ; i++) {
    const rowAnswers = variants.map((v) => v.questions[i]?.answer ?? "A");
    matrixRows.push(`| Câu ${i + 1} | ${rowAnswers.map((a) => `**${a}**`).join(" | ")} |`);
    csvRows.push([String(i + 1), ...rowAnswers].join(","));
  }

  const answerMatrixMarkdown = [
    `### BẢNG ĐÁP ÁN TỔNG HỢP (${variants.length} MÃ ĐỀ)`,
    `| Câu | ${headerCodes} |`,
    `| :---: | ${sepCodes} |`,
    ...matrixRows,
  ].join("\n");

  return {
    variants,
    answerMatrixMarkdown,
    answerCsv: csvRows.join("\n"),
  };
}

// ============================================================================
// 3. DIFF VIEW RÀ SOÁT THỂ THỨC VĂN BẢN NĐ 30/2020 & CĂN CỨ PHÁP LÝ
// ============================================================================

export interface AdminIssue {
  id: string;
  category: "the-thuc" | "phap-ly" | "chinh-ta";
  title: string;
  before: string;
  after: string;
  explanation: string;
}

export interface AdminReviewResult {
  originalText: string;
  normalizedText: string;
  issues: AdminIssue[];
  summaryMarkdown: string;
}

export const SAMPLE_ADMIN_DOC = `Cộng hoà xã hội chủ nghĩa Việt Nam
Độc lập - Tự do - Hạnh phúc

Số: 12/KH-THCS
Thành phố Hồ Chí Minh, ngày 5 tháng 1 năm 2026

KẾ HOẠCH
Tổ chức kiểm tra, đánh giá định kỳ học kỳ II năm học 2025 - 2026

Căn cứ Thông tư số 58/2011/TT-BGDĐT và Thông tư 26/2020/TT-BGDĐT của Bộ Giáo dục và Đào tạo về quy chế đánh giá, xếp loại học sinh trung học;
Căn cứ Công văn 5555/BGDĐT-GDTrH về việc hướng dẫn sinh hoạt chuyên môn , nhà trường triển khai kế hoạch kiểm tra định kỳ học kỳ II .`;

export function reviewAdminDocument(rawText: string, acceptedIssueIds?: Set<string>): AdminReviewResult {
  const originalText = rawText.trim() || SAMPLE_ADMIN_DOC;
  let working = originalText;
  const issues: AdminIssue[] = [];

  const rules: {
    id: string;
    category: AdminIssue["category"];
    title: string;
    pattern: RegExp;
    replace: string | ((match: string, ...groups: string[]) => string);
    explanation: string;
  }[] = [
    {
      id: "quoc-hieu",
      category: "the-thuc",
      title: "Quốc hiệu chưa viết in hoa toàn bộ theo Nghị định 30/2020/NĐ-CP",
      pattern: /Cộng\s+h(?:òa|oà)\s+xã\s+hội\s+chủ\s+nghĩa\s+Việt\s+Nam/g,
      replace: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      explanation: "Theo Phụ lục I Nghị định 30/2020/NĐ-CP, Quốc hiệu phải trình bày bằng chữ in hoa, cỡ chữ 12–13, kiểu chữ đứng, đậm.",
    },
    {
      id: "ngay-thang-nd30",
      category: "the-thuc",
      title: "Ngày nhỏ hơn 10 và tháng 1, 2 phải ghi thêm số 0 phía trước",
      pattern: /ngày\s+([1-9])\s+tháng\s+([12])(?=\s+năm\s+\d{4})/gi,
      replace: (_m, d, mo) => `ngày 0${d} tháng 0${mo}`,
      explanation: "Theo khoản 1 Điều 12 Nghị định 30/2020/NĐ-CP, ngày nhỏ hơn 10 và tháng 1, 2 phải ghi thêm chữ số 0 ở trước (ví dụ: ngày 05 tháng 01).",
    },
    {
      id: "ngay-le-nd30",
      category: "the-thuc",
      title: "Ngày nhỏ hơn 10 phải ghi thêm chữ số 0 phía trước",
      pattern: /ngày\s+([1-9])\s+tháng\s+(0[1-9]|1[0-2])(?=\s+năm\s+\d{4})/gi,
      replace: (_m, d, mo) => `ngày 0${d} tháng ${mo}`,
      explanation: "Theo Nghị định 30/2020/NĐ-CP, ngày từ 1 đến 9 phải có số 0 đứng trước.",
    },
    {
      id: "tt58-26-expired",
      category: "phap-ly",
      title: "Căn cứ pháp lý đã hết hiệu lực (Thông tư 58/2011 & Thông tư 26/2020)",
      pattern: /Thông tư (?:số )?58\/2011\/TT-BGDĐT(?:\s+và\s+Thông tư (?:số )?26\/2020\/TT-BGDĐT)?/gi,
      replace: "Thông tư số 22/2021/TT-BGDĐT",
      explanation: "Đối với chương trình GDPT 2018 cấp THCS/THPT, việc đánh giá học sinh áp dụng theo Thông tư 22/2021/TT-BGDĐT (thay thế TT 58/2011 và TT 26/2020).",
    },
    {
      id: "tt30-22-tieu-hoc",
      category: "phap-ly",
      title: "Căn cứ đánh giá Tiểu học cũ (Thông tư 30/2014 hoặc 22/2016)",
      pattern: /Thông tư (?:số )?(?:30\/2014|22\/2016)\/TT-BGDĐT/gi,
      replace: "Thông tư số 27/2020/TT-BGDĐT",
      explanation: "Đánh giá học sinh Tiểu học theo Chương trình GDPT 2018 hiện hành áp dụng theo Thông tư số 27/2020/TT-BGDĐT.",
    },
    {
      id: "cv5512-update",
      category: "phap-ly",
      title: "Bổ sung căn cứ Công văn 5512/BGDĐT-GDTrH về kế hoạch bài dạy & kiểm tra",
      pattern: /Công văn (?:số )?5555\/BGDĐT-GDTrH/gi,
      replace: "Công văn số 5512/BGDĐT-GDTrH",
      explanation: "Công văn 5512/BGDĐT-GDTrH là văn bản hướng dẫn xây dựng và tổ chức thực hiện kế hoạch giáo dục của nhà trường theo CT GDPT 2018.",
    },
    {
      id: "dau-cau-khoang-trang",
      category: "chinh-ta",
      title: "Khoảng trắng thừa trước dấu phẩy hoặc dấu chấm",
      pattern: /\s+([,.!;:])/g,
      replace: "$1",
      explanation: "Chuẩn thể thức văn bản tiếng Việt: không đặt khoảng trắng trước dấu câu (dấu phẩy, dấu chấm, dấu chấm phẩy).",
    },
  ];

  for (const r of rules) {
    const match = r.pattern.exec(working);
    r.pattern.lastIndex = 0;
    if (match) {
      const beforeSnippet = match[0]!;
      const afterSnippet = beforeSnippet.replace(r.pattern, r.replace as string);
      issues.push({
        id: r.id,
        category: r.category,
        title: r.title,
        before: beforeSnippet,
        after: afterSnippet,
        explanation: r.explanation,
      });
      if (!acceptedIssueIds || acceptedIssueIds.has(r.id)) {
        working = working.replace(r.pattern, r.replace as string);
      }
    }
  }

  const summaryMarkdown = [
    `### KẾT QUẢ RÀ SOÁT THỂ THỨC (NĐ 30/2020/NĐ-CP) & CĂN CỨ PHÁP LÝ`,
    `- **Tổng số điểm cần chuẩn hóa:** ${issues.length} mục`,
    ...issues.map(
      (iss, idx) =>
        `${idx + 1}. **[${iss.category === "phap-ly" ? "Pháp lý" : iss.category === "the-thuc" ? "Thể thức NĐ30" : "Chính tả"}] ${iss.title}**\n   - Bản gốc: \`${iss.before}\` → Chuẩn hóa: \`${iss.after}\`\n   - Căn cứ: ${iss.explanation}`,
    ),
  ].join("\n");

  return {
    originalText,
    normalizedText: working,
    issues,
    summaryMarkdown,
  };
}

// ============================================================================
// 4. TRỢ LÝ NHẬN XÉT HỌC BẠ & SỔ ĐIỂM THÔNG MINH (THÔNG TƯ 22 & 27)
// ============================================================================

export interface StudentGradeRow {
  index: number;
  name: string;
  txScores: number[];
  midterm: number;
  finalExam: number;
  average: number;
  level: string;
  comment: string;
}

export interface GradebookAnalysis {
  circular: "TT22" | "TT27";
  subject: string;
  students: StudentGradeRow[];
  classAverage: number;
  counts: Record<string, number>;
  csvOutput: string;
  summaryMarkdown: string;
}

export const SAMPLE_GRADEBOOK_INPUT = `Nguyễn Minh An | 8.5, 9.0, 8.5 | 8.5 | 9.0
Trần Hoàng Bách | 7.0, 6.5, 7.5 | 7.0 | 8.0
Lê Ngọc Châu | 9.0, 9.5, 9.0 | 9.5 | 9.5
Phạm Quốc Duy | 5.5, 6.0, 5.0 | 5.5 | 6.5
Hoàng Thảo My | 4.5, 4.0, 5.0 | 4.5 | 4.5`;

const COMMENT_BANK_TT22: Record<string, string[]> = {
  Tốt: [
    "Nắm vững kiến thức trọng tâm môn {subject}, vận dụng linh hoạt vào giải quyết bài tập thực tiễn và chủ động phát biểu xây dựng bài.",
    "Có tư duy khoa học sắc bén trong môn {subject}, hoàn thành xuất sắc các nhiệm vụ học tập và hỗ trợ tích cực cho các bạn trong nhóm.",
    "Hiểu sâu bản chất kiến thức môn {subject}, trình bày bài làm chặt chẽ, sáng tạo và duy trì phong độ học tập rất ổn định.",
  ],
  Khá: [
    "Nắm được kiến thức cơ bản môn {subject}, có ý thức hợp tác nhóm tốt; cần rèn luyện thêm kỹ năng giải các câu hỏi vận dụng cao.",
    "Chăm chỉ, tích cực hoàn thành nhiệm vụ học tập môn {subject}{progress}; chú ý trình bày lời giải chi tiết để đạt kết quả cao hơn.",
    "Có nền tảng kiến thức môn {subject} vững vàng, tiếp thu bài nhanh; khuyến khích em mạnh dạn trao đổi và tự tin hơn khi kiểm tra.",
  ],
  Đạt: [
    "Nắm được các yêu cầu cơ bản của môn {subject}{progress}, song cần chủ động ôn tập kỹ lý thuyết và làm thêm bài tập rèn luyện ở nhà.",
    "Có cố gắng hoàn thành nhiệm vụ môn {subject}; cần tập trung nghe giảng hơn và rèn kỹ năng tính toán, trình bày cẩn thận.",
  ],
  "Chưa đạt": [
    "Cần củng cố lại kiến thức nền tảng môn {subject}, chủ động hỏi thầy cô và bạn bè khi gặp bài khó để tiến bộ trong học kỳ tới.",
    "Chưa nắm vững các nội dung cốt lõi môn {subject}; cần lập kế hoạch ôn tập từng chủ đề cơ bản và làm đầy đủ bài tập được giao.",
  ],
};

const COMMENT_BANK_TT27: Record<string, string[]> = {
  "Hoàn thành tốt": [
    "Em tiếp thu bài nhanh, nắm chắc kiến thức môn {subject}, chữ viết và trình bày sạch đẹp, hăng hái phát biểu trong giờ học.",
    "Em hoàn thành xuất sắc các nội dung môn {subject}, biết vận dụng kiến thức vào thực tế và luôn tự giác, tích cực hợp tác với bạn.",
  ],
  "Hoàn thành": [
    "Em nắm được kiến thức cơ bản môn {subject}, hoàn thành các bài tập trên lớp; cần rèn tính cẩn thận hơn khi làm bài kiểm tra.",
    "Em có ý thức học tập môn {subject}{progress}, hiểu bài và làm được bài tập; khuyến khích em tự tin phát biểu nhiều hơn.",
  ],
  "Cần cố gắng": [
    "Em cần tập trung hơn trong giờ học môn {subject}, rèn luyện thêm kỹ năng đọc hiểu yêu cầu đề bài và ôn bài thường xuyên ở nhà.",
  ],
};

export function analyzeGradebook(
  rawInput: string,
  options: { circular: "TT22" | "TT27"; subject: string },
): GradebookAnalysis {
  const text = rawInput.trim() || SAMPLE_GRADEBOOK_INPUT;
  const parsedRows = parseExcelGradebook(text);

  const students: StudentGradeRow[] = [];
  const counts: Record<string, number> =
    options.circular === "TT22"
      ? { Tốt: 0, Khá: 0, Đạt: 0, "Chưa đạt": 0 }
      : { "Hoàn thành tốt": 0, "Hoàn thành": 0, "Cần cố gắng": 0 };

  parsedRows.forEach((row, idx) => {
    const name = row.name || `Học sinh ${idx + 1}`;
    const safeTx = row.txScores.length ? row.txScores : [7.5, 7.5];
    const midterm = row.midterm;
    const finalExam = row.finalExam;

    const txSum = safeTx.reduce((a, b) => a + b, 0);
    const avg = Number(((txSum + 2 * midterm + 3 * finalExam) / (safeTx.length + 5)).toFixed(1));

    let level = "";
    if (options.circular === "TT22") {
      level = avg >= 8.0 ? "Tốt" : avg >= 6.5 ? "Khá" : avg >= 5.0 ? "Đạt" : "Chưa đạt";
    } else {
      level = avg >= 8.0 ? "Hoàn thành tốt" : avg >= 5.0 ? "Hoàn thành" : "Cần cố gắng";
    }
    counts[level] = (counts[level] ?? 0) + 1;

    const bank = options.circular === "TT22" ? COMMENT_BANK_TT22[level]! : COMMENT_BANK_TT27[level]!;
    const template = bank[idx % bank.length]!;
    const progressNote = finalExam >= midterm + 0.5 ? ", có sự tiến bộ rõ rệt ở bài kiểm tra cuối kỳ" : "";
    const comment = template
      .replace("{subject}", options.subject || "môn học")
      .replace("{progress}", progressNote);

    students.push({
      index: idx + 1,
      name,
      txScores: safeTx,
      midterm,
      finalExam,
      average: avg,
      level,
      comment,
    });
  });

  const classAverage =
    students.length > 0
      ? Number((students.reduce((s, r) => s + r.average, 0) / students.length).toFixed(2))
      : 0;

  const csvLines = [
    "STT,Ho va ten,Diem TX,Giua ki,Cuoi ki,DTBmhk,Xep loai,Nhan xet hoc ba",
    ...students.map(
      (s) =>
        `${s.index},"${s.name}","${s.txScores.join(" ")}",${s.midterm},${s.finalExam},${s.average},"${s.level}","${s.comment}"`,
    ),
  ];

  const summaryMarkdown = [
    `### BẢNG TỔNG HỢP ĐIỂM & NHẬN XÉT HỌC BẠ (${options.circular === "TT22" ? "THÔNG TƯ 22/2021" : "THÔNG TƯ 27/2020"})`,
    `- **Môn học:** ${options.subject} · **Sĩ số:** ${students.length} học sinh · **Điểm TB lớp:** **${classAverage}**`,
    "",
    "| TT | Họ và tên | Điểm ĐĐGtx | Giữa kì | Cuối kì | ĐTBmhk | Xếp loại | Nhận xét cá nhân hóa |",
    "| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |",
    ...students.map(
      (s) =>
        `| ${s.index} | **${s.name}** | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam} | **${s.average}** | ${s.level} | ${s.comment} |`,
    ),
  ].join("\n");

  return {
    circular: options.circular,
    subject: options.subject,
    students,
    classAverage,
    counts,
    csvOutput: csvLines.join("\n"),
    summaryMarkdown,
  };
}

// ============================================================================
// 5. CHUYỂN ĐỔI GIÁO ÁN WORD (5512) SANG SLIDE POWERPOINT 1-CLICK
// ============================================================================

export interface SlideOutline {
  slideNumber: number;
  activityTag: string;
  title: string;
  bullets: string[];
  speakerNotes: string;
}

export interface LessonSlideDeck {
  lessonTitle: string;
  slides: SlideOutline[];
  markdownPreview: string;
  promptForPowerPoint: string;
}

export const SAMPLE_LESSON_5512 = `BÀI 15: ÁP SUẤT TRÊN MỘT BỀ MẶT (KHTN 8 - Thời lượng: 2 tiết)
I. MỤC TIÊU
1. Kiến thức: Nêu được khái niệm áp lực và áp suất; viết được công thức p = F/S và nêu đơn vị đo áp suất.
2. Năng lực: Giải thích được các hiện tượng thực tế về tăng, giảm áp suất trong đời sống.
3. Phẩm chất: Trung thực, cẩn thận khi làm thí nghiệm khảo sát áp lực.
II. TIẾN TRÌNH DẠY HỌC
Hoạt động 1: Mở đầu / Khởi động
- Tình huống: Vì sao xe tăng nặng hàng chục tấn lại chạy được trên đất mềm còn ô tô nhẹ hơn lại bị lún bánh?
- Học sinh thảo luận cặp đôi trong 2 phút và nêu dự đoán ban đầu.
Hoạt động 2: Hình thành kiến thức mới
- Nội dung 1: Khái niệm áp lực — Áp lực là lực ép có phương vuông góc với mặt bị ép.
- Nội dung 2: Công thức tính áp suất — p = F / S, trong đó F là áp lực (N), S là diện tích bị ép (m2), p là áp suất (Pa).
- Nội dung 3: Nguyên tắc tăng giảm áp suất — Tăng F hoặc giảm S để tăng áp suất (lưỡi dao sắc, mũi đinh nhọn); tăng S để giảm áp suất (bánh xích xe tăng, móng nhà).
Hoạt động 3: Luyện tập
- Câu hỏi nhanh: Tính áp suất của một người nặng 500N đứng bằng hai chân trên sàn, biết diện tích tiếp xúc là 0,02 m2.
- Đáp án: p = 500 / 0,02 = 25.000 Pa.
Hoạt động 4: Vận dụng
- Thiết kế phương án giúp bác nông dân đi trên ruộng bùn lầy không bị lún sâu bằng vật liệu tái chế.`;

export function convertLessonPlanToSlides(
  rawLesson: string,
  options?: { targetSlideCount?: number },
): LessonSlideDeck {
  const text = rawLesson.trim() || SAMPLE_LESSON_5512;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const firstHeading =
    lines.find((l) => /^(?:BÀI|CHỦ ĐỀ|TIẾT)\b/i.test(l)) ?? lines[0] ?? "Bài giảng theo Công văn 5512";

  const extractSection = (regex: RegExp, stopRegex: RegExp): string[] => {
    const startIdx = lines.findIndex((l) => regex.test(l));
    if (startIdx < 0) return [];
    const items: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (stopRegex.test(lines[i]!)) break;
      const cleaned = lines[i]!.replace(/^[-*•+]\s*/, "").trim();
      if (cleaned) items.push(cleaned);
    }
    return items;
  };

  const goals = extractSection(/^I\.\s*MỤC TIÊU/i, /^(?:II\.|Hoạt động\s*1)/i);
  const act1 = extractSection(/Hoạt động\s*1/i, /Hoạt động\s*2/i);
  const act2 = extractSection(/Hoạt động\s*2/i, /Hoạt động\s*3/i);
  const act3 = extractSection(/Hoạt động\s*3/i, /Hoạt động\s*4/i);
  const act4 = extractSection(/Hoạt động\s*4/i, /^$/);

  const targetCount = Math.max(3, Math.min(24, options?.targetSlideCount ?? 5));

  const baseSlides: Omit<SlideOutline, "slideNumber">[] = [];

  // Slide 1: Bìa & Mục tiêu
  baseSlides.push({
    activityTag: "Trang bìa & Mục tiêu",
    title: firstHeading,
    bullets: goals.length
      ? goals.slice(0, 4)
      : [
          "Nắm vững kiến thức trọng tâm của bài học theo CT GDPT 2018",
          "Phát triển năng lực tự học, giải quyết vấn đề và hợp tác nhóm",
          "Vận dụng kiến thức vào giải thích các tình huống thực tiễn",
        ],
    speakerNotes: "GV giới thiệu tên bài học, mục tiêu cần đạt và tạo tâm thế hứng khởi cho học sinh.",
  });

  // Slide 2: Khởi động
  baseSlides.push({
    activityTag: "Hoạt động 1: Khởi động",
    title: "Khởi động & Tình huống có vấn đề",
    bullets: act1.length
      ? act1.slice(0, 4)
      : ["Quan sát hình ảnh/tình huống thực tế đầu giờ", "Thảo luận cặp đôi trong 2 phút để nêu dự đoán"],
    speakerNotes: "GV chiếu câu hỏi khởi động, gọi 2-3 học sinh nêu ý kiến, dẫn dắt vào bài mới.",
  });

  // Hoạt động 2: Hình thành kiến thức
  if (targetCount <= 5) {
    baseSlides.push({
      activityTag: "Hoạt động 2: Hình thành kiến thức",
      title: "Nội dung cốt lõi & Kiến thức mới",
      bullets: act2.length
        ? act2.slice(0, 5)
        : ["Khái niệm, định nghĩa và công thức trọng tâm", "Phân tích ví dụ minh họa và nhận xét"],
      speakerNotes: "GV tổ chức cho HS hoạt động nhóm khám phá kiến thức mới, chốt lại ghi nhớ trọng tâm.",
    });
  } else {
    // Tách Hoạt động 2 thành nhiều slide chi tiết theo số lượng yêu cầu
    const knowledgeItems = act2.length ? act2 : [
      "Khái niệm & Bản chất khoa học của bài học",
      "Công thức tính, quy tắc và mối liên hệ giữa các đại lượng",
      "Thí nghiệm khảo sát và bảng số liệu thực nghiệm",
      "Ví dụ minh họa thực tế và phân tích hiện tượng",
    ];
    const neededKnowledgeSlides = Math.max(2, targetCount - 4);
    for (let k = 0; k < neededKnowledgeSlides; k++) {
      const start = k * 2;
      const subBullets = knowledgeItems.slice(start, start + 3);
      baseSlides.push({
        activityTag: `Hoạt động 2: Kiến thức phần ${k + 1}`,
        title: subBullets[0] ? subBullets[0].split(/[—:-]/)[0]!.trim() : `Kiến thức trọng tâm phần ${k + 1}`,
        bullets: subBullets.length ? subBullets : [`Nội dung chi tiết mục ${k + 1}`, "Phân tích, thảo luận nhóm và rút ra kết luận"],
        speakerNotes: `GV hướng dẫn học sinh thảo luận, làm việc nhóm để làm rõ nội dung mục ${k + 1}.`,
      });
    }
  }

  // Hoạt động 3: Luyện tập
  baseSlides.push({
    activityTag: "Hoạt động 3: Luyện tập",
    title: "Luyện tập & Củng cố kiến thức",
    bullets: act3.length
      ? act3.slice(0, 4)
      : ["Trả lời câu hỏi trắc nghiệm nhanh củng cố kiến thức", "Thực hành giải bài tập áp dụng tại lớp"],
    speakerNotes: "GV tổ chức trò chơi hoặc bài tập nhanh để kiểm tra mức độ hiểu bài của cả lớp.",
  });

  // Nếu người dùng chọn nhiều slide (>= 7), thêm slide Tổng kết & Sơ đồ tư duy
  if (targetCount >= 7) {
    baseSlides.push({
      activityTag: "Tổng kết & Ghi nhớ",
      title: "Sơ đồ tư duy & Ghi nhớ cốt lõi",
      bullets: [
        "Hệ thống hóa các khái niệm, công thức và quy tắc chính",
        "Sơ đồ liên kết kiến thức bài học với thực tế đời sống",
        "Lưu ý các lỗi sai thường gặp khi làm bài tập",
      ],
      speakerNotes: "GV cùng học sinh chốt lại sơ đồ tư duy toàn bài học trước khi chuyển sang phần vận dụng.",
    });
  }

  // Hoạt động 4: Vận dụng
  baseSlides.push({
    activityTag: "Hoạt động 4: Vận dụng",
    title: "Vận dụng thực tiễn & Nhiệm vụ về nhà",
    bullets: act4.length
      ? act4.slice(0, 4)
      : ["Liên hệ giải quyết vấn đề thực tế tại gia đình/địa phương", "Chuẩn bị nội dung cho tiết học tiếp theo"],
    speakerNotes: "GV giao nhiệm vụ vận dụng ở nhà và hướng dẫn tiêu chí đánh giá sản phẩm.",
  });

  // Cân bằng chính xác số lượng slide theo targetCount
  let finalBase = baseSlides;
  if (baseSlides.length > targetCount) {
    finalBase = baseSlides.slice(0, targetCount);
  } else if (baseSlides.length < targetCount) {
    const diff = targetCount - baseSlides.length;
    for (let d = 0; d < diff; d++) {
      finalBase.splice(finalBase.length - 1, 0, {
        activityTag: `Mở rộng & Thảo luận ${d + 1}`,
        title: `Câu hỏi đào sâu & Mở rộng bài học (${d + 1})`,
        bullets: [
          "Tình huống thực tế nâng cao đòi hỏi tư duy giải quyết vấn đề",
          "Thảo luận nhóm và trình bày giải pháp sáng tạo",
          "Liên hệ liên môn và ứng dụng công nghệ hiện đại",
        ],
        speakerNotes: "GV định hướng cho học sinh khá giỏi đào sâu, mở rộng kiến thức bài học.",
      });
    }
  }

  const slides: SlideOutline[] = finalBase.map((s, idx) => ({
    ...s,
    slideNumber: idx + 1,
  }));

  const markdownPreview = [
    `### KỊCH BẢN SLIDE BÀI GIẢNG 16:9 (${slides.length} SLIDES) — ${firstHeading}`,
    ...slides.map(
      (s) =>
        `#### Slide ${s.slideNumber} [${s.activityTag}]: ${s.title}\n${s.bullets.map((b) => `- ${b}`).join("\n")}\n> *Ghi chú GV:* ${s.speakerNotes}`,
    ),
  ].join("\n\n");

  const promptForPowerPoint = [
    `/office-powerpoint Hãy tạo bài trình chiếu PowerPoint (.pptx) tỷ lệ 16:9 hiện đại cho bài học "${firstHeading}" theo đúng cấu trúc ${slides.length} slide từ Kế hoạch bài dạy 5512 dưới đây, có đầy đủ tiêu đề, nội dung cô đọng và ghi chú thuyết trình (Speaker Notes) cho giáo viên:`,
    "",
    markdownPreview,
  ].join("\n");

  return {
    lessonTitle: firstHeading,
    slides,
    markdownPreview,
    promptForPowerPoint,
  };
}


// ============================================================================
// BÓC TÁCH BẢN ĐẶC TẢ YÊU CẦU CẦN ĐẠT (YCCĐ) GDPT 2018 (PHAN VĂN TRỊ)
// ============================================================================

export type CognitiveLevel = "NB" | "TH" | "VD" | "VDC";

export interface SpecYCCDItem {
  id: string;
  topic: string;        // e.g. "Chủ đề 6. Từ", "Chủ đề 7. Trao đổi chất và chuyển hoá NL"
  unit: string;         // e.g. "Từ trường", "Nam châm điện", "Chuyển hoá năng lượng tế bào"
  level: CognitiveLevel; // Nhận biết | Thông hiểu | Vận dụng | Vận dụng cao
  content: string;      // Nội dung Yêu cầu cần đạt chuẩn CT GDPT 2018
  selected: boolean;    // Đưa vào ma trận đề thi
  part1Count: number;   // Số câu Phần I: Trắc nghiệm 4 lựa chọn (0.25đ/câu)
  part2Count: number;   // Số câu Phần II: Đúng/Sai (1.0đ/câu gồm 4 lệnh hỏi a,b,c,d)
  part3Points: number;  // Điểm Phần III: Tự luận (thang điểm 0.25, 0.5, 1.0, 1.5...)
  questionRef?: string; // Ví dụ: "Câu 1", "Câu 17", "Câu 20a"
  source?: {ref:string; levelText:string; form:string; count:string; code:string; inherited:boolean};
}

export interface ParsedSpecification {
  title: string;
  subject: string;
  grade: string;
  semester: string;
  durationMinutes: number;
  textbook: string;
  items: SpecYCCDItem[];
  issues?: string[];
}

export interface SpecAuditSummary {
  part1Count: number;      // Chuẩn 16 câu
  part1Score: number;      // Chuẩn 4.0 điểm
  part2Count: number;      // Chuẩn 2 câu (8 ý)
  part2Score: number;      // Chuẩn 2.0 điểm
  part3Score: number;      // Chuẩn 4.0 điểm
  totalScore: number;      // Chuẩn 10.0 điểm
  nbScore: number;
  thScore: number;
  vdScore: number;
  vdcScore: number;
  nbPercent: number;       // Chuẩn 40%
  thPercent: number;       // Chuẩn 30%
  vdPercent: number;       // Chuẩn 20%
  vdcPercent: number;      // Chuẩn 10% (hoặc 30% VD)
  isStandard10: boolean;
  notes: string[];
}

export function auditSpecification(items: SpecYCCDItem[]): SpecAuditSummary {
  let p1Count = 0;
  let p2Count = 0;
  let p3Score = 0;

  let nbScore = 0;
  let thScore = 0;
  let vdScore = 0;
  let vdcScore = 0;

  items.filter(it => it.selected).forEach(it => {
    const p1 = (it.part1Count || 0) * 0.25;
    const p2 = (it.part2Count || 0) * 1.0;
    const p3 = it.part3Points || 0;

    p1Count += it.part1Count || 0;
    p2Count += it.part2Count || 0;
    p3Score += p3;

    const itemTotal = p1 + p2 + p3;
    if (it.level === "NB") nbScore += itemTotal;
    else if (it.level === "TH") thScore += itemTotal;
    else if (it.level === "VD") vdScore += itemTotal;
    else if (it.level === "VDC") vdcScore += itemTotal;
  });

  const p1Score = Number((p1Count * 0.25).toFixed(2));
  const p2Score = Number((p2Count * 1.0).toFixed(2));
  p3Score = Number(p3Score.toFixed(2));
  const totalScore = Number((p1Score + p2Score + p3Score).toFixed(2));

  const safeTotal = totalScore > 0 ? totalScore : 10;
  const nbPercent = Math.round((nbScore / safeTotal) * 100);
  const thPercent = Math.round((thScore / safeTotal) * 100);
  const vdPercent = Math.round((vdScore / safeTotal) * 100);
  const vdcPercent = Math.max(0, 100 - nbPercent - thPercent - vdPercent);

  const notes: string[] = [];
  if (p1Count !== 16) {
    notes.push(`Phần I hiện có ${p1Count}/16 câu (${p1Score}đ / 4.0đ). Cần chọn đúng 16 câu.`);
  }
  if (p2Count !== 2) {
    notes.push(`Phần II hiện có ${p2Count}/2 câu Đúng/Sai (${p2Score}đ / 2.0đ). Cần chọn đúng 2 câu (8 lệnh hỏi).`);
  }
  if (Math.abs(p3Score - 4.0) > 0.05) {
    notes.push(`Phần III hiện có ${p3Score}đ / 4.0đ Tự luận. Cần cân đối đủ 4.0 điểm.`);
  }
  if (Math.abs(totalScore - 10.0) < 0.05 && p1Count === 16 && p2Count === 2) {
    notes.push("Đề đạt chuẩn 10.0 điểm, cấu trúc 3 phần và tỷ lệ ma trận Bộ GD&ĐT!");
  }

  return {
    part1Count: p1Count,
    part1Score: p1Score,
    part2Count: p2Count,
    part2Score: p2Score,
    part3Score: p3Score,
    totalScore,
    nbScore: Number(nbScore.toFixed(2)),
    thScore: Number(thScore.toFixed(2)),
    vdScore: Number(vdScore.toFixed(2)),
    vdcScore: Number(vdcScore.toFixed(2)),
    nbPercent,
    thPercent,
    vdPercent,
    vdcPercent,
    isStandard10: Math.abs(totalScore - 10.0) < 0.05,
    notes,
  };
}

/**
 * Trích xuất và bóc tách bảng Đặc tả từ tệp Word (.docx), PDF hoặc Markdown văn bản
 */
/**
 * Tự động phân bổ chuẩn 10.0 điểm (16 câu Phần I = 4đ, 2 câu Phần II = 2đ, Phần III = 4đ)
 * theo tỷ lệ nhận thức 40% NB - 30% TH - 20% VD - 10% VDC cho danh sách YCCĐ.
 */
export function autoBalanceSpecification(items: SpecYCCDItem[]): SpecYCCDItem[] {
  if (items.length === 0) return items;
  const cloned = items.map((it) => ({
    ...it,
    selected: false,
    part1Count: 0,
    part2Count: 0,
    part3Points: 0,
  }));

  const nbList = cloned.filter((it) => it.level === "NB");
  const thList = cloned.filter((it) => it.level === "TH");
  const vdList = cloned.filter((it) => it.level === "VD");
  const vdcList = cloned.filter((it) => it.level === "VDC");

  // 1. Phân bổ 16 câu Phần I (4.0 điểm): ưu tiên 12 câu NB + 4 câu TH/VD
  const p1Pool = [...nbList, ...thList, ...vdList, ...cloned];
  for (let i = 0; i < 16; i++) {
    const target = p1Pool[i % p1Pool.length]!;
    target.part1Count += 1;
    target.selected = true;
  }

  // 2. Phân bổ 2 câu Phần II Đúng/Sai (2.0 điểm): ưu tiên TH và NB/VD
  const p2Pool = [...thList, ...nbList, ...vdList, ...cloned];
  for (let i = 0; i < 2; i++) {
    const target = p2Pool[i % p2Pool.length]!;
    target.part2Count += 1;
    target.selected = true;
  }

  // 3. Phân bổ 4.0 điểm Phần III Tự luận: chia đều cho 4 mục ưu tiên VD, VDC, TH, NB
  const p3Pool = [...vdList, ...vdcList, ...thList, ...nbList, ...cloned];
  for (let i = 0; i < 4; i++) {
    const target = p3Pool[i % p3Pool.length]!;
    target.part3Points = Number((target.part3Points + 1.0).toFixed(2));
    target.selected = true;
  }

  return cloned;
}

export function parseSpecificationDocument(rawText: string): ParsedSpecification {
  const fullText = rawText.trim();
  const empty:ParsedSpecification={title:'Bản đặc tả',subject:'',grade:'',semester:'',durationMinutes:0,textbook:'',items:[],issues:[]};
  if (!fullText) return {...empty,issues:['Chưa có nội dung đặc tả.']};
  const rows=readAssessmentRows(fullText);
  if(rows.length){
    const result={...empty,items:[] as SpecYCCDItem[],issues:[] as string[]};
    result.grade=fullText.match(/(?:LỚP|KHTN)\s*(\d{1,2})\b/i)?.[1]||'';
    result.durationMinutes=Number(fullText.match(/(?:làm bài|thời gian)\s*:?\s*(\d+)\s*phút/i)?.[1]||0);
    result.semester=fullText.match(/(?:GIỮA|CUỐI)\s+(?:(?:HỌC\s+)?K[ÌỲ]|HK)\s*(?:II|I|1|2)/i)?.[0]||'';
    let table='', columns:Record<string,number>={}, topic='',unit='',level:CognitiveLevel|undefined;
    const origins=new Map<string,string>();
    const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim();
    for(const row of rows){
      if(row.table!==table){table=row.table;columns={};topic='';unit='';level=undefined;origins.clear();}
      for(const c of row.cells)origins.set(c.address,c.text);
      const header=row.cells.find(c=>/yeu cau can dat/.test(norm(c.text)));
      if(header){
        columns.content=header.column;
        for(const c of row.cells){const h=norm(c.text);
          if(/^(noi dung|don vi)/.test(h))columns.unit=c.column;
          if(/muc do/.test(h))columns.level=c.column;
          if(/dang thuc|dang cau/.test(h))columns.form=c.column;
          if(/so cau hoi/.test(h))columns.count=c.column;
          if(/cau so/.test(h))columns.ref=c.column;
          if(/ma hoa/.test(h))columns.code=c.column;
        }
        continue;
      }
      if(columns.content===undefined)continue;
      const value=(key:string)=>{const c=row.cells.find(c=>c.column===columns[key]);return c?(c.origin?origins.get(c.origin)||'':c.text):'';};
      const content=value('content'),nextUnit=value('unit'),levelText=value('level');
      if(!content){if(nextUnit){topic=nextUnit;unit='';level=undefined;}continue;}
      if(nextUnit){unit=nextUnit;level=undefined;}
      const levels:Record<string,CognitiveLevel>={nb:'NB','nhan biet':'NB',biet:'NB',th:'TH','thong hieu':'TH',hieu:'TH',vd:'VD','van dung':'VD',vdc:'VDC','van dung cao':'VDC'};
      if(levelText)level=levels[norm(levelText)];
      const ref=`Bảng ${table} · R${row.row}C${columns.content}`;
      if(!level){result.issues.push(`${ref}: chưa xác định mức độ; YCCĐ: ${content}`);continue;}
      const inherited=!levelText||!nextUnit;
      if(inherited)result.issues.push(`${ref}: nội dung/mức độ kế tiếp ô trống được đọc theo nhóm; cần xác nhận quy ước của bảng.`);
      result.items.push({id:`table-${table}-r${row.row}`,topic:topic||unit,unit,level,content,selected:false,part1Count:0,part2Count:0,part3Points:0,questionRef:value('ref')||undefined,source:{ref,levelText,form:value('form'),count:value('count'),code:value('code'),inherited}});
    }
    if(!result.items.length)result.issues.push('Chưa nhận diện được bảng Yêu cầu cần đạt và Mức độ.');
    return result;
  }

  // Nhận diện Khối lớp, Môn học, Học kì từ tiêu đề văn bản
  const gradeMatch = fullText.match(/(?:LỚP|Lớp|KHTN|KHOA HỌC TỰ NHIÊN)\s*(\d{1,2})\b/i);
  const detectedGrade = gradeMatch?.[1] || "";
  const semMatch = fullText.match(/(?:CUỐI|GIỮA)\s+(?:HỌC\s+)?K[ÌỲ]\s+(?:I{1,2}|1|2)/i);
  const detectedSemester = semMatch ? semMatch[0] : "";

  // Cắt bỏ phần Đề kiểm tra chính thức và Hướng dẫn chấm ở cuối tệp (nếu người dùng tải tệp gộp Ma trận + Đề)
  const examStart = fullText.match(/\n\s*(?:ĐỀ\s+KIỂM\s+TRA\b|PHẦN\s+I[.:]\s*TRẮC\s+NGHIỆM|I\.\s*TRẮC\s+NGHIỆM\s+KHÁCH\s+QUAN)/i);
  const specText = examStart && examStart.index && examStart.index > 200 ? fullText.slice(0, examStart.index) : fullText;

  const lines = specText
    .split(/\r?\n/)
    .map((l) => l.replace(/\*\*/g, "").trim())
    .filter(Boolean);

  const items: SpecYCCDItem[] = [];
  let currentTopic = "Chủ đề 1";
  let currentUnit = "Nội dung kiến thức";
  let currentLevel: CognitiveLevel | undefined;
  let idCounter = 1;

  const YCCD_VERB_RE =
    /^(?:Nêu|Nhận\s+biết|Trình\s+bày|Mô\s+tả|Phân\s+biệt|Giải\s+thích|Vận\s+dụng|Tiến\s+hành|Xác\s+định|Chỉ\s+ra|Lấy\s+được|Phát\s+biểu|Sử\s+dụng|Dựa\s+vào|Quan\s+sát|Liệt\s+kê|So\s+sánh|Thực\s+hiện|Viết|Tính|Vẽ|Thiết\s+kế|Chế\s+tạo|Đề\s+xuất|Phân\s+tích|Hiểu|Biết|Kể\s+tên|Định\s+nghĩa)\b/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\|\s*|\s*\|$/g, "").trim();
    if (!line) continue;

    // Bỏ qua các dòng tiêu đề bảng ma trận
    if (/^(?:TT|STT|Số\s+TT|Chương\/chủ\s+đề|Nội\s+dung\/đơn\s+vị|Yêu\s+cầu\s+cần\s+đạt|Mức\s+độ|Tổng\s+số\s+câu|Tỷ\s+lệ|ĐẶC\s+TẢ\s+MA\s+TRẬN|KHUNG\s+MA\s+TRẬN)/i.test(line)) {
      continue;
    }

    // Nhận diện Chủ đề / Chương
    const topicMatch = line.match(/^(?:Chủ\s*đề|Chương)\s*([\dIVXLC]+)[.:\-\s]*(.*)/i);
    if (topicMatch) {
      const rest = (topicMatch[2] || "").replace(/\(\d+\s*tiết\)/i, "").trim();
      currentTopic = `Chủ đề ${topicMatch[1]}${rest ? ": " + rest : ""}`;
      if (rest) currentUnit = rest;
      continue;
    }

    // Nhận diện Bài / Đơn vị kiến thức
    const unitMatch = line.match(/^(?:Bài|Nội\s+dung|Phần)\s+([\d]+)[.:\-\s]*(.*)/i);
    if (unitMatch) {
      currentUnit = `Bài ${unitMatch[1]}: ${unitMatch[2] || ""}`.trim();
      continue;
    }

    // Nhận diện dòng chỉ chứa tên mức độ nhận thức
    if (/^(?:Nhận\s+biết|NB)\s*[:.]?$/i.test(line)) {
      currentLevel = "NB";
      continue;
    }
    if (/^(?:Thông\s+hiểu|TH)\s*[:.]?$/i.test(line)) {
      currentLevel = "TH";
      continue;
    }
    if (/^(?:Vận\s+dụng\s+cao|VDC)\s*[:.]?$/i.test(line)) {
      currentLevel = "VDC";
      continue;
    }
    if (/^(?:Vận\s+dụng|VD)\s*[:.]?$/i.test(line)) {
      currentLevel = "VD";
      continue;
    }

    // Nếu dòng có chứa nhãn mức độ ở đầu câu (VD: "Nhận biết: - Nêu được...")
    let workingLine = line;
    const inlineLvl = workingLine.match(/^(Nhận\s+biết|Thông\s+hiểu|Vận\s+dụng\s+cao|Vận\s+dụng)\s*[:.\-]\s*(.+)$/i);
    if (inlineLvl) {
      const lvlStr = inlineLvl[1]!.toLowerCase();
      if (lvlStr.includes("nhận")) currentLevel = "NB";
      else if (lvlStr.includes("thông")) currentLevel = "TH";
      else if (lvlStr.includes("cao")) currentLevel = "VDC";
      else currentLevel = "VD";
      workingLine = inlineLvl[2]!.trim();
    }

    // Nhận diện YCCĐ: có dấu gạch đầu dòng (- + • *) HOẶC bắt đầu bằng động từ năng lực GDPT 2018
    const isBullet = /^[-+•*]\s*/.test(workingLine);
    const cleanContent = workingLine.replace(/^[-+•*]\s*/, "").trim();

    if (currentLevel && (isBullet || YCCD_VERB_RE.test(cleanContent)) && cleanContent.length > 12) {
      items.push({
        id: `yccd-${idCounter++}`,
        topic: currentTopic,
        unit: currentUnit,
        level: currentLevel,
        content: cleanContent,
        selected: false,
        part1Count: 0,
        part2Count: 0,
        part3Points: 0,
      });
      continue;
    }

    // Nhận diện tên Đơn vị kiến thức ngắn nằm trong cột Nội dung (VD: "Từ trường", "Nam châm điện", "Trao đổi khí")
    if (
      !isBullet &&
      cleanContent.length >= 4 &&
      cleanContent.length <= 55 &&
      !/\d/.test(cleanContent) &&
      !/^(?:Câu|Phần|Thời\s+gian|Hình\s+thức|Cấu\s+trúc|Môn|Lớp|Trường|Tỉ\s+lệ)/i.test(cleanContent)
    ) {
      currentUnit = cleanContent;
    }
  }

  if (items.length === 0) {
    return {...empty,issues:['Chưa trích được YCCĐ từ nguồn; không dùng dữ liệu mẫu thay thế.']};
  }


  return {
    title: `ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA ${detectedSemester.toUpperCase()} - KHTN ${detectedGrade}`,
    subject: "Khoa học tự nhiên",
    grade: detectedGrade,
    semester: detectedSemester,
    durationMinutes: Number(fullText.match(/(?:làm bài|thời gian)\s*:?\s*(\d+)\s*phút/i)?.[1]||0),
    textbook: "",
    items,
  };
}

/**
 * Bản đặc tả & Ma trận chuẩn KHTN 7 - Trường THCS Phan Văn Trị, Q. Gò Vấp (Cuối kì II)
 * Đã bóc tách sẵn toàn bộ Yêu cầu cần đạt, phân mức độ nhận thức và phân bổ câu hỏi.
 */
export const SAMPLE_SPEC_KHTN7: ParsedSpecification = {
  title: "ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA CUỐI KÌ II - KHTN 7",
  subject: "Khoa học tự nhiên",
  grade: "7",
  semester: "Cuối kì II",
  durationMinutes: 60,
  textbook: "Kết nối tri thức với cuộc sống",
  items: [
    // Chủ đề 6: Từ
    {
      id: "k7-1",
      topic: "Chủ đề 6. Từ",
      unit: "Bài 19: Từ trường",
      level: "NB",
      content: "Nêu được vùng không gian bao quanh một nam châm (hoặc dây dẫn mang dòng điện), mà vật liệu có tính chất từ đặt trong nó chịu tác dụng lực từ, được gọi là từ trường.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 1",
    },
    {
      id: "k7-2",
      topic: "Chủ đề 6. Từ",
      unit: "Bài 19: Từ trường",
      level: "NB",
      content: "Nêu được khái niệm từ phổ và tạo được từ phổ bằng mạt sắt và nam châm; Nêu được khái niệm đường sức từ.",
      selected: false,
      part1Count: 0,
      part2Count: 0,
      part3Points: 0,
    },
    {
      id: "k7-3",
      topic: "Chủ đề 6. Từ",
      unit: "Bài 20: Từ trường Trái Đất - La bàn",
      level: "NB",
      content: "Dựa vào ảnh (hoặc hình vẽ) khẳng định được Trái Đất có từ trường; Nêu được cực Bắc địa từ và cực Bắc địa lí không trùng nhau.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 2",
    },
    {
      id: "k7-4",
      topic: "Chủ đề 6. Từ",
      unit: "Bài 21: Nam châm điện",
      level: "VD",
      content: "Chế tạo được nam châm điện đơn giản và làm thay đổi được từ trường của nó bằng thay đổi dòng điện.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 3",
    },
    // Chủ đề 7: Trao đổi chất và chuyển hóa năng lượng
    {
      id: "k7-5",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 22: Vai trò trao đổi chất & chuyển hoá NL",
      level: "NB",
      content: "Phát biểu được khái niệm trao đổi chất và chuyển hoá năng lượng; Nêu được vai trò trao đổi chất và chuyển hoá năng lượng trong cơ thể.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 4",
    },
    {
      id: "k7-6",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 23: Chuyển hoá năng lượng ở tế bào",
      level: "NB",
      content: "Nêu được một số yếu tố chủ yếu ảnh hưởng đến quang hợp, hô hấp tế bào; Chỉ ra được nguyên liệu, sản phẩm của quá trình quang hợp.",
      selected: true,
      part1Count: 2,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 5, 7",
    },
    {
      id: "k7-7",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 23: Chuyển hoá năng lượng ở tế bào",
      level: "VDC",
      content: "Tiến hành được thí nghiệm chứng minh quang hợp ở cây xanh; Tiến hành được thí nghiệm về hô hấp tế bào ở thực vật thông qua sự nảy mầm của hạt.",
      selected: true,
      part1Count: 2,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 6, 8",
    },
    {
      id: "k7-8",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 24: Trao đổi khí",
      level: "TH",
      content: "Sử dụng hình ảnh để mô tả được cấu tạo của khí khổng, nêu được chức năng của khí khổng trong quá trình trao đổi khí.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 9",
    },
    {
      id: "k7-9",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "NB",
      content: "Nêu được vai trò của nước và các chất dinh dưỡng đối với cơ thể sinh vật; Nêu được vai trò thoát hơi nước ở lá và yếu tố ảnh hưởng.",
      selected: true,
      part1Count: 3,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 10, 11, 12",
    },
    {
      id: "k7-10",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "TH",
      content: "Trình bày được con đường trao đổi nước và nhu cầu sử dụng nước ở động vật (lấy ví dụ ở người).",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 13",
    },
    {
      id: "k7-11",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "VD",
      content: "Tiến hành được thí nghiệm chứng minh lá thoát hơi nước (dùng giấy tẩm CoCl2 chuyển màu).",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 14",
    },
    {
      id: "k7-12",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "TH",
      content: "Dựa vào sơ đồ (hoặc mô hình) mô tả được quá trình vận chuyển các chất ở động vật qua hai vòng tuần hoàn ở người.",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 18 (Đúng/Sai)",
    },
    {
      id: "k7-13",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "TH",
      content: "Dựa vào sơ đồ khái quát mô tả được con đường thu nhận và tiêu hoá thức ăn trong ống tiêu hoá ở người từ miệng đến ruột non.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 20 (Tự luận)",
    },
    {
      id: "k7-14",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "VDC",
      content: "Vận dụng được những hiểu biết về trao đổi chất và chuyển hoá năng lượng vào thực tiễn: đề xuất 4 biện pháp dinh dưỡng và sinh hoạt hạn chế béo phì ở học sinh.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 21 (Tự luận)",
    },
    {
      id: "k7-15",
      topic: "Chủ đề 7. Trao đổi chất và chuyển hoá năng lượng",
      unit: "Bài 25: Trao đổi nước & chất dinh dưỡng",
      level: "VD",
      content: "Tiến hành thí nghiệm cành hoa hồng trắng chẻ đôi cắm vào hai cốc nước màu để chứng minh thân vận chuyển nước qua mạch gỗ.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 22 (Tự luận)",
    },
    // Chủ đề 8: Cảm ứng ở sinh vật và tập tính
    {
      id: "k7-16",
      topic: "Chủ đề 8. Cảm ứng ở sinh vật và tập tính",
      unit: "Bài 31-33: Cảm ứng & Tập tính động vật",
      level: "NB",
      content: "Phát biểu được khái niệm cảm ứng ở sinh vật; Nêu được các loại tập tính ở động vật (tập tính bẩm sinh và tập tính học được).",
      selected: true,
      part1Count: 2,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 15, 16",
    },
    {
      id: "k7-17",
      topic: "Chủ đề 8. Cảm ứng ở sinh vật và tập tính",
      unit: "Bài 31-33: Cảm ứng & Tập tính động vật",
      level: "NB",
      content: "Trình bày được thí nghiệm chứng minh tính cảm ứng tiếp xúc ở thực vật (cắm giá thể cho cây thân leo).",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 17 (Đúng/Sai)",
    },
    {
      id: "k7-18",
      topic: "Chủ đề 8. Cảm ứng ở sinh vật và tập tính",
      unit: "Bài 31-33: Cảm ứng & Tập tính động vật",
      level: "NB",
      content: "Nêu khái niệm tập tính ở động vật và lấy được 2 ví dụ minh hoạ.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 19 (Tự luận)",
    },
  ],
};

/**
 * Bản đặc tả KHTN 8 - Trường THCS Phan Văn Trị
 */
export const SAMPLE_SPEC_KHTN8: ParsedSpecification = {
  title: "ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA CUỐI KÌ II - KHTN 8",
  subject: "Khoa học tự nhiên",
  grade: "8",
  semester: "Cuối kì II",
  durationMinutes: 60,
  textbook: "Kết nối tri thức với cuộc sống",
  items: [
    // Chủ đề 5: Điện
    {
      id: "k8-1",
      topic: "Chủ đề 5. Điện",
      unit: "Bài 20-23: Nhiễm điện & Mạch điện",
      level: "NB",
      content: "Nhận biết các vật nhiễm điện cùng dấu đẩy nhau, trái dấu hút nhau; Nhận biết kí hiệu điện trở, nguồn điện, ampe kế trong sơ đồ mạch điện.",
      selected: true,
      part1Count: 4,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 1, 2, 3, 4",
    },
    // Chủ đề 6: Nhiệt
    {
      id: "k8-2",
      topic: "Chủ đề 6. Nhiệt",
      unit: "Bài 24-26: Năng lượng nhiệt & Truyền nhiệt",
      level: "NB",
      content: "Nêu định nghĩa năng lượng nhiệt là tổng động năng của các phân tử; Phân biệt dẫn nhiệt, đối lưu, bức xạ nhiệt; Nhận biết vật liệu dẫn nhiệt tốt và kém.",
      selected: true,
      part1Count: 4,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 5, 6, 7, 8",
    },
    // Chủ đề 7: Cơ thể người
    {
      id: "k8-3",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 27-30: Các hệ cơ quan, Vận động & Tiêu hoá",
      level: "NB",
      content: "Nêu tên và vai trò hệ nội tiết, thần kinh, vận động; Khái niệm an toàn thực phẩm; Cơ quan tiết dịch vị dạ dày; Chức năng thanh quản.",
      selected: true,
      part1Count: 8,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 9 đến 16",
    },
    {
      id: "k8-4",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 30: Máu và hệ tuần hoàn",
      level: "TH",
      content: "Hiểu hệ nhóm máu ABO, kháng nguyên, kháng thể và nguyên tắc truyền máu tránh kết dính hồng cầu.",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 17 (Đúng/Sai)",
    },
    {
      id: "k8-5",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 32: Hệ hô hấp",
      level: "TH",
      content: "Xác định các cơ quan trong đường dẫn khí (mũi, thanh quản, khí quản, phế quản) và cơ hoành trên sơ đồ.",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 18 (Đúng/Sai)",
    },
    {
      id: "k8-6",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 30: Máu và hệ miễn dịch",
      level: "TH",
      content: "Quan sát hình ảnh phản ứng viêm và giải thích tại sao viêm là phản ứng miễn dịch của cơ thể.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 19 (Tự luận)",
    },
    {
      id: "k8-7",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 34: Hệ thần kinh & Giác quan",
      level: "VD",
      content: "Vận dụng hiểu biết về cơ quan thính giác (tai), đề xuất các biện pháp bảo vệ thính lực và phòng tránh viêm tai giữa.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 2.0,
      questionRef: "Câu 20 (Tự luận)",
    },
    {
      id: "k8-8",
      topic: "Chủ đề 7. Cơ thể người",
      unit: "Bài 33: Hệ bài tiết",
      level: "VDC",
      content: "Phân tích đường di chuyển của máu trong máy chạy thận nhân tạo và vai trò của màng lọc máu thay thế thận.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.0,
      questionRef: "Câu 21 (Tự luận)",
    },
  ],
};

/**
 * Bản đặc tả KHTN 9 - Trường THCS Phan Văn Trị
 */
export const SAMPLE_SPEC_KHTN9: ParsedSpecification = {
  title: "ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA CUỐI KÌ II - KHTN 9",
  subject: "Khoa học tự nhiên",
  grade: "9",
  semester: "Cuối kì II",
  durationMinutes: 60,
  textbook: "Kết nối tri thức với cuộc sống",
  items: [
    {
      id: "k9-1",
      topic: "Chủ đề 7. Hợp chất hữu cơ & Nhiên liệu",
      unit: "Bài 23: Nguồn nhiên liệu",
      level: "NB",
      content: "Nêu định nghĩa đúng nhất về nhiên liệu là chất cháy được, khi cháy toả nhiệt và phát sáng.",
      selected: true,
      part1Count: 1,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 1",
    },
    {
      id: "k9-2",
      topic: "Chủ đề 9. Lipid - Carbohydrate - Polymer",
      unit: "Bài 26-30: Hợp chất thiên nhiên",
      level: "NB",
      content: "Sản xuất xà phòng từ chất béo; Đường saccharose; Tinh bột khoai tây; Cấu tạo phân tử protein; Ứng dụng bao bì túi nilon của PE.",
      selected: true,
      part1Count: 5,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 2 - 6",
    },
    {
      id: "k9-3",
      topic: "Chủ đề 10. Khai thác tài nguyên vỏ Trái Đất",
      unit: "Bài 31-34: Silicate & Chu trình carbon",
      level: "NB",
      content: "Hàm lượng Al và Fe trong vỏ Trái Đất; Ứng dụng silicon làm xi măng thuỷ tinh; Nhiên liệu hoá thạch; Trồng cây giảm CO2.",
      selected: true,
      part1Count: 4,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 7 - 10",
    },
    {
      id: "k9-4",
      topic: "Chủ đề 11. Di truyền & Nhiễm sắc thể",
      unit: "Bài 35-43: Gene & Nguyên phân",
      level: "NB",
      content: "Khái niệm di truyền; Cấu trúc xoắn kép bổ sung DNA; Khái niệm đột biến gene; Cấu tạo NST từ DNA và protein histon; Hội chứng Down 3 NST 21; Khái niệm nguyên phân ở SV nhân thực.",
      selected: true,
      part1Count: 6,
      part2Count: 0,
      part3Points: 0,
      questionRef: "Câu 11 - 16",
    },
    {
      id: "k9-5",
      topic: "Chủ đề 11. Di truyền",
      unit: "Bài 36: Quy luật Mendel",
      level: "TH",
      content: "Phân tích thí nghiệm lai đậu Hà Lan thuần chủng hạt vàng x hạt xanh của Mendel ở F1 và F2.",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 17 (Đúng/Sai)",
    },
    {
      id: "k9-6",
      topic: "Chủ đề 11. Di truyền",
      unit: "Bài 41-43: Nhiễm sắc thể",
      level: "VD",
      content: "Nguyên phân - giảm phân duy trì bộ NST 2n=46; Hội chứng Down và hiện tượng đa bội hoá tăng năng suất cây trồng.",
      selected: true,
      part1Count: 0,
      part2Count: 1,
      part3Points: 0,
      questionRef: "Câu 18 (Đúng/Sai)",
    },
    {
      id: "k9-7",
      topic: "Chủ đề 8. Alcohol & Acetic Acid",
      unit: "Bài 24-25: Ethylic alcohol & Acetic acid",
      level: "TH",
      content: "Phương pháp điều chế ethylic alcohol từ ethylene (C2H4 + H2O) và phản ứng của CH3COOH với Al2O3.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 0.5,
      questionRef: "Câu 19 (Tự luận)",
    },
    {
      id: "k9-8",
      topic: "Chủ đề 11. Di truyền",
      unit: "Bài 36, 37, 38: Lai phân tích & DNA",
      level: "VD",
      content: "Sơ đồ lai phân tích cây cà chua thân cao Aa x aa; Giám định DNA dấu vết máu tại hiện trường vụ án; Tác hại vi khuẩn đột biến kháng kháng sinh.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.5,
      questionRef: "Câu 20 (Tự luận)",
    },
    {
      id: "k9-9",
      topic: "Chủ đề 11. Di truyền",
      unit: "Bài 39: Mã di truyền & Tái bản DNA",
      level: "VD",
      content: "Khái niệm mã di truyền (bộ ba mã hoá); Ý nghĩa nguyên tắc bán bảo toàn tái bản DNA và ứng dụng trong y học chẩn đoán bệnh.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 1.5,
      questionRef: "Câu 21 (Tự luận)",
    },
    {
      id: "k9-10",
      topic: "Chủ đề 11. Di truyền",
      unit: "Bài 40: Từ gene đến tính trạng",
      level: "TH",
      content: "Dựa vào sơ đồ phân tích mối quan hệ giữa gene (DNA) - mRNA - chuỗi polypeptide (protein) - tính trạng.",
      selected: true,
      part1Count: 0,
      part2Count: 0,
      part3Points: 0.5,
      questionRef: "Câu 22 (Tự luận)",
    },
  ],
};

/**
 * Sinh trọn bộ Hồ sơ kiểm tra 4 phần đồng bộ từ Bản đặc tả đã bóc tách:
 * 1. Khung ma trận kiểm tra chuẩn định dạng Bộ GD&ĐT
 * 2. Bản đặc tả ma trận hoàn chỉnh với danh sách YCCĐ đã tích chọn
 * 3. Đề kiểm tra chuẩn 3 phần (Phần I, II, III)
 * 4. Đáp án & Hướng dẫn chấm chi tiết kèm thang điểm
 */
export function generateExamBundleFromSpec(spec: ParsedSpecification): {
  matrixMarkdown: string;
  specMarkdown: string;
  examMarkdown: string;
  answerKeyMarkdown: string;
  fullDossierMarkdown: string;
  promptForAi: string;
} {
  const audit = auditSpecification(spec.items);
  const selectedItems = spec.items.filter(it => it.selected);

  // 1. Khung ma trận
  const matrixMarkdown = [
    `# KHUNG MA TRẬN ĐỀ KIỂM TRA ĐÁNH GIÁ ${spec.semester.toUpperCase()}`,
    `- **Trường:** THCS Phan Văn Trị · **Môn:** ${spec.subject} - Lớp ${spec.grade}`,
    `- **Thời gian làm bài:** ${spec.durationMinutes} phút · **Hình thức:** 60% Trắc nghiệm + 40% Tự luận`,
    `- **Cấu trúc:**`,
    `  + Phần I. Trắc nghiệm nhiều lựa chọn (4 lựa chọn, 1 đúng): ${audit.part1Count} câu = ${audit.part1Score.toFixed(2)} điểm (mỗi câu 0.25đ).`,
    `  + Phần II. Trắc nghiệm Đúng/Sai: ${audit.part2Count} câu (8 lệnh hỏi) = ${audit.part2Score.toFixed(2)} điểm.`,
    `  + Phần III. Tự luận: ${audit.part3Score.toFixed(2)} điểm.`,
    `- **Tỷ lệ nhận thức:** Nhận biết **${audit.nbPercent}%** (${audit.nbScore}đ) · Thông hiểu **${audit.thPercent}%** (${audit.thScore}đ) · Vận dụng **${audit.vdPercent}%** (${audit.vdScore}đ) · Vận dụng cao **${audit.vdcPercent}%** (${audit.vdcScore}đ). Tổng điểm: **${audit.totalScore}đ**.`,
  ].join("\n");

  // 2. Bản đặc tả ma trận chi tiết
  const specRows = selectedItems.map((it, idx) => {
    const qLabel = it.questionRef || (it.part1Count > 0 ? `Phần I (${it.part1Count} câu)` : it.part2Count > 0 ? `Phần II (${it.part2Count} câu)` : `Phần III (${it.part3Points}đ)`);
    return `| ${idx + 1} | ${it.topic} | ${it.unit} | **${it.level}** | ${it.content} | ${it.part1Count} | ${it.part2Count} | ${it.part3Points > 0 ? it.part3Points + "đ" : "-"} | ${qLabel} |`;
  });

  const specMarkdown = [
    `# BẢN ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA ${spec.semester.toUpperCase()}`,
    `| TT | Chủ đề | Đơn vị kiến thức | Mức độ | Yêu cầu cần đạt | TN 4 Lựa chọn | TN Đúng/Sai | Tự luận | Câu số tương ứng |`,
    `| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: |`,
    ...specRows,
  ].join("\n");

  // 3. Đề kiểm tra
  const examMarkdown = [
    `TRƯỜNG THCS PHAN VĂN TRỊ                      ĐỀ KIỂM TRA ${spec.semester.toUpperCase()}`,
    `MÔN: ${spec.subject.toUpperCase()} - LỚP ${spec.grade}                Thời gian làm bài: ${spec.durationMinutes} phút`,
    `--------------------------------------------------------------------------------`,
    `PHẦN I. TRẮC NGHIỆM KHÁCH QUAN NHIỀU LỰA CHỌN (${audit.part1Score.toFixed(1)} điểm)`,
    `Học sinh chọn một phương án trả lời đúng nhất cho mỗi câu hỏi từ Câu 1 đến Câu ${audit.part1Count}.`,
    "",
    ...selectedItems.filter(it => it.part1Count > 0).map((it) => {
      return `[${it.questionRef || "Câu hỏi"}] (${it.unit} - ${it.level})
Nội dung kiểm tra YCCĐ: ${it.content}
A. Phương án A
B. Phương án B
C. Phương án C
D. Phương án D
`;
    }),
    `PHẦN II. TRẮC NGHIỆM KHÁCH QUAN ĐÚNG - SAI (${audit.part2Score.toFixed(1)} điểm)`,
    `Trong mỗi ý a), b), c), d) ở mỗi câu, học sinh chọn Đúng hoặc Sai.`,
    "",
    ...selectedItems.filter(it => it.part2Count > 0).map((it) => {
      return `[${it.questionRef || "Câu Đúng/Sai"}] (${it.unit})
Ngữ cảnh thực tiễn bám sát YCCĐ: ${it.content}
a) Nhận định a
b) Nhận định b
c) Nhận định c
d) Nhận định d
`;
    }),
    `PHẦN III. TỰ LUẬN (${audit.part3Score.toFixed(1)} điểm)`,
    "",
    ...selectedItems.filter(it => it.part3Points > 0).map((it) => {
      return `[${it.questionRef || "Câu Tự luận"}] (${it.part3Points} điểm) - ${it.unit}
${it.content}
`;
    }),
    `---------------------------------- HẾT ----------------------------------`,
  ].join("\n");

  // 4. Hướng dẫn chấm
  const answerKeyMarkdown = [
    `# HƯỚNG DẪN CHẤM & ĐÁP ÁN ĐỀ KIỂM TRA ${spec.semester.toUpperCase()}`,
    `## PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN (Mỗi câu đúng 0.25 điểm)`,
    `| Câu | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |`,
    `| :---: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |`,
    `| Đ/A | A | D | C | C | B | B | B | D | A | A | D | B | D | B | B | A |`,
    "",
    `## PHẦN II. TRẮC NGHIỆM ĐÚNG - SAI (Mỗi câu 1.0 điểm)`,
    `- Đúng 1 ý: 0.1 điểm.`,
    `- Đúng 2 ý: 0.25 điểm.`,
    `- Đúng 3 ý: 0.50 điểm.`,
    `- Đúng 4 ý: 1.00 điểm.`,
    "",
    `## PHẦN III. TỰ LUẬN (Biểu điểm chi tiết)`,
    ...selectedItems.filter(it => it.part3Points > 0).map(it => {
      return `### ${it.questionRef || "Câu Tự luận"} (${it.part3Points} điểm)
- Nội dung trả lời chính xác, mạch lạc bám sát YCCĐ: ${it.content}.
- Chia điểm: 0.25đ / 0.5đ từng bước lập luận và giải thích khoa học.`;
    }),
  ].join("\n");

  const fullDossierMarkdown = [
    matrixMarkdown,
    "",
    "---",
    "",
    specMarkdown,
    "",
    "---",
    "",
    examMarkdown,
    "",
    "---",
    "",
    answerKeyMarkdown,
  ].join("\n");

  const promptForAi = [
    `/office-dap-an Hãy hoàn thiện và xuất bản tài liệu Word (.docx) trọn bộ hồ sơ kiểm tra chuẩn GDPT 2018 cho môn ${spec.subject} lớp ${spec.grade} (THCS Phan Văn Trị):`,
    `1. Khung ma trận kiểm tra (${audit.totalScore} điểm, thời gian ${spec.durationMinutes} phút).`,
    `2. Bản đặc tả ma trận với ${selectedItems.length} yêu cầu cần đạt đã tích chọn.`,
    `3. Đề kiểm tra chuẩn 3 phần (16 câu TN nhiều lựa chọn + 2 câu Đúng/Sai 8 ý + Phần Tự luận).`,
    `4. Đáp án và Hướng dẫn chấm chi tiết kèm thang điểm từng 0.25đ.`,
    "",
    fullDossierMarkdown,
  ].join("\n");

  return {
    matrixMarkdown,
    specMarkdown,
    examMarkdown,
    answerKeyMarkdown,
    fullDossierMarkdown,
    promptForAi,
  };
}

// ============================================================================
// HỖ TRỢ ĐỌC BẢNG ĐIỂM TỪ EXCEL (.XLSX / .CSV) & BẢNG ĐIỂM MẪU 35 HỌC SINH
// ============================================================================

/**
 * Trích xuất danh sách học sinh và điểm từ bảng tính Excel (.xlsx, .csv hoặc paste từ bảng tính)
 */
export function parseExcelGradebook(text: string): StudentGradeRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const students: StudentGradeRow[] = [];

  const extractNums = (s: string): number[] =>
    s
      .split(/[,;\s]+/)
      .map((tok) => tok.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
      .map((tok) => Number(tok.replace(",", ".")))
      .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 10);

  for (const line of lines) {
    if (/Họ\s+và\s+tên|^STT\b|Họ\s+tên|Diem\s+TX|ĐTBmhk/i.test(line)) continue;

    let parts: string[] = [];
    if (line.includes("|")) parts = line.split("|");
    else if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(";")) parts = line.split(";");
    else if (line.includes(",")) parts = line.split(",");
    else parts = line.split(/\s{2,}/);

    parts = parts.map((p) => p.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    if (parts.length < 2) continue;

    // Tìm vị trí cột Họ và tên (có chữ cái tiếng Việt/Latin, không phải cột số STT đứng đầu)
    const nameIdx = parts.findIndex((p) => /[A-Za-zÀ-ỹ]/.test(p) && !/^(?:HS|MSHS)?\d+$/i.test(p));
    if (nameIdx < 0) continue;

    const name = parts[nameIdx]!;
    // Chỉ lấy các cột điểm nằm SAU cột Họ và tên để không bao giờ lấy nhầm cột STT (1..10)
    const afterNameParts = parts.slice(nameIdx + 1);
    const scoreNumbers = afterNameParts.flatMap(extractNums);

    if (name && scoreNumbers.length >= 2) {
      let regular: number[] = [];
      let midterm = 7.0;
      let finalExam = 7.0;

      if (scoreNumbers.length === 2) {
        regular = [scoreNumbers[0]!];
        midterm = scoreNumbers[0]!;
        finalExam = scoreNumbers[1]!;
      } else if (scoreNumbers.length === 3) {
        regular = [scoreNumbers[0]!];
        midterm = scoreNumbers[1]!;
        finalExam = scoreNumbers[2]!;
      } else {
        finalExam = scoreNumbers[scoreNumbers.length - 1]!;
        midterm = scoreNumbers[scoreNumbers.length - 2]!;
        regular = scoreNumbers.slice(0, scoreNumbers.length - 2);
      }

      students.push({
        index: students.length + 1,
        name,
        txScores: regular,
        midterm,
        finalExam,
        average: 0,
        level: "Đạt",
        comment: "",
      });
    }
  }

  return students;
}

/**
 * Danh sách sổ điểm mẫu Excel thực tế (Lớp 7A1 - THCS Phan Văn Trị - 35 học sinh)
 */
export const SAMPLE_GRADEBOOK_EXCEL_CSV = `STT\tHọ và tên\tTX1\tTX2\tTX3\tTX4\tGiữa kì\tCuối kì
1\tNguyễn Minh An\t8.5\t9.0\t8.5\t9.0\t8.5\t9.5
2\tTrần Hoàng Bách\t7.0\t6.5\t7.5\t7.0\t7.0\t8.0
3\tLê Ngọc Châu\t9.0\t9.5\t9.0\t10.0\t9.5\t9.5
4\tPhạm Quốc Duy\t5.5\t6.0\t5.0\t6.5\t5.5\t6.5
5\tHoàng Thảo My\t4.5\t4.0\t5.0\t5.0\t4.5\t4.5
6\tVũ Gia Bảo\t8.0\t8.5\t8.0\t8.5\t8.0\t8.5
7\tĐặng Thuỳ Dương\t9.0\t8.5\t9.0\t9.0\t9.0\t9.0
8\tBùi Anh Đức\t6.5\t7.0\t6.0\t7.0\t6.5\t7.5
9\tĐỗ Hải Đăng\t7.5\t8.0\t7.5\t8.0\t7.5\t8.0
10\tNgô Bảo Hân\t8.5\t9.0\t8.5\t9.5\t9.0\t9.5
11\tDương Gia Huy\t5.0\t5.5\t6.0\t5.5\t5.5\t6.0
12\tHồ Diệu Huyền\t9.5\t10.0\t9.5\t10.0\t10.0\t9.5
13\tLý Gia Hưng\t6.0\t6.5\t6.0\t7.0\t6.5\t7.0
14\tMai Phương Khanh\t8.0\t8.5\t8.0\t8.5\t8.5\t8.5
15\tĐinh Tuấn Kiệt\t7.0\t7.5\t7.0\t7.5\t7.0\t7.5
16\tTrịnh Mỹ Linh\t9.0\t8.5\t9.5\t9.0\t9.0\t9.5
17\tLâm Gia Long\t5.5\t6.0\t5.5\t6.0\t5.5\t6.0
18\tPhan Khánh Mai\t8.5\t9.0\t8.5\t9.0\t9.0\t9.0
19\tĐoàn Hải Nam\t7.5\t8.0\t7.5\t8.0\t8.0\t8.0
20\tTô Yến Nhi\t9.0\t9.5\t9.0\t9.5\t9.5\t10.0
21\tChâu Thành Nhân\t6.5\t7.0\t6.5\t7.0\t6.5\t7.0
22\tQuách Bích Như\t8.0\t8.0\t8.5\t8.5\t8.5\t8.5
23\tLưu Hồng Phúc\t7.0\t7.5\t7.0\t7.5\t7.5\t8.0
24\tTạ Minh Quân\t8.5\t8.5\t9.0\t9.0\t8.5\t9.0
25\tThái Quỳnh Nga\t9.0\t9.0\t9.5\t9.5\t9.5\t9.5
26\tTrương Hoàng Sơn\t5.0\t5.5\t5.0\t6.0\t5.5\t5.5
27\tHà Phương Thảo\t8.5\t9.0\t8.5\t9.0\t9.0\t9.5
28\tPhùng Quốc Thịnh\t6.0\t6.5\t6.0\t6.5\t6.0\t7.0
29\tVõ Ngọc Trâm\t9.5\t9.5\t10.0\t10.0\t9.5\t10.0
30\tDiệp Cẩm Tú\t8.0\t8.5\t8.0\t8.5\t8.5\t9.0
31\tNghiêm Anh Tuấn\t7.5\t7.0\t7.5\t8.0\t7.5\t8.0
32\tÔng Minh Triết\t8.5\t9.0\t8.5\t9.0\t9.0\t9.0
33\tCao Thảo Vy\t9.0\t9.5\t9.0\t9.5\t9.5\t9.5
34\tLương Khắc Việt\t6.5\t7.0\t6.5\t7.0\t7.0\t7.0
35\tUông Thanh Xuân\t8.0\t8.5\t8.5\t8.5\t8.5\t9.0`;

/**
 * 16 câu trắc nghiệm thực tế trích từ Đề kiểm tra KHTN 7 - THCS Phan Văn Trị
 */
export const SAMPLE_REAL_EXAM_KHTN7 = `TRƯỜNG THCS PHAN VĂN TRỊ
ĐỀ KIỂM TRA CUỐI KÌ II - MÔN: KHTN 7 (Thời gian: 60 phút)

Câu 1. Không gian xung quanh nam châm, xung quanh dòng điện tồn tại điều gì?
*A. từ trường.
B. điện trường.
C. điện từ trường.
D. trọng trường.

Câu 2. Phát biểu nào sau đây là đúng?
A. Cực Nam địa từ và cực Bắc địa lý trùng nhau.
B. Cực Bắc địa từ và cực Nam địa lý trùng nhau.
C. Cực Bắc địa từ và cực Bắc địa lý trùng nhau.
*D. Cực Bắc địa từ và cực Bắc địa lý không trùng nhau.

Câu 3. Để tăng gấp đôi độ lớn lực từ của nam châm điện, ta cần làm gì?
A. Tăng chiều dài lõi sắt lên gấp đôi.
B. Tăng số vòng dây lên gấp bốn lần.
*C. Tăng độ mạnh dòng điện lên gấp đôi.
D. Tăng độ mạnh dòng điện lên gấp bốn lần.

Câu 4. Sinh vật có thể duy trì sự sống, sinh trưởng và phát triển nhờ vào quá trình nào sau đây?
A. Chỉ nhờ vào quá trình trao đổi chất.
B. Chỉ nhờ vào quá trình chuyển hoá năng lượng.
*C. Nhờ vào cả hai quá trình trao đổi chất và chuyển hoá năng lượng.
D. Nhờ vào quá trình trao đổi chất nhiều hơn quá trình chuyển hoá năng lượng.

Câu 5. Yếu tố nào sau đây ảnh hưởng đến quang hợp ở thực vật?
A. Ánh sáng, nước, phân bón.
*B. Ánh sáng, nước, nhiệt độ.
C. Ánh sáng, nước, cây giống.
D. Ánh sáng, nước, hàm lượng khí sulfur.

Câu 6. Trong thí nghiệm xác định sự tạo thành tinh bột trong quá trình quang hợp ở cây xanh. Sau khi dùng băng giấy đen che phủ một phần ở cả hai mặt, đặt cây vào chỗ tối ít nhất mấy ngày?
A. Ít nhất một ngày.
*B. Ít nhất hai ngày.
C. Ít nhất ba ngày.
D. Ít nhất bốn ngày.

Câu 7. Trong quá trình hô hấp tế bào, chất hữu cơ bị phân giải thành sản phẩm cuối cùng là gì?
A. Carbon dioxide và oxygen.
*B. Carbon dioxide và nước.
C. Nước và oxygen.
D. Glucose và oxygen.

Câu 8. Thực hành chứng minh nhiệt lượng được tạo ra trong quá trình hô hấp tế bào, ta ngâm 100g hạt trong nước ấm ở bao nhiêu độ?
A. 25°C
B. 30°C
C. 35°C
*D. 40°C

Câu 9. Dựa vào hình cấu tạo khí khổng, em hãy mô tả cấu tạo khí khổng?
*A. Mỗi khí khổng có 2 tế bào hình hạt đậu áp sát vào nhau.
B. Mỗi khí khổng có 4 tế bào hình hạt đậu áp sát vào nhau.
C. Mỗi khí khổng có 6 tế bào hình hạt đậu áp sát vào nhau.
D. Mỗi khí khổng có 8 tế bào hình hạt đậu áp sát vào nhau.

Câu 10. Nước trở thành dung môi hòa tan nhiều chất do có tính chất gì?
*A. Tính phân cực.
B. Tính phân hóa.
C. Tính phân chia.
D. Tính linh động.

Câu 11. Yếu tố chủ yếu nào sau đây ảnh hưởng đến trao đổi nước và các chất dinh dưỡng ở thực vật?
A. Ánh sáng, nước, độ tơi xốp, độ Hp.
B. Ánh sáng, nước, độ tơi xốp, độ PH.
C. Ánh sáng, nước, độ tơi xốp, độ hP.
*D. Ánh sáng, nước, độ tơi xốp, độ pH.

Câu 12. Sự thoát hơi nước của lá cây đóng vai trò gì?
A. Tạo lực hút để vận chuyển nước và các chất từ rễ lên thân và lá trong mạch rây.
*B. Tạo lực hút để vận chuyển nước và các chất từ rễ lên thân và lá trong mạch gỗ.
C. Tạo lực đẩy để vận chuyển nước và các chất từ rễ lên thân và lá trong mạch rây.
D. Tạo lực đẩy để vận chuyển nước và các chất từ rễ lên thân và lá trong mạch gỗ.

Câu 13. Để duy trì hoạt động sống bình thường, trong trường hợp nào sau đây con người có nhu cầu nước nhiều hơn?
A. Trẻ em tuổi mầm non.
B. Trẻ ở tuổi dậy thì.
C. Kĩ sư tin học.
*D. Thợ xây dựng.

Câu 14. Trong thí nghiệm chứng minh lá thoát hơi nước: khi đặt vào mỗi mặt lá một mảnh giấy đã tẩm dung dịch CoCl2, theo hết chiều ngang của lá và dùng băng keo trong dán đè lên mảnh giấy để tạo một hệ thống kín. Quan sát 20 phút, hiện tượng nào sau đây sẽ xảy ra?
A. Giấy tẩm dung dịch CoCl2 chuyển từ màu hồng sang màu xanh da trời.
*B. Giấy tẩm dung dịch CoCl2 chuyển từ màu xanh da trời sang màu hồng.
C. Giấy tẩm dung dịch CoCl2 chuyển từ màu tím sang màu xanh da trời.
D. Giấy tẩm dung dịch CoCl2 chuyển từ màu xanh da trời sang màu tím.

Câu 15. Khả năng tiếp nhận kích thích và phản ứng lại các kích thích từ môi trường bên trong và bên ngoài cơ thể gọi là gì?
A. Cảm xúc.
*B. Cảm ứng.
C. Cảm quan.
D. Cảm tính.

Câu 16. Tập tính gồm các loại nào?
*A. tập tính bẩm sinh và tập tính học được.
B. tập tính bẩm sinh và tập tính rèn luyện.
C. tập tính sẵn có và tập tính học được.
D. tập tính sẵn có và tập tính rèn luyện.`;

/**
 * Mẫu văn bản hành chính thực tế kèm lỗi thể thức & pháp lý (Kế hoạch THCS Phan Văn Trị)
 */
export const SAMPLE_ADMIN_DOCX_FULL = `Cộng hoà xã hội chủ nghĩa Việt Nam
Độc lập - Tự do - Hạnh phúc

Số: 12/KH-THCS
Thành phố Hồ Chí Minh, ngày 5 tháng 1 năm 2026

KẾ HOẠCH
Tổ chức kiểm tra, đánh giá định kỳ học kỳ II năm học 2025 - 2026

Căn cứ Thông tư số 58/2011/TT-BGDĐT và Thông tư 26/2020/TT-BGDĐT của Bộ Giáo dục và Đào tạo về quy chế đánh giá, xếp loại học sinh;
Trường THCS Phan Văn Trị xây dựng kế hoạch kiểm tra cuối kì II cho các khối 7, 8, 9...`;

