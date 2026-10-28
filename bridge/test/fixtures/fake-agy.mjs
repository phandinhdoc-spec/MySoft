#!/usr/bin/env node
// agy giả: chế độ denied trả result có denied_actions và response rỗng.
import fs from "node:fs";
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\n");
if (args.includes("--yolo")) {
  process.stderr.write("flags provided but not defined: -yolo\n");
  process.exit(2);
}
const mode = process.env.FAKE_MODE || "ok";
if (!args.includes('--input-format') || args[args.indexOf('--input-format') + 1] !== 'stream-json' || args.includes('-p')) {
  process.stderr.write('Expected stream-json stdin without -p\n');
  process.exit(2);
}
let input = '';
for await (const chunk of process.stdin) input += chunk;
const message = JSON.parse(input);
if (message.event !== 'user' || typeof message.message?.content !== 'string') throw Error('Invalid user event');
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
out({ type: "init" });
if (mode === "echo-prompt") {
  out({ type: "result", status: "COMPLETED", conversation_id: "conv-9", response: message.message.content });
} else if (mode === "cwd") {
  out({ type: "result", status: "COMPLETED", conversation_id: "conv-9", response: process.cwd() });
} else if (mode === "denied") {
  out({ type: "result", status: "COMPLETED", conversation_id: "conv-9", response: "", denied_actions: [{ action: "write", path: "/x" }] });
} else if (mode === "real") {
  // Định dạng thật của agy 1.3.x (đã lấy từ máy người dùng).
  const su = (o) => out({ event: "step_update", step_update: { conversation_id: "conv-r", ...o } });
  process.stdout.write(""); // init ở trên là dạng cũ; gửi thêm init thật:
  out({ event: "init", conversation_id: "conv-r", init: { model: "m", tools: [] } });
  su({ step_index: 0, state: "DONE", step_type: "user_input" });
  su({ step_index: 1, state: "ACTIVE", step_type: "tool_call", text_delta: "BỎ" });
  su({ step_index: 2, state: "ACTIVE", step_type: "agent_response", text_delta: "Xin chào " });
  su({ step_index: 2, state: "ACTIVE", step_type: "agent_response", text_delta: "thầy cô" });
  out({ event: "result", result: { conversation_id: "conv-r", status: "COMPLETED", response: "Xin chào thầy cô" } });
} else if (mode === "empty") {
  // Định dạng lạ / không có chữ: trước đây engine trả chuỗi rỗng, giao diện im lặng.
  out({ type: "something_else", payload: { note: "khong co text" } });
  out({ type: "result", status: "COMPLETED", conversation_id: "conv-9", response: "" });
} else {
  out({ type: "step_update", step_type: "tool_call", agent_response: { text_delta: "BỎ" } });
  out({ type: "step_update", step_type: "agent_response", conversation_id: "conv-9", agent_response: { text_delta: "Chào " } });
  out({ type: "step_update", step_type: "agent_response", agent_response: { text_delta: "bạn" } });
  out({ type: "result", status: "COMPLETED", conversation_id: "conv-9", response: "Chào bạn" });
}
