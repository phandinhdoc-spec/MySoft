import './companion.css';
import {readSelection} from './office/selection';
import {captureBody,restoreBody,type BodySnapshot} from './office/restore';
import {toolLabel,argsPreview} from './toolLabels';
import {executeTool,hostFromOffice} from './office';
import {isDesktopOfficeReadTool as isReadTool,DESKTOP_OFFICE_TOOLS as TOOL_CATALOG,type ToolCall} from '@pvta/shared';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=el('status');let socket:WebSocket|undefined;let decision:((v:boolean)=>void)|undefined;
Office.onReady(info=>{
 if(!info.host){status.textContent='Hãy mở add-in này trong Word, Excel hoặc PowerPoint.';return;}
 const host=hostFromOffice(info.host);let undo: {before:BodySnapshot;after:string;identity:string}|undefined;
 el('doc-icon').textContent=host==='word'?'W':host==='excel'?'X':'P';
 const refresh=async()=>{try{el('doc-name').textContent=decodeURIComponent((Office.context.document.url??'').split('/').pop()||'Tài liệu chưa lưu');const s=await readSelection(host);el('selection').textContent=s.cells?`${s.cells.rows} hàng × ${s.cells.cols} cột đang chọn`:s.text.trim()?`${s.text.length} ký tự đang chọn`:'Chưa chọn đoạn nội dung';}catch{el('selection').textContent='Làm việc với tài liệu đang mở';}};void refresh();setInterval(()=>{if(!document.hidden)void refresh();},8000);
 el('undo').onclick=async()=>{if(!undo)return;const button=el<HTMLButtonElement>('undo');button.disabled=true;try{if((Office.context.document.url??'')!==undo.identity)throw Error('Tài liệu đã đổi. Không hoàn tác.');const now=await captureBody();if(now.ooxml!==undo.after)throw Error('Tài liệu đã thay đổi thêm. Dùng Hoàn tác của Word để giữ các chỉnh sửa mới.');const result=await restoreBody(undo.before);if(!result.ok)throw Error('Cần kiểm tra bản khôi phục trong Word.');undo=undefined;button.hidden=true;el('last-note').textContent='Đã khôi phục nội dung trước thao tác.';}catch(e){el('last-note').textContent=e instanceof Error?e.message:String(e);}finally{button.disabled=false;}};
status.textContent='Mở ứng dụng PVTA Chat → Office → Lấy mã kết nối. Đây không phải API key.';
 const connect=(launchTicket?:string)=>{
  socket?.close();const ws=new WebSocket('wss://localhost:52734/office');socket=ws;
  const identity=Office.context.document.url??'';let working=false;let currentId='';let cancelled=false;
  ws.onopen=()=>ws.send(JSON.stringify({type:'pair',token:launchTicket?undefined:el<HTMLInputElement>('token').value.trim(),launchTicket,documentUrl:identity,host,name:identity.split('/').pop()||`${host} · tài liệu chưa lưu`}));
  ws.onmessage=async e=>{if(socket!==ws)return;let m:any;try{m=JSON.parse(String(e.data));}catch{return;}
   if(m.type==='paired'){el('connection-dot').classList.add('on');status.textContent=m.selected?'Đã kết nối và chọn tài liệu này trong PVTA Chat.':'Đã kết nối. Chọn tài liệu này trong PVTA.';if(launchTicket){Office.context.document.settings.remove('PVTA.LaunchTicket');Office.context.document.settings.saveAsync();}el('pair').hidden=true;el('disconnect').hidden=false;el<HTMLInputElement>('token').value='';return;}
   if(m.type==='cancel'&&m.id===currentId){cancelled=true;decision?.(false);return;}
   if(m.type!=='execute')return;
   const reply=(value:object)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,...value}));};
   if(working){reply({error:'Office đang xử lý thao tác trước.'});return;}working=true;currentId=m.id;cancelled=false;
   try{
    const call=m.call as ToolCall;if(!TOOL_CATALOG.some(t=>t.host===host&&t.name===call.tool))throw Error('Công cụ không phù hợp.');
    if((Office.context.document.url??'')!==identity)throw Error('Tài liệu đã đổi. Ngắt kết nối và kết nối lại.');
    if(!isReadTool(call.tool)){
     el('action-label').textContent=toolLabel(call.tool,'vi');const preview=argsPreview(call.args);el('preview').textContent=[preview.text,JSON.stringify(preview.rest,null,2)].filter(Boolean).join('\n');el('approve').hidden=false;
     const allowed=await new Promise<boolean>(resolve=>{decision=resolve;});decision=undefined;el('approve').hidden=true;
     if(!allowed)throw Error('Người dùng đã từ chối thao tác.');
     if((Office.context.document.url??'')!==identity)throw Error('Tài liệu đã đổi sau khi đề xuất.');
    }
    if(cancelled||ws.readyState!==WebSocket.OPEN)throw Error('Yêu cầu đã kết thúc.');
    let before:BodySnapshot|undefined;if(!isReadTool(call.tool)&&host==='word'){try{before=await captureBody();}catch{}}
    const result=await executeTool(host,call);
    if(!isReadTool(call.tool)){undo=undefined;el('undo').hidden=true;el('last-action').hidden=false;el('last-note').textContent='Đã áp dụng. Có thể dùng Hoàn tác của Office ngay sau thao tác này.';if(before){try{undo={before,after:(await captureBody()).ooxml,identity};el('undo').hidden=false;el('last-note').textContent='Có thể hoàn tác nội dung nếu chưa chỉnh sửa thêm.';}catch{}}}
    reply({result});
   }catch(e){reply({error:e instanceof Error?e.message:String(e)});}finally{working=false;}
  };
  ws.onclose=()=>{if(socket!==ws)return;el('connection-dot').classList.remove('on');decision?.(false);status.textContent='Đã ngắt kết nối. Nhập mã từ PVTA để kết nối lại.';el('pair').hidden=false;el('disconnect').hidden=true;};ws.onerror=()=>{if(socket!==ws)return;status.textContent='Không kết nối được. Kiểm tra PVTA và thiết lập chứng chỉ Office.';};
 };
 el<HTMLFormElement>('pair').onsubmit=e=>{e.preventDefault();connect();};
 const launchTicket=Office.context.document.settings.get('PVTA.LaunchTicket');
 if(typeof launchTicket==='string'&&/^[a-f0-9]{64}$/.test(launchTicket)){
  status.textContent='Đang kết nối tài liệu mới với PVTA Chat…';connect(launchTicket);
 }
 el('accept').onclick=()=>decision?.(true);el('reject').onclick=()=>decision?.(false);el('disconnect').onclick=()=>socket?.close();
});
