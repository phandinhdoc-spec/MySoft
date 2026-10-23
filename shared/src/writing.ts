/** Công cụ viết: thao tác nhanh trên phần đang chọn (gợi ý viết / sửa nhanh tại chỗ). */

export type WriteAction =
  | "fix"
  | "shorter"
  | "longer"
  | "simpler"
  | "formal"
  | "summary"
  | "questions"
  | "continue"
  | "ideas"
  | "translate"
  | "custom";

export const WRITE_ACTIONS: readonly WriteAction[] = [
  "fix",
  "shorter",
  "longer",
  "simpler",
  "formal",
  "summary",
  "questions",
  "continue",
  "ideas",
  "translate",
  "custom",
];

/** Hành động làm việc với đoạn ngay trước con trỏ khi không chọn gì (chỉ Word). */
export const WRITE_FROM_CURSOR: readonly WriteAction[] = ["continue", "ideas"];

/** Hành động cho ra nội dung mới (chèn thêm), không thay phần đang chọn. */
export const WRITE_ADDS: readonly WriteAction[] = ["summary", "questions", "continue", "ideas"];

export const WRITE_MAX_CHARS = 30_000;
