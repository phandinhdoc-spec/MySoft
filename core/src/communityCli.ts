/**
 * Công cụ cho người phụ trách PVTA: lấy các issue "[phan-hoi]" trên GitHub, kiểm tra, rồi (khi duyệt) ghi vào skills/cd-*
 * để bản cập nhật sau mang kiến thức chung đến mọi máy.
 *
 *   npm run collect-feedback -w bridge                 # chỉ liệt kê (không ghi gì)
 *   npm run collect-feedback -w bridge -- --accept     # ghi skills/cd-* và feedback/accepted.json
 *   npm run collect-feedback -w bridge -- --file issues.json   # đọc issue từ tệp (mảng {number,title,body}) thay vì gọi gh
 *
 * Luôn đọc phần liệt kê trước khi --accept: nội dung do người ngoài gửi, sẽ vào lời nhắc của mọi máy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planMerge, renderCommunitySkill, runCommand, TITLE_TAG, type IssueLike } from "./community.js";
import { REPO } from "./updater.js";

interface Accepted {
  issues: number[];
  skills: Record<string, { issues: number[]; date: string }>;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadIssues(): Promise<IssueLike[]> {
  const file = arg("--file");
  if (file) return JSON.parse(fs.readFileSync(file, "utf8")) as IssueLike[];
  const r = await runCommand(
    "gh",
    ["issue", "list", "--repo", REPO, "--state", "open", "--search", `${TITLE_TAG} in:title`, "--limit", "200", "--json", "number,title,body"],
    { timeoutMs: 120_000 },
  );
  if (r.code !== 0) throw new Error(`gh issue list lỗi: ${r.stderr.trim() || "chưa cài hoặc chưa đăng nhập gh"}`);
  return (JSON.parse(r.stdout) as IssueLike[]).filter((i) => (i.title ?? "").startsWith(TITLE_TAG));
}

async function main(): Promise<void> {
  const root = path.resolve(arg("--root") ?? fileURLToPath(new URL("../..", import.meta.url)));
  const skillsDir = path.join(root, "skills");
  const acceptedFile = path.join(root, "feedback", "accepted.json");
  let accepted: Accepted = { issues: [], skills: {} };
  try {
    accepted = JSON.parse(fs.readFileSync(acceptedFile, "utf8")) as Accepted;
  } catch {
    /* chưa có */
  }
  const done = new Set(accepted.issues);
  const issues = (await loadIssues()).filter((i) => !done.has(i.number));
  const existing = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];
  const plan = planMerge(issues, existing);

  console.log(`Issue mới: ${issues.length} | mục đạt kiểm tra: ${plan.candidates.length} | bị loại: ${plan.rejected.length} | không phải gói phản hồi: ${plan.ignored.length}\n`);
  for (const c of plan.candidates) {
    console.log(`── ${c.name}  (issue ${c.issues.map((n) => `#${n}`).join(", ")})\n   ${c.description}\n${c.body.split("\n").map((l) => `   | ${l}`).join("\n")}\n`);
  }
  for (const r of plan.rejected) console.log(`✗ #${r.issue} ${r.name}: ${r.reason}`);

  if (!process.argv.includes("--accept")) {
    console.log("\nChưa ghi gì. Đọc kỹ rồi chạy lại với --accept để ghi vào skills/.");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const c of plan.candidates) {
    fs.mkdirSync(path.join(skillsDir, c.name), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, c.name, "SKILL.md"), renderCommunitySkill(c));
    accepted.skills[c.name] = { issues: c.issues, date: today };
  }
  accepted.issues = [...new Set([...accepted.issues, ...issues.map((i) => i.number)])].sort((a, b) => a - b);
  fs.mkdirSync(path.dirname(acceptedFile), { recursive: true });
  fs.writeFileSync(acceptedFile, JSON.stringify(accepted, null, 2) + "\n");
  console.log(`\nĐã ghi ${plan.candidates.length} mục vào skills/ và cập nhật feedback/accepted.json. Hãy chạy kiểm thử, tăng phiên bản rồi đóng gói (scripts/package.sh).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
