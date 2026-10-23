/**
 * Làm đẹp Excel: nhận diện vùng của sheet (khối tiêu đề, đầu bảng một hoặc nhiều tầng có ô gộp, dữ liệu, dòng tổng)
 * để chỉ chuẩn hóa phần cần chuẩn hóa mà KHÔNG phá cấu trúc thầy cô đã dựng (ô gộp, căn lề, đầu bảng hai tầng).
 * Thuần túy, kiểm thử được; chỉ số hàng/cột tính từ 0 trong vùng đang dùng (used range).
 */

export interface MergeArea {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export type ColKind = "stt" | "score" | "number" | "date" | "text";
export type TitleRole = "org" | "title" | "sub";

export interface SheetPlan {
  rows: number;
  cols: number;
  /** Khối tiêu đề phía trên bảng (tên trường, tên bảng, năm học…), gồm cả hai đầu. */
  titleRows: [number, number] | null;
  titleRoles: TitleRole[];
  /** Đầu bảng, có thể nhiều tầng. */
  headerRows: [number, number] | null;
  dataStart: number;
  dataEnd: number;
  totalRow: number | null;
  colKinds: ColKind[];
  /** Chữ gộp của đầu bảng theo cột (dùng đo độ rộng tối thiểu). */
  headerText: string[];
  nameCol: number | null;
}

const MAX_HEADER = 4;
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const isNum = (v: unknown): boolean => {
  if (typeof v === "number") return Number.isFinite(v);
  const s = text(v).replace(",", ".");
  return s !== "" && /^-?\d+(\.\d+)?$/.test(s);
};
const toNum = (v: unknown): number => (typeof v === "number" ? v : Number(text(v).replace(",", ".")));
const DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const TOTAL = /^(tổng|cộng|trung bình|tb\b)/iu;
const ORG = /^(UBND|ỦY BAN|SỞ|PHÒNG|TRƯỜNG|CỘNG HÒA|ĐỘC LẬP)/u;
const caps = (t: string) => t === t.toUpperCase() && /\p{L}/u.test(t);

export function planSheet(values: unknown[][], merges: MergeArea[] = []): SheetPlan {
  const rows = values.length;
  const cols = Math.max(0, ...values.map((r) => r.length));
  const at = (r: number, c: number) => text(values[r]?.[c]);
  const filled = (r: number) => {
    let n = 0;
    for (let c = 0; c < cols; c++) if (at(r, c)) n++;
    return n;
  };
  const textRatio = (r: number) => {
    let t = 0;
    let n = 0;
    for (let c = 0; c < cols; c++) {
      if (!at(r, c)) continue;
      n++;
      if (!isNum(values[r]![c])) t++;
    }
    return n ? t / n : 0;
  };
  const wide = Math.max(3, Math.ceil(cols * 0.3));

  // Đầu bảng bắt đầu ở hàng rộng đầu tiên mà phần lớn là chữ.
  let hs = -1;
  for (let r = 0; r < rows; r++) {
    if (filled(r) >= wide && textRatio(r) >= 0.6) {
      hs = r;
      break;
    }
  }
  let he = hs;
  if (hs >= 0) {
    while (he - hs + 1 < MAX_HEADER && he + 1 < rows) {
      const n = he + 1;
      const inHead = (m: MergeArea) => m.r1 >= hs && m.r1 <= he;
      // (a) có ô gộp dọc kéo xuống hàng kế
      const vertical = merges.some((m) => inHead(m) && m.r2 >= n);
      // (b) ô gộp ngang ở đầu bảng và hàng kế có chữ nằm trong khoảng gộp (đánh số 1..5 dưới "ĐĐGtx")
      const under = merges.some((m) => {
        if (!inHead(m) || m.r2 !== he || m.c2 <= m.c1) return false;
        const kids = Array.from({ length: m.c2 - m.c1 + 1 }, (_, i) => at(n, m.c1 + i)).filter(Boolean);
        return kids.length > 0 && kids.every((k) => k.length <= 4);
      });
      // (c) không có ô gộp: hàng kế toàn số ngắn liên tiếp 1,2,3… nằm dưới ô trống/tên nhóm
      let seq = false;
      const nums: number[] = [];
      for (let c = 0; c < cols; c++) if (at(n, c)) nums.push(toNum(values[n]![c]));
      if (nums.length >= 2 && nums.every((x) => Number.isInteger(x) && x >= 0 && x < 20) && nums.every((x, i) => i === 0 || x === nums[i - 1]! + 1) && nums.length === filled(n)) seq = true;
      if (vertical || under || seq) he = n;
      else break;
    }
  }

  // Khối tiêu đề: các hàng có chữ nằm trước đầu bảng.
  let titleRows: [number, number] | null = null;
  const titleRoles: TitleRole[] = [];
  const stop = hs >= 0 ? hs : 0;
  let t0 = -1;
  let t1 = -1;
  for (let r = 0; r < stop; r++) {
    if (filled(r) > 0) {
      if (t0 < 0) t0 = r;
      t1 = r;
    }
  }
  if (t0 >= 0) {
    titleRows = [t0, t1];
    let titleSeen = false;
    for (let r = t0; r <= t1; r++) {
      const t = at(r, 0) || values[r]!.map(text).find(Boolean) || "";
      if (!t) titleRoles.push("sub");
      else if (caps(t) && ORG.test(t) && !titleSeen) titleRoles.push("org");
      else if (caps(t) && !titleSeen) {
        titleSeen = true;
        titleRoles.push("title");
      } else titleRoles.push("sub");
    }
  }

  // Dữ liệu: khối liền kề dưới đầu bảng (dừng ở hàng trống; phần chữ ký, ghi chú bên dưới không đụng tới).
  let ds = hs >= 0 ? he + 1 : 0;
  while (ds < rows && filled(ds) === 0) ds++;
  let de = ds - 1;
  for (let r = ds; r < rows; r++) {
    if (filled(r) === 0) break;
    de = r;
  }
  let totalRow: number | null = null;
  if (de >= ds) {
    const first = values[de]!.map(text).find(Boolean) ?? "";
    if (TOTAL.test(first)) {
      totalRow = de;
      de -= 1;
    }
  }

  const headerText: string[] = [];
  for (let c = 0; c < cols; c++) {
    const parts: string[] = [];
    if (hs >= 0) for (let r = hs; r <= he; r++) if (at(r, c)) parts.push(at(r, c));
    headerText.push(parts.join(" "));
  }

  const colKinds: ColKind[] = [];
  for (let c = 0; c < cols; c++) {
    const cells: unknown[] = [];
    for (let r = ds; r <= de; r++) if (at(r, c)) cells.push(values[r]![c]);
    if (cells.length === 0) {
      colKinds.push("text");
      continue;
    }
    if (cells.every((v) => DATE.test(text(v)))) colKinds.push("date");
    else if (cells.every(isNum)) {
      const ns = cells.map(toNum);
      const seq = ns.length >= 3 && ns.every((x, i) => i === 0 || x === ns[i - 1]! + 1) && ns[0]! <= 1 && c <= 1;
      if (seq) colKinds.push("stt");
      else if (ns.every((x) => x >= 0 && x <= 10) && (/ĐĐG|ĐTB|điểm|\bTB\b/iu.test(headerText[c] ?? "") || ns.some((x) => !Number.isInteger(x)))) colKinds.push("score");
      else colKinds.push("number");
    } else if (cells.filter(isNum).length >= cells.length * 0.8 && /ĐĐG|ĐTB|điểm/iu.test(headerText[c] ?? "")) colKinds.push("score");
    else colKinds.push("text");
  }
  const nameIdx = headerText.findIndex((h) => /họ\s*(và)?\s*tên|họ tên/iu.test(h));

  return {
    rows,
    cols,
    titleRows,
    titleRoles,
    headerRows: hs >= 0 ? [hs, he] : null,
    dataStart: ds,
    dataEnd: de,
    totalRow,
    colKinds,
    headerText,
    nameCol: nameIdx >= 0 ? nameIdx : null,
  };
}
