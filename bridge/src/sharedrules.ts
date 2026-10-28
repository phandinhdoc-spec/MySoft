import fs from "node:fs";
import path from "node:path";
import type { SharedRule } from "@pvta/shared";
import { invokedRules } from "@pvta/core/desktop/rules";
import type { Rule } from "@pvta/core/desktop/types";

/**
 * Đọc (chỉ đọc) quy tắc của PVTA Chat để add-in áp dụng cùng. Chat giữ dữ liệu trong bộ nhớ và tự ghi `chatbox/state.json`,
 * nên add-in KHÔNG ghi vào đó (sẽ bị Chat ghi đè); sửa quy tắc ở Chat, add-in thấy ngay lần sau.
 * Tệp có thể lớn (cả lịch sử Chat): chỉ nạp lại khi thời điểm sửa hoặc kích thước đổi.
 */
export interface ChatRules {
  text: string;
  rules: SharedRule[];
}
const cache = new Map<string, { key: string; value: ChatRules }>();

export function readChatRules(home: string): ChatRules {
  const file = path.join(home, "chatbox", "state.json");
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { text: "", rules: [] };
  }
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.value;
  let value: ChatRules = { text: "", rules: [] };
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8")) as {
      preferences?: { rules?: unknown };
      ruleBook?: unknown;
      projects?: Array<{ name?: unknown; ruleBook?: unknown }>;
      chats?: Array<{ title?: unknown; ruleBook?: unknown }>;
    };
    const text = typeof d.preferences?.rules === "string" ? d.preferences.rules.slice(0, 10_000) : "";
    const seen = new Set<string>();
    const rules: SharedRule[] = [];
    const pushRules = (list: unknown, scopePrefix?: string) => {
      if (!Array.isArray(list)) return;
      for (const r of list) {
        if (!r || typeof r !== "object" || typeof (r as Rule).key !== "string" || typeof (r as Rule).text !== "string") continue;
        const rule = r as Rule;
        if (seen.has(rule.key) || rules.length >= 100) continue;
        seen.add(rule.key);
        const baseTitle = String(rule.title ?? rule.key).slice(0, 80);
        rules.push({
          key: rule.key,
          title: scopePrefix ? `${baseTitle} (${scopePrefix.slice(0, 30)})` : baseTitle,
          text: rule.text.slice(0, 20000),
          always: scopePrefix ? false : rule.always === true,
        });
      }
    };
    pushRules(d.ruleBook);
    if (Array.isArray(d.projects)) {
      for (const p of d.projects) pushRules(p?.ruleBook, typeof p?.name === "string" ? p.name : undefined);
    }
    if (Array.isArray(d.chats)) {
      for (const c of d.chats) pushRules(c?.ruleBook, typeof c?.title === "string" ? c.title : undefined);
    }
    value = { text, rules };
  } catch {
    /* đang ghi dở hoặc hỏng: dùng bản trống, lần sau đọc lại */
    return { text: "", rules: [] };
  }
  cache.set(file, { key, value });
  return value;
}

/** Quy tắc luôn áp dụng (đưa vào lời nhắc hệ thống của add-in). */
export function alwaysRulesText(r: ChatRules): string {
  const lines = [r.text.trim(), ...r.rules.filter((x) => x.always).map((x) => `- [#${x.key}] ${x.title}: ${x.text}`)].filter(Boolean);
  return lines.join("\n");
}

/** Quy tắc người dùng gọi bằng #khóa trong tin nhắn (không phải loại luôn áp dụng). */
export function invokedRulesText(r: ChatRules, message: string): string {
  const list = r.rules.map((x) => ({ id: x.key, key: x.key, title: x.title, text: x.text, always: x.always, at: 0 })) as Rule[];
  const hit = invokedRules(list, message).filter((x) => !x.always);
  return hit.length ? `QUY TẮC THẦY CÔ GỌI TRONG YÊU CẦU (từ PVTA Chat):\n${hit.map((x) => `- [#${x.key}] ${x.title}: ${x.text}`).join("\n")}` : "";
}
