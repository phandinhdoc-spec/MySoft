// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {WorkflowGraph} from '../src/WorkflowGraph';
import {clampZoom,stepZoom,wheelFactor,scrollAfterZoom,fitZoom,readZoom,zoomLabel,ZOOM_MIN,ZOOM_MAX,ejectOutside} from '../src/workflow-zoom';

describe('workflow-zoom (tính toán thuần)',()=>{
 it('giới hạn mức thu phóng và bỏ qua giá trị hỏng',()=>{
  expect(clampZoom(10)).toBe(ZOOM_MAX);expect(clampZoom(0.01)).toBe(ZOOM_MIN);expect(clampZoom(NaN)).toBe(1);
  expect(readZoom(null)).toBe(1);expect(readZoom('abc')).toBe(1);expect(readZoom('9')).toBe(ZOOM_MAX);expect(readZoom('1.5')).toBe(1.5);
 });
 it('mỗi nấc phím đổi 15% và không vượt giới hạn',()=>{
  expect(stepZoom(1,1)).toBe(1.15);expect(stepZoom(1,-1)).toBe(0.87);expect(stepZoom(ZOOM_MAX,1)).toBe(ZOOM_MAX);expect(stepZoom(ZOOM_MIN,-1)).toBe(ZOOM_MIN);
  expect(zoomLabel(1.15)).toBe('115%');
 });
 it('con lăn rời đi theo nấc, touchpad chụm đi liên tục',()=>{
  expect(wheelFactor(-100)).toBeCloseTo(1.15);expect(wheelFactor(100)).toBeCloseTo(1/1.15);expect(wheelFactor(-3,1)).toBeCloseTo(1.15);
  expect(wheelFactor(-4)).toBeGreaterThan(1);expect(wheelFactor(-4)).toBeLessThan(1.1);expect(wheelFactor(0)).toBe(1);
 });
 it('giữ điểm dưới con trỏ đứng yên khi phóng',()=>{
  // điểm nội dung dưới con trỏ: (scroll+offset-pad)/zoom phải bằng nhau trước và sau
  const [scroll,offset,pad,from,to]=[200,120,6,1,1.5];
  const next=scrollAfterZoom(scroll,offset,pad,from,to);
  expect((next+offset-pad)/to).toBeCloseTo((scroll+offset-pad)/from);
  expect(scrollAfterZoom(0,0,6,1,0.5)).toBe(3);expect(scrollAfterZoom(0,100,6,1,0.5)).toBe(0);
 });
 it('vừa khung: chỉ thu nhỏ khi nội dung lớn hơn khung',()=>{
  expect(fitZoom(2000,1000,1000,1000)).toBe(0.5);expect(fitZoom(400,300,1000,1000)).toBe(1);expect(fitZoom(100000,100,500,500)).toBe(ZOOM_MIN);expect(fitZoom(0,0,500,500)).toBe(1);
 });
});

let host:HTMLDivElement,root:Root;
const nodes=[{id:'a',name:'A',dependsOn:[]},{id:'b',name:'B',dependsOn:['a']}];
const render=async(extra:Record<string,unknown>={})=>act(async()=>root.render(React.createElement(WorkflowGraph,{nodes,disabled:false,onSelect:vi.fn(),onDependencies:vi.fn(),renderAction:()=>null,onAdd:vi.fn(),storageKey:'t:zoom',...extra} as any)));
const label=()=>host.querySelector('.wf-zoom-value')!.textContent;
const canvas=()=>host.querySelector<HTMLElement>('.wf-canvas')!;
const click=async(name:string)=>act(async()=>host.querySelector<HTMLElement>(`[aria-label="${name}"]`)!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

describe('WorkflowGraph: thu phóng và bố cục',()=>{
 it('nút +, −, về 100% và lưu mức thu phóng theo từng quy trình',async()=>{
  await render();expect(label()).toBe('100%');
  await click('Phóng to sơ đồ');expect(label()).toBe('115%');
  expect(host.querySelector<HTMLElement>('[data-wf-bg]')!.style.transform).toBe('scale(1.15)');
  expect(localStorage.getItem('t:zoom:zoom')).toBe('1.15');
  await click('Thu nhỏ sơ đồ');expect(label()).toBe('100%');await click('Thu nhỏ sơ đồ');expect(label()).toBe('87%');
  await act(async()=>host.querySelector<HTMLElement>('.wf-zoom-value')!.click());expect(label()).toBe('100%');
  await click('Phóng to sơ đồ');await act(async()=>root.unmount());root=createRoot(host);await render();expect(label()).toBe('115%');
 });
 it('⌘/Ctrl + lăn chuột thu phóng, lăn thường thì cuộn như cũ',async()=>{
  await render();
  const plain=new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true});
  await act(async()=>{canvas().dispatchEvent(plain);});expect(plain.defaultPrevented).toBe(false);expect(label()).toBe('100%');
  const zoomIn=new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true});
  await act(async()=>{canvas().dispatchEvent(zoomIn);});expect(zoomIn.defaultPrevented).toBe(true);expect(label()).toBe('115%');
  const mac=new WheelEvent('wheel',{deltaY:100,metaKey:true,bubbles:true,cancelable:true});
  await act(async()=>{canvas().dispatchEvent(mac);});expect(label()).toBe('100%');
 });
 it('chế độ con lăn chuột rời: lăn thường cũng thu phóng và nhớ lựa chọn',async()=>{
  await render();
  await act(async()=>host.querySelector<HTMLElement>('[aria-pressed][title*="lăn chuột"]')!.click());
  expect(localStorage.getItem('pvta.workflowWheelZoom')).toBe('1');
  const e=new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true});
  await act(async()=>{canvas().dispatchEvent(e);});expect(e.defaultPrevented).toBe(true);expect(label()).toBe('115%');
 });
 it('phím tắt ⌘/Ctrl + (+, −, 0) và bỏ qua khi đang gõ chữ',async()=>{
  await render();
  const press=async(init:KeyboardEventInit,target:EventTarget=document.body)=>{const e=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,...init});await act(async()=>{target.dispatchEvent(e);});return e;};
  const e1=await press({key:'=',metaKey:true});expect(e1.defaultPrevented).toBe(true);expect(label()).toBe('115%');
  await press({key:'+',ctrlKey:true});expect(label()).toBe('132%');
  await press({key:'-',metaKey:true});await press({key:'-',metaKey:true});expect(label()).toBe('100%');
  await press({key:'0',metaKey:true});expect(label()).toBe('100%');
  const input=document.createElement('input');document.body.append(input);
  const e2=await press({key:'=',metaKey:true},input);expect(e2.defaultPrevented).toBe(false);expect(label()).toBe('100%');input.remove();
 });
 it('không vượt 200% hoặc dưới 25%',async()=>{
  localStorage.setItem('t:zoom:zoom','9');await render();expect(label()).toBe('200%');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Phóng to sơ đồ"]')!.disabled).toBe(true);
  localStorage.setItem('t:zoom:zoom','0.01');await act(async()=>root.unmount());root=createRoot(host);await render();expect(label()).toBe('25%');
 });
 it('kéo nút khi đang phóng 200% di chuyển đúng khoảng cách trong sơ đồ',async()=>{
  localStorage.setItem('t:zoom:zoom','2');await render();
  const node=host.querySelector<HTMLElement>('.wf-node')!,handle=host.querySelector<HTMLElement>('[aria-label="Di chuyển bước: A"]')!;
  const left=parseFloat(node.style.left);
  (handle as any).setPointerCapture=()=>{};(handle as any).hasPointerCapture=()=>true;(handle as any).releasePointerCapture=()=>{};
  const ev=(type:string,x:number)=>{const e=new MouseEvent(type,{bubbles:true,clientX:x,clientY:0});Object.defineProperty(e,'pointerId',{value:1});return e;};
  await act(async()=>{handle.dispatchEvent(ev('pointerdown',100));});
  await act(async()=>{handle.dispatchEvent(ev('pointermove',160));});
  expect(parseFloat(node.style.left)).toBe(left+30);
 });
 it('ẩn/hiện hướng dẫn, công cụ khung và phóng to toàn khung bằng Esc để thoát',async()=>{
  await render({frames:[],onFrames:vi.fn()});
  expect(host.querySelector('.wf-frame-tools')).not.toBeNull();expect(host.textContent).toContain('Bấm nút để sửa');
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.wf-view-tools button')].find(b=>b.textContent==='Ẩn công cụ khung')!.click());
  expect(host.querySelector('.wf-frame-tools')).toBeNull();expect(localStorage.getItem('pvta.workflowFrameTools')).toBe('0');
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.wf-view-tools button')].find(b=>b.textContent==='Ẩn hướng dẫn')!.click());
  expect(host.textContent).not.toContain('Bấm nút để sửa');
  await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.wf-view-tools button')].find(b=>b.textContent==='Toàn khung')!.click());
  expect(host.querySelector('.wf-visual-editor')!.classList.contains('wf-expanded')).toBe(true);
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  expect(host.querySelector('.wf-visual-editor')!.classList.contains('wf-expanded')).toBe(false);
 });
});

describe('ejectOutside',()=>{
 const R=(x:number,y:number,w=230,h=100)=>({x,y,w,h});
 it('đưa nút không thuộc khung nằm trong hình bao ra ngoài',()=>{
  const r=ejectOutside({n1:R(20,20),n2:R(40,40),n3:R(300,40)},new Set(['n2','n3']),[R(0,0,600,300)]);
  expect(Object.keys(r.moved)).toEqual(['n1']);
  const m=r.moved.n1!;expect(m.x<0||m.y<0).toBe(true);
 });
 it('không dời nút thuộc khung, kể cả khung lồng nhau',()=>{
  const r=ejectOutside({a:R(20,20),b:R(40,40)},new Set(['a','b']),[R(0,0,600,300),R(10,10,400,200)]);
  expect(r.moved).toEqual({});expect(r.stuck).toEqual([]);
 });
 it('cho phép vị trí âm nhưng không vượt quá lề',()=>{
  const r=ejectOutside({n1:R(0,0)},new Set(),[R(-10,-10,400,400)],24,-320);
  const m=r.moved.n1!;expect(m.x).toBeGreaterThanOrEqual(-320);expect(m.y).toBeGreaterThanOrEqual(-320);
 });
 it('không dời nút vào chỗ đã có nút khác',()=>{
  const r=ejectOutside({n1:R(20,20),o:R(-254,20)},new Set(['o']),[R(0,0,600,300)]);
  const m=r.moved.n1!,o=R(-254,20);
  expect(m.x<o.x+o.w+8&&o.x<m.x+230+8&&m.y<o.y+o.h+8&&o.y<m.y+100+8).toBe(false);
 });
});
