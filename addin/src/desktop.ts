import './companion.css';
import {readSelection} from './office/selection';
import {captureBody,restoreBody,type BodySnapshot} from './office/restore';
import {executeTool,hostFromOffice} from './office';
import {isDesktopOfficeReadTool as isReadTool,DESKTOP_OFFICE_TOOLS as TOOL_CATALOG,type ToolCall} from '@pvta/shared';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=el('status');let socket:WebSocket|undefined;let reconnectTimer:ReturnType<typeof setTimeout>|undefined;let manualDisconnect=false;
Office.onReady(info=>{
 if(!info.host){status.textContent='Hãy mở add-in này trong Word, Excel hoặc PowerPoint.';return;}
 const host=hostFromOffice(info.host);let undo: {before:BodySnapshot;after:string;identity:string}|undefined;
 el('doc-icon').textContent=host==='word'?'W':host==='excel'?'X':'P';
 const refresh=async()=>{try{el('doc-name').textContent=decodeURIComponent((Office.context.document.url??'').split('/').pop()||'Tài liệu chưa lưu');const s=await readSelection(host);el('selection').textContent=s.cells?`${s.cells.rows} hàng × ${s.cells.cols} cột đang chọn`:s.text.trim()?`${s.text.length} ký tự đang chọn`:'Chưa chọn đoạn nội dung';}catch{el('selection').textContent='Làm việc với tài liệu đang mở';}};void refresh();setInterval(()=>{if(!document.hidden)void refresh();},8000);
 el('undo').onclick=async()=>{if(!undo)return;const button=el<HTMLButtonElement>('undo');button.disabled=true;try{if((Office.context.document.url??'')!==undo.identity)throw Error('Tài liệu đã đổi. Không hoàn tác.');const now=await captureBody();if(now.ooxml!==undo.after)throw Error('Tài liệu đã thay đổi thêm. Dùng Hoàn tác của Word để giữ các chỉnh sửa mới.');const result=await restoreBody(undo.before);if(!result.ok)throw Error('Cần kiểm tra bản khôi phục trong Word.');undo=undefined;button.hidden=true;el('last-note').textContent='Đã khôi phục nội dung trước thao tác.';}catch(e){el('last-note').textContent=e instanceof Error?e.message:String(e);}finally{button.disabled=false;}};
 status.textContent='Đang tự động kết nối với PVTA Chat…';
 const connect=(launchTicket?:string)=>{
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
  manualDisconnect=false;
  socket?.close();const ws=new WebSocket('wss://localhost:52734/office');socket=ws;
  const identity=Office.context.document.url??'';let working=false;let currentId='';let cancelled=false;
  const manualToken=el<HTMLInputElement>('token')?.value.trim()||undefined;
  ws.onopen=()=>ws.send(JSON.stringify({type:'pair',token:launchTicket?undefined:manualToken,launchTicket,documentUrl:identity,host,name:identity.split('/').pop()||`${host} · tài liệu chưa lưu`}));
  ws.onmessage=async e=>{if(socket!==ws)return;let m:any;try{m=JSON.parse(String(e.data));}catch{return;}
   if(m.type==='paired'){el('connection-dot').classList.add('on');status.textContent=m.selected?'Đã tự động kết nối và chọn tài liệu này trong PVTA Chat.':'Đã kết nối với PVTA Chat.';if(launchTicket){Office.context.document.settings.remove('PVTA.LaunchTicket');Office.context.document.settings.saveAsync();}el('pair').hidden=true;el('disconnect').hidden=false;if(el<HTMLInputElement>('token'))el<HTMLInputElement>('token').value='';return;}
   if(m.type==='cancel'&&m.id===currentId){cancelled=true;return;}
   if(m.type!=='execute')return;
   const reply=(value:object)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,...value}));};
   if(working){reply({error:'Office đang xử lý thao tác trước.'});return;}working=true;currentId=m.id;cancelled=false;
   try{
    const call=m.call as ToolCall;if(!TOOL_CATALOG.some(t=>t.host===host&&t.name===call.tool))throw Error('Công cụ không phù hợp.');
    if((Office.context.document.url??'')!==identity)throw Error('Tài liệu đã đổi. Đang tự kết nối lại…');
    if(cancelled||ws.readyState!==WebSocket.OPEN)throw Error('Yêu cầu đã kết thúc.');
    let before:BodySnapshot|undefined;if(!isReadTool(call.tool)&&host==='word'){try{before=await captureBody();}catch{}}
    const result=await executeTool(host,call);
    if(!isReadTool(call.tool)){undo=undefined;el('undo').hidden=true;el('last-action').hidden=false;el('last-note').textContent='Đã áp dụng trực tiếp từ PVTA Chat. Có thể dùng Hoàn tác ngay sau thao tác này.';if(before){try{undo={before,after:(await captureBody()).ooxml,identity};el('undo').hidden=false;el('last-note').textContent='Đã áp dụng trực tiếp. Có thể hoàn tác nội dung nếu chưa chỉnh sửa thêm.';}catch{}}}
    reply({result});
   }catch(e){reply({error:e instanceof Error?e.message:String(e)});}finally{working=false;}
  };
  ws.onclose=()=>{
   if(socket!==ws)return;
   el('connection-dot').classList.remove('on');
   el('disconnect').hidden=true;
   if(manualDisconnect){status.textContent='Đã tạm ngắt kết nối. Bấm Kết nối lại khi cần.';el('pair').hidden=false;return;}
   status.textContent='Đang chờ PVTA Chat trên máy (tự động kết nối)…';
   reconnectTimer=setTimeout(()=>connect(),2500);
  };
  ws.onerror=()=>{if(socket!==ws)return;status.textContent='Đang tự động kết nối với PVTA Chat…';};
 };
 el<HTMLFormElement>('pair').onsubmit=e=>{e.preventDefault();connect();};
 const launchTicket=Office.context.document.settings.get('PVTA.LaunchTicket');
 if(typeof launchTicket==='string'&&/^[a-f0-9]{64}$/.test(launchTicket)){
  connect(launchTicket);
 }else{
  connect();
 }
 el('disconnect').onclick=()=>{manualDisconnect=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=undefined;}socket?.close();};
});
