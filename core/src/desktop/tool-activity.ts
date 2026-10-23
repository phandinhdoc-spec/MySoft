import { toolOfFile } from '../groups/catalog.js';
import type { Chat } from './types.js';

/** Số tệp theo công cụ: working = đang chờ/đang xử lí, unseen = PVTA đã tạo hoặc sửa xong mà thầy cô chưa mở xem. */
export type ToolActivity = Record<string, { working: number; unseen: number }>;

/** Chỉ tính kết quả gần đây: kết quả cũ hàng tháng không còn là «chưa xem» có ý nghĩa. */
export const UNSEEN_WINDOW_MS = 7 * 24 * 3600_000;

export function toolOf(a: { kind: string; path: string; savedPath?: string; savedPaths?: string[]; output?: string }): { tool?: string; file: string } {
  const file = a.savedPaths?.[a.savedPaths.length - 1] ?? a.savedPath ?? a.output ?? a.path ?? '';
  if (a.kind === 'create_typst') return { tool: 'typst', file };
  return { tool: toolOfFile(file) ?? toolOfFile(a.path ?? ''), file };
}

export function computeToolActivity(chats: Chat[], now = Date.now()): ToolActivity {
  const out: ToolActivity = {};
  const seenWorking = new Set<string>();
  const seenUnseen = new Set<string>();
  const bump = (tool: string, key: 'working' | 'unseen') => {
    out[tool] ??= { working: 0, unseen: 0 };
    out[tool]![key]++;
  };
  for (const c of chats) {
    for (const m of c.messages) {
      for (const a of m.actions ?? []) {
        if (a.kind === 'open_file' || a.kind === 'office_live') continue;
        const { tool, file } = toolOf(a);
        if (!tool || !file) continue;
        const key = `${tool}|${file}`;
        if (a.state === 'pending') {
          if (!seenWorking.has(key)) { seenWorking.add(key); bump(tool, 'working'); }
        } else if (a.state === 'done' && !a.viewed && now - m.at <= UNSEEN_WINDOW_MS) {
          if (!seenUnseen.has(key)) { seenUnseen.add(key); bump(tool, 'unseen'); }
        }
      }
      for (const s of m.plan?.steps ?? []) {
        if (s.status !== 'running') continue;
        for (const f of s.files ?? []) {
          const tool = toolOfFile(f);
          const key = `${tool}|${f}`;
          if (tool && !seenWorking.has(key)) { seenWorking.add(key); bump(tool, 'working'); }
        }
      }
    }
  }
  return out;
}

/** Đánh dấu đã xem mọi kết quả của một công cụ (hoặc một hành động). Trả về số hành động đã đổi. */
export function markToolSeen(chats: Chat[], tool?: string, actionId?: string): number {
  let n = 0;
  for (const c of chats) for (const m of c.messages) for (const a of m.actions ?? []) {
    if (a.state !== 'done' || a.viewed) continue;
    if (actionId ? a.id !== actionId : toolOf(a).tool !== tool) continue;
    a.viewed = true;
    n++;
  }
  return n;
}
