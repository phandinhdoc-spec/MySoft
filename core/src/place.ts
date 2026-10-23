import { fold } from "./hints.js";

/**
 * Xác định đơn vị và địa phương của văn bản từ vài dòng đầu (chỉ xử lý cục bộ, không gửi cho model),
 * để tìm văn bản liên quan đúng địa bàn (vd phường Hạnh Thông thuộc TP Hồ Chí Minh, không phải Quảng Ngãi).
 */
export interface DocContext {
  /** Tên văn bản (dòng tiêu đề viết hoa: KẾ HOẠCH CÔNG TÁC QUÝ III NĂM 2026). */
  title?: string;
  /** Đơn vị ban hành, vd "THCS Phan Văn Trị". */
  school?: string;
  /** Địa phương cấp phường/xã/quận/huyện, vd "phường Hạnh Thông". */
  place?: string;
  /** Tỉnh/thành nếu văn bản ghi rõ. */
  province?: string;
}

const OLD_PROVINCES = [
  "Hà Nội", "Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "An Giang", "Bà Rịa - Vũng Tàu", "Bắc Giang", "Bắc Kạn", "Bạc Liêu", "Bắc Ninh", "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước", "Bình Thuận", "Cà Mau", "Cao Bằng", "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Tĩnh", "Hải Dương", "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái",
];

export interface Province {
  name: string;
  /** Cách gọi (đã bỏ dấu) để nhận ra trong chữ. */
  aliases: string[];
  /** Tên miền cấp tỉnh trong *.<slug>.gov.vn. */
  slugs: string[];
}

const EXTRA: Record<string, { aliases?: string[]; slugs?: string[] }> = {
  "Hồ Chí Minh": { aliases: ["tp hcm", "tphcm", "tp ho chi minh", "thanh pho ho chi minh", "sai gon", "tp.hcm"], slugs: ["tphcm", "hcm", "binhduong", "baria-vungtau", "brvt"] },
  "Thừa Thiên Huế": { aliases: ["hue", "tp hue"], slugs: ["hue"] },
  "Bà Rịa - Vũng Tàu": { aliases: ["ba ria vung tau", "vung tau", "brvt"], slugs: ["baria-vungtau", "brvt"] },
  "Đắk Lắk": { aliases: ["dak lak"], slugs: ["daklak"] },
};

export const PROVINCES: Province[] = OLD_PROVINCES.map((name) => {
  const f = fold(name);
  const x = EXTRA[name] ?? {};
  return { name, aliases: [f, ...(x.aliases ?? []).map(fold)], slugs: [f.replace(/ /g, ""), ...(x.slugs ?? [])] };
});

const has = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

/** Tỉnh/thành được nhắc nhiều nhất trong chữ (đã bỏ dấu); cần ít nhất minVotes lần và hơn hẳn tỉnh thứ hai. */
export function provinceByVotes(text: string, minVotes = 2): Province | undefined {
  const f = fold(text);
  const counts: Array<{ p: Province; n: number }> = [];
  for (const p of PROVINCES) {
    let n = 0;
    for (const a of p.aliases) {
      let i = -1;
      while ((i = ` ${f} `.indexOf(` ${a} `, i + 1)) >= 0) n++;
    }
    if (n) counts.push({ p, n });
  }
  counts.sort((a, b) => b.n - a.n);
  const top = counts[0];
  if (!top || top.n < minVotes) return undefined;
  if (counts[1] && counts[1].n === top.n) return undefined;
  return top.p;
}

/** Tỉnh ghi rõ trong văn bản (một lần là đủ). */
export function explicitProvince(text: string): Province | undefined {
  return provinceByVotes(text, 1);
}

const STOP_AFTER = new Set(["cong", "hoa", "doc", "lap", "truong", "to", "so", "ngay", "thang", "nam", "tinh", "thanh", "pho", "quan", "huyen", "xa", "phuong", "ubnd", "cong hoa"]);
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(?:Ii|Iii|Iv|Vi|Vii|Viii|Ix)\b/g, (r) => r.toUpperCase());
const isUpper = (l: string) => {
  const letters = l.replace(/[^\p{L}]/gu, "");
  return letters.length > 2 && letters === letters.toUpperCase();
};

const DOC_TITLE = /(ke hoach|bao cao|quyet dinh|cong van|bien ban|to trinh|thong bao|chuong trinh|huong dan|de an|tong ket|noi quy|quy che)/;

export function extractContext(head: string): DocContext {
  const out: DocContext = {};
  const lines = head.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    if (!out.school) {
      const m = /(?:tr(?:ư|u)ờng|truong)\s+((?:thcs|thpt|tiểu học|tieu hoc|mầm non|mam non|th&thcs|thcs&thpt)[^,;:.\-–]{2,50})/iu.exec(line);
      if (m) {
        let name = m[1]!.trim().split(/\s+(?:t[ổo]|ph[òo]ng|ubnd)\s/i)[0]!;
        name = name.replace(/\s+(c[ộo]ng|đ[ộo]c)\b.*$/i, "");
        if (name.length >= 6) out.school = (/\p{Ll}/u.test(name) ? name : titleCase(name)).replace(/^thcs/i, "THCS").replace(/^thpt/i, "THPT");
      }
    }
    if (!out.place) {
      const m = /(phường|xã|thị trấn|quận|huyện)\s+([\p{L}]+(?:\s+[\p{L}]+){0,2})/iu.exec(line);
      if (m) {
        const words: string[] = [];
        for (const w of m[2]!.split(/\s+/)) {
          if (STOP_AFTER.has(fold(w))) break;
          words.push(w);
        }
        if (words.length) out.place = `${m[1]!.toLowerCase()} ${titleCase(words.join(" "))}`;
      }
    }
    if (!out.title) {
      const f = fold(line);
      if (isUpper(line) && DOC_TITLE.test(f) && !/cong hoa xa hoi/.test(f)) {
        // Tiêu đề thường xuống dòng: "KẾ HOẠCH" / "CÔNG TÁC QUÝ III NĂM 2026".
        let full = line;
        const next = lines[li + 1];
        if (next && isUpper(next) && line.split(/\s+/).length <= 4 && next.length <= 80 && !/cong hoa|dong|doc lap/.test(fold(next))) full = `${line} ${next}`;
        out.title = titleCase(full).replace(/\s+/g, " ").slice(0, 100);
      }
    }
  }
  const prov = explicitProvince(head);
  if (prov) out.province = prov.name;
  return out;
}

/** Tỉnh của một tên miền cấp tỉnh (*.quangngai.gov.vn); host khác trả undefined. */
export function hostProvince(host: string): Province | undefined {
  const m = /\.([a-z-]+)\.gov\.vn$/.exec(host);
  if (!m) return undefined;
  return PROVINCES.find((p) => p.slugs.includes(m[1]!));
}

/** Có cùng địa bàn không: true/false nếu biết, undefined nếu trang không thuộc tỉnh nào (trung ương, báo, luật...). */
export function sameArea(host: string, province: Province | undefined): boolean | undefined {
  const hp = hostProvince(host);
  if (!hp) return undefined;
  if (!province) return false; // chưa biết địa bàn: không mang trang địa phương lạ về
  return hp.name === province.name || province.slugs.some((s) => hp.slugs.includes(s));
}
