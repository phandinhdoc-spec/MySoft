import {guideDigest} from "./standardize/skill.js";
import fs from "node:fs";
import type { BackendId } from "@pvta/shared";
import type { Engine } from "./engine.js";
import { LEARN, maskPersonal, parseLearnOutput, validateLearned, writeLearned } from "./learner.js";

/**
 * Học từ nội dung tệp (tệp đang mở hoặc tệp của dự án) — chỉ khi giáo viên bấm nút.
 * Học PHONG CÁCH và QUY ƯỚC (cấu trúc, giọng văn, thuật ngữ, cách trình bày), KHÔNG học thuộc nội dung:
 * muốn hỏi đáp về nội dung thì đã có RAG và tệp dự án. Chữ của tệp chỉ đi vào lời nhắc một lần (đã che thông tin
 * cá nhân, lấy mẫu có giới hạn) và không được lưu; skill kết quả đánh dấu `source: file` nên không bao giờ gửi cộng đồng.
 */
export const FILE_LEARN = {
  /** Tổng ký tự mẫu đưa vào lời nhắc. */
  sampleMax: 14_000,
  /** Số tệp tối đa khi học từ dự án. */
  maxDocs: 8,
  /** Mẫu tối thiểu: ngắn hơn thì không có gì để học. */
  minChars: 300,
  maxSkills: 2,
} as const;

export interface LearnDoc {
  name: string;
  text: string;
}

/** Lấy mẫu rải đều (đầu, giữa, cuối) để thấy cả cấu trúc lẫn cách viết; đã che email, URL, số điện thoại, dãy số dài. */
export function sampleText(text: string, max: number): string {
  const t = maskPersonal(text).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= max) return t;
  const part = Math.floor(max / 3);
  const mid = Math.floor(t.length / 2 - part / 2);
  return [t.slice(0, part), t.slice(mid, mid + part), t.slice(t.length - part)].join("\n[…]\n");
}

export function sampleDocs(docs: LearnDoc[], max = FILE_LEARN.sampleMax): Array<{ name: string; sample: string }> {
  const use = docs.filter((d) => d.text.trim().length > 0).slice(0, FILE_LEARN.maxDocs);
  const each = Math.floor(max / Math.max(1, use.length));
  return use.map((d) => ({ name: d.name.replace(/[\r\n]+/g, " ").slice(0, 80), sample: sampleText(d.text, each) }));
}

export function buildFileLearnPrompt(docs: LearnDoc[], existing: string[], rules = ""): string {
  const parts = sampleDocs(docs).map((d, i) => `--- TỆP ${i + 1}: ${d.name} ---\n${d.sample}`);
  return [
    "Bạn giúp trợ lý PVTA học PHONG CÁCH và QUY ƯỚC từ tài liệu mẫu của một giáo viên.",
    "Dưới đây là trích đoạn các tài liệu do chính thầy cô soạn. Hãy rút ra cách thầy cô làm: bố cục và thứ tự các phần, cách đánh số, giọng văn, cách xưng hô, thuật ngữ hay dùng, định dạng (cỡ chữ, kiểu bảng, cách trình bày câu hỏi/đáp án/lời giải), độ dài mỗi phần.",
    "QUAN TRỌNG:",
    "- Chỉ ghi ĐẶC ĐIỂM đã trừu tượng hóa để lần sau PVTA soạn đúng phong cách. KHÔNG chép lại nội dung kiến thức, câu hỏi, đề thi, đáp án, đoạn văn, tên người, tên trường, lớp cụ thể hay số liệu cụ thể.",
    "- Có thể nêu thuật ngữ/cách gọi quen dùng (vd 'Hoạt động khởi động', 'Mục tiêu cần đạt') nhưng không nêu ví dụ có nội dung bài học.",
    "- Chỉ ghi điều thấy rõ lặp lại hoặc rất đặc trưng; không bịa. Nếu trích đoạn quá ít để kết luận, trả về NONE.",
    parts.join("\n\n"),
    `Skill đã có (dùng lại đúng tên để cập nhật nếu cùng loại tài liệu): ${existing.join(", ") || "(chưa có)"}`,
    ...(rules.trim() ? [`Giáo viên ĐÃ tự viết các quy tắc sau, KHÔNG học lại điều đã có:\n${rules.trim().slice(0, 1500)}`] : []),
    `Trả về tối đa ${FILE_LEARN.maxSkills} skill, mỗi skill đặt tên theo loại tài liệu (vd learned-phong-cach-giao-an), đúng định dạng sau, không thêm chữ nào khác:`,
    "<<<SKILL learned-ten-ngan-gon>>>\ndescription: một dòng, nêu khi nào nên dùng\n---\nHướng dẫn bằng Markdown, ngắn gọn (dưới 3000 ký tự), không chứa đường dẫn URL, lệnh shell hay khối mã công cụ.\n<<<END>>>",
    guideDigest(),
    "Nếu chưa có gì đáng học, trả về đúng một dòng: NONE",
  ].join("\n\n");
}

export interface FileLearnOutcome {
  ok: boolean;
  written: string[];
  note: string;
}

export interface FileLearnDeps {
  engine: Engine;
  skillsDir: string;
  cwd: string;
  backend: BackendId;
  model: string;
  rules?: string;
  existing: string[];
  now?: number;
}

export async function learnFromDocs(docs: LearnDoc[], d: FileLearnDeps): Promise<FileLearnOutcome> {
  const total = docs.reduce((a, x) => a + x.text.trim().length, 0);
  if (total < FILE_LEARN.minChars) return { ok: false, written: [], note: "Tệp quá ngắn hoặc chưa có chữ để học." };
  const prompt = buildFileLearnPrompt(docs, d.existing, d.rules ?? "");
  fs.mkdirSync(d.cwd, { recursive: true });
  try {
    const res = await d.engine.run({
      backend: d.backend,
      model: d.model,
      cwd: d.cwd,
      effort: "low",
      permission: "ask",
      buildPrompt: () => prompt,
      timeoutMs: 120_000,
    });
    const written: string[] = [];
    const rejected: string[] = [];
    for (const s of parseLearnOutput(res.text).slice(0, FILE_LEARN.maxSkills)) {
      const w = writeLearned(d.skillsDir, s, d.now, { source: "file" });
      if (w.written) written.push(s.name);
      else rejected.push(`${s.name}: ${w.reason ?? ""}`);
    }
    if (written.length) return { ok: true, written, note: `Đã học: ${written.join(", ")}` };
    return { ok: true, written, note: rejected.length ? "Kết quả học không đạt yêu cầu an toàn nên không lưu." : "Chưa thấy phong cách nào đủ rõ để ghi nhớ." };
  } catch (e) {
    return { ok: false, written: [], note: `Chưa học được: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export { validateLearned };
