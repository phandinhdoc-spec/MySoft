import {ChatWorkflowActions,ChatWorkflowButton,ChatWorkflowCard,type WorkflowCall} from './ChatWorkflow';
import {PromptQueue} from './PromptQueue';
import {WorkflowPromptDock} from './WorkflowPromptDock';
import {markdownList,markdownFile} from './composer-markdown';
import {t as uiText} from './i18n';
import {MessageContent} from './MessageContent';
import {AttachmentChip} from './AttachmentChip';
import {ChatAttachments} from './ChatAttachments';
import {timeline} from './chat-timeline';
import {SkillEditor} from './SkillEditor';
import {SkillCard} from './SkillCard';
import {AccessToggle} from './AccessToggle';
import {WorkspaceSidebar,type SkillNavigation} from './WorkspaceSidebar';
import type {OfficeNavigation} from './OfficePanel';
import {ActivityRail,ACTIVITY_MENUS,nextSidebarSelection} from './ActivityRail';
import {ModelStatusBar} from './ModelStatusBar';
import {Conversation} from './Conversation';
import {RunningTasks} from './RunningTasks';
import {RunProgress,appendProgress} from './RunProgress';
import type {AiProgressEntry} from '@pvta/shared';
import {AppearanceOptions} from './AppearanceOptions';
import {useAppearance} from './useAppearance';
import {PlanningControls,PlanningProgress,planningMinutes,type PlanningMode} from './PlanningControls';
import {SidebarNav,type SourceShortcut} from './SidebarNav';
import {initialChat,openChatWindow} from './chat-window';
import {ToolsHub,type ToolsSection,type ProTab} from './ToolsHub';
import {TaskFailureBanner} from './TaskFailureBanner';
import {failedTasks,type FailedTask} from '@pvta/core/desktop/task-failure';
import {LearningPanel} from './LearningPanel';
import {SelfTip} from './SelfTip';
import {PlanCard} from './PlanCard';
import {SlotBar} from './SlotBar';
import {StandardizeBox} from './Standardize';
import {GitHubPanel} from './GitHubPanel';
import {TerminalPanel} from './TerminalPanel';
import pvtaLogo from './assets/pvta-logo.png';
import './brand.css';
import './screenshot.css';
import {applySetup,type SetupEvent} from './setupStore';
import type {OfficeTarget} from './OfficeEditor';
import {MarkdownEditor,type Draft} from './MarkdownEditor';
import {BackendSetup} from './BackendSetup';
import {HistoryPanel} from './HistoryPanel';
import {ActivityPanel} from './ActivityPanel';
import {ProjectLearning} from './ProjectLearning';
import {ProjectEditor} from './ProjectEditor';
import {LinkedNotebooks} from './LinkedNotebooks';
import {ProjectCard} from './ProjectCard';
import {Icon} from './Icon';
import {SourceContext,FilePreview,SOURCE_REF_TYPE} from './WorkspaceContext';
import {ChatToolsWindow,PathPreview} from './ChatToolsWindow';
import type {MessageDraft} from './message-to-project';
import {useNotebookFiles} from './notebook-files';
import {ActionCard} from './ActionCard';
import {ProposalBar} from './ProposalBar';
import {hideProposalMark,splitProposal} from './proposal';
import {ComposerHint,Tip,TriggerButton,TriggerMenu,menuItems,PromptManager,FolderDialog,RefineSettingsPanel,AddRuleDialog,type MenuItem,type FolderChoice} from './Composer';
import {ProfilePanel,RuleCenter} from './ProfilePanel';
import {userInitial,displayName,resolveAssistantModelLabel,effectiveRules,type RuleScopeKind} from './profile';
import {parseComposerCommand} from '@pvta/shared';
import {runComposerCommand,type CommandEnv} from './composer-commands';
import {OfficePanel,OfficePreview} from './OfficePanel';
import {WorkflowPanel} from './WorkflowPanel';
import {Modal} from './Modal';
import {SkillsManagerModal} from './SkillsManagerModal';
import React,{useState,useEffect,useRef} from 'react';
import {visibleModelText,appearancePalette,API_PROVIDERS,parseQuickSetup,WRITING_MODES,BUILTIN_MODE_ICONS,effortsFor,modelsOf,TRIGGERS,detectTrigger,applyPick,pathToken,nextPlaceholder,TEACHER_FEATURES,pickHomeTools,templateSlots,PROMPT_MAX_SLOTS,type FeatureKey,type TriggerChar,type ModelChoice,type ApiProvider} from '@pvta/shared';
import {rpc,subscribe,pickFiles,savePath,chooseBackup,type ViewState,type Chat,type Action,type Plan,type PlanStep,type Preferences} from './ipc';
import {Markdown} from './Markdown';
import {AppearancePicker} from './AppearancePicker';
import {CommandCodePanel} from './CommandCodePanel';
import {OpenCodePanel} from './OpenCodePanel';
import {UpdateBanner,UpdateStatus} from './UpdatePanel';
import {BriefingStrip} from './GroupsPanel';
import {ActivationScreen,LicenseSettings} from './LicensePanel';
import {ChatActions} from './ChatActions';
import {NotebookPanel,NotebookSources,useNotebook} from './NotebookPanel';
import {ChatLayout} from './PdfSplit';
import {LinkGuard,askOpenLink} from './LinkGuard';
// Hướng dẫn nằm trong gói riêng, chỉ tải khi thầy cô mở (không chiếm RAM lúc dùng bình thường).
const HelpPanel=React.lazy(()=>import('./HelpPanel'));
import {HelpAssistant} from './HelpAssistant';
const MODE_LABELS:Record<string,string>={standard:uiText("Sư phạm"),exact:uiText("Chính xác"),academic:uiText("Học thuật"),accounting:uiText("Kế toán"),creative:uiText("Sáng tạo"),admin:uiText("Hành chính"),concise:uiText("Ngắn gọn"),developer:uiText("Lập trình viên")};
const statusLabel:Record<string,string>={waiting:uiText("Chờ"),running:uiText("Đang chạy"),done:'Xong',error:uiText("Lỗi"),interrupted:uiText("Đã dừng")};

export function App(){
 const [progress,setProgress]=useState<Record<string,AiProgressEntry[]>>({});
 const clearProgress=(id:string)=>{setProgress(current=>{const next={...current};delete next[id];return next;});};
 const beginProgress=(id:string)=>{clearProgress(id);};
 const [workflowNavigation,setWorkflowNavigation]=useState({id:''});
 const [githubNavigation,setGithubNavigation]=useState<{operation:string}>();
 const [officeNavigation,setOfficeNavigation]=useState<OfficeNavigation>();
 const [skillNavigation,setSkillNavigation]=useState<SkillNavigation>();
 const [notebookNavigation,setNotebookNavigation]=useState<SourceShortcut>();
 const openWorkflows=(id='')=>{setWorkflowNavigation({id});setNav('workflows');};
 /** Bấm tên bảng chức năng ở thanh bên = mở trang quản lí đầy đủ của chính chức năng đó. */
 const openPanelHome=(key:string)=>{setGithubVisible(key==='github');if(key==='workflows'){openWorkflows();return;}if(key==='github')return;setNav(key==='chat'?'history':key);};
 const [state,setState]=useState<ViewState>();const [renaming,setRenaming]=useState<{id:string;value:string}>();const [initialized,setInitialized]=useState(false);const [active,setActive]=useState('');const [project,setProject]=useState('');const [nav,setNav]=useState('chat');const [modal,setModal]=useState('');const [modalActions,setModalActions]=useState<React.ReactNode>(null);useEffect(()=>{setModalActions(null);},[modal]);const [addingProjectRule,setAddingProjectRule]=useState(false);const [newRuleTitle,setNewRuleTitle]=useState('');const [newRuleText,setNewRuleText]=useState('');const [newRuleAlways,setNewRuleAlways]=useState(false);const [savingProjectRule,setSavingProjectRule]=useState(false);const [ruleFocus,setRuleFocus]=useState<RuleScopeKind>();const [text,setText]=useState('');const [planningMode,setPlanningMode]=useState<PlanningMode>('chat');const planMode=planningMode!=='chat';const setPlanMode=(value:boolean)=>setPlanningMode(value?'plan':'chat');const [planningTime,setPlanningTime]=useState('KGH');const [localBusy,setBusy]=useState<Set<string>>(new Set());const [stream,setStream]=useState<Record<string,string>>({});const [error,setError]=useState('');const [toast,setToast]=useState('');const [filter,setFilter]=useState('');const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('pvta.sidebarCollapsed')==='true';}catch{return false;}});const [hints,setHints]=useState<any[]>([]);const [optimization,setOptimization]=useState('');const [optimizing,setOptimizing]=useState(false);const [attaching,setAttaching]=useState(false);
 const [groupTarget,setGroupTarget]=useState<{tab:'groups'|'docs'|'basis'|'learn';group?:string}>({tab:'groups'});
 const [taskTarget,setTaskTarget]=useState<FailedTask|null>(null);
 const [officeEdit,setOfficeEdit]=useState<OfficeTarget|null>(null);const [toolsSection,setToolsSection]=useState<ToolsSection>('docs');const [proTab,setProTab]=useState<ProTab>('assessment');
 const [busySendMode,setBusySendMode]=useState<'queue'|'steer'>('queue');
 const [submittingPrompt,setSubmittingPrompt]=useState(false);
 const promptSubmitLock=useRef(false);
 const busy=new Set([...localBusy,...(state?.activeChatIds??[])]);
 const [sidePanel,setSidePanel]=useState(()=>{try{const saved=localStorage.getItem('pvta.sidebarPanel');return ACTIVITY_MENUS.some(([key])=>key===saved)?saved!:'chat';}catch{return 'chat';}});
 useEffect(()=>{try{localStorage.setItem('pvta.sidebarCollapsed',String(collapsed));localStorage.setItem('pvta.sidebarPanel',sidePanel);}catch{}},[collapsed,sidePanel]);
 const [sideW,setSideW]=useState<number>(()=>{try{const v=Number(localStorage.getItem('pvta.sidebarWidth'));return v>=180&&v<=480?v:216;}catch{return 216;}});const [projectFilter,setProjectFilter]=useState('');const [navH,setNavH]=useState<number>(()=>{try{const v=Number(localStorage.getItem('pvta.sidebarNavHeight'));return v>=60&&v<=700?v:220;}catch{return 220;}});
 const contextualSide=['office','skills','tools'].includes(sidePanel);
 const [workspaceSideW,setWorkspaceSideW]=useState(()=>{try{const w=Number(localStorage.getItem('pvta.workspaceSidebarWidth'));return w>=180&&w<=320?w:232;}catch{return 232;}});
 const currentSideW=contextualSide?workspaceSideW:sideW;
 const setCurrentSideW=contextualSide?setWorkspaceSideW:setSideW;
 const sideMax=contextualSide?320:480;
 const [draft,setDraft]=useState<Draft|null>(null);const [location,setLocation]=useState<{dir:string;choices:string[]}>();
 const [beautifying,setBeautifying]=useState(false);
 useEffect(()=>{if(active)void rpc('outputLocation',{chatId:active}).then(setLocation).catch(()=>{});else setLocation(undefined);},[active,state]);
 async function editDraft(attachmentId?:string,content=''){try{const chatId=await ensureChat();const data=attachmentId?await rpc('readDraft',{chatId,attachmentId}):{content,name:'ban-nhap.md'};setDraft({chatId,...data});}catch(e){report(e);}}
 const [hiddenMissed,setHiddenMissed]=useState<number|undefined>();const [hiddenSkills,setHiddenSkills]=useState(0);const [hiddenFailures,setHiddenFailures]=useState<Set<string>>(new Set());
 const [toolsPinned,setToolsPinned]=useState(()=>{try{return localStorage.getItem('pvta.projectToolsPinned')==='true';}catch{return false;}});
 const [projectTools,setProjectTools]=useState(toolsPinned);const [toolsExpanded,setToolsExpanded]=useState(false);const [previewFile,setPreviewFile]=useState('');const [previewPath,setPreviewPath]=useState('');const [previewOver,setPreviewOver]=useState(false);
 useEffect(()=>{try{localStorage.setItem('pvta.projectToolsPinned',String(toolsPinned));}catch{}},[toolsPinned]);
 useEffect(()=>{
  if(!projectTools||toolsPinned||modal||attaching)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{clearTimeout(timer);timer=undefined;};
  const inside=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('.project-tools-window,.project-tools-toggle,.file-chips');
  let pointerInside=true;
  const schedule=()=>{
   if(pointerInside||inside(document.activeElement)){cancel();return;}
   if(timer)return;
   timer=setTimeout(()=>{timer=undefined;if(!pointerInside&&!inside(document.activeElement))setProjectTools(false);},1000);
  };
  const pointer=(event:Event)=>{pointerInside=inside(event.target);schedule();};
  document.addEventListener('pointermove',pointer);document.addEventListener('focusin',schedule);
  return()=>{cancel();document.removeEventListener('pointermove',pointer);document.removeEventListener('focusin',schedule);};
 },[projectTools,toolsPinned,modal,attaching]);
 useEffect(()=>setPreviewFile(''),[active,project]);
 // Đoạn chat kéo/thêm vào dự án: tạo hội thoại mới trong dự án, lưu đoạn chat thành .md trong thư mục đầu ra và đính kèm vào hội thoại đó. Tin nhắn không tự gửi tới AI.
 async function saveMessageToProject(d:MessageDraft){try{if(!currentProject)throw Error(uiText("Chọn dự án trước."));const projectId=currentProject.id;const id=await rpc<string>('newChat',{projectId});setActive(id);setProject(projectId);setText('');setHints([]);setOptimization('');setNav('chat');setStream(s=>({...s,[id]:''}));const saved=await rpc<{path:string}>('saveDraft',{chatId:id,name:d.name,content:d.content});await rpc('renameChat',{chatId:id,title:d.title}).catch(()=>{});notice(uiText("Đã lưu {0} vào dự án và mở hội thoại mới.",[saved.path.split(/[\\/]/).pop()??d.name]));input.current?.focus();}catch(e){report(e);}}
 async function copyToProject(attachmentId:string){try{const dirs=await pickFiles(true);if(!dirs[0])return;const result=await rpc('copyAttachmentToProject',{chatId:active,attachmentId,dir:dirs[0]});if(result.errors?.length)throw Error(result.errors.join('\n'));notice(uiText("Đã sao chép vào dự án: {0}",[result.path]));}catch(e){report(e);}}
 const [githubVisible,setGithubVisible]=useState(false);
 useEffect(()=>setGithubVisible(false),[nav]);
 const [terminalVisible,setTerminalVisible]=useState(false);
 const [terminalStarted,setTerminalStarted]=useState(false);
 const [help,setHelp]=useState<string|null>(null);
 // PDF đang mở bên cạnh khung chat (gắn với một hội thoại).
 const [pdfView,setPdfView]=useState<{path:string;name:string;chatId:string;rev:number}|null>(null);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='F1'){e.preventDefault();setHelp(v=>v===null?'':null);}};window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);},[]);
 const [caret,setCaret]=useState(0);const [sel,setSel]=useState(0);const [dismissed,setDismissed]=useState(-1);const [folderPath,setFolderPath]=useState('');const [folderBusy,setFolderBusy]=useState(false);const end=useRef<HTMLDivElement>(null);const input=useRef<HTMLTextAreaElement>(null);const stateRef=useRef(state);stateRef.current=state;
 const approvingRef=useRef(new Set<string>());const [approving,setApproving]=useState(false);
 // Khung soạn: đổi chiều cao (kéo tay cầm, bấm +/−, phím mũi tên) và danh sách chỗ trống [ ] của lời nhắc mẫu.
 const composerMax=()=>Math.max(64,Math.min(Math.round(window.innerHeight*0.45),window.innerHeight-260,640));
 const readManualH=()=>{try{const v=Number(localStorage.getItem('pvta.composerHeight'));return v>=64&&v<=900?Math.min(v,composerMax()):null;}catch{return null;}};
 const [composerH,setComposerH]=useState<number|null>(readManualH);const autoGrown=useRef(false);
 const [template,setTemplate]=useState('');const [slotsHidden,setSlotsHidden]=useState(false);const prevText=useRef('');
 useEffect(()=>{const clamp=()=>setComposerH(h=>h===null?null:Math.min(h,composerMax()));window.addEventListener('resize',clamp);return()=>window.removeEventListener('resize',clamp);},[]);
 useEffect(()=>{setTemplate('');setSlotsHidden(false);prevText.current='';},[active]);
 function resizeComposer(h:number|null,persist=true){
  const next=h===null?null:Math.max(64,Math.min(composerMax(),Math.round(h)));setComposerH(next);
  if(persist){autoGrown.current=false;try{if(next)localStorage.setItem('pvta.composerHeight',String(next));else localStorage.removeItem('pvta.composerHeight');}catch{/* không lưu được: vẫn dùng trong phiên */}}
 }
 function startComposerResize(e:React.PointerEvent<HTMLDivElement>){
  const el=input.current;if(!el)return;e.preventDefault();const startY=e.clientY;const startH=el.offsetHeight;const grip=e.currentTarget;
  grip.setPointerCapture?.(e.pointerId);grip.classList.add('dragging');document.body.classList.add('composer-dragging');
  const move=(ev:PointerEvent)=>resizeComposer(startH+(startY-ev.clientY));
  const stop=()=>{grip.classList.remove('dragging');document.body.classList.remove('composer-dragging');grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',stop);grip.removeEventListener('pointercancel',stop);};
  grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',stop);grip.addEventListener('pointercancel',stop);
 }
 /** Lời nhắc dài vừa chèn: nới khung soạn vừa đủ (không lưu lại; gửi xong thì về cỡ cũ). */
 function growToFit(){requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=input.current;if(!el)return;const want=Math.min(composerMax(),el.scrollHeight+6);if(want>el.offsetHeight+8){autoGrown.current=true;resizeComposer(want,false);}}));}
 useEffect(()=>{
  const prev=prevText.current;prevText.current=text;
  if(!text.trim()){if(template)setTemplate('');setSlotsHidden(false);if(autoGrown.current){autoGrown.current=false;setComposerH(readManualH());}return;}
  // Lời nhắc mẫu được chèn, dán hoặc đặt vào một lần (không phải gõ từng chữ): theo dõi các chỗ trống của nó.
  const n=templateSlots(text).length;
  if(!template&&n>0&&n<=PROMPT_MAX_SLOTS&&text.length-prev.length>=20){setTemplate(text);setSlotsHidden(false);if(text.length>240)growToFit();}
 },[text]);
 function pickSlot(s:{start:number;end:number}){
  const el=input.current;if(!el)return;const a=s.start>=0?s.start:el.selectionStart;const b=s.start>=0?s.end:a;
  el.blur();el.focus();el.setSelectionRange(a,b);setCaret(a);
  // Cuộn tới chỗ được chọn (ước lượng theo vị trí ký tự, đủ để thấy chỗ trống khi lời nhắc dài).
  if(el.scrollHeight>el.clientHeight){const target=(a/Math.max(1,el.value.length))*el.scrollHeight-el.clientHeight/2;el.scrollTop=Math.max(0,Math.min(el.scrollHeight-el.clientHeight,target));}
 }
 function insertMd(before:string,after='',defaultText=''){
  const el=input.current;if(!el)return;
  const start=el.selectionStart;const end=el.selectionEnd;
  const selected=text.slice(start,end)||defaultText;
  const replacement=before+selected+after;
  const nextText=text.slice(0,start)+replacement+text.slice(end);
  setText(nextText);
  requestAnimationFrame(()=>{
   el.focus();
   const newCursor=start+before.length+(selected?selected.length:0);
   el.setSelectionRange(newCursor,newCursor);
  });
 }
 function handleInsertList(ordered:boolean){
  const el=input.current;if(!el)return;
  const result=markdownList(el.value,el.selectionStart,el.selectionEnd,ordered);
  setText(result.text);
  requestAnimationFrame(()=>{el.focus();el.setSelectionRange(result.caret,result.caret);});
 }
 async function handleInsertFile(){
  try{
   const picks=await pickFiles(false,{name:uiText("Tệp tài liệu"),extensions:['docx','xlsx','pptx','pdf','txt','md','typ','csv']});
   if(!picks[0])return;
   insertMd(markdownFile(picks[0]));
   await attach([picks[0]],'chat',false,true);
  }catch(e){report(e);}
 }
 function handleInsertLink(){
  const el=input.current;
  const sel=el?text.slice(el.selectionStart,el.selectionEnd):'';
  if(sel){insertMd('[','](https://)','');}
  else{insertMd('[','](https://)',uiText("tiêu đề liên kết"));}
 }
 function handleInsertTable(){
  const prefix=(!text||text.endsWith('\n\n'))?'':text.endsWith('\n')?'\n':'\n\n';
  insertMd(prefix+'| Cột 1 | Cột 2 | Cột 3 |\n| --- | --- | --- |\n| Dữ liệu 1 | Dữ liệu 2 | Dữ liệu 3 |\n\n','');
 }
 async function handleInsertImage(){
  try{
   const picked=await pickFiles(false,{name:uiText("Hình ảnh"),extensions:['png','jpg','jpeg','webp','gif','svg']});
   if(picked.length>0&&picked[0]){
    const filePath=picked[0];
    const fileName=filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/,'')??'ảnh';
    insertMd(`![${fileName}](${filePath})\n`,'');
    return;
   }
  }catch{}
  insertMd('![','](đường_dẫn_ảnh)',uiText("Mô tả hình ảnh"));
 }
 function handleInsertSection(){
  const prefix=(!text||text.endsWith('\n\n'))?'':text.endsWith('\n')?'\n':'\n\n';
  insertMd(prefix+'---\n\n','');
 }
 async function handlePaste(e:React.ClipboardEvent<HTMLTextAreaElement>){
  const content=e.clipboardData.getData('text/plain');
  if(!content)return;
  const isLong=content.length>=80||(content.includes('\n')&&content.trim().length>=40);
  if(!isLong)return;
  e.preventDefault();
  const el=e.currentTarget;
  const start=el.selectionStart;
  const end=el.selectionEnd;
  const before=text.slice(0,start);
  const after=text.slice(end);
  const initialText=before+content+after;
  setText(initialText);
  const rawCursor=start+content.length;
  requestAnimationFrame(()=>{el.focus();el.setSelectionRange(rawCursor,rawCursor);});
  setBeautifying(true);
  try{
   const res=await rpc<{text:string;changed:boolean}>('beautifyMarkdown',{text:content});
   if(res?.text&&res.text!==content){
    setText(current=>{
     if(current.includes(content)){
      return current.replace(content,res.text);
     }
     return current;
    });
    notice(uiText("✓ Đã tự động làm đẹp & chuẩn hóa Markdown"));
   }
  }catch(err){
   console.warn('Tự động làm đẹp Markdown gặp lỗi:',err);
  }finally{
   setBeautifying(false);
  }
 }
 useEffect(()=>{let alive=true;let off:(()=>void)|undefined;void subscribe(e=>{if(!alive)return;if(e.event==='state'){setState(e.data as ViewState);}if(e.event==='progress'){const {chatId,entry}=e.data;setProgress(current=>({...current,[chatId]:appendProgress(current[chatId]??stateRef.current?.chatProgress?.[chatId]??[],entry)}));}if(e.event==='usage'){const {backend,usage}=e.data;setState(current=>current?{...current,modelUsage:{...current.modelUsage,[backend]:usage}}:current);}if(e.event==='setup')applySetup(e.data as SetupEvent);if(e.event==='delta'){const d=e.data as {chatId:string;text:string;reset?:boolean;newTurn?:boolean};if(d.newTurn)clearProgress(d.chatId);setStream(s=>({...s,[d.chatId]:d.reset?d.text:(s[d.chatId]??'')+d.text}));}}).then(unlisten=>{if(!alive){unlisten();return;}off=unlisten;return rpc<ViewState>('init').then(s=>{if(alive){setState(s);const c=initialChat(s);setActive(c?.id??'');setProject(c?.projectId??(new URLSearchParams(window.location.search).has('chat')?'':s.data.lastProjectId??''));setInitialized(true);}});}).catch(e=>setError(String(e)));return ()=>{alive=false;off?.();};},[]);
 useEffect(()=>{if(initialized)void rpc('rememberContext',{projectId:project,chatId:active}).catch(()=>{});},[initialized,project,active]);
 const chat=state?.data.chats.find(c=>c.id===active);const currentProject=state?.data.projects.find(p=>p.id===(chat?.projectId??project));const homeSignal=currentProject?{projectName:currentProject.name,rules:currentProject.rules,folders:(currentProject.folders??[]).map(f=>f.split(/[\\/]/).filter(Boolean).pop()??f),brain:state?.homeBrain?.[currentProject.id]}:undefined;const toolsOpen=projectTools&&(!!currentProject||!!chat);const home=pickHomeTools(homeSignal);const pref=state?.data.preferences;
 useAppearance(pref);

 useEffect(()=>{if(!taskTarget||nav!=='chat'||active!==taskTarget.chatId)return;const node=document.getElementById(taskTarget.targetId);if(node){node.scrollIntoView({behavior:'instant',block:'center'});node.setAttribute('tabindex','-1');node.focus({preventScroll:true});}setTaskTarget(null);},[taskTarget,active,nav]);
 function viewFailedTask(task:FailedTask){const current=failedTasks(stateRef.current?.data.chats??[]).find(t=>t.chatId===task.chatId&&t.targetId===task.targetId);if(!current){notice(uiText("Công việc đã được xử lý hoặc không còn tồn tại."));return;}setActive(current.chatId);setProject(current.projectId??'');setNav('chat');setModal('');setOfficeEdit(null);setDraft(null);setPdfView(null);setTaskTarget(current);}

 useEffect(()=>{let alive=true;setHints([]);if(active)void rpc('hints',{chatId:active}).then(v=>{if(alive)setHints(v);}).catch(()=>{});return()=>{alive=false;};},[active,state?.data.attachments.length]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(modal||projectTools){setModal('');setProjectTools(false);}else if(busy.has(active)){void rpc('cancel',{chatId:active});}}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();setPlanningMode(v=>v==='chat'?'plan':v==='plan'?'pro':'chat');}};window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);},[active,busy,modal,projectTools]);
 useEffect(()=>{if(!('__TAURI_INTERNALS__' in window))return;let off:(()=>void)|undefined;let mounted=true;void import('@tauri-apps/api/webviewWindow').then(async({getCurrentWebviewWindow})=>{const unlisten=await getCurrentWebviewWindow().onDragDropEvent(e=>{if(e.payload.type==='drop'){const r=window.devicePixelRatio||1;const at=document.elementFromPoint(e.payload.position.x/r,e.payload.position.y/r);if(at?.closest('.project-preview-pane')&&e.payload.paths[0]){previewDropped(e.payload.paths[0]);return;}void dropped(e.payload.paths);}});if(mounted)off=unlisten;else unlisten();});return ()=>{mounted=false;off?.();};},[active,project]);
 const report=(e:unknown)=>setError(e instanceof Error?e.message:String(e));
 const openSelfTip=(t:import('./self-tip').SelfTipTarget)=>{if(t==='workflows')openWorkflows();else if(t==='github')setGithubVisible(true);else if(t==='terminal'){setTerminalStarted(true);setTerminalVisible(true);}else if(t==='help')setHelp('');else if(t==='settings')setModal('settings');else if(t==='learned')setModal('learned');else{setNav(t);if(t==='skills'){setSidePanel('skills');setCollapsed(false);}}};
 const notice=(message:string)=>{setToast(message);setTimeout(()=>setToast(''),5000);};
 const patch=async(patch:Partial<Preferences>)=>{await rpc('preferences',{patch});};
 /** Model/mức suy nghĩ của từng hội thoại: ghi vào hội thoại đang mở, không đổi mặc định và không ảnh hưởng cửa sổ khác. */
 const activeChat=state?.data.chats.find(c=>c.id===active);
 const chatPatch=async(value:Partial<Preferences>)=>{if(!activeChat){await patch(value);return;}const {choice,effort,...rest}=value;if(Object.keys(rest).length)await patch(rest);const params:Record<string,unknown>={chatId:activeChat.id};if('choice' in value)params.choice=choice;if('effort' in value)params.effort=effort??null;if(Object.keys(params).length>1){if(!('choice' in value)&&!activeChat.choice&&state)params.choice=state.data.preferences.choice;await rpc('chatModel',params);}};
 const chatState=state&&activeChat?{...state,data:{...state.data,preferences:{...state.data.preferences,choice:activeChat.choice??state.data.preferences.choice,effort:activeChat.choice?activeChat.effort??undefined:state.data.preferences.effort}}}:state;
 useEffect(()=>{
  const edit=(event:Event)=>{const file=(event as CustomEvent<{path:string}>).detail.path;
   void (async()=>{const chatId=await ensureChat();
    const a=await rpc<OfficeTarget>('prepareFileEdit',{chatId,path:file});
    setActive(chatId);setNav('chat');
    if(/\.(docx|xlsx|pptx)$/i.test(file)){setPdfView(null);setOfficeEdit({chatId,attachmentId:a.attachmentId,name:a.name});}
    else if(/\.pdf$/i.test(file)){setOfficeEdit(null);await openPdf(file,'current',a.name);}
    else await editDraft(a.attachmentId);
   })().catch(report);
  };window.addEventListener('pvta-edit-file',edit);return()=>window.removeEventListener('pvta-edit-file',edit);
 },[active,project]);
 async function ensureChat(){if(active&&stateRef.current?.data.chats.some(c=>c.id===active))return active;const id=await rpc<string>('newChat',{projectId:project||undefined});setActive(id);return id;}
 async function newChat(projectId=''){const id=await rpc<string>('newChat',{projectId:projectId||undefined});setActive(id);setProject(projectId);setText('');setHints([]);setOptimization('');setNav('chat');setStream(s=>({...s,[id]:''}));input.current?.focus();}
 async function startWorkflowDesign(){try{const id=await rpc<string>('workflowDesignStart');setActive(id);setProject('');setNav('chat');setText('');setPlanMode(false);requestAnimationFrame(()=>input.current?.focus());}catch(e){report(e);}}
 const [wfCall,setWfCall]=useState<WorkflowCall|null>(null);
 /** Gọi quy trình ngay trong hội thoại; kết quả thành tin nhắn của PVTA. Không mở bảng Quy trình. */
 async function runWorkflowInChat(chatId:string,args:{templateId?:string;workflowId?:string;params?:Record<string,string>;output?:string;retry?:boolean;edits?:{access?:Record<string,string>;note?:string}}){try{await rpc('chatWorkflow',{chatId,...args});setWfCall(c=>c?.chatId===chatId?null:c);return true;}catch(e){report(e);return false;}}
 function insertWorkflowName(name:string){const el=input.current;const a=el?.selectionStart??text.length,b=el?.selectionEnd??a;const tok=`[Quy trình: ${name}] `;const pre=text.slice(0,a),lead=pre===''||/\s$/.test(pre)?'':' ';const next=pre+lead+tok+text.slice(b);setText(next);focusAt((pre+lead+tok).length);}
 /** Môi trường cho lệnh #thêm/#sửa/#xóa và /kỹ-năng: dùng cùng nguồn dữ liệu với menu # và /. */
 function composerCommandEnv():CommandEnv{
  const project=currentProject;
  return {
   rules:effectiveRules({profile:state?.data.ruleBook,project:project?.ruleBook,chat:chat?.ruleBook}),
   skills:state?.skills??[],
   scopeFor:(kind)=>kind==='profile'?{kind:'profile'}:kind==='project'?{kind:'project',id:project?.id??''}:{kind:'chat',id:active},
   rpc:(method,params)=>rpc(method,params),
   notice,
   confirm:(message)=>window.confirm(message),
   openSkill:(name)=>{setSkillNavigation({name});setNav('skills');},
  };
 }
 async function send(override?:string,beautify=false,images?:string[],workflowBuild=false,approve=false){const message=(override??text).trim();if(!message)return;
  if(busy.has(active)||(chat?.pendingPrompts?.length??0)>0){
   if(promptSubmitLock.current)return;
   promptSubmitLock.current=true;setSubmittingPrompt(true);
   try{
    await rpc('queuePrompt',{chatId:active,text:message,mode:busySendMode,planningMode,planningTimeoutMs:planMode?planningMinutes(planningTime):undefined,beautify,images});
    setText(value=>value.trim()===message?'':value);
   }catch(e){report(e);}finally{promptSubmitLock.current=false;setSubmittingPrompt(false);}
   return;
  }
  // Lệnh quản lý quy tắc/kỹ năng (#thêm, /kỹ-năng sửa…) xử lý tại chỗ, không gửi cho AI. Lỗi cú pháp giữ nguyên chữ để thầy cô sửa.
  const command=parseComposerCommand(message);
  if(command){
   if('error' in command){notice(command.error);return;}
   setText('');
   await runComposerCommand(command.command,composerCommandEnv());
   return;
  }const call=/\[Quy trình: ([^\]]+)\]/.exec(message);const tpl=call?state?.data.workflowTemplates?.find(t=>t.name===call[1]):undefined;if(tpl&&call){try{const chatId=await ensureChat();setWfCall({chatId,templateId:tpl.id,text:message.replace(call[0],'').trim()});setText('');}catch(e){report(e);}return;}let id='';try{const planningTimeoutMs=planMode?planningMinutes(planningTime):undefined;id=await ensureChat();if(busy.has(id))return;setBusy(b=>new Set(b).add(id));beginProgress(id);setStream(s=>({...s,[id]:''}));setText('');setError('');await rpc('send',{chatId:id,text:message,plan:planMode,planningMode,planningTimeoutMs,beautify,images,workflowBuild,approve});}catch(e){if(!approvingRef.current.has(id))report(e);}finally{if(id&&!approvingRef.current.has(id)){setBusy(b=>{const n=new Set(b);n.delete(id);return n;});}}}
 /** Nút Duyệt (Plan/Plan Pro): dừng lượt đang bàn, gửi toàn bộ trao đổi để PVTA xuất và lưu kế hoạch kèm quy trình. */
 async function approvePlanning(){if(!planMode||approving)return;const id=active;const c=stateRef.current?.data.chats.find(x=>x.id===id);
  if(!id||!c?.messages.some(m=>m.role==='user'&&m.text.trim())){notice(uiText("Chưa có nội dung trao đổi để duyệt. Hãy bàn kế hoạch với PVTA trước."));return;}
  let planningTimeoutMs:number;try{planningTimeoutMs=planningMinutes(planningTime);}catch(e){report(e);return;}
  approvingRef.current.add(id);setApproving(true);setBusy(b=>new Set(b).add(id));beginProgress(id);setStream(s=>({...s,[id]:''}));setError('');
  try{const m=await rpc<{plan?:unknown}>('send',{chatId:id,text:uiText("Duyệt kế hoạch"),plan:true,planningMode,planningTimeoutMs,approvePlan:true});if(m?.plan){setPlanningMode('chat');notice(uiText("Đã duyệt: kế hoạch và quy trình đã được lưu."));}}
  catch(e){report(e);}finally{approvingRef.current.delete(id);setApproving(false);setBusy(b=>{const n=new Set(b);n.delete(id);return n;});setStream(s=>({...s,[id]:''}));clearProgress(id);}}
 async function attach(paths?:string[],scope:'chat'|'project'='chat',folder=false,skipConfirm=false){try{const id=await ensureChat();const picks=paths??await pickFiles(folder);if(!picks.length)return;if(!skipConfirm&&!confirm(uiText("Đọc và lưu chỉ mục cục bộ {0} đã chọn?{1}\n{2}",[folder?uiText("thư mục"):uiText("tệp"),folder&&scope==='project'?' PVTA sẽ nhớ vị trí này làm nơi lưu tệp mới của dự án.':'',picks.join('\n')])))return;setAttaching(true);const r=await rpc('attach',{chatId:id,paths:picks,scope,folder});notice(r.errors?.length?r.errors.join('\n'):r.outputDir?uiText("Đã nhớ thư mục dự án: {0}. Tệp mới sẽ lưu tại đây.",[r.outputDir]):uiText("Đã đọc và lập chỉ mục tài liệu."));}catch(e){report(e);}finally{setAttaching(false);}}
 async function executePlan(plan:Plan,stepId?:string){beginProgress(plan.chatId);setBusy(b=>new Set(b).add(plan.chatId));try{await rpc('runPlan',{id:plan.id,stepId,revision:plan.revision??0});}catch(e){report(e);}finally{setBusy(b=>{const n=new Set(b);n.delete(plan.chatId);return n;});setStream(s=>({...s,[plan.chatId]:''}));clearProgress(plan.chatId);}}

 const files=state?.data.attachments.filter(a=>a.scope==='chat'?a.scopeId===active:a.scopeId===currentProject?.id)??[];
 const notebookFiles=useNotebookFiles([...(currentProject?.notebookIds??[]),...(chat?.notebookIds??[])],report);
 const contextFiles=[...files,...notebookFiles];
 const notebook=useNotebook({report,notice,navigationRequest:notebookNavigation,enabled:nav==='notebook'||sidePanel==='notebook'});
 const trig=state?detectTrigger(text,caret):null;const menuOpen=!!trig&&trig.start!==dismissed;
 const items:MenuItem[]=state&&trig&&menuOpen?menuItems(TRIGGERS[trig.char].kind,trig.query,state,{files:contextFiles,project:currentProject,chat}):[];
 const selIndex=Math.min(sel,Math.max(0,items.length-1));
 function focusAt(pos:number,end=pos){requestAnimationFrame(()=>{const el=input.current;if(!el)return;el.focus();el.setSelectionRange(pos,end);setCaret(pos);});}
 function insertTool(value:string,kind:'rules'|'skills'|'prompts'){const sep=text&&!/\s$/.test(text)?(kind==='prompts'?'\n':' '):'';const next=`${text}${sep}${value}${kind==='prompts'?'':' '}`;setText(next);if(kind==='prompts'&&templateSlots(value).length){setTemplate(next);setSlotsHidden(false);}focusAt(next.length);}
 function pickItem(it:MenuItem){if(!trig)return;const kind=TRIGGERS[trig.char].kind;const r=applyPick(text,trig,{kind,value:it.value});setText(r.text);if(kind==='prompts'){if(templateSlots(it.value).length){setTemplate(r.text);setSlotsHidden(false);if(it.value.length>240)growToFit();}else setTemplate('');}setSel(0);setDismissed(-1);focusAt(r.selection?r.selection[0]:r.caret,r.selection?r.selection[1]:r.caret);}
 function openTrigger(char:TriggerChar){const el=input.current;const pos=el?.selectionStart??text.length;const before=text.slice(0,pos);const lead=before===''||/[\s(]$/.test(before)?'':' ';const next=before+lead+char+text.slice(el?.selectionEnd??pos);setText(next);setSel(0);setDismissed(-1);focusAt(before.length+lead.length+1);}
 function manage(){
  if(!trig)return;const t=trig,c=t.char,snapshot=text;setDismissed(t.start);
  if(c==='/'){setNav('skills');}
  else if(c==='@')setModal('prompts');
  else if(c==='#'){setRuleFocus(undefined);setModal('rules');}
  else if(c==='$')void attach();
  else void pickFiles(true).then(dirs=>{
   if(!dirs[0])return;const value=pathToken(dirs[0]);
   // Ô chat đã đổi trong lúc chọn thư mục thì nối vào cuối thay vì ghi đè chỗ cũ.
   if(input.current?.value!==snapshot){setText(v=>`${v}${v&&!/\s$/.test(v)?' ':''}${value} `);focusAt(Number.MAX_SAFE_INTEGER);return;}
   const r=applyPick(snapshot,t,{kind:'folders',value});setText(r.text);setDismissed(-1);focusAt(r.caret);
  }).catch(report);
 }
 /** Thả tệp vào khung «Xem trước tài liệu»: chỉ xem, không đính kèm. Tệp đã có trong dự án/hội thoại thì dùng bản đã đọc. */
 function previewDropped(file:string){setPreviewOver(false);const known=files.find(f=>f.path===file);if(known){setPreviewFile(known.id);setPreviewPath('');}else{setPreviewFile('');setPreviewPath(file);}}
 async function dropped(paths:string[]){try{const k=await rpc<{dirs:string[];files:string[]}>('pathKinds',{paths});if(k.files.length)await attach(k.files);if(k.dirs[0]){setFolderPath(k.dirs[0]);if(k.dirs.length>1)notice(uiText("Mỗi lần chỉ thêm một thư mục; hãy thêm lần lượt từng thư mục."));}}catch(e){report(e);}}
 /** Nút chụp ảnh màn hình: bật chế độ theo dõi, thầy cô chụp bằng phím tắt hệ thống (macOS ⌘⇧3/⌘⇧4/⌘⇧5), ảnh mới tự đính kèm vào chat. */
 const [shotWatch,setShotWatch]=useState(false);const [shotKeep,setShotKeep]=useState(false);const shotKeepRef=useRef(shotKeep);shotKeepRef.current=shotKeep;const attachShotsLatest=useRef(attachShots);attachShotsLatest.current=attachShots;
 /** Đưa ảnh chụp vào khung chat: không hỏi xác nhận, không đổi thư mục lưu của chat, đặt con trỏ vào ô nhập để gõ câu hỏi ngay. */
 async function attachShots(paths:string[]){
  try{const id=await ensureChat();setAttaching(true);const r=await rpc<{count:number;errors?:string[]}>('attach',{chatId:id,paths,scope:'chat',capture:true});
   if(r.errors?.length)notice(r.errors.join('\n'));else notice(uiText("Đã chèn {0} ảnh chụp vào khung chat.",[paths.length]));
   requestAnimationFrame(()=>input.current?.focus());
  }catch(e){report(e);}finally{setAttaching(false);}
 }
 useEffect(()=>{
  if(!shotWatch)return;
  let alive=true,busyScan=false,again=false,warned=false;let clip:string|undefined;const since=Date.now(),seen:string[]=[];const idleMs=()=>shotKeepRef.current?30*60_000:3*60_000;let deadline=since+idleMs();
  const scan=()=>{
   if(!alive)return;if(busyScan){again=true;return;}
   // Hết hạn vẫn quét thêm một lần: ảnh chụp trong lúc cửa sổ bị hãm không bị bỏ sót.
   const expired=Date.now()>deadline;
   busyScan=true;
   rpc<{files:string[];clip?:string;denied?:string[]}>('screenshotScan',{since,seen,clip}).then(async r=>{
    if(!alive)return;if(r.clip!==undefined)clip=r.clip;
    if(expired&&!r.files.length){alive=false;setShotWatch(false);notice(uiText("Hết thời gian chờ ảnh chụp màn hình. Bấm nút để theo dõi lại."));return;}
    // macOS chưa cấp quyền đọc thư mục lưu ảnh chụp: không bao giờ thấy tệp mới, phải nói rõ thay vì chờ im lặng.
    if(!warned&&r.denied?.length&&!r.files.length){warned=true;notice(uiText("PVTA chưa được phép đọc {0} nên không thấy ảnh vừa chụp. Mở Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Tệp và thư mục, bật quyền cho PVTA. Tạm thời có thể chụp vào clipboard (⌃⌘⇧4), PVTA vẫn nhận được.",[r.denied.join(', ')]));}
    if(!r.files.length)return;
    seen.push(...r.files);
    // Chế độ liên tục: giữ theo dõi để chụp tiếp; chế độ một lần: tắt sau ảnh đầu tiên.
    if(shotKeepRef.current)deadline=Date.now()+idleMs();else setShotWatch(false);
    await attachShotsLatest.current(r.files);
   }).catch(e=>{if(alive){setShotWatch(false);report(e);}}).finally(()=>{busyScan=false;if(again&&alive){again=false;scan();}});
  };
  // WebView macOS hãm bộ hẹn giờ khi cửa sổ nằm nền (lúc chụp màn hình ứng dụng khác), nên quét bù ngay khi PVTA được xem lại.
  const onVisible=()=>{if(document.visibilityState!=='hidden')scan();};
  const timer=window.setInterval(scan,1000);scan();
  window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);};
 },[shotWatch]);
 /** Mở PDF bên cạnh khung chat. 'current': dùng hội thoại đang mở; 'new': tạo hội thoại riêng cho PDF. PDF được đính kèm để PVTA đọc. */
 async function openPdf(file:string,target:'current'|'new',name=file.split(/[\\/]/).pop()??file,reindex=false){
  try{
   const st=stateRef.current;let id=target==='current'&&active&&st?.data.chats.some(c=>c.id===active)?active:'';
   if(!id){id=await rpc<string>('newChat',{projectId:project||undefined});if(target==='new')await rpc('renameChat',{chatId:id,title:`PDF · ${name}`}).catch(()=>{});}
   const chatProject=st?.data.chats.find(c=>c.id===id)?.projectId??(project||undefined);
   const attached=st?.data.attachments.some(a=>a.path===file&&(a.scope==='chat'?a.scopeId===id:a.scopeId===chatProject));
   setActive(id);setNav('chat');setPdfView({path:file,name,chatId:id,rev:Date.now()});
   if(!attached||reindex){setAttaching(true);try{const r=await rpc('attach',{chatId:id,paths:[file],scope:'chat'});if(r?.errors?.length)notice(r.errors.join('\n'));}finally{setAttaching(false);}}
  }catch(e){report(e);}
 }
 /** Sau khi lưu PDF: mở bản vừa lưu và cho PVTA đọc bản này thay cho bản cũ (tệp cũ vẫn giữ nguyên trên máy). */
 async function pdfSaved(file:string){
  const old=pdfView;
  if(old&&old.path!==file){const a=stateRef.current?.data.attachments.find(x=>x.scope==='chat'&&x.scopeId===old.chatId&&x.path===old.path);if(a)await rpc('removeAttachment',{id:a.id}).catch(()=>{});}
  await openPdf(file,'current',undefined,true);
 }
 function openTools(section:ToolsSection,pro?:ProTab){setToolsSection(section);if(pro)setProTab(pro);setNav('tools');}
 function openTool(key:string){if(key==='pdf'){void pickPdf();return;}if(key==='modes'||key==='learned'){setModal(key);return;}setNav('chat');if(key==='accounting')void patch({mode:'accounting'});setText(key==='beautify'?uiText("Làm đẹp tài liệu đã đính kèm, giữ nguyên nội dung. Chọn quy trình theo loại tệp."):uiText("Kiểm tra số liệu các tài liệu đã đính kèm. Tính lại bằng Python, đối chiếu các số giữa Excel, Word và PowerPoint; báo vị trí và chênh lệch trước khi sửa."));input.current?.focus();}
 async function pickPdf(){try{const f=(await pickFiles()).filter(x=>/\.pdf$/i.test(x));if(!f.length){notice(uiText("Chọn một tệp PDF."));return;}await openPdf(f[0]!,'new');}catch(e){report(e);}}
 /** Đưa đoạn chữ bôi đen (hoặc số trang) từ khung PDF vào ô chat. */
 /** Vùng khoanh trên PDF: gửi ngay yêu cầu kèm chữ OCR; ảnh vùng chỉ đi kèm tin nhắn này. */
 function askRegion(r:{text:string;page:number;image:string;request:string}){
  const head=r.request||uiText("Đọc và giải thích nội dung trong vùng này");
  const body=uiText("Vùng khoanh ở trang {0} của PDF (ảnh vùng đã đính kèm){1}",[r.page,r.text?uiText("; chữ nhận dạng bằng OCR, có thể sai, hãy đối chiếu với ảnh:\n\"\"\"\n{0}\n\"\"\"",[r.text]):'.']);
  void send(`${head}\n\n${body}`,false,r.image?[r.image]:undefined);
 }
 function askPdf(quote:string,page:number){
  const q=quote?`> ${quote.replace(/\s+/g,' ')}\n> (trang ${page})\n\n`:uiText("Ở trang {0} của tài liệu, ",[page]);
  setText(t=>(t.trim()?t.replace(/\s*$/,'\n\n'):'')+q);
  setTimeout(()=>{const el=input.current;if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},0);
 }
 async function chooseFolder(){try{const p=await pickFiles(true);if(p[0])setFolderPath(p[0]);}catch(e){report(e);}}
 async function confirmFolder(choice:FolderChoice,name:string){const path=folderPath;setFolderBusy(true);try{if(choice==='new'){const r=await rpc('addFolderProject',{path,name});setProject(r.projectId);setActive(r.chatId);setNav('chat');setFolderPath('');notice(r.errors?.length?r.errors.join('\n'):uiText("Đã tạo dự án “{0}” từ thư mục. Tệp mới sẽ lưu tại đây.",[r.name]));}else{setFolderPath('');await attach([path],choice==='project'?'project':'chat',true,true);}}catch(e){report(e);}finally{setFolderBusy(false);}}
 const newDocsTotal=state?.groups?.kinds.flatMap(k=>k.groups).reduce((n,g)=>n+g.newDocs,0)??0;
 const title=nav==='notebook'?uiText("Sổ nguồn"):nav==='projects'?uiText("Dự án"):nav==='history'?uiText("Lịch sử trò chuyện"):nav==='activity'?uiText("Nhật ký công việc"):nav==='workflows'?uiText("Quy trình tự động"):nav==='office'?uiText("Bộ công cụ Office"):nav==='skills'?uiText("Kỹ năng của PVTA"):nav==='tools'?uiText("Tiện ích"):currentProject?.name??uiText("Cuộc trò chuyện");

 const clampSide=(v:number)=>Math.min(sideMax,Math.max(180,Math.round(v)));
 const saveSide=(v:number)=>{try{localStorage.setItem(contextualSide?'pvta.workspaceSidebarWidth':'pvta.sidebarWidth',String(v));}catch{/* không lưu được thì thôi */}};
 /** Kéo thanh ngăn bên phải thanh điều khiển để đổi độ rộng (180–480 px, nhớ cho lần sau). */
 function startResize(e:React.PointerEvent<HTMLDivElement>){
  e.preventDefault();const el=e.currentTarget;el.setPointerCapture(e.pointerId);
  const move=(ev:PointerEvent)=>setCurrentSideW(clampSide(ev.clientX-(el.parentElement?.getBoundingClientRect().left??0)-(el.parentElement?.querySelector('.activity-bar')?.getBoundingClientRect().width??56)));
  const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);document.body.classList.remove('resizing-sidebar');setCurrentSideW(w=>{saveSide(w);return w;});};
  document.body.classList.add('resizing-sidebar');el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
 }

 /** Chiều cao tối đa của danh sách dự án: chừa chỗ cho khối dự án đang mở và chân thanh bên, để thanh kéo không bao giờ đẩy menu ra khỏi tầm nhìn. */
 const navMax=(el?:Element|null)=>{const host=(el??document.querySelector('.sidebar-split'))?.parentElement;const room=host?host.clientHeight-220:700;return Math.max(60,Math.min(700,room));};
 const applyNavH=(v:number,save=true)=>{const h=Math.min(navMax(),Math.max(60,Math.round(v)));setNavH(h);if(save){try{localStorage.setItem('pvta.sidebarNavHeight',String(h));}catch{/* không lưu được thì thôi */}}return h;};
 /** Kéo thanh ngăn ngang: bắt con trỏ vào chính thanh để không mất sự kiện khi rê nhanh, ra ngoài cửa sổ hay qua iframe/webview. */
 function startSplit(e:React.PointerEvent<HTMLDivElement>){
  if(e.button!==0)return;
  e.preventDefault();const el=e.currentTarget,startY=e.clientY,start=navH,id=e.pointerId;let last=start,done=false;
  try{el.setPointerCapture(id);}catch{/* trình duyệt không hỗ trợ thì dùng sự kiện trên thanh */}
  const move=(ev:PointerEvent)=>{if(ev.pointerId!==id)return;last=applyNavH(start+ev.clientY-startY,false);};
  const up=(ev:Event)=>{if(done||(ev as PointerEvent).pointerId!==undefined&&(ev as PointerEvent).pointerId!==id)return;done=true;el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('lostpointercapture',up);window.removeEventListener('blur',up);document.body.classList.remove('resizing-split');try{el.releasePointerCapture(id);}catch{/* đã nhả */}try{localStorage.setItem('pvta.sidebarNavHeight',String(last));}catch{/* bỏ qua */}};
  document.body.classList.add('resizing-split');el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);window.addEventListener('blur',up);
 }
 /** Một dòng hội thoại ở thanh bên. Chat thường: biểu tượng hai gạch ngắn trên, một gạch dài dưới. Trong dự án: hình bình hành. */
 const chatRow=(c:Chat,inProject:boolean)=>renaming?.id===c.id?<form key={c.id} className="recent-rename" onSubmit={e=>{e.preventDefault();const t=renaming.value.trim();setRenaming(undefined);if(t&&t!==c.title)void rpc('renameChat',{chatId:c.id,title:t}).catch(report);}}><input autoFocus aria-label={uiText("Tên cuộc trò chuyện")} maxLength={150} value={renaming.value} onChange={e=>setRenaming({id:c.id,value:e.target.value})} onBlur={()=>setRenaming(undefined)} onKeyDown={e=>{if(e.key==='Escape')setRenaming(undefined);}}/></form>:<div key={c.id} className={`recent-row ${inProject?'in-project':''}`}><ChatActions chat={c} projects={state!.data.projects} variant="menu" report={report} onDone={r=>{if(c.id!==active)return;if(r.deleted){setActive('');setProject('');setHints([]);}else if(r.project!==undefined)setProject(r.project);}}><button title={uiText("{0} (nhấp đúp để đổi tên)",[c.title])} className={c.id===active?'active':''} onClick={()=>{setActive(c.id);setProject(c.projectId??'');setNav('chat');}} onDoubleClick={()=>setRenaming({id:c.id,value:c.title})}><i className={inProject?'glyph-para':'glyph-lines'} aria-hidden="true"/><span className="recent-title">{c.title}</span>{busy.has(c.id)&&<span className="tiny-dot"/>}{!inProject&&<small>{state?.data.projects.find(p=>p.id===c.projectId)?.name??uiText("Độc lập")}</small>}</button></ChatActions></div>;
 const sideProject=currentProject&&state?currentProject:undefined;
 /** Thanh kéo ngăn luôn có khi một dự án đang mở ở bảng Hội thoại/Lịch sử/Dự án, kể cả khi trang chính đang ở Quản lí dự án hay mục khác. */
 const splitOn=['chat','history','projects'].includes(sidePanel);
 const projectChats=sideProject&&state?state.data.chats.filter(c=>c.projectId===sideProject.id).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updatedAt-a.updatedAt):[];
 const projectShown=projectFilter.trim()?projectChats.filter(c=>c.title.toLocaleLowerCase('vi').includes(projectFilter.trim().toLocaleLowerCase('vi'))):projectChats;
 return <div className={`app with-activity-bar ${collapsed?'sidebar-collapsed':''} ${toolsOpen&&toolsPinned?'project-tools-docked':''} ${toolsExpanded?'project-tools-wide':''}`} style={{'--sidebar-w':`${currentSideW}px`} as React.CSSProperties}><LinkGuard report={report}/>
  <ActivityRail selected={sidePanel} collapsed={collapsed} reflect={pref?.reflect===true} reflecting={!!state?.learning?.reflect?.running} reflectNote={state?.learning?.reflect?.message} urgent={state?.urgency?.urgent===true} urgencyNote={state?.urgency?.note} onUrgency={()=>{const on=state?.urgency?.urgent!==true;void rpc('setUrgency',{on}).then(()=>notice(on?uiText("Cờ đỏ: việc gấp. Quy trình chạy song song theo CPU/RAM; tự về cờ xanh khi xong hoặc sau 30 phút, và không mở thêm bước khi áp lực RAM chạm mức vàng."):uiText("Đã về cờ xanh: chạy mặc định."))).catch(report);}} onReflect={()=>{const on=pref?.reflect!==true;void patch({reflect:on}).then(()=>notice(on?uiText("Não bộ đã sáng: model mặc định sẽ rút kinh nghiệm từ tiến trình và lưu bài học chờ duyệt trong Những điều đã học."):uiText("Đã tắt Não bộ."))).catch(report);}} onSettings={()=>setModal('settings')} onHome={()=>{setGithubVisible(false);setSidePanel('chat');setProject('');setActive('');setNav('chat');}} onSelect={key=>{const next=nextSidebarSelection(sidePanel,collapsed,key);setSidePanel(next.selected);setCollapsed(next.collapsed);setGithubVisible(key==='github'&&!next.collapsed);if(next.collapsed)return;if(key==='github')setGithubVisible(true);else if(key==='workflows')openWorkflows();else setNav(key==='projects'?(project?'chat':'projects'):key);}}/>
  <aside id="activity-panel" aria-label={uiText("Bảng chức năng")} aria-hidden={collapsed} className={`sidebar ${sideProject?'in-project':''}`}>
   <header className="sidebar-panel-heading"><button type="button" className="panel-home" title={uiText("Mở trang quản lí {0}",[(ACTIVITY_MENUS.find(([key])=>key===sidePanel)?.[2]??'').toLocaleLowerCase('vi')])} onClick={()=>openPanelHome(sidePanel)}><strong>{ACTIVITY_MENUS.find(([key])=>key===sidePanel)?.[2]}</strong><span aria-hidden="true">↗</span></button><button aria-label={uiText("Thu gọn bảng chức năng")} onClick={()=>setCollapsed(true)}>‹</button></header>
   {['chat','history','projects'].includes(sidePanel)&&<button className="new-chat" onClick={()=>void newChat().catch(report)}><Icon name="plus"/> {uiText("Chat mới độc lập")}<kbd>↵</kbd></button>}
   {['chat','history','projects'].includes(sidePanel)&&<button className="new-chat" onClick={()=>void openChatWindow().catch(report)}>{uiText("Mở cửa sổ chat mới")} ↗</button>}

   {sidePanel==='notebook'?<div className="sidebar-notebook"><NotebookSources c={notebook} split/></div>:contextualSide?<WorkspaceSidebar key={sidePanel} panel={sidePanel} state={state} toolsSection={toolsSection} pro={proTab} groupTab={groupTarget.tab}
    onOffice={request=>{setGithubVisible(false);setOfficeNavigation({...request});setNav('office');}}
    onSkill={request=>{setGithubVisible(false);setSkillNavigation({...request});setNav('skills');}}
    onPrompt={prompt=>{setGithubVisible(false);setNav('chat');setText(prompt);input.current?.focus();}}
    onTool={openTool} onTools={(section,target)=>{if(section==='groups'&&target)setGroupTarget({tab:target as typeof groupTarget.tab});openTools(section,section==='pro'?target as ProTab:undefined);}}/>:<div className={`sidebar-nav-pane ${splitOn?'split':''}`} style={splitOn?{height:navH}:undefined}><SidebarNav githubProject={currentProject} panelKey={sidePanel} state={state} nav={nav} active={active} project={project} githubVisible={githubVisible} newDocs={newDocsTotal}
    onNavigate={key=>{if(key==='github')setGithubVisible(true);else if(key==='workflows')openWorkflows();else setNav(key);}}
    onChat={(id,p)=>{setActive(id);setProject(p);setNav('chat');}}
    onProject={id=>{setProject(id);setActive('');setNav('chat');}}
    onProjectEdit={id=>{setProject(id);setModal('editProject');}} onProjectLearning={id=>{setProject(id);setModal('projectLearning');}} onProjectTools={id=>{setProject(id);setProjectTools(true);}} onProjectDeleted={id=>{if(id===project){setProject('');setActive('');}}} report={report}
    onWorkflow={openWorkflows}
    onGithub={operation=>{setGithubNavigation({operation});setGithubVisible(true);}}
    onSource={source=>{setNotebookNavigation({...source});setNav('notebook');}}/></div>}

   {splitOn?<>
    <div className="sidebar-split" role="separator" aria-orientation="horizontal" aria-label={uiText("Kéo để đổi chiều cao danh sách dự án (mũi tên lên/xuống, nhấp đúp để đặt lại)")} aria-valuemin={60} aria-valuemax={navMax()} aria-valuenow={navH} tabIndex={0}
     onPointerDown={startSplit} onDoubleClick={()=>applyNavH(220)}
     onKeyDown={e=>{const dy=e.key==='ArrowUp'?-24:e.key==='ArrowDown'?24:0;if(dy){e.preventDefault();applyNavH(navH+dy);}if(e.key==='Home'){e.preventDefault();applyNavH(220);}}}/>
    {sideProject&&<>
    <div className="sidebar-project"><div className="sidebar-project-head"><button type="button" className="sidebar-project-open" title={uiText("Mở trang dự án {0}",[sideProject.name])} onClick={()=>{setActive('');setNav('chat');}}><i className="glyph-para big" aria-hidden="true"/><strong>{sideProject.name}</strong></button><button title={uiText("Chat mới trong dự án")} aria-label={uiText("Chat mới trong dự án")} onClick={()=>void newChat(sideProject.id).catch(report)}>＋</button></div><button className="sidebar-project-back" onClick={()=>{setProject('');setActive('');setProjectFilter('');setNav('chat');}}>{uiText("‹ Tất cả hội thoại")}</button></div>
    <div className="sidebar-section"><span>{uiText("CHAT TRONG DỰ ÁN ·")} {projectChats.length}</span></div>
    {projectChats.length>6&&<input className="sidebar-filter" type="search" aria-label={uiText("Lọc chat trong dự án")} placeholder={uiText("Lọc chat trong dự án…")} value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}/>}
    <div className="recent-list project-tree">{projectShown.map(c=>chatRow(c,true))}{!projectChats.length&&<p className="muted small">{uiText("Dự án chưa có chat. Bấm ＋ để bắt đầu.")}</p>}{!!projectChats.length&&!projectShown.length&&<p className="muted small">{uiText("Không có chat nào khớp.")}</p>}</div>
    </>}
   </>:null}
   <div className="sidebar-bottom"><button type="button" className="avatar avatar-button" title={uiText("Hồ sơ cá nhân: tên, quy tắc và kỹ năng riêng")} aria-label={uiText("Mở hồ sơ cá nhân")} onClick={()=>setModal('profile')}>{userInitial(pref?.userName)}</button><div><strong>{displayName(pref?.userName,uiText("Không gian cá nhân"))}</strong></div><small className="sidebar-disclaimer">{uiText("PVTA có thể mắc lỗi. Thầy cô kiểm tra thông tin quan trọng.")}</small></div>
  </aside>
  <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label={uiText("Kéo để đổi độ rộng thanh bên (mũi tên trái/phải, nhấp đúp để đặt lại)")} aria-valuemin={180} aria-valuemax={sideMax} aria-valuenow={currentSideW} tabIndex={0} onPointerDown={startResize} onDoubleClick={()=>{setCurrentSideW(contextualSide?232:216);saveSide(contextualSide?232:216);}} onKeyDown={e=>{const d=e.key==="ArrowLeft"?-16:e.key==="ArrowRight"?16:0;if(d){e.preventDefault();const w=clampSide(currentSideW+d);setCurrentSideW(w);saveSide(w);}if(e.key==="Home"){e.preventDefault();setCurrentSideW(contextualSide?232:216);saveSide(contextualSide?232:216);}}}/>
  {toolsOpen&&!currentProject&&chat&&state&&<ChatToolsWindow state={state} chatId={chat.id} title={chat.title} pinned={toolsPinned} expanded={toolsExpanded} onPin={()=>setToolsPinned(v=>!v)} onExpand={()=>setToolsExpanded(v=>!v)} onClose={()=>{setToolsPinned(false);setProjectTools(false);}} onInsert={insertTool} onManage={k=>{if(k==='skills')setNav('skills');else if(k==='prompts')setModal('prompts');else{setRuleFocus(undefined);setModal('rules');}}}/>}
  {toolsOpen&&currentProject&&<aside className={`project-tools-window ${toolsExpanded?'expanded':''}`} role="region" aria-label={uiText("Quản lí dự án")}>
   <header><div><strong>{uiText("Quản lí dự án")}</strong><small>{currentProject?.name??uiText("Không gian làm việc")}</small></div><button className="project-pin" aria-pressed={toolsPinned} title={toolsPinned?uiText("Bỏ ghim để tự ẩn khi rời bảng"):uiText("Ghim bảng luôn hiển thị")} onClick={()=>setToolsPinned(v=>!v)}><Icon name="pin"/>{toolsPinned?uiText("Đã ghim"):uiText("Tự ẩn")}</button><button aria-label={toolsExpanded?uiText("Thu nhỏ bảng"):uiText("Mở rộng bảng")} onClick={()=>setToolsExpanded(v=>!v)}>{toolsExpanded?'↙':'↗'}</button><button aria-label={uiText("Đóng quản lí dự án")} onClick={()=>{setToolsPinned(false);setProjectTools(false);}}>{uiText("×")}</button></header>
   <div className="project-tools-groups">
    <section className="project-tools-actions project-group-chat"><h3><Icon name="chat"/>{uiText("Trò chuyện")}</h3>{currentProject&&<button onClick={()=>void newChat(currentProject.id).catch(report)}>{uiText("＋ Chat trong dự án")}</button>}<button onClick={()=>void newChat().catch(report)}>{uiText("Chat độc lập ↗")}</button>{!currentProject&&<button onClick={()=>setNav('projects')}>{uiText("Chọn hoặc tạo dự án")}</button>}</section>
    <section className="project-tools-actions project-group-files"><h3><Icon name="project"/>{uiText("Tài liệu & nơi lưu")}</h3>{currentProject&&<><button onClick={()=>void attach(undefined,'project')}>{uiText("＋ Tài liệu dự án")}</button><button onClick={()=>void attach(undefined,'project',true)}>{uiText("＋ Thư mục")}</button></>}{currentProject&&(currentProject.url||currentProject.outputDir)&&<button className="project-destination" title={currentProject.url??currentProject.outputDir} onClick={()=>{setProject(currentProject.id);setModal('editProject');}}>{uiText("Thư mục dự án:")} {currentProject.cloud?.name??currentProject.url??currentProject.outputDir} {uiText("· Chỉnh sửa")}</button>}{location&&<label className="project-destination">{uiText("Lưu tệp mới vào:")}<select aria-label={uiText("Thư mục lưu tệp mới")} value={location.dir} onChange={e=>void rpc('selectOutput',{chatId:active,dir:e.target.value}).catch(report)}>{location.choices.map(dir=><option key={dir} value={dir}>{dir}</option>)}</select></label>}{active&&<LinkedNotebooks compact scope="chat" id={active} ids={state?.data.chats.find(c=>c.id===active)?.notebookIds} report={report}/>}<small>{uiText("Kéo tệp đính kèm vào vùng tài liệu trong ngữ cảnh để sao chép vào dự án; chọn thư mục đích khi được hỏi.")}</small></section>
    {currentProject&&<section className="project-tools-actions project-group-rules"><h3><Icon name="project"/>{uiText("Quy tắc")}</h3><small>{uiText("Quy tắc riêng của dự án: “toàn cục” luôn áp dụng cho cả dự án, “cục bộ” chỉ chạy khi gọi bằng #tên.")}</small>
     <div className="project-tools-toolbar">
      <button type="button" className="primary btn-compact" title={uiText("Thêm quy tắc mới cho dự án")} onClick={()=>setAddingProjectRule(v=>!v)}>{addingProjectRule?uiText("Đóng form"):uiText("＋ Thêm quy tắc")}</button>
      <button type="button" className="btn-compact" title={uiText("Mở cửa sổ thêm quy tắc riêng")} onClick={()=>setModal('addProjectRule')}>{uiText("Cửa sổ thêm quy tắc")}</button>
      <button type="button" className="btn-compact" onClick={()=>{setProject(currentProject.id);setRuleFocus('project');setModal('rules');}}>{uiText("Quản lý quy tắc")}{currentProject.ruleBook?.length?` · ${currentProject.ruleBook.length}`:''}</button>
     </div>
     {addingProjectRule&&<form className="project-rule-add-form" onSubmit={e=>{
      e.preventDefault();
      if(!newRuleTitle.trim()||!newRuleText.trim())return;
      setSavingProjectRule(true);
      void rpc('saveRule',{rule:{title:newRuleTitle.trim(),text:newRuleText.trim(),always:newRuleAlways},scope:{kind:'project',id:currentProject.id}}).then(()=>{
       notice(uiText("Đã thêm quy tắc cho dự án."));
       setNewRuleTitle('');
       setNewRuleText('');
       setNewRuleAlways(false);
       setAddingProjectRule(false);
      }).catch(report).finally(()=>setSavingProjectRule(false));
     }}>
      <strong>{uiText("Thêm quy tắc mới cho dự án")}</strong>
      <label>{uiText("Tên quy tắc")}<input autoFocus required maxLength={80} value={newRuleTitle} onChange={e=>setNewRuleTitle(e.target.value)} placeholder={uiText("Ví dụ: Giọng văn gần gũi")}/></label>
      <label>{uiText("Nội dung")}<textarea required maxLength={20000} rows={4} value={newRuleText} onChange={e=>setNewRuleText(e.target.value)} placeholder={uiText("Điều PVTA cần tuân theo trong dự án này...")}/></label>
      <label className="checkbox-row"><input type="checkbox" checked={newRuleAlways} onChange={e=>setNewRuleAlways(e.target.checked)}/><span>{uiText("Toàn cục (áp dụng cho mọi chat trong dự án)")}</span></label>
      <div className="project-rule-add-actions">
       <button type="button" disabled={savingProjectRule} onClick={()=>setAddingProjectRule(false)}>{uiText("Hủy")}</button>
       <button type="button" disabled={savingProjectRule} onClick={()=>{setAddingProjectRule(false);setModal('addProjectRule');}}>{uiText("Mở cửa sổ thêm ↗")}</button>
       <button type="submit" className="primary" disabled={savingProjectRule||!newRuleTitle.trim()||!newRuleText.trim()}>{savingProjectRule?uiText("Đang lưu…"):uiText("Lưu quy tắc")}</button>
      </div>
     </form>}
    </section>}
    {currentProject&&<section className="project-tools-actions project-group-learning"><h3><Icon name="skills"/>{uiText("Học hỏi")}</h3><small>{uiText("Kế thừa cách viết, quy trình và lưu ý từ tài liệu cũ. Dùng số liệu mới trong tài liệu hiện tại.")}</small><button onClick={()=>{setProject(currentProject.id);setModal('projectLearning');}}>{uiText("Quản lí Học hỏi")} {currentProject.learning?.enabled===false?' · Đang tắt':''}</button></section>}
    {currentProject&&<section className="project-tools-actions project-group-activity"><h3><Icon name="activity"/>{uiText("Theo dõi")}</h3><button onClick={()=>setModal('summaries')}>{uiText("Tóm tắt chat")}</button><button onClick={()=>setNav('activity')}>{uiText("Nhật ký")}</button></section>}
   </div>
   <section className={`project-preview-pane ${previewOver?'context-drop-active':''}`} aria-label={uiText("Xem trước tệp đính kèm")} title={uiText("Kéo tệp vào đây để xem trước. Tệp không bị đính kèm hay sửa.")} onDragOver={e=>{const t=e.dataTransfer.types;if(t.includes(SOURCE_REF_TYPE)||t.includes('application/x-pvta-attachment')||t.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';setPreviewOver(true);}}} onDragLeave={()=>setPreviewOver(false)} onDrop={e=>{setPreviewOver(false);const id=e.dataTransfer.getData('application/x-pvta-attachment');const ref=e.dataTransfer.getData(SOURCE_REF_TYPE);if(!id&&!ref)return;e.preventDefault();e.stopPropagation();if(id&&files.some(f=>f.id===id)){setPreviewFile(id);setPreviewPath('');return;}try{const r=JSON.parse(ref) as {path?:string};if(r.path)previewDropped(r.path);else notice(uiText("Tệp của sổ nguồn chỉ xem được trong khung Xem nguồn."));}catch{report(new Error(uiText("Không đọc được tệp vừa kéo.")));}}}><header><Icon name="eye"/><strong>{uiText("Xem trước tài liệu")}</strong></header><select aria-label={uiText("Tệp trong dự án")} value={previewFile} onChange={e=>{setPreviewFile(e.target.value);setPreviewPath('');}}><option value="">{uiText("Chọn tệp để xem")}</option>{files.filter(f=>f.scope==='project').map(f=><option key={f.id} value={f.id}>{f.purpose==='learning'?'Học hỏi · ':''}{f.name}</option>)}</select>{previewPath?<PathPreview file={{name:previewPath.split(/[\\/]/).pop()||previewPath,path:previewPath}}/>:previewFile?<FilePreview file={files.find(f=>f.id===previewFile)} chatId={active}/>:<p className="project-preview-empty">{uiText("Chọn tài liệu dự án trong danh sách, hoặc kéo tệp vào đây để xem trước.")}</p>}</section>
  </aside>}<main className="main"><header className="topbar"><button className="sidebar-toggle" aria-label={collapsed?uiText("Mở bảng chức năng"):uiText("Thu gọn bảng chức năng")} title={collapsed?uiText("Mở bảng chức năng"):uiText("Thu gọn bảng chức năng")} onClick={()=>setCollapsed(v=>!v)}>☰</button><div className="breadcrumb">PVTA <span>/</span><strong>{title}</strong><RunningTasks state={state} busy={busy} report={report} onChat={id=>{const c=state?.data.chats.find(c=>c.id===id);setActive(id);setProject(c?.projectId??'');setNav('chat');setModal('');setGithubVisible(false);setOfficeEdit(null);setDraft(null);setPdfView(null);setTaskTarget(null);}} onWorkflow={openWorkflows}/>{state?.selfTip&&<SelfTip tip={state.selfTip} report={report} go={openSelfTip}/>}</div><div className="top-actions"><button className={`shot-btn ${shotWatch?'watching':''}`} title={shotWatch?uiText("Đang chờ ảnh chụp màn hình… bấm để hủy"):uiText("Chụp ảnh màn hình rồi tự đưa vào chat")} aria-label={uiText("Chụp ảnh màn hình")} aria-pressed={shotWatch} onClick={()=>{if(shotWatch){setShotWatch(false);return;}setShotWatch(true);notice(uiText("Đang theo dõi: hãy chụp màn hình (⌘⇧4 hoặc ⌘⇧5 trên Mac). Ảnh vừa chụp sẽ tự vào khung chat."));}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/></svg>{shotWatch&&<span>{uiText("Đang chờ…")}</span>}</button><button className={`shot-btn shot-keep ${shotKeep?'watching':''}`} title={shotKeep?uiText("Đang bật chụp liên tục: mọi ảnh chụp mới đều vào chat. Bấm để tắt."):uiText("Bật chụp liên tục: không cần bấm lại sau mỗi ảnh")} aria-label={uiText("Chụp liên tục")} aria-pressed={shotKeep} onClick={()=>{if(shotKeep){setShotKeep(false);setShotWatch(false);return;}setShotKeep(true);setShotWatch(true);notice(uiText("Đã bật chụp liên tục: mỗi ảnh chụp mới tự vào khung chat cho tới khi bạn bấm tắt."));}}>∞</button><button className="palette-quick-btn" title={uiText("Chuyển nhanh giao diện Sư phạm Hiện đại / Mực Tím Tinh Tế")} onClick={()=>void patch({palette:pref?.palette==='violet'?'paper':'violet'}).catch(report)}><Icon name="palette"/><span>{pref?.palette==='violet'?uiText("Mực Tím"):uiText("Hiện đại")}</span></button><span className="local-badge"><i/> {uiText("Dữ liệu trên máy")}</span><button title="Terminal trong PVTA" aria-label={uiText("Mở hoặc ẩn terminal")} aria-expanded={terminalVisible} onClick={()=>{setTerminalStarted(true);setTerminalVisible(v=>!v);}}><Icon name="terminal"/></button><button className="help-btn" title={uiText("Hướng dẫn sử dụng (F1)")} aria-label={uiText("Hướng dẫn sử dụng")} onClick={()=>setHelp('')}><Icon name="help"/></button><button className="project-tools-toggle" title={currentProject?uiText("Công cụ dự án"):uiText("Tiện ích của chat")} aria-label={currentProject?uiText("Công cụ dự án"):uiText("Tiện ích của chat")} aria-expanded={toolsOpen} onClick={()=>{if(!currentProject&&!chat){setProjectTools(false);notice(uiText("Chưa mở chat nào. Hãy mở hoặc tạo một chat để dùng tiện ích."));return;}setProjectTools(v=>!v);}}><Icon name="settings"/></button></div></header>
  <WorkflowPromptDock>
  {state?.refine.missedAt&&!state.refine.running&&hiddenMissed!==state.refine.missedAt&&<div className="notice" role="status">{uiText("Biên tập nền bỏ lỡ lịch")} {new Date(state.refine.missedAt).toLocaleString('vi-VN')}. <button onClick={()=>void rpc('catchUpRefine').then(()=>notice(uiText("Đã kết thúc lượt chạy bù; xem kết quả trong Biên tập nền."))).catch(report)}>{uiText("Chạy bù")}</button><button aria-label={uiText("Ẩn thông báo")} title={uiText("Ẩn thông báo")} onClick={()=>setHiddenMissed(state.refine.missedAt)}>{uiText("×")}</button></div>}
  {failedTasks(state?.data.chats??[]).filter(task=>!hiddenFailures.has(task.targetId)).map(task=><TaskFailureBanner key={task.targetId} task={task} onView={viewFailedTask} onDismiss={t=>setHiddenFailures(v=>new Set(v).add(t.targetId))}/>)}
   {!!state?.skillDiscovery?.suggestions.length&&hiddenSkills!==state.skillDiscovery.suggestions.length&&<div className="skill-suggestion-notice" role="status"><button onClick={()=>{setNav('skills');setSidePanel('skills');setCollapsed(false);}}>◇ {state.skillDiscovery.suggestions.length} {uiText("skill phù hợp đang chờ duyệt")}</button><button aria-label={uiText("Ẩn thông báo")} title={uiText("Ẩn thông báo")} onClick={()=>setHiddenSkills(state.skillDiscovery!.suggestions.length)}>{uiText("×")}</button></div>}<UpdateBanner busy={busy.size>0}/>
   {state&&nav==='chat'&&<BriefingStrip state={state} go={(t,group)=>{if(t==='backends'){setModal('settings');return;}setGroupTarget({tab:t==='documents'?'docs':t==='basis'?'basis':t==='proposals'?'learn':'groups',group});openTools('groups');}}/>}
   {error&&<div role="alert" className="error-banner">{error}<button aria-label={uiText("Đóng thông báo")} onClick={()=>setError('')}>{uiText("×")}</button></div>}
   {!state?<div className="loading"><img className="brand-mark pvta-logo" src={pvtaLogo} alt=""/><p>{uiText("Đang kết nối với lõi PVTA…")}</p><button onClick={()=>void rpc<ViewState>('init').then(setState).catch(report)}>{uiText("Kết nối lại")}</button></div>:
   state.license?.required&&!state.license.activated?<ActivationScreen state={state} report={report} onState={setState}/>:
   nav==='history'?<HistoryPanel state={state} report={report} onOpen={(id,p)=>{setActive(id);setProject(p);setNav('chat');}} onChanged={(id,p,deleted)=>{if(id===active){if(deleted){setActive('');setProject('');setHints([]);}else if(p!==undefined)setProject(p);}}}/>:
   nav==='projects'?<div className="workspace-panel"><div className="page-heading"><div><span className="eyebrow">{uiText("KHÔNG GIAN LÀM VIỆC")}</span><h1>{uiText("Dự án của thầy cô")}</h1><p>{uiText("Tập hợp tài liệu và hội thoại theo một chủ đề.")}</p></div><button className="primary" onClick={()=>setModal('project')}>{uiText("＋ Tạo dự án")}</button></div><div className="project-grid">{state.data.projects.map(p=><ProjectCard key={p.id} id={p.id} report={report} onDeleted={()=>{if(p.id===project){setProject('');setActive('');}}} name={p.name} rules={p.rules} chatCount={state.data.chats.filter(c=>c.projectId===p.id).length} onOpen={()=>{setProject(p.id);setActive('');setNav('chat');}} onLearning={()=>{setProject(p.id);setModal('projectLearning');}} onEdit={()=>{setProject(p.id);setModal('editProject');}}/>)}{!state.data.projects.length&&<div className="empty-card"><h3>{uiText("Một nơi cho mỗi công việc")}</h3><p>{uiText("Tạo dự án cho môn học, lớp hoặc kế hoạch giảng dạy. Chat mới nhận tóm tắt các cuộc chat cũ trong dự án.")}</p></div>}</div></div>:
   nav==='activity'?<ActivityPanel projects={state.data.projects} projectId={project} onResume={id=>{const c=state.data.chats.find(c=>c.id===id);if(!c){notice(uiText("Hội thoại này đã bị xóa."));return;}setActive(c.id);setProject(c.projectId??'');setNav('chat');}}/>:nav==='office'?<OfficePanel onNavigated={()=>setOfficeNavigation(undefined)} navigationRequest={officeNavigation} state={state} report={report} notice={notice} onUse={prompt=>{setNav('chat');setText(prompt);input.current?.focus();}}/>:
   nav==='workflows'?<WorkflowPanel state={state} report={report} notice={notice} onAutoCreate={()=>void startWorkflowDesign()} navigationRequest={workflowNavigation}/>:nav==='skills'?<SkillsPanel onNavigated={()=>setSkillNavigation(undefined)} navigationRequest={skillNavigation} state={state} report={report} notice={notice}/>:nav==='notebook'?<NotebookPanel state={state} controller={notebook} sourcesInSidebar report={report} notice={notice} openUrl={askOpenLink}/>:
   nav==='tools'?<ToolsHub state={state} report={report} notice={notice} section={toolsSection} onSection={setToolsSection} pro={proTab} onPro={setProTab} groupTarget={groupTarget} onTool={openTool} onPrompt={prompt=>{setNav('chat');setText(prompt);if(prompt.startsWith('[PVTA:EXAM:PLAN-PRO]'))setPlanningMode('pro');input.current?.focus();}} onWork={target=>{if(target==='math'){openTools('pro','math');return;}if(target==='workflows'){openWorkflows();return;}setNav('chat');setText(target);}}/>:
   <ChatLayout office={officeEdit?.chatId===active?officeEdit:null} onOfficeClose={()=>setOfficeEdit(null)} onOfficeAsk={s=>{setText(s);input.current?.focus();}} notice={notice} scope={active} pdf={pdfView&&pdfView.chatId===active?{key:`${pdfView.path}#${pdfView.rev}`,path:pdfView.path,name:pdfView.name,onClose:()=>setPdfView(null),onAsk:askPdf,onSaved:p=>void pdfSaved(p),notice,report,onRegion:data=>rpc('pdfRegion',{data}),onAskRegion:askRegion}:null}><Conversation scope={active} updateKey={`${chat?.messages.length}:${stream[active]??''}:${busy.has(active)}`} focusTarget={!!taskTarget} onDragOver={e=>{if(!('__TAURI_INTERNALS__' in window))e.preventDefault();}} onDrop={e=>{if(!('__TAURI_INTERNALS__' in window)){e.preventDefault();notice(uiText("Trong bản xem trên trình duyệt, dùng nút đính kèm và nhập đường dẫn. Kéo thả hoạt động trong ứng dụng desktop."));}}}>
    {!chat?.messages.length&&!(wfCall&&chat&&wfCall.chatId===chat.id)?<div className="welcome"><div className="welcome-symbol pvta-logo"><img src={pvtaLogo} alt="PVTA"/></div><span className="eyebrow">{uiText("KHÔNG GIAN LÀM VIỆC THÔNG MINH")} · v{state?.version}</span><h1>{currentProject?currentProject.name:<>{uiText("Ý tưởng của thầy cô.")}<br/><em>{uiText("Cùng PVTA thực hiện.")}</em></>}</h1><p>{currentProject?uiText("Trò chuyện với tài liệu và kiến thức của dự án."):uiText("Soạn bài, ra đề chuẩn GDPT 2018, trộn đề, rà soát văn bản và làm việc cùng tài liệu.")}</p>{home.features.length>0&&<div className="bento-suite-strip" aria-label={uiText("Tính năng sư phạm gợi ý cho dự án")}>{home.features.map(key=>{const f=TEACHER_FEATURES.find(x=>x.key===key)!;return <button key={f.key} type="button" className={`bento-feature-card tone-${f.tone}`} onClick={()=>openTools('pro',f.key)}><div className="bento-card-top"><span className={`bento-icon tone-${f.tone}`}><Icon name={f.icon}/></span><span className="bento-badge">{f.badge}</span></div><strong>{f.shortTitle}</strong><small>{f.desc}</small></button>;})}</div>}<div className="suggestion-grid">{home.prompts.map((p,i)=><button key={p.id} className="suggestion" onClick={()=>{setText(uiText(p.prompt));if(p.plan)setPlanMode(true);input.current?.focus();}}><span className={`suggestion-icon tone-${i}`}>{p.icon}</span><strong>{uiText(p.label)}</strong><small>{uiText(p.desc)}</small><span className="suggestion-arrow">↗</span></button>)}</div><div className="welcome-foot"><span>✓</span> {uiText("Thầy cô luôn duyệt trước khi PVTA ghi hoặc mở tệp.")}</div></div>:
    <div className="messages">{timeline(chat.messages,files.filter(a=>a.scope==='chat')).map(item=>item.kind==='files'?<ChatAttachments key={item.key} files={item.files} chatId={chat.id} userName={pref?.userName} report={report} onDraft={id=>void editDraft(id)} onProject={currentProject?id=>void copyToProject(id):undefined} onPdf={a=>void openPdf(a.path,'current',a.name)}/>:((m)=>{const assistantModelName=(m as any).model||resolveAssistantModelLabel(chatState,chat);return <article id={`message-${m.id}`} key={m.id} className={`message ${m.role} ${m.error?'message-error':''}`}><div className="message-avatar">{m.role==='user'?userInitial(pref?.userName):<i>P</i>}</div><MessageContent message={m} chatId={chat.id} notice={notice} report={report} projectName={currentProject?.name} onProjectSave={d=>void saveMessageToProject(d)}><div className="message-label">{m.role==='user'?<span>{displayName(pref?.userName,uiText("Thầy cô"))}</span>:<span>PVTA {assistantModelName&&<em className="message-model">{assistantModelName}</em>}</span>}<time>{new Date(m.at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</time></div><Markdown text={m.role==='assistant'?(hideProposalMark(visibleModelText(m.text)).trim()||(m.plan?uiText("Kế hoạch và quy trình đã sẵn sàng để thầy cô xem, sửa và duyệt."):uiText("Lượt trả lời này chứa lệnh công cụ chưa xử lý. Hãy gửi lại yêu cầu để PVTA thực hiện."))):m.text} chatId={chat.id}/>{m.role==='assistant'&&m.id===chat.messages.at(-1)?.id&&!busy.has(chat.id)&&pref?.access!=='read'&&(()=>{const proposal=splitProposal(visibleModelText(m.text)).proposal;return proposal?<ProposalBar summary={proposal} onAgree={()=>void send(uiText("Đồng ý. Hãy thực hiện đề nghị trên."),false,undefined,false,true)} onTalk={()=>input.current?.focus()}/>:null;})()}{m.planning&&<PlanningProgress run={m.planning}/>} {m.plan&&<PlanCard state={state} onWorkflow={openWorkflows} plan={m.plan} busy={busy.has(chat.id)} onRun={stepId=>executePlan(m.plan!,stepId)} report={report} notice={notice}/>} {m.actions?.map(a=><ActionCard key={a.id} action={a} report={report} notice={notice}/>)}{m.workflow&&<ChatWorkflowActions status={m.workflow.status} onOpen={()=>openWorkflows(m.workflow!.id)} onRetry={()=>void runWorkflowInChat(chat.id,{workflowId:m.workflow!.id,retry:true})}/>}</MessageContent></article>;})(item.message))}{stream[active]&&(()=>{const streamModelName=resolveAssistantModelLabel(chatState,chat);return <article className="message assistant streaming"><div className="message-avatar"><i>P</i></div><div className="message-content"><div className="message-label"><span>PVTA {streamModelName&&<em className="message-model">{streamModelName}</em>}</span></div><Markdown text={hideProposalMark(visibleModelText(stream[active]!,true))} chatId={chat.id}/></div></article>;})()}{busy.has(active)&&<RunProgress key={active} running entries={progress[active]??state.chatProgress?.[active]??[]}/>}{wfCall&&state&&wfCall.chatId===active&&<ChatWorkflowCard state={state} call={wfCall} onRun={args=>runWorkflowInChat(wfCall.chatId,args)} onCancel={()=>setWfCall(null)}/>}<div ref={end}/></div>}
   </Conversation>
   <div className="composer-area"><PromptQueue chat={chat} busy={busy.has(active)} onChange={(id,action)=>void rpc('changeQueuedPrompt',{chatId:active,id,action}).catch(report)}/>{chat?.workflowDesign&&<div className="wf-design-banner" role="region" aria-label={uiText("Thiết kế quy trình")}><div className="wf-design-actions"><strong>{uiText("Đầu ra của quy trình")}</strong>{chat.workflowDesign.workflowId?<button className="primary" onClick={()=>openWorkflows(chat.workflowDesign?.workflowId)}>{uiText("Xem quy trình")}</button>:<button className="primary" disabled={busy.has(active)||(!text.trim()&&!chat.messages.some(m=>m.role==='user'))} onClick={()=>void send(text.trim()||uiText("Làm ngay"),false,undefined,true)}>{busy.has(active)?uiText("Đang xử lý…"):uiText("Làm ngay")}</button>}</div><small>{chat.workflowDesign.workflowId?uiText("Đã tạo quy trình. Mở để xem và chỉnh sửa."):uiText("Mô tả đầu ra mong muốn; cùng PVTA góp ý, phản biện rồi xác nhận tạo quy trình.")}</small></div>}<SourceContext files={contextFiles} office={state.office} rag={!!pref?.rag} onOffice={()=>setNav('office')} chatId={active} projectId={currentProject?.id??''} notice={notice} report={report} onMessageDrop={currentProject?d=>void saveMessageToProject(d):undefined} onProjectDrop={currentProject? id=>void copyToProject(id):undefined}/>{attaching&&<div className="composer-note">{uiText("Đang đọc tài liệu…")}</div>}{files.some(a=>a.scope==='chat')&&<div className="file-chips">{files.filter(a=>a.scope==='chat').map(a=><AttachmentChip key={a.id} file={a} chatId={active} report={report} onDraft={()=>void editDraft(a.id)} onProject={currentProject?()=>void copyToProject(a.id):undefined} onPdf={()=>void openPdf(a.path,'current',a.name)}/>)}</div>}{hints.length>0&&<div className="hint-chips">{hints.map((h,i)=><span key={i}><button onClick={()=>{if(h.mode)void patch({mode:h.mode});if(h.prompt)setText(h.prompt);setHints(x=>x.filter((_,n)=>n!==i));}}>✦ {h.label}</button><button title={uiText("Bỏ gợi ý")} onClick={()=>setHints(x=>x.filter((_,n)=>n!==i))}>{uiText("×")}</button></span>)}</div>}
    {template&&!slotsHidden&&<SlotBar template={template} text={text} onPick={pickSlot} onClose={()=>setSlotsHidden(true)}/>}{template&&slotsHidden&&<button type="button" className="slot-show" onClick={()=>setSlotsHidden(false)}>{uiText("Hiện danh sách chỗ cần điền")}</button>}
    <div className={`composer ${planMode?'plan-composer':''}`}>
     <div className="composer-grip" role="separator" aria-orientation="horizontal" tabIndex={0} aria-label={uiText("Đổi chiều cao khung soạn. Kéo lên xuống, hoặc dùng phím mũi tên lên xuống; Home để đặt lại.")} title={uiText("Kéo để đổi chiều cao khung soạn · bấm đúp để đặt lại")} onPointerDown={startComposerResize} onDoubleClick={()=>resizeComposer(null)} onKeyDown={e=>{const h=input.current?.offsetHeight??120;if(e.key==='ArrowUp'){e.preventDefault();resizeComposer(h+(e.shiftKey?96:24));}else if(e.key==='ArrowDown'){e.preventDefault();resizeComposer(h-(e.shiftKey?96:24));}else if(e.key==='Home'||e.key==='Escape'){e.preventDefault();resizeComposer(null);}}}/>
     <div className="composer-md-toolbar" role="toolbar" aria-label={uiText("Công cụ soạn thảo Markdown")} onMouseDown={e=>e.preventDefault()}>
      <div className="md-tools-group">
       <button type="button" className="md-tool-btn" title={uiText("Chữ đậm (Ctrl+B)")} onClick={()=>insertMd('**','**')}><strong>B</strong></button>
       <button type="button" className="md-tool-btn" title={uiText("Chữ nghiêng (Ctrl+I)")} onClick={()=>insertMd('*','*')}><em>I</em></button>
       <button type="button" className="md-tool-btn" title={uiText("Gạch chân (<u>)")} onClick={()=>insertMd('<u>','</u>')}><u>U</u></button>
       <span className="md-tool-sep" aria-hidden="true"/>
       <button type="button" className="md-tool-btn" title={uiText("Chèn liên kết URL")} onClick={handleInsertLink}>Url</button>
       <button type="button" className="md-tool-btn" title={uiText("Danh sách gạch đầu dòng")} onClick={()=>handleInsertList(false)}>List</button>
       <button type="button" className="md-tool-btn" title={uiText("Danh sách đánh số")} onClick={()=>handleInsertList(true)}>Enum</button>
       <button type="button" className="md-tool-btn" title={uiText("Chèn bảng Markdown")} onClick={handleInsertTable}>Table</button>
       <button type="button" className="md-tool-btn" title={uiText("Chèn hình ảnh")} onClick={()=>void handleInsertImage()}>Image</button>
       <button type="button" className="md-tool-btn" title={uiText("Chèn liên kết tệp")} onClick={()=>void handleInsertFile()}>File</button>
       <span className="md-tool-sep" aria-hidden="true"/>
       <button type="button" className="md-tool-btn md-tool-section" title={uiText("Tách phân đoạn / Phase YAML (---)")} onClick={handleInsertSection}>Section</button>
      </div>
      {beautifying&&<span className="md-beautifying-indicator"><i className="md-spinner"/>{uiText("Đang tự động chuẩn hóa…")}</span>}
     </div>
     <div className="composer-input"><textarea ref={input} className={composerH?'resized':undefined} style={composerH?{height:composerH}:undefined} value={text} onDragOver={e=>{if(e.dataTransfer.types.includes(SOURCE_REF_TYPE)){e.preventDefault();e.dataTransfer.dropEffect='copy';}}} onDrop={e=>{const raw=e.dataTransfer.getData(SOURCE_REF_TYPE);if(!raw)return;e.preventDefault();try{const r=JSON.parse(raw) as {name:string;path:string};const el=e.currentTarget;const at=el.selectionStart??text.length;const tok=pathToken(r.path||r.name);const pre=text.slice(0,at),post=text.slice(el.selectionEnd??at);const lead=pre&&!/\s$/.test(pre)?' ':'';setText(pre+lead+tok+' '+post);}catch{/* dữ liệu kéo không hợp lệ: bỏ qua */}}} onPaste={handlePaste} onChange={e=>{const v=e.target.value;setText(v);setCaret(e.target.selectionStart);setSel(0);if(!detectTrigger(v,e.target.selectionStart))setDismissed(-1);}} onSelect={e=>setCaret(e.currentTarget.selectionStart)} aria-describedby={text?undefined:'composer-hint'} aria-expanded={menuOpen} placeholder={chat?.workflowDesign?uiText("Mô tả đầu ra hoặc trao đổi để hoàn thiện quy trình…"):planMode?uiText("Mô tả việc cần lập kế hoạch…"):uiText("Thầy cô muốn cùng PVTA làm gì hôm nay?")} aria-label={uiText("Nội dung tin nhắn")} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey){if(e.key==='b'||e.key==='B'){e.preventDefault();insertMd('**','**');return;}if(e.key==='i'||e.key==='I'){e.preventDefault();insertMd('*','*');return;}if(e.key==='u'||e.key==='U'){e.preventDefault();insertMd('<u>','</u>');return;}}if(menuOpen&&trig){if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(items.length){e.preventDefault();setSel((selIndex+(e.key==='ArrowDown'?1:items.length-1))%items.length);}return;}if((e.key==='Enter'&&!e.shiftKey||e.key==='Tab')&&items[selIndex]){e.preventDefault();pickItem(items[selIndex]!);return;}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDismissed(trig.start);return;}}if(e.key==='Tab'&&!e.shiftKey){const el=e.currentTarget;const h=nextPlaceholder(text,el.selectionEnd);if(h){e.preventDefault();el.setSelectionRange(h[0],h[1]);return;}}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(undefined,/làm đẹp/i.test(text));}}}/>{!text&&<ComposerHint/>}</div>{menuOpen&&trig&&<TriggerMenu char={trig.char} items={items} selected={selIndex} onPick={pickItem} onHover={setSel} onManage={manage} onClose={()=>setDismissed(trig.start)}/>}<div className="composer-toolbar"><div className="composer-left"><Tip name={uiText("Đính kèm tài liệu")} guide={uiText("Chọn tệp Word, Excel, PowerPoint, PDF, văn bản hoặc hình ảnh để PVTA đọc. Cũng kéo thả tệp vào cửa sổ được.")}><button type="button" aria-label={uiText("Đính kèm tài liệu")} onClick={()=>void attach()}><Icon name="attach"/></button></Tip><Tip name={uiText("Thêm thư mục")} guide={uiText("Chọn cả một thư mục tài liệu. Mặc định PVTA tạo dự án mới với tên gợi ý từ tên thư mục.")}><button type="button" aria-label={uiText("Thêm thư mục")} onClick={()=>void chooseFolder()}><Icon name="folder-add"/></button></Tip><span className="toolbar-divider"/>{(['@','/','#','$','$$'] as TriggerChar[]).map(c=><TriggerButton key={c} char={c} active={menuOpen&&trig?.char===c} onClick={()=>openTrigger(c)}/>)}<span className="toolbar-divider"/><ChatWorkflowButton state={state} onInsert={insertWorkflowName} onManage={()=>openWorkflows()}/><button className="mode-control" title={uiText("Chọn chế độ viết")} onClick={()=>setModal('writing')}><span>{BUILTIN_MODE_ICONS[pref?.mode as keyof typeof BUILTIN_MODE_ICONS]??'◇'}</span>{MODE_LABELS[pref?.mode??'standard']??state.modes.find(m=>m.id===pref?.mode)?.name??uiText("Chế độ viết")}<small>⌄</small></button><button className="optimize" disabled={!text.trim()||optimizing||attaching} title={optimizing?uiText("Đang đọc nguồn và soạn lời nhắc…"):uiText("Soạn lời nhắc từ hội thoại và tài liệu đã chọn")} onClick={()=>{setOptimizing(true);void ensureChat().then(chatId=>rpc<string>('optimize',{chatId,text})).then(setOptimization).catch(report).finally(()=>setOptimizing(false));}}><Icon name="spark"/></button></div><div className="composer-right"><AccessToggle value={pref?.access??'ask'} onChange={v=>void rpc('preferences',{patch:{access:v}}).catch(report)}/><PlanningControls mode={planningMode} time={planningTime} onMode={setPlanningMode} onTime={setPlanningTime} onApprove={()=>void approvePlanning()} approving={approving} onWorkflow={()=>openWorkflows([...chat?.messages??[]].reverse().find(m=>m.plan?.workflowId)?.plan?.workflowId??'')}/>{busy.has(active)&&<><select className="busy-send-mode" aria-label={uiText("Cách gửi khi AI đang xử lý")} value={busySendMode} onChange={e=>setBusySendMode(e.target.value as 'queue'|'steer')} title={uiText("Chen ngang: AI nhận bổ sung ở lượt gọi tiếp theo; thao tác đang chạy có thể cần hoàn tất trước.")}><option value="queue">{uiText("Xếp hàng")}</option><option value="steer">{uiText("Chen ngang")}</option></select><button className="send-button stop-button" aria-label={uiText("Dừng yêu cầu")} title={uiText("Dừng yêu cầu (Esc)")} onClick={()=>void rpc('cancel',{chatId:active}).catch(report)}><Icon name="stop"/></button></>}<button className="send-button" disabled={!text.trim()||submittingPrompt} aria-label={busy.has(active)?busySendMode==='queue'?uiText("Xếp hàng prompt"):uiText("Gửi bổ sung chen ngang"):uiText("Gửi tin nhắn")} title={busy.has(active)?busySendMode==='queue'?uiText("Xếp hàng prompt (Enter)"):uiText("Gửi bổ sung chen ngang (Enter)"):uiText("Gửi tin nhắn (Enter)")} onClick={()=>void send(undefined,/làm đẹp/i.test(text))}><Icon name="send"/></button></div></div></div>
    <ModelStatusBar state={chatState!} busy={busy.has(active)} onModel={()=>setModal('models')} onPatch={value=>void chatPatch(value).catch(report)}/>

   </div></ChatLayout>}
  <GitHubPanel projectUrl={currentProject?.url} navigationRequest={githubNavigation} visible={githubVisible} projectId={currentProject?.id} name={currentProject?.name} folder={currentProject?.outputDir??currentProject?.folders?.[0]} folders={currentProject?.folders} onClose={()=>setGithubVisible(false)}/>
  {terminalStarted&&<TerminalPanel visible={terminalVisible} cwd={currentProject?.folders?.[0]} onHide={()=>setTerminalVisible(false)} onClose={()=>{setTerminalStarted(false);setTerminalVisible(false);}}/>}
  </WorkflowPromptDock></main>{draft&&<MarkdownEditor draft={draft} onClose={()=>setDraft(null)} onSaved={path=>{setDraft(null);notice(uiText("Đã lưu và đính kèm: {0}",[path]));}}/>}
  {state&&folderPath&&<Modal title={uiText("Thêm thư mục")} onClose={()=>{if(!folderBusy)setFolderPath('');}}><FolderDialog path={folderPath} projectName={currentProject?.name} inProject={!!currentProject} busy={folderBusy} onCancel={()=>setFolderPath('')} onConfirm={(c,n)=>void confirmFolder(c,n)}/></Modal>}
  <HelpAssistant onRead={setHelp}/>
  {help!==null&&<React.Suspense fallback={null}><HelpPanel key={help} topic={help} onClose={()=>setHelp(null)}/></React.Suspense>}
  {toast&&<div role="status" className="toast">{toast}</div>}
  {optimization&&<Modal title={uiText("Đề xuất lời nhắc")} onClose={()=>setOptimization('')}><textarea className="editor" value={optimization} onChange={e=>setOptimization(e.target.value)}/><div className="modal-actions"><button onClick={()=>setOptimization('')}>{uiText("Bỏ qua")}</button><button className="primary" onClick={()=>{setText(optimization);setOptimization('');input.current?.focus();}}>{uiText("Dùng lời nhắc này")}</button></div></Modal>}
  {state&&modal&&<Modal title={{commandcode:uiText("Điều khiển CommandCode"),opencode:uiText("Quản lí OpenCode"),models:uiText("Chọn AI"),settings:uiText("Cài đặt PVTA"),writing:uiText("Chế độ viết"),project:uiText("Tạo dự án"),editProject:uiText("Chỉnh sửa dự án"),modes:uiText("Quản lý chế độ viết"),learned:uiText("Những điều PVTA đã học"),prompts:uiText("Quản lý prompt mẫu"),rules:uiText("Quản lý quy tắc"),skills:uiText("Quản lý kỹ năng"),addProjectRule:uiText("Thêm quy tắc mới"),profile:uiText("Hồ sơ cá nhân"),search:uiText("Tìm hội thoại"),summaries:uiText("Tóm tắt hội thoại trong dự án"),projectLearning:uiText("Học hỏi của dự án")}[modal]??'PVTA'} actions={modalActions} onClose={()=>setModal('')}>
   {modal==='models'?<ModelPicker state={chatState!} patch={chatPatch} setDefault={patch} hasChat={!!activeChat} report={report} close={()=>setModal('')} open={setModal}/>:
    modal==='opencode'?<OpenCodePanel state={state} patch={patch} notice={notice} close={()=>setModal('')}/>:modal==='commandcode'?<CommandCodePanel state={state} patch={patch} notice={notice} close={()=>setModal('')}/>:modal==='settings'?<Settings state={state} patch={patch} report={report} notice={notice} open={setModal} onResume={id=>{const c=state.data.chats.find(c=>c.id===id);if(c){setActive(id);setProject(c.projectId??'');setNav('chat');setModal('');}}}/>:
    modal==='writing'?<div className="mode-list">{[...Object.values(WRITING_MODES).map(m=>({...m,name:MODE_LABELS[m.id],hint:m.instructions.split('\n')[0]})),...state.modes].map(m=><button key={m.id} className={pref?.mode===m.id?'chosen':''} onClick={()=>void patch({mode:m.id}).then(()=>setModal('')).catch(report)}><strong>{BUILTIN_MODE_ICONS[m.id as keyof typeof BUILTIN_MODE_ICONS]??'◇'} {m.name}</strong><small>{m.hint||uiText("Văn phong gần gũi, phù hợp giảng dạy.")}</small></button>)}<button onClick={()=>setModal('modes')}>{uiText("⚙ Quản lý chế độ viết")}</button></div>:
    modal==='projectLearning'&&state.data.projects.find(p=>p.id===project)?<ProjectLearning key={project} project={state.data.projects.find(p=>p.id===project)!} files={state.data.attachments} report={report}/>:
    modal==='project'||modal==='editProject'?<ProjectEditor project={modal==='editProject'?state.data.projects.find(p=>p.id===project):undefined} notice={notice} onSave={async v=>{const id=await rpc<string>('saveProject',v);setProject(id);setActive('');setNav('chat');setModal('');}} onDelete={async id=>{await rpc('deleteProject',{id});setProject('');setModal('');}} report={report}/>:
    modal==='addProjectRule'&&currentProject?<AddRuleDialog scope={{kind:'project',id:currentProject.id}} onSaved={()=>{notice(uiText("Đã thêm quy tắc cho dự án."));setModal('');}} onCancel={()=>setModal('')} report={report}/>:
    modal==='prompts'?<PromptManager state={state} report={report} notice={notice} onActions={setModalActions}/>:
    modal==='rules'?<RuleCenter state={state} report={report} notice={notice} chatId={chat?.id} projectId={currentProject?.id} initial={ruleFocus} onActions={setModalActions}/>:
    modal==='skills'?<SkillsManagerModal state={state} report={report} notice={notice} onActions={setModalActions}/>:
    modal==='profile'?<ProfilePanel state={state} patch={patch} report={report} notice={notice} onSkill={request=>{setModal('');setGithubVisible(false);setSkillNavigation({...request});setNav('skills');}}/>:
    modal==='modes'?<ModeManager state={state} report={report} notice={notice}/>:
    modal==='learned'?<LearningPanel state={state} report={report}/> :
    modal==='summaries'?<div className="settings-section">{state.data.chats.filter(c=>c.projectId===currentProject?.id).map(c=><label key={c.id}>{c.title}<textarea className="editor compact" defaultValue={c.summary} placeholder={uiText("Chưa có tóm tắt. Được tạo nền sau khi trò chuyện.")} onBlur={e=>{if(e.target.value!==c.summary)void rpc('saveSummary',{chatId:c.id,summary:e.target.value}).catch(report);}}/></label>)}</div>:modal==='search'?<><input autoFocus value={filter} placeholder={uiText("Tìm theo tên hoặc nội dung…")} onChange={e=>setFilter(e.target.value)}/><div className="search-results">{state.data.chats.filter(c=>(c.title+' '+c.messages.map(m=>m.text).join(' ')).toLowerCase().includes(filter.toLowerCase())).map(c=><button key={c.id} onClick={()=>{setActive(c.id);setProject(c.projectId??'');setNav('chat');setModal('');}}>{c.title}<small>{c.summary.slice(0,100)}</small></button>)}</div></>:null}
  </Modal>}
 </div>;
}
export {Modal} from './Modal';



function ModelPicker({state,patch,setDefault,hasChat,report,close,open}:{state:ViewState;patch:(p:Partial<Preferences>)=>Promise<void>;setDefault:(p:Partial<Preferences>)=>Promise<void>;hasChat:boolean;report:(e:unknown)=>void;close:()=>void;open:(name:string)=>void}){
 const choice=state.data.preferences.choice;const [backend,setBackend]=useState<string>(choice==='auto'?'agy':choice.backend==='api'&&choice.model.startsWith('commandcode/')?'commandcode':choice.backend);const [model,setModel]=useState(choice==='auto'?'':choice.model);const [query,setQuery]=useState('');
 const caps=Object.fromEntries(state.backends.map(b=>[b.id,{installed:b.installed,efforts:b.efforts}]));
 const models=backend==='commandcode'?(state.api.find(a=>a.id==='commandcode')?.models??[]).map(m=>({id:`commandcode/${m.id}`,label:m.label??m.id,hint:'CommandCode'})):backend==='api'?state.api.filter(a=>a.id!=='commandcode').flatMap(a=>a.models.map(m=>({id:`${a.id}/${m.id}`,label:m.label??m.id,hint:a.label}))):modelsOf(state.catalog,backend as 'agy'|'claude'|'codex'|'opencode');
 const levels=effortsFor((backend==='commandcode'?'api':backend) as ModelChoice['backend'],model,caps as any,state.catalog);
 return <div className="model-picker"><button className={`auto-choice ${choice==='auto'?'chosen':''}`} onClick={()=>void patch({choice:'auto'}).then(close).catch(report)}><span>✦</span><div><strong>{uiText("Tự động chọn AI")}</strong><small>{uiText("Chọn agy, Claude, Codex, OpenCode hoặc CommandCode đã cấu hình; sau đó đến API khác.")}</small></div></button><div className="backend-tabs">{['agy','claude','codex','opencode','commandcode','api'].map(b=><button key={b} className={backend===b?'selected':''} onClick={()=>{setBackend(b);setModel('');setQuery('');}}>{b==='commandcode'?'CommandCode':b==='api'?uiText("API khác"):b==='agy'?'Gemini · agy':b==='claude'?'Claude':b==='opencode'?'OpenCode':'Codex'}</button>)}</div><div className="backend-status">{backend==='commandcode'?(state.api.find(a=>a.id==='commandcode')?.configured?uiText("Đã lưu khóa CommandCode"):uiText("Chưa cấu hình CommandCode")):backend==='api'?uiText("Chỉ gọi nhà cung cấp đã được thầy cô cấu hình."):state.backends.find(b=>b.id===backend)?.installed?'Đã cài · '+(state.backends.find(b=>b.id===backend)?.auth==='ready'?uiText("Đã đăng nhập"):state.backends.find(b=>b.id===backend)?.auth==='missing'?uiText("Chưa đăng nhập"):uiText("Trạng thái đăng nhập sẽ được xác nhận khi chạy")):uiText("Chưa cài — xem hướng dẫn trong Cài đặt.")}</div>{backend==='commandcode'&&<button onClick={()=>open('commandcode')}>{uiText("⚙ Điều khiển CommandCode")}</button>}{backend==='opencode'&&<button onClick={()=>open('opencode')}>{uiText("⚙ Quản lí OpenCode")}</button>}<input placeholder={uiText("Tìm model…")} value={query} onChange={e=>setQuery(e.target.value)}/><div className="model-list">{models.filter(m=>(m.label+' '+m.id).toLowerCase().includes(query.toLowerCase())).map(m=><button key={m.id} className={model===m.id?'chosen':''} onClick={()=>setModel(m.id)}><strong>{m.label}</strong><small>{m.id} {'hint' in m&&m.hint?' · '+m.hint:''}</small>{model===m.id&&<span>✓</span>}</button>)}</div><label>{uiText("Mã model khác")}<input value={model} onChange={e=>setModel(e.target.value)} placeholder={uiText("Tên chính xác do nhà cung cấp hỗ trợ")}/></label>{levels.length>0&&<label>{uiText("Mức suy nghĩ")}<select value={state.data.preferences.effort??''} onChange={e=>void patch({effort:(e.target.value||null) as Preferences['effort']}).catch(report)}><option value="">Theo model</option>{levels.map(e=><option key={e} value={e}>{e}</option>)}</select></label>}<div className="modal-actions"><button className="primary" disabled={!model.trim()||(backend==='commandcode'&&!state.api.find(a=>a.id==='commandcode')?.configured)} onClick={()=>void patch({choice:{backend:(backend==='commandcode'?'api':backend) as ModelChoice['backend'],model:backend==='commandcode'&&!model.trim().startsWith('commandcode/')?`commandcode/${model.trim()}`:model.trim()}}).then(close).catch(report)}>{hasChat?uiText("Dùng cho cửa sổ này"):uiText("Dùng model này")}</button>{hasChat&&<button disabled={!model.trim()||(backend==='commandcode'&&!state.api.find(a=>a.id==='commandcode')?.configured)} title={uiText("Cửa sổ chat mới sẽ bắt đầu bằng model này. Cửa sổ đang có model riêng không bị đổi.")} onClick={()=>void setDefault({choice:{backend:(backend==='commandcode'?'api':backend) as ModelChoice['backend'],model:backend==='commandcode'&&!model.trim().startsWith('commandcode/')?`commandcode/${model.trim()}`:model.trim()}}).then(close).catch(report)}>{uiText("Đặt làm mặc định")}</button>}</div></div>;
}
function Settings({state,patch,report,notice,open,onResume}:{onResume:(id:string)=>void;state:ViewState;patch:(p:Partial<Preferences>)=>Promise<void>;report:(e:unknown)=>void;notice:(s:string)=>void;open:(s:string)=>void}){
 const [tab,setTab]=useState(state.backends.some(b=>b.installed)||state.api.some(a=>a.configured)?'general':'backends');const pref=state.data.preferences;const [rules,setRules]=useState(pref.rules);const [provider,setProvider]=useState<ApiProvider>('openai');const [key,setKey]=useState('');const [base,setBase]=useState(state.api.find(a=>a.id==='openai')?.baseUrl??'');const [model,setModel]=useState('');const [models,setModels]=useState<{id:string;label?:string}[]>([]);const [loading,setLoading]=useState(false);
 async function fetchModels(){setLoading(true);try{setModels(await rpc('apiModels',{provider,key,baseUrl:base}));}catch(e){report(e);}finally{setLoading(false);}}

 return <><div className="settings-tabs">{[['general',uiText("Chung")],['appearance',uiText("Giao diện")],['backends',uiText("Công cụ AI")],['api',uiText("Khóa API")],['refine',uiText("Biên tập nền")],['license',uiText("Giấy phép & phản hồi")],['data',uiText("Dữ liệu & cập nhật")],['activity',uiText("Nhật ký")]].map(([id,label])=><button className={tab===id?'selected':''} key={id} onClick={()=>setTab(id!)}>{label}</button>)}</div>{tab==='general'?<div className="settings-section"><label>{pref.language==='en'?'Chat language':uiText("Ngôn ngữ Chat")}<select value={pref.language??'vi'} onChange={e=>{const language=e.target.value as 'vi'|'en';void patch({language}).then(()=>{localStorage.setItem('pvta.chat.language',language);location.reload();}).catch(report);}}><option value="vi">{uiText("Tiếng Việt")}</option><option value="en">English</option></select></label><label>{uiText("Cỡ chữ hội thoại ·")} {pref.fontSize}px<input type="range" min="12" max="24" value={pref.fontSize} onChange={e=>void patch({fontSize:Number(e.target.value)}).catch(report)}/></label>{[['learning',uiText("Tự học từ phản hồi"),uiText("AI nhẹ xử lý góp ý khi chat rảnh; xem trạng thái trong Nhật ký.")],['rag',uiText("Tra cứu tài liệu (RAG)"),uiText("Chỉ lấy các đoạn phù hợp, kèm vị trí nguồn.")]].map(([id,label,desc])=><label key={id} className="toggle-row"><div><strong>{label}</strong><small>{desc}</small></div><input type="checkbox" checked={pref[id as keyof Preferences]===true} onChange={e=>void patch({[id!]:e.target.checked}).catch(report)}/></label>)}<div className="row"><button onClick={()=>open('learned')}>{uiText("Những điều đã học")}</button><button onClick={()=>open('modes')}>{uiText("Chế độ viết")}</button><button onClick={()=>open('rules')}>{uiText("Quản lý quy tắc #")}</button><button onClick={()=>open('prompts')}>{uiText("Thư viện lời nhắc @")}</button></div><label>{uiText("Quy tắc chung (luôn áp dụng). Quy tắc đặt tên gọi bằng #")}<textarea className="editor compact" value={rules} onChange={e=>setRules(e.target.value)} placeholder={uiText("Những điều PVTA cần luôn tuân theo…")}/></label><StandardizeBox kind="rule" compact text={rules} onApply={r=>setRules(r.text)} report={report}/><button className="primary" onClick={()=>void patch({rules}).then(()=>notice(uiText("Đã lưu quy tắc."))).catch(report)}>{uiText("Lưu quy tắc")}</button></div>:
 tab==='activity'?<ActivityPanel projects={state.data.projects} onResume={onResume}/>:tab==='license'?<LicenseSettings state={state} report={report} notice={notice}/>:tab==='refine'?<RefineSettingsPanel state={state} patch={patch as any} report={report} notice={notice}/>:
 tab==='appearance'?<div className="settings-section"><AppearancePicker value={pref.palette} onChange={palette=>void patch({palette}).catch(report)}/><AppearanceOptions toolbarIconSize={pref.toolbarIconSize} fontFamily={pref.fontFamily} iconStyle={pref.iconStyle} onChange={value=>void patch(value).catch(report)}/></div>:
 tab==='backends'?<><McpSettings pref={pref} patch={patch} report={report} notice={notice}/><BackendSetup state={state} report={report} notice={notice} open={open}/></>:

 tab==='api'?<div className="settings-section"><label>{uiText("Điền nhanh")}<textarea autoComplete="off" className="quick-fill" placeholder={uiText("Dán đoạn curl, JSON, .env hoặc khóa API. Nội dung sẽ được xóa ngay sau khi tách.")} onChange={e=>{const v=e.target.value;if(!v)return;const parsed=parseQuickSetup(v);e.target.value='';if(parsed.provider){setProvider(parsed.provider);setBase(parsed.baseUrl??API_PROVIDERS[parsed.provider].baseUrl);}if(parsed.baseUrl)setBase(parsed.baseUrl);if(parsed.key)setKey(parsed.key);if(parsed.model)setModel(parsed.model);notice(uiText("Đã tách thông tin. Kiểm tra trước khi lưu."));}}/></label><label>{uiText("Nhà cung cấp")}<select value={provider} onChange={e=>{const p=e.target.value as ApiProvider;setProvider(p);setBase(state.api.find(a=>a.id===p)?.baseUrl??API_PROVIDERS[p].baseUrl);setKey('');setModel('');setModels(state.api.find(a=>a.id===p)?.models??[]);if(p==='commandcode'){setLoading(true);void rpc('apiModels',{provider:p,baseUrl:API_PROVIDERS[p].baseUrl}).then(setModels).catch(report).finally(()=>setLoading(false));}}}>{state.api.map(a=><option key={a.id} value={a.id}>{a.label}{a.configured?' · đã cấu hình':''}</option>)}</select></label><label>{uiText("Địa chỉ API")}<input value={base} readOnly={API_PROVIDERS[provider].fixedUrl} onChange={e=>setBase(e.target.value)}/></label><label>{uiText("Khóa API")}<input type="password" value={key} autoComplete="new-password" onChange={e=>setKey(e.target.value)} placeholder={state.api.find(a=>a.id===provider)?.configured?uiText("Đã lưu · để trống để giữ khóa tại đúng địa chỉ cũ"):uiText("Nhập khóa API")}/></label><button disabled={loading} onClick={()=>void fetchModels()}>{loading?uiText("Đang tải…"):uiText("Tải danh sách model từ nhà cung cấp")}</button><label>Model<select value={model} onChange={e=>setModel(e.target.value)}><option value="">{uiText("Chọn model…")}</option>{models.map(m=><option key={m.id} value={m.id}>{m.label??m.id}</option>)}</select><input value={model} onChange={e=>setModel(e.target.value)} placeholder={uiText("Hoặc nhập mã model")}/></label><button className="primary" onClick={()=>void rpc('saveApi',{provider,key,baseUrl:base,model,models}).then(()=>{setKey('');notice(uiText("Đã lưu API trên máy."));}).catch(report)}>{uiText("Lưu API")}</button><small className="muted">{uiText("Khóa được lưu trong tệp riêng tư và chỉ gửi tới nhà cung cấp tại địa chỉ đã lưu.")}</small></div>:
 <div className="settings-section"><label>{uiText("Thư mục dữ liệu")}<code className="file-path">{state.home}</code></label><div className="row"><button onClick={()=>void savePath('PVTA-sao-luu.zip').then(async p=>{if(p&&confirm(uiText("Xuất dữ liệu PVTA? Bản sao lưu chứa hội thoại và có thể chứa khóa API; hãy giữ riêng tư."))){await rpc('exportData',{path:p});notice(uiText("Đã xuất: {0}",[p]));}}).catch(report)}>{uiText("Xuất dữ liệu…")}</button><button onClick={()=>void chooseBackup().then(async p=>{if(p&&confirm(uiText("Khôi phục bản sao lưu? Dữ liệu hiện tại được giữ trong thư mục backups. Cần đóng rồi mở lại PVTA sau khi nhập."))){await rpc('importData',{path:p});notice(uiText("Đã khôi phục. Đóng và mở lại PVTA để dùng dữ liệu vừa nhập."));}}).catch(report)}>{uiText("Nhập dữ liệu…")}</button></div><hr/><h3>{uiText("Phiên bản")} {state.version}</h3><UpdateStatus/><hr/><h3>{uiText("Chia sẻ tri thức")}</h3><p className="muted">{uiText("Chỉ gửi các quy tắc tổng quát thầy cô tự chọn và duyệt. Tên học sinh, nội dung tài liệu và khóa API cần được xóa trước khi gửi.")}</p><button onClick={()=>void rpc('previewFeedback').then(preview=>{const body=prompt(uiText("Xem và sửa nội dung công khai trước khi gửi lên GitHub. Xóa mọi thông tin cá nhân:"),preview.body);if(body&&confirm(uiText("Gửi nội dung vừa duyệt lên GitHub công khai?")))void rpc('sendFeedback',{token:preview.token,body}).then(()=>notice(uiText("Đã gửi phản hồi lên GitHub."))).catch(report);}).catch(report)}>{uiText("Xem trước nội dung chia sẻ…")}</button><hr/><h3>{uiText("Hội thoại hiện tại")}</h3><p className="small muted">{uiText("Lịch sử và chỉ mục được lưu cục bộ bằng JSON. Dữ liệu gửi tới backend AI khi thầy cô dùng trong yêu cầu.")}</p></div>}</>;
}

function McpSettings({pref,patch,report,notice}:{pref:Preferences;patch:(p:Partial<Preferences>)=>Promise<void>;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const mcp=pref.mcp??{enabled:false,allowedTools:[]};const [tools,setTools]=useState(mcp.allowedTools.join('\n'));
 const save=(next:{enabled:boolean;allowedTools:string[]})=>patch({mcp:next} as Partial<Preferences>);
 const parse=()=>[...new Set(tools.split(/[\s,]+/).map(x=>x.trim()).filter(x=>/^mcp__[\w.-]+(__[\w.*-]+)?$/.test(x)))];
 return <div className="settings-section"><h3>{uiText("Kết nối công cụ ngoài (Google, Canva…)")}</h3>
  <label className="toggle-row"><div><strong>{uiText("Cho phép công cụ kết nối")}</strong><small>{uiText("Mặc định tắt. Khi bật, Claude Code được nạp các kết nối thầy cô đã tự thêm bằng")}<code>claude mcp add</code>{uiText(". PVTA không tự đăng nhập hay làm thay.")}</small></div><input type="checkbox" checked={mcp.enabled} onChange={e=>{const on=e.target.checked;if(on&&!confirm(uiText("Bật kết nối công cụ ngoài?\n\n• AI có thể gửi email, sửa lịch hoặc sửa tài liệu trên tài khoản đã kết nối nếu công cụ đó nằm trong danh sách cho phép.\n• Nội dung hội thoại có thể được gửi tới dịch vụ ngoài.\n• Không dùng với dữ liệu học sinh (tên, điểm, thông tin liên hệ).\n• Nên thử bằng tài khoản hoặc tài liệu thử trước.")))return;void save({enabled:on,allowedTools:mcp.allowedTools}).catch(report);}}/></label>
  <p className="muted">{uiText("Hiện chỉ áp dụng cho Claude Code. Codex và agy tự đọc cấu hình riêng của chúng; PVTA chưa giới hạn công cụ của hai CLI này và chưa kiểm chứng việc chúng gọi được kết nối khi chạy qua PVTA.")}</p>
  {mcp.enabled&&<><label>{uiText("Công cụ được phép (mỗi dòng một tên, dạng")}<code>{uiText("mcp__máy-chủ__công-cụ")}</code>)<textarea className="editor compact" value={tools} onChange={e=>setTools(e.target.value)} placeholder="mcp__google-drive__search_files"/></label>
  <p className="small muted">{uiText("Chỉ nên liệt kê công cụ đọc. Công cụ không có trong danh sách sẽ bị từ chối vì PVTA chạy không tương tác. Quyền ghi tệp trong thư mục làm việc không kéo theo quyền này. Dòng sai dạng sẽ bị bỏ.")}</p>
  <button className="primary" onClick={()=>{const list=parse();void save({enabled:true,allowedTools:list}).then(()=>{setTools(list.join('\n'));notice(uiText("Đã lưu {0} công cụ kết nối được phép.",[list.length]));}).catch(report);}}>{uiText("Lưu danh sách")}</button></>}
 </div>;
}
function ModeManager({state,report,notice}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void}){const [id,setId]=useState('');const [name,setName]=useState('');const [instructions,setInstructions]=useState('');const [icon,setIcon]=useState('◇');const [hint,setHint]=useState('');return <div className="settings-section"><label>{uiText("Chọn chế độ để sửa hoặc nhân bản")}<select value={id} onChange={e=>{const v=e.target.value;setId(v);const c=state.modes.find(m=>m.id===v);const b=WRITING_MODES[v as keyof typeof WRITING_MODES];setName(c?.name??MODE_LABELS[v]??'');setInstructions(c?.instructions??b?.instructions??'');setIcon(c?.icon??BUILTIN_MODE_ICONS[v as keyof typeof BUILTIN_MODE_ICONS]??'◇');setHint(c?.hint??'');}}><option value="">{uiText("＋ Tạo chế độ mới")}</option>{Object.values(WRITING_MODES).map(m=><option key={m.id} value={m.id}>{MODE_LABELS[m.id]} {uiText("· mặc định")}</option>)}{state.modes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>{uiText("Tên")}<input value={name} onChange={e=>setName(e.target.value)}/></label><div className="row"><label>{uiText("Biểu tượng")}<input value={icon} maxLength={8} onChange={e=>setIcon(e.target.value)}/></label><label>{uiText("Mô tả")}<input value={hint} onChange={e=>setHint(e.target.value)}/></label></div><label>{uiText("Chỉ dẫn")}<textarea className="editor" value={instructions} maxLength={4000} onChange={e=>setInstructions(e.target.value)}/></label><div className="row"><button className="primary" onClick={()=>void rpc('saveModes',{mode:{id:id.startsWith('c-')?id:undefined,name,icon,hint,instructions}}).then(()=>notice(uiText("Đã lưu chế độ riêng."))).catch(report)}>{uiText("Lưu chế độ riêng")}</button>{id&&<button onClick={()=>void rpc('saveModes',{mode:{name:uiText("{0} (bản sao)",[name]),icon,hint,instructions}}).then(()=>notice(uiText("Đã nhân bản chế độ."))).catch(report)}>{uiText("Nhân bản")}</button>}{id.startsWith('c-')&&<button className="danger" onClick={()=>{if(confirm(uiText("Xóa chế độ riêng này?")))void rpc('deleteMode',{id}).then(()=>{setId('');setName('');setInstructions('');}).catch(report);}}>{uiText("Xóa")}</button>}</div><p className="muted small">{uiText("Sửa chế độ mặc định sẽ tạo bản riêng; thầy cô luôn chọn lại được chế độ gốc.")}</p></div>;}


function SkillsPanel({state,report,notice,navigationRequest,onNavigated}:{onNavigated?:()=>void;navigationRequest?:SkillNavigation;state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const [tier,setTier]=useState<2|3|4>(3);const [guide,setGuide]=useState<{name:string;body:string}>();
 const [source,setSource]=useState('');const [scan,setScan]=useState<any>();const [loading,setLoading]=useState(false);const [selected,setSelected]=useState<string[]>([]);const [own,setOwn]=useState(false);const [name,setName]=useState('');const [body,setBody]=useState('');const [view,setView]=useState<any>();
 const [selectedName,setSelectedName]=useState<string>('');
 const skillsInTier=state.skills.filter(s=>(s.tier??4)===tier);
 const selectedSkill=skillsInTier.find(s=>s.name===selectedName)||skillsInTier[0];
 const protectedSkill=!selectedSkill||selectedSkill.tier===1||selectedSkill.tier===2||selectedSkill.name.startsWith('pvta-')||selectedSkill.name.startsWith('learned-');

 const handleAddSkill=()=>setOwn(true);
 const handleEditSkill=()=>{
  if(selectedSkill){
   if(protectedSkill)notice(uiText("Kỹ năng hệ thống hoặc tự học không thể sửa trực tiếp."));
   else setView({...selectedSkill,requestEdit:true});
  }else notice(uiText("Chưa chọn kỹ năng để sửa."));
 };
 const handleDeleteSkill=()=>{
  if(selectedSkill){
   if(protectedSkill)notice(uiText("Kỹ năng hệ thống hoặc tự học không thể xóa."));
   else if(confirm(uiText("Xóa skill {0}?",[selectedSkill.name]))){
    void rpc('deleteSkill',{name:selectedSkill.name}).then(()=>{
     notice(uiText("Đã xóa skill {0}.",[selectedSkill.name]));
     if(selectedName===selectedSkill.name)setSelectedName('');
    }).catch(report);
   }
  }else notice(uiText("Chưa chọn kỹ năng để xóa."));
 };

 const importedNames=state.skills.filter(s=>s.tier===3&&!s.guide).map(s=>s.name).join('|');
 useEffect(()=>{if(tier!==3||!importedNames)return;let stop=false;void(async()=>{for(const name of importedNames.split('|')){if(stop)break;try{await rpc('skillGuide',{name});}catch{break;}}})();return()=>{stop=true;};},[tier,importedNames]);
 const importInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!navigationRequest)return;onNavigated?.();setView(navigationRequest.name?state.skills.find(s=>s.name===navigationRequest.name):undefined);setOwn(!!navigationRequest.create);if(navigationRequest.import)importInput.current?.focus();},[navigationRequest]);

 return <div className="workspace-panel"><div className="page-heading"><div><span className="eyebrow">{uiText("QUY TRÌNH CHO CÔNG VIỆC")}</span><div className="title-with-actions"><h1>{uiText("Quản lý kỹ năng")}</h1><div className="heading-toolbar-actions"><button type="button" className="primary btn-compact" title={uiText("Viết kỹ năng mới")} onClick={handleAddSkill}>{uiText("＋ Thêm")}</button><button type="button" className="btn-compact" disabled={!selectedSkill||protectedSkill} title={uiText("Sửa kỹ năng đang chọn")} onClick={handleEditSkill}>{uiText("✎ Sửa")}</button><button type="button" className="danger btn-compact" disabled={!selectedSkill||protectedSkill} title={uiText("Xóa kỹ năng đang chọn")} onClick={handleDeleteSkill}>{uiText("🗑 Xóa")}</button></div></div><p>{uiText("Đã kèm các kỹ năng Office. Bật/tắt từng kỹ năng hoặc nhập thêm từ GitHub; gọi bằng /tên trong trò chuyện.")}</p></div><div className="row">{state.license?.admin&&<button onClick={()=>void rpc('systemSkills').then(rows=>setGuide({name:uiText("Skill hệ thống · chỉ đọc"),body:rows.map((s:any)=>`## ${s.name}\n${s.body}`).join('\n\n')})).catch(report)}>{uiText("Skill hệ thống")}</button>}<button onClick={handleAddSkill}>{uiText("＋ Tự viết skill")}</button></div></div>{tier===3&&<section className="card"><div className="row"><strong>{uiText("Đề xuất theo nhóm công việc")}</strong><button disabled={state.skillDiscovery?.running} onClick={()=>void rpc('discoverSkills',{force:true}).catch(report)}>{state.skillDiscovery?.running?uiText("Đang rà soát…"):uiText("Tìm skill phù hợp")}</button></div>{state.skillDiscovery?.error&&<p role="alert">{state.skillDiscovery.error}</p>}{state.skillDiscovery?.suggestions.map(s=><article key={s.id}><strong>{s.name}</strong><p>{s.reason}</p><small>{s.source}</small><div className="row"><button disabled={state.skillDiscovery?.running} onClick={()=>void rpc('reviewSkillSuggestion',{id:s.id,accept:true}).then(()=>notice(uiText("Đã tải skill sau khi duyệt."))).catch(report)}>{uiText("Đồng ý tải")}</button><button disabled={state.skillDiscovery?.running} onClick={()=>void rpc('reviewSkillSuggestion',{id:s.id,accept:false}).catch(report)}>{uiText("Bỏ qua")}</button></div></article>)}</section>}<div className="skill-import"><Icon name="skills"/><input ref={importInput} placeholder={uiText("Dán link GitHub của kho, thư mục hoặc SKILL.md…")} value={source} onChange={e=>setSource(e.target.value)}/><button className="primary" disabled={!source.trim()||loading} onClick={()=>{setLoading(true);void rpc('scanSkills',{source}).then(r=>{setScan(r);setSelected(r.items.filter((x:any)=>!x.problem).map((x:any)=>x.key));}).catch(report).finally(()=>setLoading(false));}}>{loading?uiText("Đang tải…"):uiText("Xem trước")}</button></div><div className="settings-tabs">{([[2,uiText("PVTA tự học")],[3,uiText("Từ GitHub")],[4,uiText("Tự tạo")]] as const).map(([id,label])=><button key={id} className={tier===id?'selected':''} onClick={()=>setTier(id)}>{label} · {state.skills.filter(s=>(s.tier??4)===id).length}</button>)}</div>{tier===2&&<p>{uiText("Skill tự học được sửa bởi Biên tập nền; duyệt bản đề xuất tại Những điều đã học.")}</p>}<div className="skills-grid">{state.skills.filter(s=>(s.tier??4)===tier).map(s=><SkillCard key={s.name} skill={s} selected={selectedSkill?.name===s.name} onSelect={()=>setSelectedName(s.name)} onGuide={s=>{setGuide({name:s.name,body:s.guide?.body??uiText("Đang soạn hướng dẫn tiếng Việt…")});if(!s.guide)void rpc('skillGuide',{name:s.name}).then(g=>setGuide({name:s.name,body:g.body})).catch(e=>{setGuide(undefined);report(e);});}} onView={setView} onEdit={s=>setView({...s,requestEdit:true})} report={report}/>)}{!state.skills.length&&<div className="empty-card"><h3>{uiText("Thêm kỹ năng đầu tiên")}</h3><p>{uiText("Dán link GitHub hoặc tự viết quy trình. Skill nhập về cần được xem trước và bật theo lựa chọn của thầy cô.")}</p></div>}</div>{scan&&<Modal title={uiText("Duyệt skill từ GitHub")} onClose={()=>setScan(undefined)}><p className="muted">{uiText("Chỉ tải SKILL.md, không chạy script đi kèm. Skill mới được lưu ở chế độ gọi thủ công bằng /tên.")}</p>{scan.items.map((s:any)=><article className="scan-item" key={s.key}><label className="checkbox-row"><input type="checkbox" checked={selected.includes(s.key)} disabled={!!s.problem} onChange={e=>setSelected(v=>e.target.checked?[...v,s.key]:v.filter(k=>k!==s.key))}/>{s.name}</label>{s.problem&&<p className="danger">{s.problem}</p>}<details><summary>{uiText("Xem toàn bộ nội dung")}</summary><pre>{s.md}</pre></details></article>)}<div className="modal-actions"><button className="primary" disabled={!selected.length} onClick={()=>void rpc('installSkills',{token:scan.token,keys:selected}).then(r=>{notice(uiText("Đã nhập {0} skill.",[r.installed.length]));setScan(undefined);}).catch(report)}>{uiText("Duyệt và lưu skill đã chọn")}</button></div></Modal>}{own&&<Modal title={uiText("Viết skill mới")} onClose={()=>setOwn(false)}><label>{uiText("Tên")}<input value={name} onChange={e=>setName(e.target.value)}/></label><label>{uiText("Nội dung SKILL.md")}<textarea className="editor" value={body} onChange={e=>setBody(e.target.value)}/></label><StandardizeBox kind="skill" text={body} title={name} defaultSource={uiText("Thầy cô viết")} onApply={r=>{setBody(r.text);if(r.title)setName(r.title);}} report={report}/><p className="muted small">{uiText("Khi lưu, PVTA tự sửa phần hình thức (tên, mô tả, dòng load, tên và thứ tự các mục) theo khuôn skill của PVTA; nội dung của thầy cô được giữ nguyên. Bấm «Chuẩn hóa» để xem trước đầy đủ.")}</p><button className="primary" onClick={()=>void rpc('createSkill',{name,text:body}).then(r=>{if(r.skipped.length)throw Error(r.skipped[0].reason);setOwn(false);const st=r.standardized;const first=st?.issues?.[0]?.message;notice(uiText("Đã lưu skill.{0}{1}",[st?.fixes?.length?uiText(" Tự chuẩn hóa {0} chỗ.",[st.fixes.length]):'',first?uiText(" Nên xem lại: {0}",[first]):'']));}).catch(report)}>{uiText("Lưu skill")}</button></Modal>}{guide&&<Modal title={uiText("Hướng dẫn · {0}",[guide.name])} onClose={()=>setGuide(undefined)}><Markdown text={guide.body}/></Modal>}{view&&<Modal title={view.name} onClose={()=>setView(undefined)}><SkillEditor key={`${view.name}-${!!view.requestEdit}`} name={view.name} requestEdit={!!view.requestEdit} report={report} notice={notice}/></Modal>}</div>;
}
