// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,it,expect,vi} from 'vitest';
import {linkTone,routeLink,arrangeLink,borderPoint,attachmentPoint} from '../src/workflow-links';
import {WorkflowGraph} from '../src/WorkflowGraph';

describe('workflow links',()=>{
 it('drags routes without changing dependencies, reconnects either end atomically, and cancels safely',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  const key='test:interactive-links';
  localStorage.setItem(key,JSON.stringify({a:{x:0,y:0},b:{x:400,y:0},c:{x:800,y:0}}));
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const change=vi.fn(),select=vi.fn();
  const nodes=[{id:'a',name:'A',dependsOn:[]},{id:'b',name:'B',dependsOn:['a']},{id:'c',name:'C',dependsOn:[]}];
  const render=async(disabled=false)=>act(async()=>root.render(React.createElement(WorkflowGraph,{nodes,storageKey:key,disabled,onSelect:select,onDependencies:change,onAdd:vi.fn(),renderAction:()=>null})));
  const pointer=async(el:Element,type:string,x:number,y:number)=>{
   (el as any).setPointerCapture=()=>{};(el as any).hasPointerCapture=()=>true;(el as any).releasePointerCapture=()=>{};
   const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:1});
   await act(async()=>el.dispatchEvent(event));
  };
  const edge=()=>host.querySelector('.wf-editable-edges path[role=button]')!;
  const port=(index:number)=>host.querySelectorAll('.wf-node')[index]!.querySelector('.wf-port')!;
  try{
   await render();
   const original=edge().getAttribute('d');
   await pointer(edge(),'pointerdown',300,120);await pointer(edge(),'pointermove',300,350);await pointer(edge(),'pointerup',300,350);
   expect(change).not.toHaveBeenCalled();expect(edge().getAttribute('d')).not.toBe(original);
   expect(JSON.parse(localStorage.getItem(key+':ports')!).links['["a","b"]'].via).toEqual({x:300,y:350});
   const moved=edge().getAttribute('d');
   await pointer(edge(),'pointerdown',300,350);await pointer(edge(),'pointermove',300,450);
   await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
   expect(edge().getAttribute('d')).toBe(moved);
   // Move only the target attachment to an arbitrary position on the same card.
   await pointer(port(1),'pointerdown',400,120);await pointer(port(1),'pointermove',630,73);await pointer(port(1),'pointerup',630,73);
   expect(change).not.toHaveBeenCalled();
   expect(JSON.parse(localStorage.getItem(key+':ports')!).ports.some((p:any)=>p.node==='b'&&p.side==='right'&&p.offset===73/240)).toBe(true);
   // Missed drop and self-loop do not remove the old relationship.
   await pointer(port(1),'pointerdown',630,73);await pointer(port(1),'pointermove',1200,500);await pointer(port(1),'pointerup',1200,500);
   expect(change).not.toHaveBeenCalled();
   await pointer(port(1),'pointerdown',630,73);await pointer(port(1),'pointermove',100,100);await pointer(port(1),'pointerup',100,100);
   expect(change).not.toHaveBeenCalled();
   await pointer(port(1),'pointerdown',630,73);await pointer(port(1),'pointermove',800,100);await pointer(port(1),'pointerup',800,100);
   expect(change).toHaveBeenLastCalledWith('c',['a'],{b:[]});
   change.mockClear();
   await pointer(port(0),'pointerdown',230,100);await pointer(port(0),'pointermove',800,100);await pointer(port(0),'pointerup',800,100);
   expect(change).toHaveBeenLastCalledWith('b',['c'],undefined);
   // Body drag creates a new link; the following click must not open its editor.
   const body=host.querySelectorAll('.wf-node-body')[2]!;change.mockClear();
   await pointer(body,'pointerdown',900,100);await pointer(body,'pointermove',0,100);await pointer(body,'pointerup',0,100);
   expect(change).toHaveBeenLastCalledWith('a',['c'],undefined);
   await act(async()=>body.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(select).not.toHaveBeenCalled();
   // B -> A would close the existing A -> B cycle.
   change.mockClear();const bBody=host.querySelectorAll('.wf-node-body')[1]!;
   await pointer(bBody,'pointerdown',500,100);await pointer(bBody,'pointermove',0,100);await pointer(bBody,'pointerup',0,100);
   expect(change).not.toHaveBeenCalled();expect(host.textContent).toContain('vòng lặp');
   await render(true);await pointer(body,'pointerdown',900,100);await pointer(body,'pointermove',0,100);await pointer(body,'pointerup',0,100);
   expect(change).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();localStorage.clear();}
 });
 it('chooses top/bottom attachments for a straight vertical link and preserves arbitrary offsets',()=>{
  const a={x:0,y:0,w:100,h:100},b={x:0,y:300,w:100,h:100};
  const route=arrangeLink(a,b,[a,b]);
  expect(route.points).toHaveLength(2);expect(route.a.side).toBe('bottom');expect(route.b.side).toBe('top');
  const p=borderPoint(a,{x:100,y:73});expect(p).toEqual({side:'right',offset:.73});
  expect(attachmentPoint(a,p)).toEqual({x:100,y:73});
 });
 it('keeps a dragged route outside cards and moves automatic attachments toward it',()=>{
  const a={x:0,y:0,w:100,h:100},b={x:300,y:0,w:100,h:100},via={x:200,y:200};
  const route=arrangeLink(a,b,[a,b],undefined,undefined,via);
  expect(route.a.side).toBe('bottom');expect(route.b.side).toBe('bottom');
  expect(route.points.some((p,i)=>{const q=route.points[i+1];return q&&p.y===via.y&&q.y===via.y&&via.x>=Math.min(p.x,q.x)&&via.x<=Math.max(p.x,q.x);})).toBe(true);
 });
 const frames=[{id:'outer',stepIds:['a','b','c']},{id:'inner',stepIds:['a','b']},{id:'other',stepIds:['d']}];
 it('uses the innermost frame and handles unframed nodes in both directions',()=>{
  expect(linkTone('a','b',frames)).toBe('normal');
  expect(linkTone('x','y',frames)).toBe('normal');
  expect(linkTone('a','x',frames)).toBe('outside');
  expect(linkTone('x','a',frames)).toBe('outside');
  expect(linkTone('a','d',frames)).toBe('between');
  expect(linkTone('a','c',frames)).toBe('between');
  expect(linkTone('a','d',[])).toBe('normal');
 });
 it('draws one straight segment when facing ports are aligned',()=>{
  expect(routeLink({x:100,y:50},'right',{x:400,y:50},'left',[
   {x:0,y:0,w:100,h:100},{x:400,y:0,w:100,h:100},
  ])).toEqual([{x:100,y:50},{x:400,y:50}]);
 });
 it('routes around a blocking card with straight orthogonal segments',()=>{
  const boxes=[{x:0,y:0,w:100,h:100},{x:200,y:-40,w:100,h:180},{x:400,y:0,w:100,h:100}];
  const path=routeLink({x:100,y:50},'right',{x:400,y:50},'left',boxes);
  expect(path[0]).toEqual({x:100,y:50});expect(path.at(-1)).toEqual({x:400,y:50});
  expect(path.some(p=>p.y<=-50||p.y>=150)).toBe(true);
  for(let i=1;i<path.length;i++){
   const a=path[i-1]!,b=path[i]!;
   expect(a.x===b.x||a.y===b.y).toBe(true);
   for(const r of boxes){
    const intersects=a.x===b.x?a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h
     :a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w;
    expect(intersects).toBe(false);
   }
  }
 });
 it('supports top/bottom ports, backwards links and negative positions',()=>{
  const boxes=[{x:-200,y:-200,w:100,h:100},{x:100,y:100,w:100,h:100}];
  for(const [a,as,b,bs] of [
   [{x:-150,y:-100},'bottom',{x:150,y:100},'top'],
   [{x:200,y:150},'right',{x:-200,y:-150},'left'],
  ] as const){
   const path=routeLink(a,as,b,bs,boxes);
   expect(path[0]).toEqual(a);expect(path.at(-1)).toEqual(b);
   expect(path.every((p,i)=>!i||p.x===path[i-1]!.x||p.y===path[i-1]!.y)).toBe(true);
  }
 });
 it('renders frame colors and arrows, updates on frame edits, and preserves edge selection',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const nodes=[{id:'a',name:'A',dependsOn:[]},{id:'b',name:'B',dependsOn:['a']},{id:'d',name:'D',dependsOn:['b']}];
  const render=async(withFrames:boolean)=>act(async()=>root.render(React.createElement(WorkflowGraph,{
   nodes,frames:withFrames?[{id:'f',name:'F',decl:'',stepIds:['b']},{id:'g',name:'G',decl:'',stepIds:['d']}]:[],
   disabled:false,onSelect:vi.fn(),onDependencies:vi.fn(),onAdd:vi.fn(),renderAction:()=>null,
   suggested:[{id:'suggest',from:'a',to:'d'}],
  })));
  try{
   await render(true);
   const outside=host.querySelector<SVGPathElement>('.wf-editable-edges g.wf-edge-outside path')!;
   expect(outside.getAttribute('d')).not.toContain('C');
   expect(outside.getAttribute('marker-end')).toContain('-outside');
   expect(host.querySelector('.wf-editable-edges g.wf-edge-between path')).not.toBeNull();
   expect(host.querySelector('.wf-suggest-edges .wf-edge-outside')).not.toBeNull();
   await act(async()=>outside.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   expect(outside.getAttribute('aria-pressed')).toBe('true');
   await render(false);
   expect(host.querySelectorAll('.wf-editable-edges g.wf-edge-normal')).toHaveLength(2);
  }finally{await act(async()=>root.unmount());host.remove();}
 });
});
