import path from "node:path";
import type { BasisChange, BasisRelated } from "@pvta/shared";
import { AlertGate, checkBasis, fixPrompt, relatedNew, safeKeywords, type Finding } from "@pvta/core/groups/alerts";
import { GroupStore } from "@pvta/core/groups/store";

/**
 * Cảnh báo căn cứ cho add-in Office. Chạy hoàn toàn trên máy: không AI, không mạng.
 * Mỗi lần mở lại kho từ thư mục dữ liệu chung, nên thay đổi do ứng dụng desktop ghi vẫn được thấy.
 */

const lastChanged = new Map<string, Finding>();

const open = (home: string) =>
  new GroupStore(home, {
    extract: async () => {
      throw new Error("Không đọc tệp trong bước kiểm tra căn cứ.");
    },
  });

export interface BasisOut {
  changed: BasisChange[];
  related: BasisRelated[];
  fixPrompt?: string;
  disclaimer: string;
}

/** Trả undefined nếu chưa chọn nhóm, không có căn cứ đổi và không có văn bản liên quan (không làm phiền). */
export function checkBasisLocal(home: string, text: string, fileName: string, now = Date.now()): BasisOut | undefined {
  if (!text.trim()) return undefined;
  const store = open(home);
  try {
    if (!store.enabled()) return undefined;
    const gate = new AlertGate(path.join(home, "groups-alerts.json"));
    const raw = checkBasis(text, store.registry, { groups: store.enabled() });
    const report = gate.filter(raw, now);
    if (fileName) gate.setPending(fileName, report.changed.length, now);
    const related = relatedNew(store, safeKeywords(text, fileName), now);
    if (!report.changed.length && !related.length) return undefined;
    lastChanged.clear();
    for (const f of report.changed) lastChanged.set(f.no, f);
    return {
      changed: report.changed.map((f) => ({ no: f.no, text: sentence(f) })),
      related: related.map((r) => ({ title: r.title, no: r.no, url: r.url, isNew: r.isNew, statusLabel: r.statusLabel, why: r.why })),
      fixPrompt: report.changed.length ? fixPrompt(fileName || "văn bản", report) : undefined,
      disclaimer: report.disclaimer,
    };
  } finally {
    store.close();
  }
}

function sentence(f: Finding): string {
  const name = `${f.type ?? "Văn bản"} ${f.no}`;
  if (f.state === "het-hieu-luc") return f.replacedBy ? `${name} đã được thay bằng ${f.replacedBy.no ?? f.replacedBy.title}` : `${name} đã hết hiệu lực`;
  return `${name} đã được sửa đổi${f.amendedBy?.length ? ` bởi ${f.amendedBy.join(", ")}` : ""}`;
}

/** «Không nhắc nữa» cho một căn cứ vừa báo. */
export function muteBasisLocal(home: string, no: string): void {
  const f = lastChanged.get(no);
  if (!f) return;
  new AlertGate(path.join(home, "groups-alerts.json")).mute(f);
  lastChanged.delete(no);
}
