import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverModels } from "../src/modelscan.js";

function fakeBin(dir: string, name: string, body: string): string {
  const f = path.join(dir, name);
  fs.writeFileSync(f, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return f;
}

describe("dò model từ CLI trên máy", () => {
  it("agy models + codex debug models → danh sách thật; claude dùng danh sách dự phòng", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-scan-"));
    const agy = fakeBin(
      dir,
      "agy",
      `const a=process.argv.slice(2); if(a[0]==="models"){console.log("Fetching available models...");console.log("gemini-3.8-flash-high\\tGemini 3.8 Flash (High)");console.log("gemini-3.8-flash-low\\tGemini 3.8 Flash (Low)");console.log("claude-sonnet-4-6\\tClaude Sonnet 4.6 (Thinking)");}`,
    );
    const codex = fakeBin(
      dir,
      "codex",
      `const a=process.argv.slice(2); if(a[0]==="debug"&&a[1]==="models"){console.log(JSON.stringify({models:[{slug:"gpt-6.1-sol",display_name:"GPT-6.1-Sol",visibility:"list",priority:1,supported_reasoning_levels:[{effort:"low"},{effort:"high"}],service_tiers:[{id:"priority",name:"Fast"}]}]}));}`,
    );
    const c = await discoverModels({ agy, codex, claude: "claude" }, { agy: true, codex: true, claude: true }, { ...process.env, CODEX_HOME: path.join(dir, "none") });
    expect(c.agy?.live).toBe(true);
    expect(c.agy?.models.map((m) => m.id)).toEqual(["gemini-3.8-flash", "claude-sonnet-4-6"]);
    expect(c.codex?.live).toBe(true);
    expect(c.codex?.models.map((m) => m.id)).toEqual(["default", "gpt-6.1-sol"]);
    expect(c.codex?.models[1]?.fastTier).toBe("priority");
    expect(c.claude?.live).toBe(false);
    expect(c.claude?.models.map((m) => m.id)).toEqual(["haiku", "sonnet", "opus"]);
  });

  it("codex không có lệnh debug models: đọc bộ nhớ đệm của codex; hỏng hết thì dùng dự phòng", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-scan-"));
    const codex = fakeBin(dir, "codex", `process.exit(2)`);
    const home = path.join(dir, "codexhome");
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, "models_cache.json"), JSON.stringify({ models: [{ slug: "gpt-x", display_name: "GPT X", visibility: "list" }] }));
    const env = { ...process.env, CODEX_HOME: home };
    const c1 = await discoverModels({ codex }, { codex: true }, env);
    expect(c1.codex?.live).toBe(true);
    expect(c1.codex?.models.map((m) => m.id)).toEqual(["default", "gpt-x"]);
    fs.rmSync(path.join(home, "models_cache.json"));
    const c2 = await discoverModels({ codex }, { codex: true }, env);
    expect(c2.codex?.live).toBe(false);
    expect(c2.codex?.models.map((m) => m.id)).toEqual(["default"]);
  });

  it("CLI chưa cài thì không chạy, dùng dự phòng", async () => {
    const c = await discoverModels({ agy: "/khong/co/agy" }, { agy: false });
    expect(c.agy?.live).toBe(false);
  });
});
