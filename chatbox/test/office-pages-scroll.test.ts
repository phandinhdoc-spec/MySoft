// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import OfficePages from '../src/OfficePages';
import {rpc} from '../src/ipc';
import {readPdf} from '../src/pdfio';

vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
vi.mock('../src/pdfio',()=>({readPdf:vi.fn()}));

const mockRenderTask = {
 promise: Promise.resolve(),
 cancel: vi.fn(),
};

const mockPageProxy = (pageNumber: number) => ({
 getViewport: ({scale}: {scale: number}) => ({width: 600 * scale, height: 800 * scale}),
 render: vi.fn(() => mockRenderTask),
 cleanup: vi.fn(),
 rotate: 0,
});

vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({
 GlobalWorkerOptions:{},
 getDocument:()=>({
  promise: Promise.resolve({
   numPages: 4,
   getPage: async (n: number) => mockPageProxy(n),
   destroy: vi.fn(),
  }),
  destroy: vi.fn(),
 }),
}));

let host: HTMLDivElement, root: Root;
const onUnavailable = vi.fn();

let ioCallbacks: Array<(entries: Array<{target: Element; isIntersecting?: boolean; intersectionRatio?: number}>) => void> = [];

beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.clearAllMocks();
 ioCallbacks = [];
 vi.stubGlobal('IntersectionObserver', class {
  callback: (entries: any[]) => void;
  constructor(cb: any) {
   this.callback = cb;
   ioCallbacks.push(cb);
  }
  observe() {}
  disconnect() {}
 });
 vi.mocked(rpc).mockResolvedValue({path: '/tmp/office-preview.pdf'});
 vi.mocked(readPdf).mockResolvedValue(new Uint8Array([1, 2, 3]));
 host = document.createElement('div');
 document.body.append(host);
 root = createRoot(host);
});

afterEach(async()=>{
 await act(async()=>root.unmount());
 host.remove();
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
});

const render = () =>
 act(async()=>
  root.render(
   React.createElement(OfficePages, {
    chatId: 'chat-1',
    sessionId: 'session-1',
    revision: 1,
    onUnavailable,
   })
  )
 );

it('renders multi-page scroll view for office preview and allows scrolling navigation', async () => {
 await render();
 expect(onUnavailable).not.toHaveBeenCalled();

 const scroller = host.querySelector<HTMLDivElement>('.oe-canvas-scroll');
 expect(scroller).toBeTruthy();

 const pageWraps = host.querySelectorAll<HTMLElement>('.oe-page-wrap');
 expect(pageWraps.length).toBe(4);
 expect(pageWraps[0].getAttribute('data-page')).toBe('1');
 expect(pageWraps[3].getAttribute('data-page')).toBe('4');

 // Toolbar shows initial page 1/4
 const toolbar = host.querySelector<HTMLDivElement>('.oe-toolbar');
 expect(toolbar?.textContent).toContain('Trang 1/4');

 const prevBtn = toolbar?.querySelectorAll('button')[0] as HTMLButtonElement;
 const nextBtn = toolbar?.querySelectorAll('button')[1] as HTMLButtonElement;
 const zoomOutBtn = toolbar?.querySelectorAll('button')[2] as HTMLButtonElement;
 const zoomInBtn = toolbar?.querySelectorAll('button')[4] as HTMLButtonElement;

 expect(prevBtn.disabled).toBe(true);
 expect(nextBtn.disabled).toBe(false);

 // Mock scrollIntoView
 Element.prototype.scrollIntoView = vi.fn();

 // Clicking next button moves to page 2
 await act(async () => {
  nextBtn.click();
 });
 expect(toolbar?.textContent).toContain('Trang 2/4');
 expect(prevBtn.disabled).toBe(false);

 // Zoom controls scale the page box dimensions
 const firstPageBox = host.querySelector<HTMLElement>('.oe-page-box');
 const initialWidth = firstPageBox?.style.width;

 await act(async () => {
  zoomInBtn.click();
 });
 const zoomedWidth = firstPageBox?.style.width;
 expect(zoomedWidth).not.toBe(initialWidth);

 await act(async () => {
  zoomOutBtn.click();
 });
 expect(firstPageBox?.style.width).toBe(initialWidth);
});

it('updates current page when scrolling via intersection observer', async () => {
 await render();
 const toolbar = host.querySelector<HTMLDivElement>('.oe-toolbar');
 expect(toolbar?.textContent).toContain('Trang 1/4');

 const pageWraps = host.querySelectorAll<HTMLElement>('.oe-page-wrap');
 const page3 = pageWraps[2];

 // Trigger IntersectionObserver for scroll container to page 3
 await act(async () => {
  for (const cb of ioCallbacks) {
   cb([{target: page3, intersectionRatio: 0.95}]);
  }
 });

 expect(toolbar?.textContent).toContain('Trang 3/4');
});
