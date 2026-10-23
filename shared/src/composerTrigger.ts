/** Ô chat: gõ @ để chọn lệnh mẫu, / để chọn kỹ năng, # để chọn quy tắc, $ để chọn tệp trong ngữ cảnh, $$ để chọn thư mục. Các hàm thuần, dùng chung cho giao diện và kiểm thử. */
export type TriggerChar = "@" | "/" | "#" | "$" | "$$";
export interface TriggerMatch {
  char: TriggerChar;
  /** Phần đã gõ sau ký tự kích hoạt (dùng để lọc). */
  query: string;
  /** Vị trí ký tự kích hoạt trong văn bản. */
  start: number;
  /** Vị trí con trỏ (hết phần đã gõ). */
  end: number;
}
export type TriggerKind = "prompts" | "skills" | "rules" | "files" | "folders";
export const TRIGGERS: Readonly<Record<TriggerChar, { kind: TriggerKind; name: string; guide: string; manage: string }>> = {
  "@": {
    kind: "prompts",
    name: "Thư viện lời nhắc",
    guide: "Gõ @ (hoặc bấm biểu tượng này) để chọn lệnh mẫu. Chỗ trống dạng [mô tả] được chọn sẵn; bấm Tab để nhảy tới chỗ trống kế tiếp.",
    manage: "Quản lý lời nhắc",
  },
  "/": {
    kind: "skills",
    name: "Kỹ năng",
    guide: "Gõ / (hoặc bấm biểu tượng này) để gọi một kỹ năng theo tên; PVTA sẽ làm theo quy trình của kỹ năng đó.",
    manage: "Quản lý kỹ năng",
  },
  "#": {
    kind: "rules",
    name: "Quy tắc",
    guide: "Gõ # (hoặc bấm biểu tượng này) để áp dụng một quy tắc đã đặt tên cho yêu cầu này. Quy tắc đánh dấu “luôn áp dụng” tự dùng cho mọi yêu cầu.",
    manage: "Quản lý quy tắc",
  },
  $: {
    kind: "files",
    name: "Tệp trong ngữ cảnh",
    guide: "Gõ $ (hoặc bấm biểu tượng này) để chọn một tài liệu trong ngữ cảnh và chèn tên tệp vào tin nhắn, để PVTA biết cần đọc tệp nào.",
    manage: "Đính kèm tệp khác",
  },
  $$: {
    kind: "folders",
    name: "Thư mục",
    guide: "Gõ $$ (hoặc bấm biểu tượng này) để chọn một thư mục của dự án hoặc thư mục chứa tài liệu và chèn đường dẫn vào tin nhắn.",
    manage: "Chọn thư mục khác",
  },
};
export const TRIGGER_HINT = "Gõ @ để liệt kê các lệnh mẫu, gõ / để liệt kê các kỹ năng, gõ # để liệt kê các quy tắc, gõ $ để chọn tệp, gõ $$ để chọn thư mục.";

/**
 * Ký tự kích hoạt chỉ có tác dụng ở đầu từ (đầu dòng, sau khoảng trắng hoặc dấu mở ngoặc),
 * để "12/10", "a@b.vn" hay "và/hoặc" không mở danh sách.
 */
export function detectTrigger(text: string, caret: number): TriggerMatch | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const m = /(^|[\s(])(\$\$|[@/#$])([^\s@/#$]*)$/u.exec(before);
  if (!m) return null;
  return { char: m[2] as TriggerChar, query: m[3]!, start: before.length - m[3]!.length - m[2]!.length, end: before.length };
}

const PLACEHOLDER = /\[[^\[\]\n]*\p{L}[^\[\]\n]*\]/u;
/** Chỗ trống [mô tả] đầu tiên từ vị trí `from`, không quay vòng. */
export function nextPlaceholder(text: string, from: number): [number, number] | null {
  const m = PLACEHOLDER.exec(text.slice(Math.max(0, from)));
  if (!m || m.index === undefined) return null;
  const s = Math.max(0, from) + m.index;
  return [s, s + m[0].length];
}

export interface Insertion {
  text: string;
  caret: number;
  /** Vùng được chọn sẵn (chỗ trống đầu tiên của lời nhắc). */
  selection?: [number, number];
}
/** Thay phần `@truy vấn` bằng nội dung được chọn. Kỹ năng, quy tắc, tệp và thư mục thêm khoảng trắng để gõ tiếp. */
export function applyPick(text: string, m: TriggerMatch, pick: { kind: TriggerKind; value: string }): Insertion {
  const head = text.slice(0, m.start);
  const tail = text.slice(m.end);
  if (pick.kind === "prompts") {
    const out = head + pick.value + tail;
    const hole = nextPlaceholder(out, head.length);
    const inside = hole && hole[0] < head.length + pick.value.length ? hole : undefined;
    return { text: out, caret: inside ? inside[1] : head.length + pick.value.length, selection: inside };
  }
  const token = pick.kind === "files" || pick.kind === "folders" ? pick.value : `${pick.kind === "skills" ? "/" : "#"}${pick.value}`;
  const space = tail.startsWith(" ") ? "" : " ";
  return { text: head + token + space + tail, caret: head.length + token.length + 1 };
}

/** Bỏ dấu và hạ chữ thường để tìm không phân biệt dấu. */
export function foldVi(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}
/** Tất cả từ trong truy vấn đều phải có mặt (không phân biệt dấu). */
export function matchesQuery(haystack: string, query: string): boolean {
  const h = foldVi(haystack);
  return foldVi(query).split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}

/** Tên tệp hoặc đường dẫn khi chèn vào tin nhắn: có khoảng trắng hay ký tự dễ gây nhầm thì bọc trong dấu huyền. */
export function pathToken(value: string): string {
  return /[\s`"'()\[\]]/u.test(value) ? `\`${value.replace(/`/g, "'")}\`` : value;
}
/** Thư mục cha của một đường dẫn tệp (hỗ trợ / và \\); rỗng nếu không có. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : "";
}
