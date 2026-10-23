import {t as uiText} from './i18n';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {PDFDocumentProxy,RenderTask,PDFDocumentLoadingTask,PDFPageProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {rpc} from './ipc';
import {readPdf} from './pdfio';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

interface PageSize {
 w: number;
 h: number;
}

interface OfficePageItemProps {
 doc: PDFDocumentProxy;
 pageNumber: number;
 base: PageSize;
 scale: number;
 rootRef: React.RefObject<HTMLDivElement | null>;
 onError: (reason: string) => void;
}

const OfficePageItem = React.memo(function OfficePageItem({
 doc,
 pageNumber,
 base,
 scale,
 rootRef,
 onError,
}: OfficePageItemProps) {
 const host = useRef<HTMLDivElement>(null);
 const canvas = useRef<HTMLCanvasElement>(null);
 const [visible, setVisible] = useState(false);
 const [pageProxy, setPageProxy] = useState<PDFPageProxy>();
 const width = Math.floor(base.w * scale);
 const height = Math.floor(base.h * scale);

 useEffect(() => {
  const el = host.current;
  if (!el || typeof IntersectionObserver === 'undefined') {
   setVisible(true);
   return;
  }
  const io = new IntersectionObserver(([en]) => setVisible(!!en?.isIntersecting), {
   root: rootRef.current,
   rootMargin: '900px 0px',
  });
  io.observe(el);
  return () => io.disconnect();
 }, [rootRef]);

 useEffect(() => {
  if (!visible || pageProxy) return;
  let live = true;
  void doc.getPage(pageNumber).then(p => {
   if (live) setPageProxy(p);
  }).catch(e => {
   if (live) onError(String(e));
  });
  return () => { live = false; };
 }, [visible, pageProxy, doc, pageNumber, onError]);

 useEffect(() => {
  const c = canvas.current;
  if (!visible || !pageProxy || !c) return;
  let live = true;
  let task: RenderTask | undefined;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = pageProxy.getViewport({scale});
  c.width = Math.floor(viewport.width * dpr);
  c.height = Math.floor(viewport.height * dpr);
  const ctx = c.getContext('2d');
  if (ctx) {
   task = pageProxy.render({
    canvasContext: ctx,
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
   });
   task.promise.catch(() => {});
  }
  return () => {
   live = false;
   task?.cancel();
   void task?.promise.catch(() => {}).finally(() => pageProxy?.cleanup());
   if (!visible && c) {
    c.width = 0;
    c.height = 0;
   }
  };
 }, [visible, pageProxy, scale]);

 return (
  <div ref={host} className="oe-page-box" style={{width, height}}>
   <canvas ref={canvas} style={{width, height}} aria-label={uiText("Trang {0}", [pageNumber])} />
  </div>
 );
});

/** Cuộn trang mượt mà bằng chuột / touchpad tương tự PDF preview; giải phóng trang ngoài tầm nhìn. */
export default function OfficePages({
 chatId,
 sessionId,
 revision,
 onUnavailable,
}: {
 chatId: string;
 sessionId: string;
 revision: number;
 onUnavailable: (reason: string) => void;
}) {
 const [doc, setDoc] = useState<PDFDocumentProxy>();
 const [sizes, setSizes] = useState<PageSize[]>([]);
 const [page, setPage] = useState(1);
 const [scale, setScale] = useState(1);
 const [status, setStatus] = useState('');
 const scroller = useRef<HTMLDivElement>(null);
 const pageEls = useRef(new Map<number, HTMLElement>());

 useEffect(() => {
  let live = true;
  let task: PDFDocumentLoadingTask | undefined;
  setStatus(uiText("Đang cập nhật bố cục…"));
  setDoc(undefined);
  setSizes([]);
  void (async () => {
   try {
    const r = await rpc<{path: string}>('editRender', {chatId, sessionId, revision});
    if (!live) return;
    const bytes = await readPdf(r.path);
    if (!live) return;
    task = pdfjs.getDocument({data: bytes, isEvalSupported: false, useSystemFonts: true});
    const next = await task.promise;
    if (!live) return;
    if (!next.numPages) throw new Error(uiText("Tài liệu không có trang để xem."));
    const pageSizes: PageSize[] = [];
    for (let i = 1; i <= next.numPages; i++) {
     const p = await next.getPage(i);
     const v = p.getViewport({scale: 1});
     pageSizes.push({w: v.width, h: v.height});
    }
    if (!live) return;
    setSizes(pageSizes);
    if (pageSizes[0]) {
     const w = (scroller.current?.clientWidth ?? 700) - 48;
     setScale(Math.min(1.6, Math.max(0.4, Math.round((w / pageSizes[0].w) * 100) / 100)));
    }
    setPage(p => Math.min(Math.max(1, p), next.numPages));
    setDoc(next);
    setStatus('');
   } catch (e) {
    if (live) onUnavailable(String(e));
   }
  })();
  return () => {
   live = false;
   void task?.destroy?.();
  };
 }, [chatId, sessionId, revision, onUnavailable]);

 // Theo dõi trang đang xem nhiều nhất trong khung cuộn khi cuộn bằng chuột hoặc touchpad
 useEffect(() => {
  const root = scroller.current;
  if (!root || !doc || !sizes.length || typeof IntersectionObserver === 'undefined') return;
  const ratios = new Map<number, number>();
  const io = new IntersectionObserver(
   entries => {
    for (const en of entries) {
     const p = Number((en.target as HTMLElement).dataset.page);
     if (p) ratios.set(p, en.intersectionRatio);
    }
    let best = 0, bestR = -1;
    for (const [k, r] of ratios) {
     if (r > bestR) {
      best = k;
      bestR = r;
     }
    }
    if (best > 0) setPage(best);
   },
   {root, threshold: [0, 0.25, 0.5, 0.75, 1]}
  );
  for (const el of pageEls.current.values()) io.observe(el);
  return () => io.disconnect();
 }, [doc, sizes, scale]);

 const goTo = useCallback((targetPage: number) => {
  const total = doc?.numPages ?? sizes.length;
  if (!total) return;
  const clamped = Math.min(total, Math.max(1, targetPage));
  const el = pageEls.current.get(clamped);
  el?.scrollIntoView({behavior: 'smooth', block: 'start'});
  setPage(clamped);
 }, [doc, sizes.length]);

 const fit = () => {
  if (!sizes[0] || !scroller.current) return;
  const w = (scroller.current.clientWidth || 700) - 48;
  setScale(Math.min(2, Math.max(0.4, Math.round((w / sizes[0].w) * 100) / 100)));
 };

 const zoom = (factor: number) => {
  setScale(s => Math.min(2.5, Math.max(0.4, Math.round(s * factor * 100) / 100)));
 };

 useEffect(() => {
  const el = scroller.current;
  if (!el) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (page > 1) {
     e.preventDefault();
     goTo(page - 1);
    }
   } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    if (doc && page < doc.numPages) {
     e.preventDefault();
     goTo(page + 1);
    }
   }
  };
  el.addEventListener('keydown', onKey);
  return () => el.removeEventListener('keydown', onKey);
 }, [page, doc, goTo]);

 return (
  <div className="oe-layout-preview">
   <div className="oe-toolbar">
    <button
     title={uiText("Trang trước")}
     aria-label={uiText("Trang trước")}
     disabled={!doc || page <= 1}
     onClick={() => goTo(page - 1)}
    >
     ←
    </button>
    <span>
     Trang {page}/{doc?.numPages ?? '…'}
    </span>
    <button
     title={uiText("Trang sau")}
     aria-label={uiText("Trang sau")}
     disabled={!doc || page >= (doc?.numPages ?? 0)}
     onClick={() => goTo(page + 1)}
    >
     →
    </button>
    <button
     title={uiText("Thu nhỏ")}
     aria-label={uiText("Thu nhỏ")}
     disabled={scale <= 0.4}
     onClick={() => zoom(1 / 1.15)}
    >
     −
    </button>
    <button
     title={uiText("Vừa chiều rộng khung")}
     aria-label={uiText("Vừa chiều rộng khung")}
     onClick={fit}
    >
     {Math.round(scale * 100)}%
    </button>
    <button
     title={uiText("Phóng to")}
     aria-label={uiText("Phóng to")}
     disabled={scale >= 2.5}
     onClick={() => zoom(1.15)}
    >
     ＋
    </button>
   </div>
   {status && <p role="status">{status}</p>}
   <div
    ref={scroller}
    className="oe-canvas-scroll"
    tabIndex={0}
    aria-label={uiText("Cuộn xem trang")}
   >
    {doc &&
     sizes.map((sz, idx) => {
      const pNum = idx + 1;
      return (
       <div
        key={pNum}
        data-page={pNum}
        className="oe-page-wrap"
        ref={el => {
         if (el) pageEls.current.set(pNum, el);
         else pageEls.current.delete(pNum);
        }}
       >
        <div className="oe-page-bar">
         <span>{uiText("Trang {0}", [pNum])}</span>
        </div>
        <OfficePageItem
         doc={doc}
         pageNumber={pNum}
         base={sz}
         scale={scale}
         rootRef={scroller}
         onError={onUnavailable}
        />
       </div>
      );
     })}
   </div>
   <small>
    {uiText(
     "Bố cục do bộ dựng nhẹ (WordCraft/DeckCraft/GridCraft) hoặc LibreOffice dựng; có thể khác Microsoft Office khi thiếu phông hoặc có đối tượng đặc biệt."
    )}
   </small>
  </div>
 );
}
