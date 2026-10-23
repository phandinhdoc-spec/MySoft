/**
 * Các hàm thuần (không gọi Office.js) của công cụ Excel, PowerPoint:
 * đổi tên gọi dễ hiểu sang tên của Office, chọn bố cục slide, tìm ô tiêu đề / nội dung.
 * Tách riêng để kiểm thử được mà không cần mở Office.
 */

/** Tên loại biểu đồ (tiếng Việt, tiếng Anh, hoặc tên gốc của Office.js) -> tên gốc của Office.js. */
const CHART_ALIASES: Record<string, string> = {
  column: "ColumnClustered", cot: "ColumnClustered", cột: "ColumnClustered",
  column_stacked: "ColumnStacked", cot_chong: "ColumnStacked", "cột chồng": "ColumnStacked",
  bar: "BarClustered", ngang: "BarClustered",
  line: "Line", duong: "Line", đường: "Line",
  line_markers: "LineMarkers",
  pie: "Pie", tron: "Pie", tròn: "Pie",
  doughnut: "Doughnut",
  area: "Area", mien: "Area", miền: "Area",
  scatter: "XYScatter", phan_tan: "XYScatter", "phân tán": "XYScatter",
};
const CHART_NATIVE = ["ColumnClustered", "ColumnStacked", "BarClustered", "BarStacked", "Line", "LineMarkers", "Pie", "Doughnut", "Area", "XYScatter"];

export const CHART_TYPE_NAMES = ["column", "column_stacked", "bar", "line", "line_markers", "pie", "doughnut", "area", "scatter"] as const;

export function chartType(v: unknown): string {
  if (v === undefined || v === null || v === "") return "ColumnClustered";
  const s = String(v).trim();
  const hit = CHART_ALIASES[s.toLowerCase()] ?? CHART_NATIVE.find((n) => n.toLowerCase() === s.toLowerCase());
  if (!hit) throw new Error(`Loại biểu đồ '${s}' không có. Dùng một trong: ${CHART_TYPE_NAMES.join(", ")}.`);
  return hit;
}

const CF_OPERATORS: Record<string, string> = {
  greaterthan: "GreaterThan", lessthan: "LessThan", greaterthanorequal: "GreaterThanOrEqual", lessthanorequal: "LessThanOrEqual",
  equalto: "EqualTo", notequalto: "NotEqualTo", between: "Between", notbetween: "NotBetween",
};

export const CF_OPERATOR_NAMES = ["greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual", "equalTo", "notEqualTo", "between", "notBetween"] as const;

export function cfOperator(v: unknown): string {
  const hit = CF_OPERATORS[String(v ?? "").trim().toLowerCase()];
  if (!hit) throw new Error(`Toán tử '${String(v)}' không có. Dùng một trong: ${CF_OPERATOR_NAMES.join(", ")}.`);
  return hit;
}

/** Giá trị so sánh của định dạng có điều kiện -> công thức: 5 -> "=5", "=B1" giữ nguyên, chữ -> ="chữ". */
export function cfFormula(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return `=${v}`;
  if (typeof v !== "string" || !v.trim()) throw new Error("Thiếu giá trị so sánh ('value').");
  const s = v.trim();
  if (s.startsWith("=")) return s;
  if (/^-?\d+([.,]\d+)?$/.test(s)) return `=${s.replace(",", ".")}`;
  return `="${s.replace(/"/g, '""')}"`;
}

export interface LayoutInfo {
  id: string;
  name: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/**
 * Chọn bố cục cho slide mới. want = tên người dùng/model gọi (khớp một phần, không phân biệt hoa thường, dấu);
 * không có thì: có gạch đầu dòng -> "Tiêu đề và nội dung", không có -> "Trang chiếu tiêu đề".
 */
export function pickLayout(layouts: LayoutInfo[], want?: string, hasBullets = true): LayoutInfo | undefined {
  if (layouts.length === 0) return undefined;
  if (want && want.trim()) {
    const w = norm(want.trim());
    const hit = layouts.find((l) => norm(l.name) === w) ?? layouts.find((l) => norm(l.name).includes(w));
    if (!hit) throw new Error(`Không có bố cục '${want}'. Có: ${layouts.map((l) => l.name).join("; ")}.`);
    return hit;
  }
  const re = hasBullets ? /(title and content|tieu de va noi dung)/ : /(^title slide|trang chieu tieu de|^tieu de$)/;
  return layouts.find((l) => re.test(norm(l.name))) ?? layouts[hasBullets ? Math.min(1, layouts.length - 1) : 0];
}

export interface ShapeBrief {
  index: number;
  name: string;
  top: number;
}

/** Ô tiêu đề và ô nội dung trong các hộp chữ của slide mới: theo tên, không có thì theo thứ tự từ trên xuống. */
export function findTitleBody(shapes: ShapeBrief[]): { title?: ShapeBrief; body?: ShapeBrief } {
  const sorted = [...shapes].sort((a, b) => a.top - b.top || a.index - b.index);
  const title = sorted.find((s) => /title|tieu de/.test(norm(s.name)) && !/sub|phu de/.test(norm(s.name))) ?? sorted[0];
  const rest = sorted.filter((s) => s !== title);
  const body = rest.find((s) => /(content|subtitle|text|body|noi dung|phu de|van ban)/.test(norm(s.name))) ?? rest[0];
  return { title, body };
}
