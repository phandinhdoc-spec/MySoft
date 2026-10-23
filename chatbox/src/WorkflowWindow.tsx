import {t as uiText} from './i18n';
import {RunProgress,appendProgress} from './RunProgress';
import {useAppearance} from './useAppearance';
import {DocumentReader} from './DocumentPreview';
import React,{useEffect,useState} from 'react';
import {rpc,subscribe,type ViewState} from './ipc';
import {WorkflowPanel} from './WorkflowPanel';
import {WorkflowPromptDock} from './WorkflowPromptDock';
import {ActionCard} from './ActionCard';
import {observeWorkflowState} from './workflow-state';
import {HelpAssistant} from './HelpAssistant';
const HelpPanel=React.lazy(()=>import('./HelpPanel'));
function WorkflowContent({id}:{id:string}){
 const [state,setState]=useState<ViewState>(),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>observeWorkflowState<ViewState>(
  receive=>subscribe(e=>{if(e.event==='state')receive(e.data as ViewState);if(e.event==='progress')setState(s=>s?{...s,chatProgress:{...s.chatProgress,[e.data.chatId]:appendProgress(s.chatProgress?.[e.data.chatId]??[],e.data.entry)}}:s);}),
  ()=>rpc<ViewState>('view'),
  setState,
  e=>setError(String(e)),
 ),[]);
 useAppearance(state?.data.preferences);
 const report=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
 const wf=state?.data.workflows?.find(w=>w.id===id);const chat=state?.data.chats.find(c=>c.messages.some(m=>m.plan?.id===wf?.planId));
 return <main className="workflow-window">{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{state&&!wf?<p role="alert">{uiText("Quy trình không còn tồn tại. Bản sửa dở vẫn được giữ trên máy.")}</p>:state?<>{chat&&state.activeChatIds?.includes(chat.id)&&<RunProgress running entries={state.chatProgress?.[chat.id]??[]}/>}<WorkflowPanel state={state} selectedId={id} report={report} notice={setNotice} onAutoCreate={()=>setNotice(uiText("Tạo quy trình mới trong cửa sổ chat chính."))}/>{chat?.messages.flatMap(m=>m.actions??[]).filter(a=>a.state==='pending').map(a=><ActionCard key={a.id} action={a} report={report} notice={setNotice}/>)}<DocumentReader/></>:<p>{uiText("Đang tải quy trình…")}</p>}</main>;
}

export function WorkflowWindow({id}:{id:string}){
 const [help,setHelp]=useState<string|null>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='F1'){e.preventDefault();setHelp(value=>value===null?'':null);}};window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);},[]);
 return <><div className="workflow-review-window"><WorkflowPromptDock><WorkflowContent id={id}/></WorkflowPromptDock></div><HelpAssistant onRead={setHelp}/>{help!==null&&<React.Suspense fallback={null}><HelpPanel key={help} topic={help} onClose={()=>setHelp(null)}/></React.Suspense>}</>;
}
