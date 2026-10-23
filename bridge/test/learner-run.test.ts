import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";
import { Learner, LearnQueue, LearnState, sanitizeRecord } from "../src/learner.js";
import { ProbeStore } from "../src/probe.js";

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-cli.mjs");

function setup(mode: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-learn-"));
  const engine = new Engine({ probe: new ProbeStore(path.join(dir, "probe.json")), env: { ...process.env, PVTA_CLAUDE_BIN: FAKE, FAKE_MODE: mode } });
  const queue = new LearnQueue(path.join(dir, "q.json"));
  const skillsDir = path.join(dir, "skills");
  fs.mkdirSync(skillsDir);
  const learner = new Learner({ engine, queue, state: new LearnState(path.join(dir, "s.json")), skillsDir, cwd: dir });
  for (let i = 0; i < 3; i++) {
    queue.add(sanitizeRecord({ request: `lập bảng điểm lớp 8A số ${i}`, calls: [{ tool: "office_excel_set_range", args: { address: "A1", values: [[1]] } }], backend: "claude", model: "sonnet" }));
  }
  return { dir, queue, learner, skillsDir };
}

describe("học nền chạy thật qua engine", () => {
  it("ghi skill hợp lệ và dọn hàng đợi", async () => {
    const { queue, learner, skillsDir } = setup("ok");
    const out = await learner.maybeRun({ force: true });
    expect(out.written).toEqual(["learned-lap-bang-diem"]);
    expect(fs.readFileSync(path.join(skillsDir, "learned-lap-bang-diem", "SKILL.md"), "utf8")).toContain("load: demand");
    expect(queue.all()).toHaveLength(0);
  });
  it("từ chối skill độc hại do model sinh ra", async () => {
    const { learner, skillsDir } = setup("learn-bad");
    const out = await learner.maybeRun({ force: true });
    expect(out.written).toEqual([]);
    expect(out.rejected[0]?.name).toBe("learned-xau");
    expect(fs.readdirSync(skillsDir)).toEqual([]);
  });
  it("lỗi CLI không làm mất hàng đợi và không ném lỗi", async () => {
    const { queue, learner } = setup("auth");
    const out = await learner.maybeRun({ force: true });
    expect(out.error).toBeDefined();
    expect(queue.all()).toHaveLength(3);
  });
  it("không chạy khi chưa rảnh và chưa đủ điều kiện", async () => {
    const { learner } = setup("ok");
    learner.touch();
    expect((await learner.maybeRun()).ran).toBe(false);
  });
});
