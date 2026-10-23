import type { AlertGate } from "./alerts.js";
import { localDay } from "./alerts.js";
import type { GroupStore } from "./store.js";

/**
 * Bản tin khởi động (đặc tả mục 2): chỉ tổng hợp lại dữ liệu đã có ở kho, không gọi mạng khi mở ứng dụng.
 * Mục nào không có thì ẩn (không hiện «0 văn bản»). Không có mục nào thì không hiện gì.
 */

export type BriefTarget = "documents" | "proposals" | "backends" | "update" | "basis" | "groups";

export interface BriefItem {
  id: string;
  text: string;
  action: string;
  target: BriefTarget;
  /** Nhóm để mở đúng bảng văn bản (nếu có). */
  group?: string;
}

export interface Briefing {
  /** Có nên hiện bản tin lúc này: có nội dung, bật, chưa hiện/đóng hôm nay. */
  show: boolean;
  greeting: string;
  items: BriefItem[];
}

export interface BriefInput {
  store: GroupStore;
  alerts?: AlertGate;
  /** Tên để chào, ví dụ "thầy Phan". */
  name?: string;
  /** Số đề xuất skill tự học đang chờ duyệt. */
  proposals?: number;
  /** Công cụ AI đã cài nhưng cần đăng nhập lại. */
  needLogin?: string[];
  now?: number;
}

export function buildBriefing(i: BriefInput): Briefing {
  const now = i.now ?? Date.now();
  const today = localDay(now);
  const items: BriefItem[] = [];

  const byGroup: Array<{ id: string; name: string; n: number }> = [];
  for (const { id, lib } of i.store.enabledLibraries()) {
    const n = lib.book.list().filter((d) => d.isNew).length;
    if (n > 0) byGroup.push({ id, name: i.store.manifest(id).name, n });
  }
  const totalNew = byGroup.reduce((s, g) => s + g.n, 0);
  if (totalNew > 0) {
    const names = byGroup.map((g) => g.name);
    items.push({ id: "docs", text: `${totalNew} văn bản mới cho nhóm ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`, action: "Xem", target: "documents", group: byGroup[0]!.id });
  }
  const basis = i.alerts?.pendingCount(now) ?? 0;
  if (basis > 0) items.push({ id: "basis", text: `${basis} văn bản đang soạn có căn cứ đã thay đổi`, action: "Xem", target: "basis" });
  if ((i.proposals ?? 0) > 0) items.push({ id: "proposals", text: `${i.proposals} đề xuất skill chờ duyệt`, action: "Duyệt", target: "proposals" });
  for (const b of i.needLogin ?? []) items.push({ id: `login-${b}`, text: `${b} cần đăng nhập lại`, action: "Đăng nhập", target: "backends" });

  const st = i.store.state().briefing;
  const enabled = st?.enabled !== false;
  const show = enabled && items.length > 0 && st?.shownDay !== today && st?.dismissedDay !== today;
  return { show, greeting: `Chào ${i.name ?? "thầy cô"}. Hôm nay có:`, items };
}

/** Ghi nhận đã hiện hôm nay: những lần mở ứng dụng sau trong ngày không hiện lại. */
export function markBriefingShown(store: GroupStore, now = Date.now()): void {
  store.patchState({ briefing: { ...store.state().briefing, shownDay: localDay(now) } });
}

/** «Không hiện lại hôm nay». */
export function dismissBriefing(store: GroupStore, now = Date.now()): void {
  store.patchState({ briefing: { ...store.state().briefing, dismissedDay: localDay(now), shownDay: localDay(now) } });
}

export function setBriefingEnabled(store: GroupStore, on: boolean): void {
  store.patchState({ briefing: { ...store.state().briefing, enabled: on } });
}
