import { describe, expect, it } from "vitest";
import { LocalTools } from "../src/localtools.js";
import { isReadTool, findTool } from "@pvta/shared";

const lt = new LocalTools({} as never, "/nonexistent/style.md");

describe("công cụ office_calc qua bridge", () => {
  it("tính, làm tròn, nhận danh sách", async () => {
    const r = await lt.execute({ tool: "office_calc", args: { expr: "1500000*8%", round: 0 } });
    expect(r.ok).toBe(true);
    expect((r.result as { value: string }).value).toBe("120000");
    const b = await lt.execute({ tool: "office_calc", args: { exprs: ["0.1+0.2", "1/0", 5] } });
    const arr = b.result as Array<Record<string, string>>;
    expect(arr[0]!.value).toBe("0.3");
    expect(arr[1]!.error).toMatch(/Chia cho 0/);
    expect(arr[2]!.error).toBeTruthy();
  });
  it("biểu thức có mã độc bị từ chối, không chạy", async () => {
    const r = await lt.execute({ tool: "office_calc", args: { expr: "require('fs').readFileSync('/etc/passwd')" } });
    expect(r.ok).toBe(false);
  });
  it("đối chiếu số liệu", async () => {
    const r = await lt.execute({ tool: "office_calc_check", args: { items: [{ expr: "2+2", expected: 5, label: "Tổng" }] } });
    expect(r.ok).toBe(true);
    expect((r.result as { mismatches: number }).mismatches).toBe(1);
  });
  it("là công cụ đọc (không cần xác nhận) và có trong danh mục", () => {
    expect(isReadTool("office_calc")).toBe(true);
    expect(isReadTool("office_calc_check")).toBe(true);
    expect(findTool("office_calc")).toBeTruthy();
  });
});
