/** Giới hạn tài liệu nặng (xem đặc tả mục 9). */
export const LIMITS = {
  excelMaxCells: 4000,
  wordMaxChars: 60_000,
  pptTextBoxMaxChars: 1500,
  toolResultMaxChars: 60_000,
  /** Số vòng model <-> Office.js tối đa cho mỗi tin nhắn (chốt chặn chi phí; LoopGuard vẫn chống lặp vô hạn). */
  maxToolRounds: 40,
  /** Thời gian chờ người dùng đồng ý một thay đổi (ms). */
  approvalTimeoutMs: 300_000,
} as const;

/** Cắt chuỗi kết quả công cụ, thêm ghi chú nếu bị cắt. */
export function truncateResult(text: string, max: number = LIMITS.toolResultMaxChars): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n…[đã cắt ${text.length - max} ký tự]`;
}
