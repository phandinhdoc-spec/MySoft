#!/usr/bin/env node
// codex giả: mô phỏng `codex exec --json ... [resume <id>] -` (prompt đọc từ stdin).
import fs from "node:fs";

const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE || "ok";
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\n");
if (args.includes("--version")) {
  console.log("codex-cli 0.99.0");
  process.exit(0);
}
if (args.includes("--help")) {
  console.log(args[0] === "exec" ? "  --json\n  --sandbox <MODE>\n  --skip-git-repo-check\n  --color <WHEN>\n  -m, --model <MODEL>" : "  -c, --config <key=value>\n  exec");
  process.exit(0);
}
let stdin = "";
process.stdin.setEncoding("utf8");
for await (const c of process.stdin) stdin += c;

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
if (mode === "auth") {
  out({ type: "error", message: "Not logged in. Run codex login." });
  process.exit(1);
}
const ri = args.indexOf("resume");
const tid = ri >= 0 ? args[ri + 1] : "thread-1";
out({ type: "thread.started", thread_id: tid });
out({ type: "turn.started" });
out({ type: "item.completed", item: { id: "item_0", type: "reasoning", text: "suy nghĩ ẩn" } });
out({ type: "item.started", item: { id: "item_1", type: "command_execution", command: "ls", status: "in_progress" } });
const reply = stdin.includes("Kết quả công cụ")
  ? "Đã xong."
  : stdin.includes("SỬA_VĂN_BẢN")
    ? 'Mình chèn tiêu đề nhé.\n```office-tool\n{"tool":"office_word_insert_text","args":{"text":"Bài 23. Quang hợp ở thực vật","where":"start"}}\n```'
    : `Chào (${stdin.length})`;
out({ type: "item.updated", item: { id: "item_2", type: "agent_message", text: reply.slice(0, 3) } });
out({ type: "item.completed", item: { id: "item_2", type: "agent_message", text: reply } });
out({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
