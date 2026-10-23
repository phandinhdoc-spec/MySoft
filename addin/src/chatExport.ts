/** Xuất hội thoại: Markdown để lưu, chia sẻ hoặc chèn vào tài liệu. */

export interface ExportMsg {
  role: "user" | "assistant";
  text: string;
}

export interface ExportLabels {
  title: string;
  you: string;
  ai: string;
}

const two = (n: number) => String(n).padStart(2, "0");

function stamp(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Chỉ giữ lượt có chữ: lượt trả lời rỗng (đang chạy, bị hủy) không đưa vào. */
export function chatToMarkdown(msgs: ExportMsg[], labels: ExportLabels, when: Date = new Date()): string {
  const turns = msgs.filter((m) => m.text.trim());
  if (turns.length === 0) return "";
  const out = [`# ${labels.title}`, `*${stamp(when)}*`, ""];
  for (const m of turns) {
    out.push(`**${m.role === "user" ? labels.you : labels.ai}:**`, "", m.text.trim(), "");
  }
  return out.join("\n").trimEnd() + "\n";
}

/** Tên tệp an toàn trên Windows và macOS: pvta-2026-10-16-0130.md */
export function chatFileName(when: Date = new Date()): string {
  return `pvta-${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}-${two(when.getHours())}${two(when.getMinutes())}.md`;
}

/** Tải tệp chữ về máy. Khung add-in có thể chặn tải xuống: trả false để nơi gọi gợi ý dùng "Sao chép". */
export function downloadText(name: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}
