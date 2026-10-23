import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizePromptTemplate, BUILTIN_PROMPTS, MAX_OWN_PROMPTS, PROMPT_CATEGORIES, type LibraryPrompt, type OfficeHost } from "@pvta/shared";

interface FileData {
  prompts: LibraryPrompt[];
  favorites: string[];
}

const HOSTS: OfficeHost[] = ["word", "excel", "powerpoint"];

/**
 * Thư viện lời nhắc riêng của người dùng (lưu ở bridge nên dùng chung cho Word, Excel, PowerPoint
 * và không mất khi xóa dữ liệu trình duyệt). Mẫu dựng sẵn nằm trong mã, không lưu ở đây.
 */
export class PromptLibrary {
  private data: FileData;
  constructor(private file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<FileData>;
      this.data = { prompts: Array.isArray(raw.prompts) ? raw.prompts : [], favorites: Array.isArray(raw.favorites) ? raw.favorites : [] };
    } catch {
      this.data = { prompts: [], favorites: [] };
    }
  }

  state(): { own: LibraryPrompt[]; favorites: string[] } {
    return { own: this.data.prompts, favorites: this.data.favorites };
  }

  save(input: unknown): { ok: true; id: string } | { ok: false; error: string } {
    if (!input || typeof input !== "object") return { ok: false, error: "Lời nhắc không hợp lệ." };
    const p = input as Record<string, unknown>;
    const title = typeof p.title === "string" ? p.title.trim().slice(0, 80) : "";
    let text = typeof p.text === "string" ? p.text.trim() : "";
    if (!title) return { ok: false, error: "Hãy đặt tên cho lời nhắc." };
    if (!text) return { ok: false, error: "Nội dung lời nhắc đang trống." };
    if (text.length > 4000) return { ok: false, error: "Lời nhắc quá dài (tối đa 4.000 ký tự)." };
    const normalized = normalizePromptTemplate(text);
    const error = normalized.issues.find(i => i.level === "error");
    if (error) return {ok: false, error: error.message};
    text = normalized.text;
    const category = typeof p.category === "string" && PROMPT_CATEGORIES.some((c) => c.id === p.category) ? p.category : "cua-toi";
    const hosts = Array.isArray(p.hosts) ? (p.hosts.filter((h) => HOSTS.includes(h as OfficeHost)) as OfficeHost[]) : undefined;
    const id = typeof p.id === "string" && /^u-[a-z0-9]{8,32}$/.test(p.id) ? p.id : `u-${crypto.randomBytes(6).toString("hex")}`;
    const item: LibraryPrompt = { id, title, text, category, hosts: hosts?.length ? hosts : undefined, own: true, updatedAt: Date.now() };
    const i = this.data.prompts.findIndex((x) => x.id === id);
    if (i >= 0) this.data.prompts[i] = item;
    else {
      if (this.data.prompts.length >= MAX_OWN_PROMPTS) return { ok: false, error: `Đã đủ ${MAX_OWN_PROMPTS} lời nhắc riêng; hãy xóa bớt.` };
      this.data.prompts.unshift(item);
    }
    this.write();
    return { ok: true, id };
  }

  remove(id: string): void {
    const before = this.data.prompts.length;
    this.data.prompts = this.data.prompts.filter((p) => p.id !== id);
    this.data.favorites = this.data.favorites.filter((f) => f !== id);
    if (this.data.prompts.length !== before) this.write();
  }

  favorite(id: string, on: boolean): void {
    const known = this.data.prompts.some((p) => p.id === id) || BUILTIN_PROMPTS.some((p) => p.id === id);
    if (!known) return;
    const has = this.data.favorites.includes(id);
    if (on && !has) this.data.favorites.unshift(id);
    else if (!on && has) this.data.favorites = this.data.favorites.filter((f) => f !== id);
    else return;
    this.write();
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
