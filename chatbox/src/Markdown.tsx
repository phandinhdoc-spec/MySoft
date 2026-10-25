import React, {useMemo, useRef, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {rpc} from './ipc';
import {t as uiText} from './i18n';
import {useObjectMenu} from './ObjectMenu';
import './markdown-images.css';
import {hydrateRichBlocks, mediaKind, richPlaceholder} from './rich-blocks';
import {EmailResults} from './EmailResults';
import {parseEmailResults} from './email-results';

function localImagePath(src: string): string | undefined {
  try {
    if (/^file:\/\//i.test(src)) {
      const url = new URL(src);
      if (url.hostname && url.hostname !== 'localhost') return undefined;
      return decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i, '$1');
    }
    if ((src.startsWith('/') && !src.startsWith('//')) || /^[a-z]:[\\/]/i.test(src)) return decodeURIComponent(src);
  } catch { /* Invalid URL: leave it to the normal image error handler. */ }
  return undefined;
}
const escapeAttribute = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface MarkdownProps {
  text: string;
  onToggleTask?: (taskIndex: number) => void;
  className?: string;
  /** Hội thoại chứa văn bản; dùng để tìm tệp được nhắc theo tên trong thư mục làm việc. */
  chatId?: string;
}

const FILE_EXT = 'docx?|xlsx?|pptx?|docm|xlsm|pptm|dotx|xltx|potx|pdf|zip|md|txt|csv|typ|png|jpe?g|webp';
const FILE_REF = new RegExp(`^(?:file://)?(?:[A-Za-z]:[\\\\/]|/|\\./|~/)?[^\\s<>"|?*\\x00-\\x1f]*[^\\s<>"|?*\\x00-\\x1f/\\\\]\\.(?:${FILE_EXT})$`, 'i');
/** Tên tệp (hoặc đường dẫn) đứng riêng trong `code` hay trong liên kết cục bộ thì thành nút bấm mở tệp. */
export function fileRefOf(text: string): string | undefined {
  const t = text.trim();
  if (t.length < 3 || t.length > 500 || /^https?:/i.test(t) || t.startsWith('~')) return undefined;
  return FILE_REF.test(t) ? t : undefined;
}

// Hook to ensure only checkbox inputs are allowed for security
if (typeof window !== 'undefined' && DOMPurify.addHook) {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'input') {
      const type = (node as Element).getAttribute('type');
      if (type !== 'checkbox') {
        node.parentNode?.removeChild(node);
      }
    }
  });
}

const LINK_COLOR_CLASSES = ['link-color-0', 'link-color-1', 'link-color-2', 'link-color-3', 'link-color-4'];

// Sanitize after math rendering; raw HTML, event attributes and script URLs never execute.
export function Markdown(props: MarkdownProps) {
  const email = useMemo(() => parseEmailResults(props.text.trim()), [props.text]);
  const blocks = useMemo(() => {
    const tokens = marked.lexer(props.text);
    return tokens.map(token => ({raw: token.raw, email: token.type === 'code' && (!token.lang || token.lang.toLowerCase() === 'json') ? parseEmailResults(token.text) : undefined, text: token.type === 'code' ? token.text : ''}));
  }, [props.text]);
  if (email) return <EmailResults key={props.text} data={email} raw={props.text}/>;
  if (!blocks.some(block => block.email)) return <MarkdownContent {...props}/>;
  // Group ordinary Markdown so task numbering and lists are preserved within each segment.
  const parts: React.ReactNode[] = [];
  let pending = '';
  let taskOffset = 0;
  const flush = () => {
    if (!pending) return;
    const offset = taskOffset;
    taskOffset += (marked.parse(pending, {async: false}) as string).match(/type="checkbox"/g)?.length ?? 0;
    parts.push(<MarkdownContent {...props} key={parts.length} text={pending} onToggleTask={props.onToggleTask ? index => props.onToggleTask!(offset + index) : undefined}/>);
    pending = '';
  };
  for (const block of blocks) {
    if (!block.email) pending += block.raw;
    else {flush(); parts.push(<EmailResults key={`${parts.length}:${block.text}`} data={block.email} raw={block.text}/>);}
  }
  flush();
  return <>{parts}</>;
}

function MarkdownContent({text, onToggleTask, className, chatId}: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<{src: string; alt: string}>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {if (expanded) dialogRef.current?.showModal();}, [expanded]);

  const html = useMemo(() => {
    const math: string[] = [];
    const source = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<!\$)\$([^$\n]+)\$(?!\$)|\\\((.+?)\\\)/g, (_m, a, b, c, d) => {
      const idx = math.length;
      math.push(katex.renderToString(a ?? b ?? c ?? d, {displayMode: !!(a ?? b), throwOnError: false, strict: 'ignore'}));
      return `PVTAMATHPLACEHOLDER${idx}END`;
    });

    // Preserve local paths without allowing file: URLs through the HTML sanitizer.
    const renderer = new marked.Renderer();
    const defaultImage = renderer.image;
    renderer.image = function(token) {
      const path = localImagePath(token.href);
      return path ? `<img data-pvta-image-path="${escapeAttribute(path)}" alt="${escapeAttribute(token.text)}">` : defaultImage.call(this, token);
    };
    const defaultCode = renderer.code;
    renderer.code = function(token) {
      const lang = (token.lang ?? '').trim().split(/\s+/)[0]!.toLowerCase();
      if (lang === 'mermaid' || lang === 'html') return richPlaceholder(lang, token.text);
      if (lang === 'audio' || lang === 'video') return richPlaceholder(lang, token.text.trim().split('\n')[0] ?? '');
      return defaultCode.call(this, token);
    };
    const defaultLink = renderer.link;
    renderer.link = function(token) {
      const kind = mediaKind(token.href);
      return kind ? richPlaceholder(kind, token.href, token.text) : defaultLink.call(this, token);
    };
    const imageRenderer = renderer.image;
    renderer.image = function(token) {
      const kind = mediaKind(token.href);
      return kind ? richPlaceholder(kind, token.href, token.text) : imageRenderer.call(this, token);
    };
    let result = marked.parse(source, {async: false, gfm: true, breaks: true, renderer}) as string;

    // Transform GFM task list checkboxes into interactive checkboxes with data-task-index
    let taskCount = 0;
    result = result.replace(/<input\s+([^>]*?)type=["']checkbox["']([^>]*?)>/gi, (_match, before, after) => {
      const isChecked = /checked/i.test(before + after);
      const idx = taskCount++;
      return `<input type="checkbox" ${isChecked ? 'checked="" ' : ''}class="task-checkbox" data-task-index="${idx}" aria-label="Đánh dấu việc đã hoàn thành" />`;
    });

    result = result.replace(/PVTAMATHPLACEHOLDER(\d+)END/g, (_, n) => math[Number(n)] ?? '');

    return DOMPurify.sanitize(result, {
      USE_PROFILES: {html: true, mathMl: true, svg: true},
      FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
      ADD_TAGS: ['input', 'mark', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
      ADD_ATTR: ['data-pvta-rich', 'data-pvta-payload', 'data-pvta-label', 'type', 'checked', 'class', 'data-task-index', 'aria-label', 'colspan', 'rowspan']
    });
  }, [text]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // 1. Collapsible lists & enums: Add toggle buttons to li items with nested lists
    const lis = el.querySelectorAll('li');
    lis.forEach(li => {
      const childList = li.querySelector(':scope > ul, :scope > ol');
      if (childList && !li.querySelector(':scope > .list-toggle-btn')) {
        li.classList.add('has-child-list');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-toggle-btn';
        btn.textContent = '▾';
        btn.setAttribute('aria-label', 'Cuộn vào hoặc sổ ra');
        btn.setAttribute('aria-expanded', 'true');
        li.insertBefore(btn, li.firstChild);
      }
    });

    // 2. Link colors: blue, red, purple, amber, emerald when near each other (Requirement 3)
    const blocks = el.querySelectorAll('p, li, td, th, blockquote, div');
    blocks.forEach(block => {
      const links = Array.from(block.querySelectorAll<HTMLAnchorElement>('a')).filter(a => {
        let p = a.parentElement;
        while (p && p !== block) {
          if (['P', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(p.tagName)) return false;
          p = p.parentElement;
        }
        return true;
      });
      if (links.length > 1) {
        links.forEach((a, i) => {
          LINK_COLOR_CLASSES.forEach(cls => a.classList.remove(cls));
          a.classList.remove('link-default');
          a.classList.add(LINK_COLOR_CLASSES[i % LINK_COLOR_CLASSES.length]!);
        });
      } else if (links.length === 1) {
        LINK_COLOR_CLASSES.forEach(cls => links[0]!.classList.remove(cls));
        links[0]!.classList.add('link-default');
      }
    });

    // 3. Auto-badge for pedagogy tables (NB, TH, VD, VDC, Câu 1, Câu 2...)
    const cells = el.querySelectorAll('td, th');
    cells.forEach(cell => {
      const textVal = cell.textContent?.trim();
      if (textVal === 'NB' && !cell.querySelector('.badge-nb')) {
        cell.innerHTML = '<span class="pedagogy-badge badge-nb">NB</span>';
      } else if (textVal === 'TH' && !cell.querySelector('.badge-th')) {
        cell.innerHTML = '<span class="pedagogy-badge badge-th">TH</span>';
      } else if (textVal === 'VD' && !cell.querySelector('.badge-vd')) {
        cell.innerHTML = '<span class="pedagogy-badge badge-vd">VD</span>';
      } else if (textVal === 'VDC' && !cell.querySelector('.badge-vdc')) {
        cell.innerHTML = '<span class="pedagogy-badge badge-vdc">VDC</span>';
      }
    });

    // 3b. Tên tệp trong `code` hoặc liên kết cục bộ: bấm để mở tệp (không đổi màu/kiểu đã có).
    el.querySelectorAll<HTMLElement>('code, a[href]').forEach(node => {
      if (node.closest('pre') || node.dataset.pvtaFileRef) return;
      let ref: string | undefined;
      if (node.tagName === 'CODE') ref = fileRefOf(node.textContent ?? '');
      else {
        const href = node.getAttribute('href') ?? '';
        if (/^(?:https?|mailto|tel|#)/i.test(href)) return;
        try {ref = fileRefOf(decodeURIComponent(href));} catch {ref = undefined;}
      }
      if (!ref) return;
      node.dataset.pvtaFileRef = ref;
      node.classList.add('pvta-file-ref');
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      node.title = /\.(?:png|jpe?g|webp)$/i.test(ref) ? `Bấm để xem ảnh lớn: ${ref}` : `Bấm để mở: ${ref}`;
    });

    // 4. Resolve local file images for preview
    let alive = true;
    const cleanups: (() => void)[] = [];
    const imgs = el.querySelectorAll<HTMLImageElement>('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      const filePath = img.dataset.pvtaImagePath || (src ? localImagePath(src) : undefined);
      const failed = (reason: string) => {
        if (!alive) return;
        img.hidden = true;
        if (img.nextElementSibling?.classList.contains('markdown-image-error')) return;
        const error = document.createElement('span');
        error.className = 'markdown-image-error';
        error.setAttribute('role', 'status');
        error.textContent = `Không thể hiển thị ảnh${img.alt ? ` “${img.alt}”` : ''}: ${reason}`;
        img.after(error);
      };
      const onError = () => failed('Ảnh không có sẵn hoặc định dạng không được hỗ trợ.');
      img.addEventListener('error', onError);
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `Xem ảnh lớn: ${img.alt || 'Ảnh'}`);
      const open = () => {if (img.getAttribute('src') && !img.hidden) setExpanded({src: img.src, alt: img.alt});};
      const onKey = (event: KeyboardEvent) => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); open();}};
      const onClick = (event: MouseEvent) => {event.preventDefault(); event.stopPropagation(); open();};
      img.addEventListener('click', onClick);
      img.addEventListener('keydown', onKey);
      cleanups.push(() => {img.removeEventListener('error', onError); img.removeEventListener('click', onClick); img.removeEventListener('keydown', onKey);});
      if (filePath) {
        img.removeAttribute('src');
        void rpc<{data?: string}>('fileQuickPreview', {path: filePath})
          .then(res => {
            if (!alive) return;
            if (res?.data) img.src = res.data;
            else failed('Tệp không chứa ảnh để xem trước.');
          })
          .catch(error => failed(String(error)));
      } else if (!src) {
        failed('Thiếu địa chỉ ảnh hợp lệ.');
      }
    });
    const stopRich = hydrateRichBlocks(el);
    return () => {alive = false; stopRich(); cleanups.forEach(cleanup => cleanup());};
  }, [html]);

  const isImageRef = (ref?: string) => !!ref && /\.(?:png|jpe?g|webp)$/i.test(ref);
  const fileRefCall = (method: 'openFileRef' | 'revealFileRef', node: HTMLElement) => {
    const ref = node.dataset.pvtaFileRef;
    if (!ref) return Promise.resolve();
    node.classList.remove('pvta-file-ref-error');
    return rpc(method, {ref, chatId}).catch(error => {
      node.classList.add('pvta-file-ref-error');
      node.title = String((error as Error)?.message ?? error);
    });
  };
  /** Ảnh mở ngay trong khung xem ảnh lớn của chat; lỗi thì báo như lúc mở tệp thường. */
  const viewImageRef = (node: HTMLElement) => {
    const ref = node.dataset.pvtaFileRef;
    if (!ref) return Promise.resolve();
    node.classList.remove('pvta-file-ref-error');
    return rpc<{data?: string; name?: string}>('previewFileRef', {ref, chatId}).then(res => {
      if (!res?.data) throw new Error('Không đọc được ảnh.');
      setExpanded({src: res.data, alt: res.name || ref});
    }).catch(error => {
      node.classList.add('pvta-file-ref-error');
      node.title = String((error as Error)?.message ?? error);
    });
  };
  const openFileRef = (node: HTMLElement) => {void (isImageRef(node.dataset.pvtaFileRef) ? viewImageRef(node) : fileRefCall('openFileRef', node));};
  const fileMenu = useObjectMenu<HTMLElement>({
    contextKey: `md-file-ref:${chatId ?? ''}`,
    commands: node => isImageRef(node.dataset.pvtaFileRef) ? [
      {id: 'view', label: uiText('Xem ảnh lớn'), group: 'open', run: () => viewImageRef(node)},
      {id: 'open', label: uiText('Mở bằng ứng dụng ngoài'), group: 'open', run: () => fileRefCall('openFileRef', node)},
      {id: 'reveal', label: uiText('Mở thư mục chứa tệp'), group: 'open', run: () => fileRefCall('revealFileRef', node)},
    ] : [
      {id: 'open', label: uiText('Mở tệp'), group: 'open', run: () => fileRefCall('openFileRef', node)},
      {id: 'reveal', label: uiText('Mở thư mục chứa tệp'), group: 'open', run: () => fileRefCall('revealFileRef', node)},
    ],
  });
  const fileRefNode = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('.pvta-file-ref') : null;

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const node = fileRefNode(e.target);
    if (node) fileMenu.handlers(node).onContextMenu(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const node = fileRefNode(e.target);
    if (!node) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {fileMenu.handlers(node).onKeyDown(e); return;}
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); openFileRef(node);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    const fileRef = target.closest<HTMLElement>('.pvta-file-ref');
    if (fileRef) {
      e.preventDefault();
      e.stopPropagation();
      openFileRef(fileRef);
      return;
    }

    // Checkbox task list click
    const checkbox = target.closest<HTMLInputElement>('.task-checkbox');
    if (checkbox) {
      const idxStr = checkbox.getAttribute('data-task-index');
      if (idxStr !== null && onToggleTask) {
        onToggleTask(Number(idxStr));
      }
      return;
    }

    // List toggle click
    const listToggle = target.closest<HTMLElement>('.list-toggle-btn');
    if (listToggle) {
      e.preventDefault();
      e.stopPropagation();
      const li = listToggle.closest('li');
      if (li) {
        const isCollapsed = li.classList.toggle('collapsed');
        listToggle.textContent = isCollapsed ? '▸' : '▾';
        listToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      }
      return;
    }
  };

  return (
    <><div
      ref={containerRef}
      className={`markdown ${className ?? ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      dangerouslySetInnerHTML={{__html: html}}
    />{fileMenu.menu}{expanded && createPortal(<dialog ref={dialogRef} className="markdown-image-dialog" aria-label="Xem ảnh lớn" onCancel={() => setExpanded(undefined)} onClose={() => setExpanded(undefined)}>
      <header><strong>{expanded.alt || 'Ảnh'}</strong><button autoFocus onClick={() => setExpanded(undefined)} aria-label="Đóng ảnh">Đóng</button></header>
      <img src={expanded.src} alt={expanded.alt}/>
    </dialog>, document.body)}</>
  );
}
