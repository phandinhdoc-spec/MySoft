import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ChatStore, readOfficeRulesForDesktop } from "../src/chatstore.js";
import { writeSystem } from "../src/writing.js";

const tmpDirs: string[] = [];
function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-chatstore-rules-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "chats.json");
  const msgDir = path.join(dir, "chats");
  return { dir, file, msgDir, store: new ChatStore(file, msgDir) };
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("ChatStore document & conversation rules on Office", () => {
  it("stores, persists, and combines global, project, and document-specific rules", () => {
    const { file, msgDir, store } = makeStore();
    store.setGlobalRules("Luôn xưng thầy/cô và gọi học sinh là các em.");
    const proj = store.saveProject({ name: "KHTN 8", rules: "Dùng danh pháp IUPAC theo CTGDPT 2018." });
    expect(proj.ok).toBe(true);
    const projectId = proj.ok ? proj.id : "";

    store.setDocRules({
      chatId: "chat_doc_1",
      docName: "Bai_12_Oxide.docx",
      host: "word",
      rules: "Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm và 1 câu tự luận.",
    });

    const effective = store.effectiveRules(projectId, "chat_doc_1", "Bai_12_Oxide.docx", "word");
    expect(effective).toContain("Luôn xưng thầy/cô");
    expect(effective).toContain("Dùng danh pháp IUPAC");
    expect(effective).toContain("Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm");

    const state = store.state("chat_doc_1", "Bai_12_Oxide.docx", "word");
    expect(state.docRules).toBe("Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm và 1 câu tự luận.");
    expect(state.activeDoc).toBe("Bai_12_Oxide.docx");

    // Lưu hội thoại mới: tự kế thừa quy tắc văn bản đã đặt trước đó
    const meta = store.save("chat_doc_1", "word", [{ role: "user", text: "Soạn đề bài 12" }], projectId, "Bai_12_Oxide.docx");
    expect(meta?.rules).toBe("Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm và 1 câu tự luận.");
    expect(meta?.docName).toBe("Bai_12_Oxide.docx");

    // Nạp lại từ đĩa
    const reloaded = new ChatStore(file, msgDir);
    expect(reloaded.docRulesOf("chat_doc_1", "Bai_12_Oxide.docx", "word")).toBe(
      "Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm và 1 câu tự luận.",
    );
    expect(reloaded.effectiveRules(projectId, undefined, "Bai_12_Oxide.docx", "word")).toContain(
      "Bài kiểm tra 15 phút: chỉ gồm 8 câu trắc nghiệm",
    );
  });

  it("supports updating and clearing conversation-specific rules", () => {
    const { store } = makeStore();
    store.save("c1", "word", [{ role: "user", text: "Xin chào" }]);
    expect(store.setChatRules("c1", "Chỉ trả lời bằng gạch đầu dòng ngắn gọn.")).toBe(true);
    expect(store.get("c1")?.rules).toBe("Chỉ trả lời bằng gạch đầu dòng ngắn gọn.");
    expect(store.effectiveRules(undefined, "c1")).toContain("Chỉ trả lời bằng gạch đầu dòng ngắn gọn.");

    expect(store.setChatRules("c1", "")).toBe(true);
    expect(store.get("c1")?.rules).toBeUndefined();
    expect(store.docRulesOf("c1")).toBe("");
  });

  it("injects document rules into writeSystem prompt for Office writing tools", () => {
    const sys = writeSystem({
      host: "word",
      lang: "vi",
      style: "",
      rules: "Không dùng từ viết tắt; giữ chuẩn NĐ 30/2020/NĐ-CP.",
    });
    expect(sys).toContain("Quy tắc của giáo viên (luôn tuân theo):");
    expect(sys).toContain("Không dùng từ viết tắt; giữ chuẩn NĐ 30/2020/NĐ-CP.");
  });

  it("separates host-specific rules (Word vs Excel vs PowerPoint) and syncs them to PVTA Chat Desktop", () => {
    const { dir, store } = makeStore();
    store.setGlobalRules("Quy tắc chung cho toàn bộ Office.");
    store.setHostRules("word", "Trong Word: dùng phông Times New Roman 13pt, giãn dòng 1.25.");
    store.setHostRules("excel", "Trong Excel: dùng phông Arial 11pt, số liệu làm tròn 1 chữ số thập phân.");
    store.setHostRules("powerpoint", "Trong PowerPoint: mỗi slide tối đa 4 ý chính.");
    const proj = store.saveProject({ name: "KHTN 9", rules: "Tuân thủ chuẩn kiến thức KHTN 9." });
    const pid = proj.ok ? proj.id : "";
    store.setDocRules({ host: "word", docName: "De_Kiem_Tra_GK1.docx", rules: "Đề gồm 12 câu trắc nghiệm và 2 câu tự luận." });

    const wordEff = store.effectiveRules(pid, undefined, "De_Kiem_Tra_GK1.docx", "word");
    expect(wordEff).toContain("Quy tắc chung cho toàn bộ Office.");
    expect(wordEff).toContain("Trong Word: dùng phông Times New Roman 13pt");
    expect(wordEff).not.toContain("Trong Excel:");
    expect(wordEff).toContain("Tuân thủ chuẩn kiến thức KHTN 9.");
    expect(wordEff).toContain("Đề gồm 12 câu trắc nghiệm và 2 câu tự luận.");

    const excelEff = store.effectiveRules(pid, undefined, "Bang_Diem_9A1.xlsx", "excel");
    expect(excelEff).toContain("Trong Excel: dùng phông Arial 11pt");
    expect(excelEff).not.toContain("Trong Word:");
    expect(excelEff).not.toContain("Đề gồm 12 câu trắc nghiệm");

    const desktopSynced = readOfficeRulesForDesktop(dir, {
      host: "word",
      docName: "De_Kiem_Tra_GK1.docx",
      projectName: "KHTN 9",
    });
    expect(desktopSynced).toContain("Quy tắc chung Office: Quy tắc chung cho toàn bộ Office.");
    expect(desktopSynced).toContain("Quy tắc riêng cho Word: Trong Word: dùng phông Times New Roman 13pt");
    expect(desktopSynced).toContain("Quy tắc dự án Office (KHTN 9): Tuân thủ chuẩn kiến thức KHTN 9.");
    expect(desktopSynced).toContain("Quy tắc riêng của tệp De_Kiem_Tra_GK1.docx: Đề gồm 12 câu trắc nghiệm và 2 câu tự luận.");
  });
});
