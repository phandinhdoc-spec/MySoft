// @vitest-environment jsdom
import {it,vi,expect,afterEach} from 'vitest';
vi.mock('../src/office/selection',()=>({readSelection:async()=>({text:''})}));
vi.mock('../src/office/restore',()=>({captureBody:vi.fn(),restoreBody:vi.fn()}));
vi.mock('../src/office',()=>({hostFromOffice:()=> 'word',executeTool:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML='';});
it('uses the embedded one-time ticket automatically and removes it only after pairing succeeds',async()=>{
 vi.useFakeTimers();const ticket='a'.repeat(64),remove=vi.fn(),saveAsync=vi.fn();
 document.body.innerHTML=['status','doc-icon','doc-name','selection','undo','last-note','connection-dot','disconnect','action-label','preview','approve','last-action','accept','reject'].map(id=>`<div id="${id}"></div>`).join('')+'<form id="pair"><input id="token"/></form>';
 vi.stubGlobal('Office',{onReady:(fn:any)=>fn({host:'Word'}),context:{document:{url:'/new.docx',settings:{get:()=>ticket,remove,saveAsync}}}});
 let ws:any;class Socket{static OPEN=1;readyState=1;send=vi.fn();close=vi.fn();onopen:any;onmessage:any;onclose:any;onerror:any;constructor(){ws=this;}}vi.stubGlobal('WebSocket',Socket);
 await import('../src/desktop');expect(ws).toBeTruthy();expect(remove).not.toHaveBeenCalled();ws.onopen();expect(JSON.parse(ws.send.mock.calls[0][0])).toMatchObject({type:'pair',launchTicket:ticket,host:'word',documentUrl:'/new.docx'});expect(JSON.parse(ws.send.mock.calls[0][0])).not.toHaveProperty('token');
 await ws.onmessage({data:JSON.stringify({type:'paired',selected:true})});expect(remove).toHaveBeenCalledWith('PVTA.LaunchTicket');expect(saveAsync).toHaveBeenCalled();expect(document.getElementById('status')?.textContent).toContain('Đã kết nối và chọn');expect(document.getElementById('pair')!.hidden).toBe(true);
});
