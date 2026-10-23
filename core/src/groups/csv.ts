/** CSV nhỏ gọn theo RFC 4180 (dấu phẩy, ngoặc kép, xuống dòng trong ô) cho sources.csv. */

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') (cur += '"'), i++;
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") (row.push(cur), (cur = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
