import { resolveTarget, skillMarkdownFor, type ComposerCommand, type TargetItem } from "@pvta/shared";
import { t as uiText } from "./i18n";

/** Quy tắc đã gộp theo phạm vi (cá nhân, dự án, hội thoại), theo đúng thứ tự menu # hiển thị. */
export interface CommandRule {
  id: string;
  key: string;
  title: string;
  text: string;
  always: boolean;
  scope: "profile" | "project" | "chat";
}
export interface CommandSkill {
  name: string;
  description: string;
  load: string;
}
export type CommandScope = { kind: "profile" } | { kind: "project"; id: string } | { kind: "chat"; id: string };

/** Mọi thứ lệnh cần từ giao diện; tách ra để kiểm thử với giả lập. */
export interface CommandEnv {
  rules: CommandRule[];
  skills: CommandSkill[];
  scopeFor(kind: CommandRule["scope"]): CommandScope;
  rpc(method: string, params?: Record<string, unknown>): Promise<unknown>;
  notice(message: string): void;
  confirm(message: string): boolean;
  openSkill(name: string): void;
}

const ruleLabel = (r: CommandRule) => (r.scope === "profile" ? uiText("cá nhân") : r.scope === "project" ? uiText("dự án") : uiText("hội thoại này"));

/** Danh sách quy tắc, đánh số đúng thứ tự mà #sửa, #xóa dùng để tra. */
export function ruleListText(rules: CommandRule[]): string {
  if (!rules.length) return uiText("Chưa có quy tắc nào. Dùng #thêm <nội dung> để tạo.");
  return rules
    .map((r, i) => `${i + 1}. #${r.key} · ${r.title} (${ruleLabel(r)}${r.always ? `, ${uiText("luôn áp dụng")}` : ""})`)
    .join("\n");
}

/** Danh sách kỹ năng, kèm trạng thái bật/tắt. */
export function skillListText(skills: CommandSkill[]): string {
  if (!skills.length) return uiText("Chưa có kỹ năng nào. Dùng /kỹ-năng thêm <tên> <mô tả> để tạo.");
  return skills.map((s, i) => `${i + 1}. /${s.name} · ${s.load === "off" ? uiText("tắt") : uiText("bật")} · ${s.description}`).join("\n");
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Thực thi một lệnh đã phân tích. Trả về true khi lệnh đã được xử lý (kể cả khi báo lỗi). */
export async function runComposerCommand(cmd: ComposerCommand, env: CommandEnv): Promise<boolean> {
  try {
    if (cmd.kind === "rule") {
      if (cmd.op === "list") {
        env.notice(ruleListText(env.rules));
        return true;
      }
      if (cmd.op === "add") {
        await env.rpc("saveRule", { rule: { title: cmd.title, text: cmd.text, always: false }, scope: env.scopeFor("profile") });
        env.notice(uiText("Đã thêm quy tắc “{0}” (cá nhân). Dùng #liệt kê để xem khóa gọi.", [cmd.title]));
        return true;
      }
      const items: TargetItem[] = env.rules.map((r) => ({ key: r.key, title: r.title }));
      const hit = resolveTarget(items, cmd.target);
      if (!hit.ok) {
        env.notice(hit.error);
        return true;
      }
      const rule = env.rules[hit.index]!;
      if (cmd.op === "edit") {
        await env.rpc("saveRule", {
          rule: { id: rule.id, title: rule.title, text: cmd.text, always: rule.always },
          scope: env.scopeFor(rule.scope),
        });
        env.notice(uiText("Đã sửa quy tắc “{0}”.", [rule.title]));
        return true;
      }
      if (!env.confirm(uiText("Xóa quy tắc “{0}”?", [rule.title]))) {
        env.notice(uiText("Chưa xóa quy tắc."));
        return true;
      }
      await env.rpc("deleteRule", { id: rule.id, scope: env.scopeFor(rule.scope) });
      env.notice(uiText("Đã xóa quy tắc “{0}”.", [rule.title]));
      return true;
    }

    if (cmd.op === "list") {
      env.notice(skillListText(env.skills));
      return true;
    }
    if (cmd.op === "add") {
      const result = (await env.rpc("createSkill", { name: cmd.name, text: skillMarkdownFor(cmd.name, cmd.description) })) as
        | { ok?: boolean; error?: string }
        | undefined;
      if (result && result.ok === false) {
        env.notice(result.error ?? uiText("Chưa tạo được kỹ năng."));
        return true;
      }
      env.notice(uiText("Đã tạo kỹ năng /{0}. Mở Kỹ năng để bổ sung các bước.", [cmd.name]));
      env.openSkill(cmd.name);
      return true;
    }
    const items: TargetItem[] = env.skills.map((s) => ({ key: s.name, title: s.description }));
    const hit = resolveTarget(items, cmd.target);
    if (!hit.ok) {
      env.notice(hit.error);
      return true;
    }
    const skill = env.skills[hit.index]!;
    if (cmd.op === "edit") {
      env.openSkill(skill.name);
      env.notice(uiText("Đã mở /{0} trong Kỹ năng. Chọn Sửa để chỉnh nội dung.", [skill.name]));
      return true;
    }
    if (!env.confirm(uiText("Xóa kỹ năng /{0}?", [skill.name]))) {
      env.notice(uiText("Chưa xóa kỹ năng."));
      return true;
    }
    await env.rpc("deleteSkill", { name: skill.name });
    env.notice(uiText("Đã xóa kỹ năng /{0}.", [skill.name]));
    return true;
  } catch (e) {
    env.notice(err(e));
    return true;
  }
}
