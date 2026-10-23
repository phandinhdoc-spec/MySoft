import { describe, expect, it, vi } from "vitest";
import { parseComposerCommand } from "@pvta/shared";
import { runComposerCommand, type CommandEnv, type CommandRule, type CommandSkill } from "../src/composer-commands";

const rules: CommandRule[] = [
  { id: "r1", key: "giong-gan-gui", title: "Giọng gần gũi", text: "Xưng thầy cô", always: true, scope: "profile" },
  { id: "r2", key: "trinh-bay-de", title: "Trình bày đề", text: "Đánh số câu", always: false, scope: "project" },
];
const skills: CommandSkill[] = [
  { name: "soan-de", description: "Soạn đề kiểm tra", load: "demand" },
  { name: "tom-tat", description: "Tóm tắt tài liệu", load: "off" },
];

function fakeEnv(over: Partial<CommandEnv> = {}) {
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const notices: string[] = [];
  const opened: string[] = [];
  const env: CommandEnv = {
    rules,
    skills,
    scopeFor: (kind) => (kind === "profile" ? { kind: "profile" } : { kind: "project", id: "p1" }),
    rpc: async (method, params) => {
      calls.push({ method, params });
      return { ok: true };
    },
    notice: (m) => notices.push(m),
    confirm: () => true,
    openSkill: (n) => opened.push(n),
    ...over,
  };
  return { env, calls, notices, opened };
}

const parse = (s: string) => {
  const r = parseComposerCommand(s);
  if (!r || !("command" in r)) throw new Error("không phải lệnh: " + s);
  return r.command;
};

describe("quy tắc bằng lệnh #", () => {
  it("#thêm lưu quy tắc cá nhân và báo kết quả", async () => {
    const { env, calls, notices } = fakeEnv();
    await runComposerCommand(parse("#thêm Giọng ấm áp: Câu ngắn"), env);
    expect(calls).toEqual([
      { method: "saveRule", params: { rule: { title: "Giọng ấm áp", text: "Câu ngắn", always: false }, scope: { kind: "profile" } } },
    ]);
    expect(notices[0]).toContain("Giọng ấm áp");
  });

  it("#sửa theo số giữ nguyên id, tiêu đề, phạm vi và trạng thái luôn áp dụng", async () => {
    const { env, calls } = fakeEnv();
    await runComposerCommand(parse("#sửa 2 Đánh số từng câu"), env);
    expect(calls[0]).toEqual({
      method: "saveRule",
      params: { rule: { id: "r2", title: "Trình bày đề", text: "Đánh số từng câu", always: false }, scope: { kind: "project", id: "p1" } },
    });
  });

  it("#xóa cần xác nhận; hủy thì không gọi RPC", async () => {
    const { env, calls, notices } = fakeEnv({ confirm: () => false });
    await runComposerCommand(parse("#xóa giong-gan-gui"), env);
    expect(calls).toHaveLength(0);
    expect(notices[0]).toContain("Chưa xóa");
  });

  it("#xóa đã xác nhận gọi deleteRule đúng id và phạm vi", async () => {
    const confirm = vi.fn(() => true);
    const { env, calls } = fakeEnv({ confirm });
    await runComposerCommand(parse("#xóa 1"), env);
    expect(confirm).toHaveBeenCalledOnce();
    expect(calls[0]).toEqual({ method: "deleteRule", params: { id: "r1", scope: { kind: "profile" } } });
  });

  it("khớp nhiều quy tắc thì không tự chọn, không gọi RPC", async () => {
    const { env, calls, notices } = fakeEnv({
      rules: [
        { id: "a", key: "de-a", title: "Đề A", text: "x", always: false, scope: "profile" },
        { id: "b", key: "de-b", title: "Đề B", text: "y", always: false, scope: "profile" },
      ],
    });
    await runComposerCommand(parse("#sửa de nội dung"), env);
    expect(calls).toHaveLength(0);
    expect(notices[0]).toContain("khớp 2");
  });

  it("#liệt kê đánh số theo đúng thứ tự tra cứu", async () => {
    const { env, calls, notices } = fakeEnv();
    await runComposerCommand(parse("#liệt kê"), env);
    expect(calls).toHaveLength(0);
    expect(notices[0].split("\n")[0]).toContain("1. #giong-gan-gui");
    expect(notices[0].split("\n")[1]).toContain("2. #trinh-bay-de");
  });

  it("lỗi RPC được báo ra, không ném lỗi", async () => {
    const { env, notices } = fakeEnv({
      rpc: async () => {
        throw new Error("Nội dung quy tắc đang trống.");
      },
    });
    await expect(runComposerCommand(parse("#thêm Tên: nội dung"), env)).resolves.toBe(true);
    expect(notices[0]).toBe("Nội dung quy tắc đang trống.");
  });
});

describe("kỹ năng bằng lệnh /kỹ-năng", () => {
  it("thêm gọi createSkill với SKILL.md tối thiểu rồi mở kỹ năng để bổ sung", async () => {
    const { env, calls, opened, notices } = fakeEnv();
    await runComposerCommand(parse("/kỹ-năng thêm kiem-tra-nhanh Soạn đề 15 phút"), env);
    expect(calls[0]!.method).toBe("createSkill");
    expect(calls[0]!.params!.name).toBe("kiem-tra-nhanh");
    expect(String(calls[0]!.params!.text)).toContain("load: demand");
    expect(opened).toEqual(["kiem-tra-nhanh"]);
    expect(notices[0]).toContain("/kiem-tra-nhanh");
  });

  it("createSkill trả về lỗi (trùng tên) thì không mở kỹ năng", async () => {
    const { env, opened, notices } = fakeEnv({
      rpc: async () => ({ ok: false, error: "Tên kỹ năng đã tồn tại." }),
    });
    await runComposerCommand(parse("/kỹ-năng thêm soan-de Mô tả khác"), env);
    expect(opened).toHaveLength(0);
    expect(notices[0]).toBe("Tên kỹ năng đã tồn tại.");
  });

  it("sửa chỉ mở kỹ năng trong Kỹ năng, không ghi gì", async () => {
    const { env, calls, opened } = fakeEnv();
    await runComposerCommand(parse("/kỹ-năng sửa soan-de"), env);
    expect(calls).toHaveLength(0);
    expect(opened).toEqual(["soan-de"]);
  });

  it("xóa cần xác nhận rồi gọi deleteSkill", async () => {
    const { env, calls } = fakeEnv();
    await runComposerCommand(parse("/kỹ-năng xóa tom-tat"), env);
    expect(calls).toEqual([{ method: "deleteSkill", params: { name: "tom-tat" } }]);
  });

  it("liệt kê ghi rõ bật/tắt", async () => {
    const { env, notices } = fakeEnv();
    await runComposerCommand(parse("/kỹ-năng liệt kê"), env);
    expect(notices[0]).toContain("/soan-de · bật");
    expect(notices[0]).toContain("/tom-tat · tắt");
  });

  it("lỗi mạng hoặc quyền từ backend hiển thị dưới dạng thông báo", async () => {
    const { env, notices } = fakeEnv({
      rpc: async () => {
        throw new Error("Không được phép sửa kỹ năng này.");
      },
    });
    await runComposerCommand(parse("/kỹ-năng xóa soan-de"), env);
    expect(notices[0]).toBe("Không được phép sửa kỹ năng này.");
  });
});
