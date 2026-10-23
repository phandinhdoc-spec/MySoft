/** Chuyển một tin nhắn trong chat thành tên và nội dung Markdown để lưu vào dự án. Hàm thuần, không gọi RPC. */

const MAX_NAME = 120;

/** Kiểu dữ liệu kéo thả của một đoạn chat (JSON: {title,name,content}). */
export const MESSAGE_DRAG_TYPE = 'application/x-pvta-message';

export type MessageDraft = {title: string; name: string; content: string};

export function messageDraft(text: string, at: number): MessageDraft {
  return {title: messageTitle(text), name: messageFileName(text, at), content: messageMarkdown(text, at)};
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Tiêu đề lấy từ dòng có chữ đầu tiên, bỏ ký hiệu Markdown; tối đa 60 ký tự. */
export function messageTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s#>*+\-\d.)]+/, '').replace(/[*_`~\[\]]/g, '').trim())
    .find((l) => l.length > 0) ?? '';
  const cut = line.length > 60 ? `${line.slice(0, 60).trimEnd()}…` : line;
  return cut || 'Đoạn chat';
}

/** Tên tệp `.md` hợp lệ trên Windows và macOS, ví dụ "Đoạn chat 2026-10-22 14.05 - Tiêu đề.md". */
export function messageFileName(text: string, at: number): string {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  const raw = `Đoạn chat ${stamp} - ${messageTitle(text)}`;
  const safe = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, MAX_NAME - 3)
    .trim();
  return `${safe || 'Đoạn chat'}.md`;
}

/** Nội dung Markdown: tiêu đề rồi toàn bộ đoạn chat, giữ nguyên chữ người dùng/AI. */
export function messageMarkdown(text: string, at: number): string {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `# ${messageTitle(text)}\n\n> Lưu từ PVTA lúc ${stamp}\n\n${text.trim()}\n`;
}
