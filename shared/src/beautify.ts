/** Làm đẹp: nhận đoạn có công thức viết dạng chữ, và so sánh định dạng trước/sau khi người dùng chỉnh (chỉ đặc điểm, không giữ chữ). */

/** Đoạn có vẻ chứa công thức toán/lý/hóa viết dạng chữ thường (chưa thành Equation). */
export function looksMathy(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 600) return false;
  if (/\$[^$]+\$|\\\(|\\\[/.test(t)) return false; // đã là LaTeX đánh dấu
  return (
    /[A-Za-z)\]]\s?\^\s?[-+]?\w/.test(t) || // x^2
    /[A-Za-z]_\{?\w/.test(t) || // H_2
    /[²³⁺⁻₀-₉⁰-⁹√∑∫≈≠≤≥±∞π]/.test(t) || // ký tự toán Unicode
    /(?<![\p{L}\d])[A-Z][a-z]?\d+(?:[A-Z][a-z]?\d*|\([A-Za-z0-9]+\)\d*)*(?![\p{L}\d])|(?<![\p{L}\d])[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*|\([A-Za-z0-9]+\)\d*)*\d(?![\p{L}\d])/u.test(t) || // H2O, CO2, Ca(OH)2
    /[a-zA-Z]\d?\s*=\s*[-\d(a-zA-Z][^.]*[/*×·]\s*[\d(a-zA-Z]/.test(t) || // v = s/t
    /\b\d+\s*[/]\s*\d+\b/.test(t) && /[a-z=]/.test(t) || // phân số 1/2 trong biểu thức
    /\b(sin|cos|tan|cot|log|ln|lim)\s*[(\dx]/i.test(t) ||
    /->|=>|<->/.test(t) && /[A-Z][a-z]?\d?/.test(t) // phản ứng
  );
}

/** Chữ ký định dạng của một đoạn. */
export interface ParaSig {
  /** Văn bản đoạn: chỉ dùng cục bộ để ghép đoạn trước/sau, không bao giờ gửi đi. */
  text: string;
  style?: string;
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  align?: string;
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  firstIndent?: number;
  leftIndent?: number;
  /** Đoạn chứa Equation. */
  eq?: boolean;
}

const PROPS: Array<[keyof ParaSig, string]> = [
  ["style", "kiểu (style)"],
  ["font", "phông chữ"],
  ["size", "cỡ chữ"],
  ["bold", "in đậm"],
  ["italic", "in nghiêng"],
  ["align", "căn lề"],
  ["lineSpacing", "giãn dòng"],
  ["spaceBefore", "cách đoạn trên"],
  ["spaceAfter", "cách đoạn dưới"],
  ["firstIndent", "thụt đầu dòng"],
  ["leftIndent", "lề trái đoạn"],
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Ghép đoạn trước/sau theo nội dung (LCS rút gọn), trả về các cặp [a,b] (null = thêm/xóa). */
export function pairParas(a: ParaSig[], b: ParaSig[]): Array<[ParaSig | null, ParaSig | null]> {
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    // quá lớn: ghép theo vị trí
    const out: Array<[ParaSig | null, ParaSig | null]> = [];
    for (let i = 0; i < Math.max(n, m); i++) out.push([a[i] ?? null, b[i] ?? null]);
    return out;
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i]![j] = norm(a[i]!.text) === norm(b[j]!.text) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: Array<[ParaSig | null, ParaSig | null]> = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && norm(a[i]!.text) === norm(b[j]!.text)) out.push([a[i++]!, b[j++]!]);
    else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) out.push([null, b[j++]!]);
    else out.push([a[i++]!, null]);
  }
  // Đoạn bị sửa chữ: trong mỗi cụm đoạn không khớp, ghép lần lượt đoạn bị bỏ với đoạn mới thêm.
  const merged: Array<[ParaSig | null, ParaSig | null]> = [];
  for (let k = 0; k < out.length; ) {
    if (out[k]![0] && out[k]![1]) {
      merged.push(out[k++]!);
      continue;
    }
    const gone: ParaSig[] = [];
    const born: ParaSig[] = [];
    while (k < out.length && !(out[k]![0] && out[k]![1])) {
      const [x, y] = out[k++]!;
      if (x) gone.push(x);
      if (y) born.push(y);
    }
    for (let q = 0; q < Math.max(gone.length, born.length); q++) merged.push([gone[q] ?? null, born[q] ?? null]);
  }
  return merged;
}

export interface BeautifyDiff {
  /** Mô tả trừu tượng (không có chữ của văn bản), tối đa ~20 dòng. */
  changes: string[];
  edited: boolean;
}

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "(không)" : String(v));

/** So sánh văn bản ngay sau khi PVTA làm đẹp (before) với lúc người dùng lưu (after). */
export function diffSigs(before: ParaSig[], after: ParaSig[]): BeautifyDiff {
  const pairs = pairParas(before, after);
  const fmt = new Map<string, number>();
  let added = 0;
  let removed = 0;
  let reworded = 0;
  let eqLost = 0;
  let eqNew = 0;
  for (const [a, b] of pairs) {
    if (a && !b) removed++;
    else if (!a && b) added++;
    else if (a && b) {
      if (norm(a.text) !== norm(b.text)) reworded++;
      if (a.eq && !b.eq) eqLost++;
      if (!a.eq && b.eq) eqNew++;
      for (const [k, label] of PROPS) {
        const x = a[k];
        const y = b[k];
        if (x === undefined || y === undefined || x === y) continue;
        const key = `${label}: ${show(x)} → ${show(y)}`;
        fmt.set(key, (fmt.get(key) ?? 0) + 1);
      }
    }
  }
  const changes: string[] = [];
  for (const [k, n] of [...fmt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)) changes.push(`${k} (${n} đoạn)`);
  if (eqLost) changes.push(`${eqLost} đoạn Equation bị đổi lại thành chữ thường`);
  if (eqNew) changes.push(`${eqNew} đoạn được người dùng chuyển thêm sang Equation`);
  if (reworded) changes.push(`${reworded} đoạn bị sửa lại chữ (nội dung)`);
  if (added) changes.push(`thêm ${added} đoạn`);
  if (removed) changes.push(`xóa ${removed} đoạn`);
  return { changes, edited: changes.length > 0 };
}

/** Làm đẹp Excel: chữ ký định dạng theo VAI TRÒ của vùng (không chứa chữ của sheet), để so trước/sau khi người dùng chỉnh. */
export interface RoleSig {
  role: string;
  font?: string;
  size?: number;
  bold?: boolean;
  align?: string;
  wrap?: boolean;
}

const ROLE_PROPS: Array<[keyof RoleSig, string]> = [
  ["font", "phông chữ"],
  ["size", "cỡ chữ"],
  ["bold", "in đậm"],
  ["align", "căn lề"],
  ["wrap", "xuống dòng trong ô"],
];

export function diffRoleSigs(before: RoleSig[], after: RoleSig[]): BeautifyDiff {
  const changes: string[] = [];
  for (const a of before) {
    const b = after.find((x) => x.role === a.role);
    if (!b) continue;
    for (const [k, label] of ROLE_PROPS) {
      const x = a[k];
      const y = b[k];
      if (x === undefined || y === undefined || x === y) continue;
      changes.push(`${a.role}: ${label} ${show(x)} → ${show(y)}`);
    }
  }
  return { changes: changes.slice(0, 20), edited: changes.length > 0 };
}
