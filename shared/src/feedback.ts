/**
 * Nhận biết lời khen / chê ngắn của giáo viên sau một thao tác của PVTA ("đẹp rồi", "sai rồi, ngắn lại").
 * Chỉ để học nền: bridge chỉ ghi đặc điểm đã trừu tượng hóa, không ghi nội dung văn bản.
 * Khen xã giao ("ok", "cảm ơn") KHÔNG tính: chỉ tính câu khen/chê nói về kết quả.
 */
export type Sentiment = "praise" | "critic";

const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const word = (alts: string[]) => new RegExp(`${L}(?:${alts.join("|")})${R}`, "iu");

const PRAISE = word([
  "đẹp", "đẹp quá", "tốt", "tốt lắm", "hay", "hay quá", "hay lắm", "chuẩn", "chuẩn rồi", "chuẩn quá", "đúng ý", "đúng rồi", "đúng thầy muốn", "đúng ý thầy",
  "được rồi", "ổn rồi", "ổn áp", "hoàn hảo", "ưng", "ưng ý", "gọn đẹp", "rõ ràng", "tuyệt", "tuyệt vời", "xuất sắc",
  "perfect", "great", "looks good", "nice", "exactly",
]);

const CRITIC = word([
  "sai", "sai rồi", "không đúng", "chưa đúng", "không đúng ý", "chưa đúng ý", "không đẹp", "chưa đẹp", "xấu", "dở", "tệ", "lộn xộn", "rối",
  "quá dài", "dài quá", "quá ngắn", "ngắn quá", "quá nhỏ", "quá to", "nhỏ quá", "to quá", "không được", "chưa được", "chưa ổn", "không ổn",
  "làm lại", "đừng", "không muốn", "không cần", "sai chính tả", "sai số", "lệch",
  "wrong", "bad", "ugly", "too long", "too short", "not what i wanted", "redo",
]);

const SOCIAL_ONLY = /^\s*(ok(ay)?|oke|cảm ơn( nhé| nhiều)?|cám ơn|thanks?( you)?|vâng|dạ|ừ|ừm|uh|yes|được|có)\s*[.!]*\s*$/iu;

/** Câu dài thường là yêu cầu mới, không phải lời nhận xét. */
const MAX_FEEDBACK_CHARS = 140;

export function detectFeedback(text: string): Sentiment | null {
  const t = text.trim();
  if (!t || t.length > MAX_FEEDBACK_CHARS) return null;
  if (SOCIAL_ONLY.test(t)) return null;
  if (t.includes("?")) return null;
  // Câu mệnh lệnh ("soạn bài Sai phạm…", "thêm bảng") là yêu cầu mới, trừ "làm lại" / "đừng".
  if (/^(hãy|giúp|tạo|viết|soạn|thêm|chèn|đổi|sửa|dịch|tóm|in|tô|căn)\s/iu.test(t)) return null;
  if (/^làm\s/iu.test(t) && !/^làm lại/iu.test(t)) return null;
  const c = CRITIC.test(t);
  const p = PRAISE.test(t);
  if (c && !p) return "critic";
  if (p && !c) return "praise";
  if (c && p) {
    // "đẹp nhưng sai số": chê ưu tiên, vì có chỗ cần sửa.
    return "critic";
  }
  return null;
}
