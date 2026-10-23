import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GroupStore } from "@pvta/core/groups/store";
import { checkBasisLocal, muteBasisLocal } from "../src/basis.js";

let home: string;
beforeEach(() => (home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-basis-"))));
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
const noExtract = { extract: async () => ({ segments: [] }) };

function seed() {
  const s = new GroupStore(home, noExtract);
  s.setEnabled(["hieu-truong"]);
  const lib = s.library("hieu-truong");
  const d = lib.book.add({ title: "Nghị định 29/2012/NĐ-CP về viên chức", no: "29/2012/NĐ-CP", agency: "Chính phủ", status: "het-hieu-luc", statusSource: "tay" } as never);
  lib.book.save();
  s.close();
  return d;
}
const TEXT = "Căn cứ Nghị định số 29/2012/NĐ-CP ngày 12/4/2012 của Chính phủ;\nQUYẾT ĐỊNH:\nĐiều 1. ...";

describe("cảnh báo căn cứ cho add-in", () => {
  it("chưa chọn nhóm: không nói gì", () => {
    expect(checkBasisLocal(home, TEXT, "a.docx")).toBeUndefined();
  });
  it("căn cứ đã hết hiệu lực: báo một lần mỗi ngày, có lời nhắc sửa, tắt được", () => {
    seed();
    const t = Date.UTC(2026, 9, 18, 3);
    const a = checkBasisLocal(home, TEXT, "qd.docx", t)!;
    expect(a.changed).toHaveLength(1);
    expect(a.changed[0]!.text).toContain("29/2012/NĐ-CP");
    expect(a.fixPrompt).toContain("Không tự sửa tài liệu");
    expect(a.disclaimer).toContain("đối chiếu văn bản gốc");
    expect(checkBasisLocal(home, TEXT, "qd.docx", t + 3600_000)).toBeUndefined(); // đã nhắc hôm nay
    const b = checkBasisLocal(home, TEXT, "qd.docx", t + 2 * 86400_000)!;
    expect(b.changed).toHaveLength(1);
    muteBasisLocal(home, "29/2012/NĐ-CP");
    expect(checkBasisLocal(home, TEXT, "qd.docx", t + 5 * 86400_000)).toBeUndefined();
  });
  it("văn bản không viện dẫn gì: im lặng", () => {
    seed();
    expect(checkBasisLocal(home, "Thông báo nghỉ lễ", "tb.docx")).toBeUndefined();
  });
});
