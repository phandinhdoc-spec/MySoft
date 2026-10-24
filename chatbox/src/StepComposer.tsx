import {t as uiText} from './i18n';
import React,{useRef,useState} from 'react';
import {TRIGGERS,detectTrigger,applyPick,nextPlaceholder,type TriggerChar} from '@pvta/shared';
import {pickFiles,type ViewState} from './ipc';
import {Icon} from './Icon';
import {QuickFile} from './QuickFile';
import {Tip,TriggerButton,TriggerMenu,menuItems,PromptManager,RuleManager,AddRuleDialog,AddPromptDialog,AddSkillDialog,type MenuItem} from './Composer';
import {Modal} from './Modal';
import {SkillsManagerModal} from './SkillsManagerModal';
import {BUILTIN_PROMPTS} from '@pvta/shared';
import type {WorkflowResource} from '../../core/src/desktop/types';
import {InheritedResources,LocalResourceForm,ResourceScopeSelect,WorkflowResourceEditor,type ResourceScope} from './WorkflowResourceEditor';
import './step-composer.css';
import {markdownList,workflowInputLink} from './composer-markdown';
import {WorkflowPromptAssistant} from './WorkflowPromptAssistant';
import {type LanguageWorkflow} from '../../core/src/desktop/workflow-language';

/** Ký tự gọi được trong ô prompt của nút: @ prompt mẫu, / skill, # quy tắc. Bỏ $ và $$ (duyệt tệp/thư mục trong ngữ cảnh chat). */
export const STEP_TRIGGERS:TriggerChar[]=['@','/','#'];
const baseName=(p:string)=>p.split(/[\\/]/).filter(Boolean).pop()??p;
const IMAGE=/\.(png|jpe?g|webp)$/i;
const DOC=/\.(docx|xlsx|pptx|pdf|txt|md|typ|csv|png|jpe?g|webp)$/i;

type StepModal = 'addSkill' | 'manageSkills' | 'addRule' | 'manageRules' | 'addPrompt' | 'managePrompts' | null;

/** Ô soạn prompt của nút quy trình: Markdown cùng các công cụ tài nguyên của nút. */
export function StepComposer({state,value,onChange,files,onFiles,projectId,disabled,filesDisabledReason,report,notice,workflow,stepId,assistant,resources=[],onResources,inheritedResources=[]}:{inheritedResources?:{owner:string;resource:WorkflowResource}[];resources?:WorkflowResource[];onResources?:(r:WorkflowResource[],prompt?:string)=>void;state:ViewState;value:string;onChange:(v:string,files?:string[])=>void;files:string[];onFiles:(files:string[])=>void;projectId?:string;disabled?:boolean;filesDisabledReason?:string;report:(e:unknown)=>void;notice:(s:string)=>void;workflow?:LanguageWorkflow&{id:string};stepId?:string;/** Bật trợ lý ! dù không nhận tệp (quy trình mẫu). */assistant?:boolean}){
 const input=useRef<HTMLTextAreaElement>(null);
 const [caret,setCaret]=useState(0),[sel,setSel]=useState(0),[dismissed,setDismissed]=useState(-1);
 const [modal,setModal]=useState<StepModal>(null);
 const [checkRequest,setCheckRequest]=useState(0);
 const [resourceScope,setResourceScope]=useState<ResourceScope>('library');
 function saveLocal(r:WorkflowResource){
  if(!onResources)return;
  if(resources.length>=30){notice(uiText("Mỗi nút tối đa 30 tài nguyên cấu hình."));return;}
  const prompt=trig?value.slice(0,trig.start)+value.slice(caret):undefined;
  onResources([...resources,r],prompt);setModal(null);
 }
 function pickScoped(it:MenuItem){
  if(resourceScope==='library'||!onResources||!trig)return false;
  const kind=trig.char==='/'?'skill':trig.char==='#'?'rule':'prompt';
  const body=kind==='skill'?state.skills.find(s=>s.name===it.value)?.body:kind==='rule'?[...(project?.ruleBook??[]),...(state.data.ruleBook??[])].find(r=>r.key===it.value)?.text:[...state.prompts.own,...BUILTIN_PROMPTS].find(p=>p.id===it.id)?.text;
  if(!body){notice(uiText("Không đọc được nội dung tài nguyên đã chọn."));return true;}
  saveLocal({id:crypto.randomUUID(),kind,name:it.title,body,scope:resourceScope});return true;
 }
 const localKind=modal==='addSkill'?'skill':modal==='addRule'?'rule':modal==='addPrompt'?'prompt':undefined;
 const raw=detectTrigger(value,caret);const trig=raw&&STEP_TRIGGERS.includes(raw.char)?raw:null;
 const menuOpen=!disabled&&!!trig&&trig.start!==dismissed;
 const project=projectId?state.data.projects?.find(p=>p.id===projectId):undefined;
 const items:MenuItem[]=menuOpen&&trig?menuItems(TRIGGERS[trig.char].kind,trig.query,state,{files:[],project}):[];
 const selIndex=Math.min(sel,Math.max(0,items.length-1));
 const focusAt=(pos:number,end=pos)=>requestAnimationFrame(()=>{const el=input.current;if(!el)return;el.focus();el.setSelectionRange(pos,end);setCaret(pos);});
 function pick(it:MenuItem){if(!trig)return;if(pickScoped(it)){setDismissed(trig.start);return;}const r=applyPick(value,trig,{kind:TRIGGERS[trig.char].kind,value:it.value});onChange(r.text);setSel(0);setDismissed(-1);focusAt(r.selection?r.selection[0]:r.caret,r.selection?r.selection[1]:r.caret);}
 function open(char:TriggerChar){const el=input.current;const pos=el?.selectionStart??value.length;const before=value.slice(0,pos);const lead=before===''||/[\s(]$/.test(before)?'':' ';const at=before.length+lead.length+char.length;onChange(before+lead+char+value.slice(el?.selectionEnd??pos));setCaret(at);setSel(0);setDismissed(-1);focusAt(at);}
 async function add(directory:boolean){
  try{const picks=await pickFiles(directory,directory?undefined:{name:uiText("Văn bản, PDF, Office và hình ảnh"),extensions:['docx','xlsx','pptx','pdf','txt','md','typ','csv','png','jpg','jpeg','webp']});
   if(!picks.length)return;const next=[...new Set([...files,...picks])];
   if(next.length>30){notice(uiText("Mỗi nút đính kèm tối đa 30 tệp hoặc thư mục."));}
   onFiles(next.slice(0,30));
  }catch(e){report(e);}
 }
 function insertTool(val:string,kind:'skills'|'rules'|'prompts'){
  const prefix=kind==='skills'?'/':kind==='rules'?'#':'@';
  const el=input.current;
  const pos=el?.selectionStart??caret;
  const before=value.slice(0,pos);
  const match=/(?:^|\s)([@/#][\w-]*)$/.exec(before);
  const at=match&&match[1]?pos-match[1].length:pos;
  const sep=at>0&&!/\s$/.test(value.slice(0,at))?' ':'';
  const insertion=`${sep}${prefix}${val} `;
  const next=value.slice(0,at)+insertion+value.slice(el?.selectionEnd??pos);
  onChange(next);
  setSel(0);
  setDismissed(-1);
  focusAt(at+insertion.length);
 }
 function addTrigger(){
  if(!trig)return;
  const c=trig.char;
  setDismissed(trig.start);
  if(c==='@')setModal('addPrompt');
  else if(c==='/')setModal('addSkill');
  else if(c==='#')setModal('addRule');
 }
 function manage(){
  if(!trig)return;
  const c=trig.char;
  setDismissed(trig.start);
  if(c==='@')setModal('managePrompts');
  else if(c==='/')setModal('manageSkills');
  else if(c==='#')setModal('manageRules');
 }
 const filesOff=disabled||!!filesDisabledReason;
 function insertMd(before:string,after='',fallback='',attachments?:string[]){
  const el=input.current;if(!el||disabled)return;
  const start=el.selectionStart,end=el.selectionEnd;
  const selected=el.value.slice(start,end)||fallback;
  onChange(el.value.slice(0,start)+before+selected+after+el.value.slice(end),attachments);
  setSel(0);setDismissed(-1);focusAt(start+before.length+selected.length);
 }
 function insertBlock(block:string){
  const el=input.current;if(!el)return;
  const before=el.value.slice(0,el.selectionStart);
  insertMd((!before||before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n')+block);
 }
 function insertList(ordered:boolean){
  const el=input.current;if(!el||disabled)return;
  const result=markdownList(el.value,el.selectionStart,el.selectionEnd,ordered);
  onChange(result.text);focusAt(result.caret);
 }
 async function insertImage(asFile=false){
  if(filesOff)return;
  try{
   const picks=await pickFiles(false,asFile?{name:uiText("Tệp tài liệu"),extensions:['docx','xlsx','pptx','pdf','txt','md','typ','csv','png','jpg','jpeg','webp']}: {name:uiText("Hình ảnh"),extensions:['png','jpg','jpeg','webp']});
   const path=picks[0];if(!path||!input.current)return;
   const next=[...new Set([...files,path])];
   if(next.length>30){notice(uiText("Mỗi nút đính kèm tối đa 30 tệp hoặc thư mục."));return;}
   insertMd(workflowInputLink(path,!asFile),'','',next);
  }catch(e){report(e);}
 }
 return <div className="step-composer">
  {onResources&&<><ResourceScopeSelect value={resourceScope} onChange={setResourceScope} disabled={disabled}/><InheritedResources items={inheritedResources}/><WorkflowResourceEditor resources={resources} onChange={onResources} disabled={disabled}/></>}
  {files.length>0&&<div className="file-chips" aria-label={uiText("Tệp đính kèm của nút")}>{files.map(f=><span key={f} className="attachment-chip" title={f}><QuickFile path={f}><button type="button" data-file-open><Icon name={DOC.test(f)?'file':'folder'}/>{IMAGE.test(f)?uiText("Ảnh: {0}",[baseName(f)]):baseName(f)}</button></QuickFile><button type="button" disabled={disabled} aria-label={uiText("Bỏ đính kèm {0}",[baseName(f)])} title={uiText("Bỏ khỏi nút")} onClick={()=>onFiles(files.filter(x=>x!==f))}>{uiText("×")}</button></span>)}</div>}
  <div className="composer">
   <div className="composer-md-toolbar" role="toolbar" aria-label={uiText("Công cụ soạn thảo Markdown")} onMouseDown={e=>e.preventDefault()}>
    <div className="md-tools-group">
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Chữ đậm (Ctrl+B)")} onClick={()=>insertMd('**','**')}><strong>B</strong></button>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Chữ nghiêng (Ctrl+I)")} onClick={()=>insertMd('*','*')}><em>I</em></button>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Gạch chân (<u>)")} onClick={()=>insertMd('<u>','</u>')}><u>U</u></button>
     <span className="md-tool-sep" aria-hidden="true"/>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Danh sách gạch đầu dòng")} onClick={()=>insertList(false)}>List</button>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Danh sách đánh số")} onClick={()=>insertList(true)}>Enum</button>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Chèn liên kết URL")} onClick={()=>insertMd('[','](https://)',uiText("tiêu đề liên kết"))}>Url</button>
     <button type="button" className="md-tool-btn" disabled={disabled} title={uiText("Chèn bảng Markdown")} onClick={()=>insertBlock('| Cột 1 | Cột 2 | Cột 3 |\n| --- | --- | --- |\n| Dữ liệu 1 | Dữ liệu 2 | Dữ liệu 3 |\n\n')}>Table</button>
     <button type="button" className="md-tool-btn" disabled={filesOff} title={filesDisabledReason??uiText("Chèn hình ảnh")} onClick={()=>void insertImage()}>Image</button>
     <button type="button" className="md-tool-btn" disabled={filesOff} title={filesDisabledReason??uiText("Chèn liên kết tệp")} onClick={()=>void insertImage(true)}>File</button>
     <span className="md-tool-sep" aria-hidden="true"/>
     <button type="button" className="md-tool-btn md-tool-section" disabled={disabled} title={uiText("Tách phân đoạn / Phase YAML (---)")} onClick={()=>insertBlock('---\n\n')}>Section</button>
    </div>
   </div>
   <div className="composer-input"><textarea ref={input} rows={6} value={value} disabled={disabled} aria-label={uiText("Prompt của nút")} aria-expanded={menuOpen}
    placeholder={uiText("Việc cần làm ở nút này. Dùng {{input}} để chèn đầu vào, {{prev}} để chèn kết quả nút trước. Gõ @ prompt mẫu, / skill, # quy tắc, ! chỉ thị biến và hàm.")}
    onChange={e=>{onChange(e.target.value);setCaret(e.target.selectionStart);setSel(0);if(!detectTrigger(e.target.value,e.target.selectionStart))setDismissed(-1);}}
    onSelect={e=>setCaret(e.currentTarget.selectionStart)} onBlur={()=>setCheckRequest(n=>n+1)}
    onKeyDown={e=>{if(e.nativeEvent.isComposing)return;
     if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey){const key=e.key.toLowerCase();if(key==='b'||key==='i'||key==='u'){e.preventDefault();insertMd(key==='b'?'**':key==='i'?'*':'<u>',key==='b'?'**':key==='i'?'*':'</u>');return;}}
     if(menuOpen&&trig){if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(items.length){e.preventDefault();setSel((selIndex+(e.key==='ArrowDown'?1:items.length-1))%items.length);}return;}
      if((e.key==='Enter'&&!e.shiftKey||e.key==='Tab')&&items[selIndex]){e.preventDefault();pick(items[selIndex]!);return;}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDismissed(trig.start);return;}}
     if(e.key==='Tab'&&!e.shiftKey){const el=e.currentTarget;const h=nextPlaceholder(value,el.selectionEnd);if(h){e.preventDefault();el.setSelectionRange(h[0],h[1]);}}}}/></div>
   {menuOpen&&trig&&<TriggerMenu char={trig.char} items={items} selected={selIndex} onPick={pick} onHover={setSel} onManage={manage} onAdd={addTrigger} onClose={()=>setDismissed(trig.start)}/>}
   <div className="composer-toolbar"><div className="composer-left">
    <Tip name={uiText("Chèn tệp hoặc ảnh")} guide={filesDisabledReason??uiText("Đính kèm Word, Excel, PowerPoint, PDF, văn bản hoặc ảnh cho riêng nút này. PVTA đọc nội dung và gửi ảnh kèm khi nút chạy.")}><button type="button" disabled={filesOff} aria-label={uiText("Chèn tệp hoặc ảnh")} onClick={()=>void add(false)}><Icon name="attach"/></button></Tip>
    <Tip name={uiText("Chèn thư mục")} guide={filesDisabledReason??uiText("Đính kèm cả thư mục; PVTA đọc tối đa 40 tệp hỗ trợ bên trong khi nút chạy.")}><button type="button" disabled={filesOff} aria-label={uiText("Chèn thư mục")} onClick={()=>void add(true)}><Icon name="folder-add"/></button></Tip>
    <span className="toolbar-divider"/>
    {STEP_TRIGGERS.map(c=><TriggerButton key={c} char={c} active={menuOpen&&trig?.char===c} onClick={()=>{if(!disabled)open(c);}}/>)}
   </div></div>
  </div>
  {workflow&&stepId&&(assistant||!filesDisabledReason)&&<WorkflowPromptAssistant noFiles={!!filesDisabledReason} checkRequest={checkRequest} workflow={workflow} stepId={stepId} value={value} caret={caret} onChange={onChange} disabled={disabled} report={report} onInsert={text=>{const before=value.slice(0,caret);const token=/(?:^|\s)([!\$][\w-]*)$/.exec(before)?.[1]??'';const at=caret-token.length;onChange(value.slice(0,at)+text+' '+value.slice(caret));focusAt(at+text.length+1);}}/>}
  {filesDisabledReason&&<p className="muted small">{filesDisabledReason}</p>}
  {localKind&&resourceScope!=='library'&&onResources&&<Modal title={uiText("Cấu hình riêng của quy trình")} onClose={()=>setModal(null)}><LocalResourceForm key={`${localKind}:${resourceScope}`} kind={localKind} scope={resourceScope} onSave={saveLocal} onCancel={()=>setModal(null)}/></Modal>}
  {modal==='addSkill'&&resourceScope==='library'&&<Modal title={uiText("Viết skill mới")} onClose={()=>setModal(null)}>
   <AddSkillDialog onSaved={name=>{setModal(null);notice(uiText("Đã lưu kỹ năng /{0}.",[name]));insertTool(name,'skills');}} onCancel={()=>setModal(null)} report={report}/>
  </Modal>}
  {modal==='manageSkills'&&<Modal title={uiText("Quản lý kỹ năng")} onClose={()=>setModal(null)}>
   <SkillsManagerModal state={state} report={report} notice={notice}/>
  </Modal>}
  {modal==='addRule'&&resourceScope==='library'&&<Modal title={uiText("Thêm quy tắc mới")} onClose={()=>setModal(null)}>
   <AddRuleDialog scope={{kind:'profile'}} onSaved={key=>{setModal(null);notice(uiText("Đã lưu quy tắc."));if(key)insertTool(key,'rules');}} onCancel={()=>setModal(null)} report={report}/>
  </Modal>}
  {modal==='manageRules'&&<Modal title={uiText("Quản lý quy tắc")} onClose={()=>setModal(null)}>
   <RuleManager state={state} report={report} notice={notice} scope={projectId?{kind:'project',id:projectId}:{kind:'profile'}}/>
  </Modal>}
  {modal==='addPrompt'&&resourceScope==='library'&&<Modal title={uiText("Thêm prompt mẫu mới")} onClose={()=>setModal(null)}>
   <AddPromptDialog onSaved={p=>{setModal(null);notice(uiText("Đã lưu prompt mẫu “{0}”.",[p.title]));insertTool(p.title,'prompts');}} onCancel={()=>setModal(null)} report={report}/>
  </Modal>}
  {modal==='managePrompts'&&<Modal title={uiText("Thư viện lời nhắc")} onClose={()=>setModal(null)}>
   <PromptManager state={state} report={report} notice={notice}/>
  </Modal>}
 </div>;
}
