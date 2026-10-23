/**
 * Tính toán chính xác cho chế độ Kế toán.
 * Số được giữ dạng PHÂN SỐ (BigInt), nên 0,1 + 0,2 = 0,3 đúng tuyệt đối và phép chia không mất độ chính xác
 * cho tới bước làm tròn cuối. Chỉ nhận một cú pháp biểu thức nhỏ (số, + - * / ^ %, ngoặc, vài hàm):
 * KHÔNG chạy mã tùy ý, không có biến.
 */

const MAX_LEN = 2000;
const MAX_DIGITS = 400; // chặn số quá lớn làm treo máy
const MAX_POW = 200;

export class Rat {
  constructor(
    public n: bigint,
    public d: bigint = 1n,
  ) {
    if (d === 0n) throw new CalcError("Chia cho 0.");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    this.n = g > 1n ? n / g : n;
    this.d = g > 1n ? d / g : d;
    if (digits(this.n) > MAX_DIGITS || digits(this.d) > MAX_DIGITS) throw new CalcError("Số quá lớn.");
  }
  add(o: Rat) {
    return new Rat(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Rat) {
    return new Rat(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Rat) {
    return new Rat(this.n * o.n, this.d * o.d);
  }
  div(o: Rat) {
    if (o.n === 0n) throw new CalcError("Chia cho 0.");
    return new Rat(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Rat(-this.n, this.d);
  }
  cmp(o: Rat) {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  isInt() {
    return this.d === 1n;
  }
}

export class CalcError extends Error {}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}
const digits = (x: bigint) => (x < 0n ? -x : x).toString().length;
const abs = (r: Rat) => (r.n < 0n ? r.neg() : r);

export type RoundMode = "half_up" | "half_even" | "down" | "up";

/** Làm tròn tới `places` chữ số thập phân (places có thể âm: làm tròn hàng chục, trăm…). */
function roundRat(r: Rat, places: number, mode: RoundMode): Rat {
  const scale = places >= 0 ? new Rat(10n ** BigInt(places)) : new Rat(1n, 10n ** BigInt(-places));
  const x = r.mul(scale); // làm tròn x về số nguyên
  const sign = x.n < 0n ? -1n : 1n;
  const ax = abs(x);
  let q = ax.n / ax.d;
  const rem = new Rat(ax.n - q * ax.d, ax.d);
  const half = new Rat(1n, 2n);
  const c = rem.cmp(half);
  if (rem.n !== 0n) {
    if (mode === "up") q += 1n;
    else if (mode === "half_up") {
      if (c >= 0) q += 1n;
    } else if (mode === "half_even") {
      if (c > 0 || (c === 0 && q % 2n === 1n)) q += 1n;
    } // "down": cắt bỏ
  }
  return new Rat(sign * q, 1n).div(scale);
}

/** Số dạng văn bản: 1234.5, 1_234.5 hoặc 1 234.5 (khoảng trắng/gạch dưới giữa các chữ số bị bỏ). Dấu phẩy KHÔNG nhận. */
function parseNumber(s: string): Rat {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m) throw new CalcError(`Số không hợp lệ: "${s}".`);
  const frac = m[2] ?? "";
  let n = BigInt(m[1]! + frac);
  let d = 10n ** BigInt(frac.length);
  const e = m[3] ? parseInt(m[3], 10) : 0;
  if (Math.abs(e) > 60) throw new CalcError("Số mũ quá lớn.");
  if (e > 0) n *= 10n ** BigInt(e);
  else if (e < 0) d *= 10n ** BigInt(-e);
  return new Rat(n, d);
}

type Tok = { t: "num"; v: Rat } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      let buf = "";
      while (j < src.length) {
        const ch = src[j]!;
        if (/[0-9.]/.test(ch)) buf += ch;
        else if ((ch === "e" || ch === "E") && /^[0-9.]+$/.test(buf) && /^[+-]?\d/.test(src.slice(j + 1))) {
          buf += ch;
          j++;
          if (src[j] === "+" || src[j] === "-") buf += src[j];
        } else if (ch === "_") {
          // gạch dưới tách nhóm chữ số: 1_000_000
        } else break;
        j++;
      }
      if (buf.startsWith(".")) buf = "0" + buf;
      out.push({ t: "num", v: parseNumber(buf) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^%(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "×") {
      out.push({ t: "op", v: "*" });
      i++;
      continue;
    }
    if (c === "÷") {
      out.push({ t: "op", v: "/" });
      i++;
      continue;
    }
    if (c === "−" || c === "–") {
      out.push({ t: "op", v: "-" });
      i++;
      continue;
    }
    throw new CalcError(`Ký tự không được phép: "${c}".`);
  }
  return out;
}

const ROUND_MODES: RoundMode[] = ["half_up", "half_even", "down", "up"];

class Parser {
  private p = 0;
  constructor(
    private toks: Tok[],
    private defMode: RoundMode,
  ) {}
  private peek() {
    return this.toks[this.p];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }
  private take() {
    return this.toks[this.p++];
  }
  parseAll(): Rat {
    const v = this.expr();
    if (this.p < this.toks.length) throw new CalcError("Biểu thức sai cú pháp (thiếu toán tử, thừa ký tự, hoặc dùng dấu phẩy: số thập phân viết bằng dấu chấm, không có dấu phân cách hàng nghìn).");
    return v;
  }
  private expr(): Rat {
    let v = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.take() as { v: string }).v;
      const r = this.term();
      v = op === "+" ? v.add(r) : v.sub(r);
    }
    return v;
  }
  private term(): Rat {
    let v = this.unary();
    for (;;) {
      if (this.isOp("*")) {
        this.take();
        v = v.mul(this.unary());
      } else if (this.isOp("/")) {
        this.take();
        v = v.div(this.unary());
      } else break;
    }
    return v;
  }
  private unary(): Rat {
    if (this.isOp("-")) {
      this.take();
      return this.unary().neg();
    }
    if (this.isOp("+")) {
      this.take();
      return this.unary();
    }
    return this.power();
  }
  private power(): Rat {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.take();
      const e = this.unary(); // kết hợp phải
      if (!e.isInt()) throw new CalcError("Chỉ nhận số mũ nguyên.");
      const k = Number(e.n);
      if (Math.abs(k) > MAX_POW) throw new CalcError("Số mũ quá lớn.");
      let r = new Rat(1n);
      for (let i = 0; i < Math.abs(k); i++) r = r.mul(base);
      return k < 0 ? new Rat(1n).div(r) : r;
    }
    return base;
  }
  private postfix(): Rat {
    let v = this.atom();
    while (this.isOp("%")) {
      this.take();
      v = v.div(new Rat(100n)); // 15% = 0,15
    }
    return v;
  }
  private atom(): Rat {
    const t = this.take();
    if (!t) throw new CalcError("Biểu thức chưa đầy đủ.");
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") {
      const v = this.expr();
      if (!this.isOp(")")) throw new CalcError("Thiếu dấu đóng ngoặc.");
      this.take();
      return v;
    }
    if (t.t === "id") return this.call(t.v);
    throw new CalcError(`Không hiểu "${t.v}".`);
  }
  private call(name: string): Rat {
    if (name === "pi" || name === "e") throw new CalcError(`Không hỗ trợ hằng số "${name}" (không chính xác tuyệt đối).`);
    if (!this.isOp("(")) throw new CalcError(`Hàm "${name}" cần dấu ngoặc.`);
    this.take();
    const args: Rat[] = [];
    let modeArg: RoundMode | undefined;
    if (!this.isOp(")")) {
      for (;;) {
        const t = this.peek();
        if (t?.t === "id" && (ROUND_MODES as string[]).includes(t.v)) {
          this.take();
          modeArg = t.v as RoundMode;
        } else args.push(this.expr());
        if (this.isOp(",")) {
          this.take();
          continue;
        }
        break;
      }
    }
    if (!this.isOp(")")) throw new CalcError(`Thiếu dấu đóng ngoặc của ${name}(…).`);
    this.take();
    const need = (min: number, max = min) => {
      if (args.length < min || args.length > max) throw new CalcError(`${name}(…) nhận ${min === max ? min : `${min}–${max}`} giá trị.`);
    };
    switch (name) {
      case "round": {
        need(1, 2);
        const places = args[1] ? Number(args[1].n) : 0;
        if (args[1] && !args[1].isInt()) throw new CalcError("round: số chữ số thập phân phải là số nguyên.");
        return roundRat(args[0]!, places, modeArg ?? this.defMode);
      }
      case "sum":
        need(1, 500);
        return args.reduce((a, b) => a.add(b));
      case "avg":
        need(1, 500);
        return args.reduce((a, b) => a.add(b)).div(new Rat(BigInt(args.length)));
      case "min":
        need(1, 500);
        return args.reduce((a, b) => (b.cmp(a) < 0 ? b : a));
      case "max":
        need(1, 500);
        return args.reduce((a, b) => (b.cmp(a) > 0 ? b : a));
      case "abs":
        need(1);
        return abs(args[0]!);
      case "floor":
        need(1);
        return new Rat(floorDiv(args[0]!.n, args[0]!.d));
      case "ceil":
        need(1);
        return new Rat(-floorDiv(-args[0]!.n, args[0]!.d));
      case "count":
        return new Rat(BigInt(args.length));
      case "median": {
        need(1, 500);
        const v = sorted(args);
        const m = v.length >> 1;
        return v.length % 2 ? v[m]! : v[m - 1]!.add(v[m]!).div(new Rat(2n));
      }
      case "var_p":
      case "var_s":
        need(name === "var_s" ? 2 : 1, 500);
        return variance(args, name === "var_s");
      case "stdev_p":
      case "stdev_s":
        need(name === "stdev_s" ? 2 : 1, 500);
        return sqrtRat(variance(args, name === "stdev_s"));
      case "sqrt":
        need(1);
        return sqrtRat(args[0]!);
      case "wavg": {
        // wavg(điểm1, hệ số1, điểm2, hệ số2, …): trung bình có trọng số.
        need(2, 500);
        if (args.length % 2) throw new CalcError("wavg(…) nhận từng cặp: giá trị, hệ số.");
        let num = new Rat(0n);
        let den = new Rat(0n);
        for (let i = 0; i < args.length; i += 2) {
          num = num.add(args[i]!.mul(args[i + 1]!));
          den = den.add(args[i + 1]!);
        }
        return num.div(den);
      }
      case "percent":
        // percent(phần, tổng) = phần / tổng × 100
        need(2);
        return args[0]!.div(args[1]!).mul(new Rat(100n));
      case "rank": {
        // rank(x, các giá trị…): hạng của x khi xếp từ CAO xuống thấp (như RANK.EQ), bằng nhau cùng hạng.
        need(2, 501);
        const [x, ...rest] = args;
        if (!rest.some((r) => r.cmp(x!) === 0)) throw new CalcError("rank: giá trị cần xếp hạng phải nằm trong danh sách.");
        return new Rat(BigInt(1 + rest.filter((r) => r.cmp(x!) > 0).length));
      }
      case "count_ge":
      case "count_gt":
      case "count_le":
      case "count_lt":
      case "count_eq": {
        // count_ge(ngưỡng, các giá trị…): đếm số giá trị ≥ ngưỡng (gt >, le ≤, lt <, eq =).
        need(1, 501);
        const [x, ...rest] = args;
        const test = { count_ge: (c: number) => c >= 0, count_gt: (c: number) => c > 0, count_le: (c: number) => c <= 0, count_lt: (c: number) => c < 0, count_eq: (c: number) => c === 0 }[name];
        return new Rat(BigInt(rest.filter((r) => test(r.cmp(x!))).length));
      }
      default:
        throw new CalcError(`Hàm không có: ${name}. Có: ${FUNCS}.`);
    }
  }
}

const FUNCS = "round, sum, avg, min, max, abs, floor, ceil, count, median, var_p, var_s, stdev_p, stdev_s, sqrt, wavg, percent, rank, count_ge, count_gt, count_le, count_lt, count_eq";

function sorted(v: Rat[]): Rat[] {
  return [...v].sort((a, b) => a.cmp(b));
}

/** Phương sai chính xác (phân số): tổng thể (chia n) hoặc mẫu (chia n − 1), như VAR.P / VAR.S của Excel. */
function variance(v: Rat[], sample: boolean): Rat {
  const n = new Rat(BigInt(v.length));
  const mean = v.reduce((a, b) => a.add(b)).div(n);
  const ss = v.reduce((acc, x) => {
    const d = x.sub(mean);
    return acc.add(d.mul(d));
  }, new Rat(0n));
  return ss.div(sample ? new Rat(BigInt(v.length - 1)) : n);
}

/** Căn bậc hai số nguyên (Newton, BigInt). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2)); // luôn ≥ √n
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/**
 * Căn bậc hai: đúng tuyệt đối khi kết quả là số hữu tỉ (vd √2,25 = 1,5); còn lại đúng tới 30 chữ số thập phân
 * (cắt bỏ phần sau, sai số < 10⁻³⁰), đủ cho mọi bước làm tròn sau đó.
 */
const SQRT_PLACES = 30n;
function sqrtRat(r: Rat): Rat {
  if (r.n < 0n) throw new CalcError("Không lấy căn bậc hai của số âm.");
  const a = isqrt(r.n);
  const b = isqrt(r.d);
  if (a * a === r.n && b * b === r.d) return new Rat(a, b);
  const scale = 10n ** SQRT_PLACES;
  return new Rat(isqrt(r.n * r.d * scale * scale), r.d * scale);
}

function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d;
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q;
}

/** Chuỗi thập phân đúng tới `maxPlaces` chữ số; `exact` = false nếu còn phần lẻ bị cắt (số thập phân vô hạn). */
export function ratToDecimal(r: Rat, maxPlaces = 20): { text: string; exact: boolean } {
  const neg = r.n < 0n;
  const n = neg ? -r.n : r.n;
  const ip = n / r.d;
  let rem = n % r.d;
  let frac = "";
  while (rem !== 0n && frac.length < maxPlaces) {
    rem *= 10n;
    frac += (rem / r.d).toString();
    rem %= r.d;
  }
  const exact = rem === 0n;
  const text = (neg && (ip !== 0n || frac !== "") ? "-" : "") + ip.toString() + (frac ? "." + frac : "");
  return { text, exact };
}

export interface CalcResult {
  expr: string;
  /** Giá trị cuối (đã làm tròn nếu có `round`), dạng chuỗi thập phân. */
  value: string;
  /** Giá trị trước khi làm tròn, tối đa 20 chữ số lẻ. */
  raw: string;
  /** Giá trị trước khi làm tròn có hữu hạn chữ số thập phân không. */
  exact: boolean;
  /** Dạng phân số tối giản khi không hữu hạn (ví dụ 1/3). */
  fraction?: string;
  /** Giá trị hiển thị kiểu Việt Nam (dấu chấm hàng nghìn, dấu phẩy thập phân). */
  vi: string;
}

export interface CalcOptions {
  /** Làm tròn kết quả cuối tới ngần này chữ số thập phân (0 = nguyên đồng). */
  round?: number;
  mode?: RoundMode;
}

/** Kiểu Việt Nam: 1234567.5 → "1.234.567,5". */
export function toVietnamese(dec: string): string {
  const neg = dec.startsWith("-");
  const [ip, fp] = (neg ? dec.slice(1) : dec).split(".");
  const grouped = ip!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + grouped + (fp ? "," + fp : "");
}

export function calc(expr: string, opts: CalcOptions = {}): CalcResult {
  if (typeof expr !== "string" || !expr.trim()) throw new CalcError("Biểu thức trống.");
  if (expr.length > MAX_LEN) throw new CalcError(`Biểu thức quá dài (tối đa ${MAX_LEN} ký tự).`);
  const mode = opts.mode && ROUND_MODES.includes(opts.mode) ? opts.mode : "half_up";
  const raw = new Parser(tokenize(expr), mode).parseAll();
  const rawDec = ratToDecimal(raw);
  let finalR = raw;
  if (opts.round !== undefined) {
    if (!Number.isInteger(opts.round) || opts.round < -12 || opts.round > 12) throw new CalcError("round phải là số nguyên từ -12 đến 12.");
    finalR = roundRat(raw, opts.round, mode);
  }
  const fin = ratToDecimal(finalR, 20);
  return {
    expr,
    value: fin.text,
    raw: rawDec.text,
    exact: rawDec.exact,
    ...(rawDec.exact ? {} : { fraction: `${raw.n}/${raw.d}` }),
    vi: toVietnamese(fin.text),
  };
}

/** Một dòng kiểm tra: biểu thức cần bằng giá trị mong đợi (người dùng/tài liệu ghi) tới `round` chữ số thập phân. */
export interface CheckItem {
  label?: string;
  expr: string;
  expected: string | number;
}

export interface CheckResult {
  label?: string;
  expr: string;
  computed: string;
  expected: string;
  match: boolean;
  diff?: string;
  error?: string;
}

/** Đối chiếu danh sách số trong tài liệu với giá trị tính lại. `round` = số chữ số thập phân của số trong tài liệu. */
export function check(items: readonly CheckItem[], opts: CalcOptions = {}): { checked: number; mismatches: number; results: CheckResult[] } {
  const results: CheckResult[] = [];
  for (const it of items.slice(0, 500)) {
    const exp = String(it.expected);
    try {
      const got = calc(it.expr, opts);
      const expNorm = calc(exp.replace(/\s/g, ""), { ...opts }).value;
      const match = got.value === expNorm || (opts.round === undefined && got.raw === expNorm);
      const res: CheckResult = { ...(it.label ? { label: it.label } : {}), expr: it.expr, computed: got.value, expected: expNorm, match };
      if (!match) res.diff = ratToDecimal(subDec(got.value, expNorm)).text;
      results.push(res);
    } catch (e) {
      results.push({ ...(it.label ? { label: it.label } : {}), expr: it.expr, computed: "", expected: exp, match: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { checked: results.length, mismatches: results.filter((r) => !r.match).length, results };
}

function subDec(a: string, b: string): Rat {
  return parseSigned(a).sub(parseSigned(b));
}
function parseSigned(s: string): Rat {
  return s.startsWith("-") ? parseNumber(s.slice(1)).neg() : parseNumber(s);
}
