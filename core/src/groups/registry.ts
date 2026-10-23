import type { GroupLibrary } from "./library.js";
import { noKey } from "./legal.js";
import type { DocRecord, DocStatus } from "./types.js";

/**
 * Tra cứu tình trạng hiệu lực xuyên các nhóm. Quan hệ thay thế/sửa đổi nằm trong chữ của văn bản mới
 * (đã tải về), nên văn bản cũ ở nhóm khác cũng được đánh dấu đúng.
 */

export interface Effective {
  status: DocStatus;
  replacedBy?: DocRecord;
  amendedBy: DocRecord[];
}

export interface Found {
  rec: DocRecord;
  group: string;
  effective: Effective;
}

export class Registry {
  constructor(private libs: () => Array<{ id: string; lib: GroupLibrary }>) {}

  private all(): Array<{ group: string; rec: DocRecord; lib: GroupLibrary }> {
    return this.libs().flatMap(({ id, lib }) => lib.book.list({ includeHidden: true }).map((rec) => ({ group: id, rec, lib })));
  }

  /** Bảng: số hiệu bị thay thế/sửa đổi -> các văn bản (đã đọc) nói điều đó. */
  private relations() {
    const replaced = new Map<string, DocRecord[]>();
    const amended = new Map<string, DocRecord[]>();
    for (const { rec } of this.all()) {
      for (const n of rec.replaces ?? []) replaced.set(noKey(n), [...(replaced.get(noKey(n)) ?? []), rec]);
      for (const n of rec.amends ?? []) amended.set(noKey(n), [...(amended.get(noKey(n)) ?? []), rec]);
    }
    return { replaced, amended };
  }

  effective(rec: DocRecord, rel = this.relations()): Effective {
    const key = rec.no ? noKey(rec.no) : "";
    const reps = key ? (rel.replaced.get(key) ?? []).filter((r) => !r.no || noKey(r.no) !== key) : [];
    const ams = key ? (rel.amended.get(key) ?? []).filter((r) => !r.no || noKey(r.no) !== key) : [];
    const replacedBy = reps.sort((a, b) => (b.effectiveAt ?? b.issuedAt ?? "").localeCompare(a.effectiveAt ?? a.issuedAt ?? ""))[0];
    let status = rec.status;
    if (rec.statusSource !== "tay") {
      if (replacedBy) status = "het-hieu-luc";
      else if (ams.length && (status === "chua-xac-dinh" || status === "con-hieu-luc")) status = "da-sua-doi";
      else if (rec.statusSource === "van-ban") status = "chua-xac-dinh";
    }
    return { status, replacedBy, amendedBy: ams };
  }

  /** Tra theo số hiệu. groups: chỉ tìm trong các nhóm này (quan hệ thay thế vẫn xét trên mọi nhóm). */
  lookup(no: string, o: { groups?: string[] } = {}): Found | undefined {
    const key = noKey(no);
    const rel = this.relations();
    const hit = this.all().find((x) => x.rec.no && noKey(x.rec.no) === key && (!o.groups || o.groups.includes(x.group)));
    return hit ? { rec: hit.rec, group: hit.group, effective: this.effective(hit.rec, rel) } : undefined;
  }

  /** Đẩy tình trạng suy ra vào danh sách và chỉ mục để RAG bỏ đúng văn bản hết hiệu lực. */
  refresh(): number {
    const rel = this.relations();
    let changed = 0;
    for (const { rec, lib } of this.all()) {
      if (rec.statusSource === "tay") continue; // người dùng đã tự đặt: không ghi đè
      const eff = this.effective(rec, rel);
      const replacedBy = eff.replacedBy?.no;
      const amendedBy = eff.amendedBy.map((a) => a.no).filter((n): n is string => !!n);
      const statusChanged = eff.status !== rec.status;
      const relChanged = replacedBy !== rec.replacedBy || JSON.stringify(amendedBy) !== JSON.stringify(rec.amendedBy ?? []);
      if (!statusChanged && !relChanged) continue;
      lib.book.update(rec.id, { replacedBy, amendedBy: amendedBy.length ? amendedBy : undefined });
      if (statusChanged) lib.setStatus(rec.id, eff.status, "van-ban");
      changed++;
    }
    return changed;
  }
}
