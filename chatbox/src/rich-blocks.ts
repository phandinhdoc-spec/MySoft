import {rpc} from './ipc';

export type RichKind = 'mermaid' | 'html' | 'audio' | 'video';

const AUDIO = /\.(mp3|wav|m4a|ogg|oga|aac|flac)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;
const MAX_HTML = 200_000;
const MAX_MERMAID = 20_000;

export const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function mediaKind(href: string): 'audio' | 'video' | undefined {
  const clean = href.split(/[?#]/)[0] ?? '';
  if (/^data:audio\//i.test(href) || AUDIO.test(clean)) return 'audio';
  if (/^data:video\//i.test(href) || VIDEO.test(clean)) return 'video';
  return undefined;
}

/** Đường dẫn tệp cục bộ (file://, tuyệt đối). URL mạng và data: trả về undefined. */
export function localMediaPath(src: string): string | undefined {
  try {
    if (/^file:\/\//i.test(src)) {
      const url = new URL(src);
      if (url.hostname && url.hostname !== 'localhost') return undefined;
      return decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i, '$1');
    }
    if ((src.startsWith('/') && !src.startsWith('//')) || /^[a-z]:[\\/]/i.test(src)) return decodeURIComponent(src);
  } catch { /* đường dẫn lỗi: báo ở bước hiển thị */ }
  return undefined;
}

/** Thẻ giữ chỗ do bộ lọc HTML cho qua; nội dung thật được dựng sau khi lọc. */
export function richPlaceholder(kind: RichKind, payload: string, label = ''): string {
  return `<div class="pvta-rich" data-pvta-rich="${kind}" data-pvta-payload="${encodeURIComponent(payload)}" data-pvta-label="${escapeAttr(label)}"></div>`;
}

const notice = (host: HTMLElement, message: string) => {
  host.replaceChildren();
  const el = document.createElement('span');
  el.className = 'markdown-image-error';
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.append(el);
};

let mermaidSeq = 0;
async function renderMermaid(host: HTMLElement, code: string, alive: () => boolean) {
  if (code.length > MAX_MERMAID) return notice(host, 'Sơ đồ quá lớn để hiển thị.');
  try {
    const {default: mermaid} = await import('mermaid');
    mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'default'});
    const {svg} = await mermaid.render(`pvta-mermaid-${++mermaidSeq}`, code);
    if (!alive()) return;
    host.replaceChildren();
    const box = document.createElement('div');
    box.className = 'pvta-rich-diagram';
    box.innerHTML = svg; // SVG do mermaid tạo ở securityLevel strict
    const bar = document.createElement('div');
    bar.className = 'pvta-rich-bar';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Lưu SVG';
    save.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
      const a = document.createElement('a');
      a.href = url; a.download = 'so-do.svg'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const src = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Xem mã sơ đồ';
    const pre = document.createElement('pre');
    pre.textContent = code;
    src.append(sum, pre);
    bar.append(save, src);
    host.append(box, bar);
  } catch (error) {
    if (!alive()) return;
    notice(host, `Không thể vẽ sơ đồ: ${error instanceof Error ? error.message : String(error)}`);
    const pre = document.createElement('pre');
    pre.textContent = code;
    host.append(pre);
  }
}

function renderHtml(host: HTMLElement, code: string) {
  if (code.length > MAX_HTML) return notice(host, 'Khối HTML quá lớn để xem trước.');
  const frame = document.createElement('iframe');
  frame.className = 'pvta-rich-frame';
  frame.setAttribute('sandbox', ''); // không script, không form, không điều hướng, origin cách ly
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', 'Xem trước HTML');
  frame.setAttribute('srcdoc', code);
  const details = document.createElement('details');
  const sum = document.createElement('summary');
  sum.textContent = 'Xem mã HTML';
  const pre = document.createElement('pre');
  pre.textContent = code;
  details.append(sum, pre);
  host.replaceChildren(frame, details);
}

async function renderMedia(host: HTMLElement, kind: 'audio' | 'video', src: string, label: string, alive: () => boolean) {
  let url: string | undefined;
  const path = localMediaPath(src);
  if (/^data:(audio|video)\//i.test(src)) url = src;
  else if (path) {
    try {
      const res = await rpc<{data?: string}>('fileMediaPreview', {path});
      if (!alive()) return;
      url = res?.data;
      if (!url) return notice(host, `Không đọc được ${kind === 'audio' ? 'âm thanh' : 'video'} “${label || path}”.`);
    } catch (error) {
      if (alive()) notice(host, `Không đọc được ${kind === 'audio' ? 'âm thanh' : 'video'} “${label || path}”: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  } else return notice(host, `Chỉ phát được tệp trên máy này. Địa chỉ mạng không được tải trong khung chat: ${src}`);
  const media = document.createElement(kind);
  media.controls = true;
  media.preload = 'metadata';
  media.src = url;
  media.setAttribute('aria-label', label || (kind === 'audio' ? 'Âm thanh' : 'Video'));
  media.addEventListener('error', () => alive() && notice(host, 'Định dạng không được hỗ trợ hoặc tệp bị hỏng.'));
  host.replaceChildren(media);
}

/** Dựng nội dung cho mọi thẻ giữ chỗ trong container. Trả về hàm dọn. */
export function hydrateRichBlocks(root: HTMLElement): () => void {
  let alive = true;
  const isAlive = () => alive;
  root.querySelectorAll<HTMLElement>('[data-pvta-rich]').forEach(host => {
    const kind = host.dataset.pvtaRich as RichKind;
    let payload = '';
    try {payload = decodeURIComponent(host.dataset.pvtaPayload ?? '');} catch { /* giữ rỗng */ }
    const label = host.dataset.pvtaLabel ?? '';
    if (kind === 'mermaid') void renderMermaid(host, payload, isAlive);
    else if (kind === 'html') renderHtml(host, payload);
    else if (kind === 'audio' || kind === 'video') void renderMedia(host, kind, payload, label, isAlive);
  });
  return () => {alive = false;};
}
