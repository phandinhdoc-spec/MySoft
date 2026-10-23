import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {RpcRequest, RpcEvent, ViewState, Chat} from '../../core/src/desktop/types.js';
import {Draft,execute} from './files.js';
import {runScript} from './process.js';
import {themes,modes,labels,type Theme,type Mode,type Screen,type Turn} from './display.js';
import {modelGroups,currentModel,type Item} from './menu.js';

export interface Runtime {dispatch(req:RpcRequest):Promise<unknown>}
export const help=`PVTA CLI — lệnh thật
/theme bang-xanh | trang-vo | soan-bai | than-chi | thanh-lich
/mode chat | code | markdown | write | plan | pro
/access read | ask | full     /writing standard | academic | admin | creative | exact | concise
/gap [on | off]              cờ việc gấp: đỏ chạy Quy trình song song theo CPU/RAM
/models                     /model auto hoặc backend model (api:provider model)
/activate <email> <mã>       /connect (khởi tạo lại sau kích hoạt)
/new                        /chats             /chat <id>
/attach <đường dẫn>          /skills            /rules
/edit <tệp.md>              /replace <dòng> <nội dung mới>
/editor                    /code <tệp nguồn>  /browser (Markdown + Mermaid)
/diff                      /preview           /save (duyệt bản nháp)
/discard                   /undo              /toc
/actions                   /approve <id>      /decline <id>
/plans                     /run <id Plan>     /step <id Plan> <id bước>
/recovery <id Plan> <id bước> /stop
/test <tên script npm>      /typecheck         /build             /lint
/open <tệp>                /output <id>       /activity
/rpc <phương thức> <JSON> — công cụ lõi nâng cao, cùng quyền và kiểm định
/help                      /quit
Gõ #quy-tắc hoặc /tên-skill trong yêu cầu để gọi quy tắc/kỹ năng.
Terminal xem Markdown dạng chữ; ảnh, HTML, audio/video mở qua /open.
Plan tạo kế hoạch; /run mới chạy. /save ghi bản nháp sau khi xem /diff.`;

export class Session {
  picker?:{title:string;items:Item[]};
  openModels(group?:string){
    const groups=modelGroups(this.view),current=currentModel(this.view,this.chat());
    const selected=groups.find(g=>g.label===group);
    this.picker=selected?{title:group!,items:selected.items.map(i=>({...i,label:(i.value===current?'✓ ':'')+i.label}))}:{title:'Chọn nhà cung cấp → model'+(!groups.length?' · Chưa cấu hình backend/API trong Desktop':''),items:[{label:(current==='/model auto'?'✓ ':'')+'Tự động',detail:'Dùng lựa chọn tự động',value:'/model auto'},...groups.map(g=>({label:(g.items.some(i=>i.value===current)?'✓ ':'')+g.label,detail:g.items.length?'Chọn model':'Chưa có model — kiểm tra cấu hình API trong Desktop',value:'group:'+g.label}))]};
    this.changed();
  }
  theme:Theme='than-chi';mode:Mode='chat';view?:ViewState;chatId='';projectId='';
  transcript='';panel='';status='Sẵn sàng';busy=false;offset=0;focus=0;
  draft:Draft;private stream='';private localJob?:AbortController;private preview=false;
  constructor(private runtime:Runtime,readonly cwd:string,private configFile:string,private changed:()=>void,private editor?:(draft:Draft)=>Promise<void>,private browser?:(text:string)=>Promise<void>){this.draft=new Draft(cwd);}
  async rpc(method:string,params:Record<string,unknown>={}){return this.runtime.dispatch({id:crypto.randomUUID(),method,params});}
  event(e:RpcEvent){
    if(e.event==='state'){this.view=e.data as ViewState;this.sync();}
    if(e.event==='delta'){const d=e.data as {chatId:string;text:string};if(d.chatId===this.chatId){this.stream+=d.text;this.sync();}}
    if(e.event==='progress'&&e.data.chatId===this.chatId&&this.busy)this.status=e.data.entry.title+' · /stop để dừng';
    this.changed();
  }
  chat():Chat|undefined{return this.view?.data.chats.find(c=>c.id===this.chatId);}
  private sync(){
    this.transcript=(this.chat()?.messages??[]).map(m=>`${m.role==='user'?'THẦY CÔ':'PVTA'}${m.error?' · LỖI':''}\n${m.text}${m.actions?.length?'\nĐề xuất: '+m.actions.map(a=>`${a.id} · ${a.state} · ${a.path}`).join('\n'):''}${m.plan?'\nPlan: '+m.plan.id+' · '+m.plan.title:''}`).join('\n\n')+(this.stream?'\n\nPVTA · đang trả lời\n'+this.stream:'');
    if(this.mode==='pro'||this.mode==='plan'){
      const p=this.chat()?.messages.filter(m=>m.plan).at(-1)?.plan;
      if(p)this.panel=`${p.title}\nID: ${p.id}\n\n`+p.steps.map(s=>`${s.status} · ${s.goal}\n${s.output??s.error??s.task}\n${(s.logs??[]).slice(-3).map(l=>l.text).join('\n')}`).join('\n\n');
    }
  }
  async start(){
    try{const c=JSON.parse(await fs.readFile(this.configFile,'utf8'));if(c.theme in themes)this.theme=c.theme;}catch{/* lần đầu */}
    this.view=await this.rpc('init') as ViewState;
    this.panel='';
    try{await this.connect();}catch(e){this.panel=String(e)+'\n\nDùng /activate <email> <mã> nếu chưa kích hoạt, sau đó /connect.';}
  }
  async connect(){
    this.view=await this.rpc('init') as ViewState;
    // The current directory is explicitly the CLI workspace; attach it as a project root.
    const existing=this.view.data.projects.find(p=>p.folders?.includes(this.cwd));
    this.projectId=existing?.id??String(await this.rpc('saveProject',{name:path.basename(this.cwd),rules:''}));
    if(!existing)await this.rpc('projectAddFolders',{projectId:this.projectId,folders:[this.cwd]});
    this.chatId=String(await this.rpc('newChat',{projectId:this.projectId}));
    await this.rpc('preferences',{patch:{access:'ask'}});
    this.view=await this.rpc('view') as ViewState;this.sync();
  }
  close(){this.localJob?.abort();}
  screen(input:string):Screen{
    const data=this.view?.data,chat=this.chat(),project=data?.projects?.find(p=>p.id===this.projectId);
    const plan=chat?.messages.filter(m=>m.plan).at(-1)?.plan;
    const sources=(data?.attachments??[]).filter(a=>a.scopeId===this.chatId||a.scopeId===this.projectId);
    const rules=[...(data?.ruleBook??[]),...(project?.ruleBook??[]),...(chat?.ruleBook??[])];
    const progress=this.view?.chatProgress?.[this.chatId]??[];
    const pending=chat?.messages.flatMap(m=>m.actions??[]).filter(a=>a.state==='pending')??[];
    const editing=this.mode==='markdown'&&!!this.draft.file;
    const messages:Turn[]=(chat?.messages??[]).map(m=>({role:m.role,error:m.error?true:undefined,text:m.text+(m.actions?.length?'\n\nĐề xuất: '+m.actions.map(a=>`${a.id} · ${a.state} · ${a.path}`).join('\n'):'')+(m.plan?'\n\nPlan: '+m.plan.id+' · '+m.plan.title:'')}));
    if(this.stream)messages.push({role:'assistant',text:this.stream});
    return {theme:this.theme,mode:this.mode,title:chat?.title??'Terminal',access:data?.preferences.access??'ask',
      messages,source:editing,preview:this.preview,
      left:editing?this.draft.file+'\n\n'+this.draft.text.split('\n').map((l,i)=>`${i+1}  ${l}`).join('\n'):this.transcript||'Chào thầy cô.\n\nNhập yêu cầu để bắt đầu.\nGõ / để chọn lệnh, kỹ năng hoặc model.',
      right:this.panel,input,status:this.status,offset:this.offset,focus:this.focus,
      rightTitle:this.panel===help?'TRỢ GIÚP':undefined,
      navigation:['Dự án',project?.name??path.basename(this.cwd),'','Hội thoại',...(data?.chats??[]).filter(c=>c.projectId===this.projectId).map(c=>(c.id===this.chatId?'› ':'  ')+c.title),'','/chats để chọn hội thoại','/new để tạo mới'].join('\n'),
      context:['Nguồn',...sources.map(a=>a.name),...(project?.folders??[]),...(chat?.sourceFolders??[]),...(!sources.length&&!project?.folders?.length&&!chat?.sourceFolders?.length?['Chưa gắn nguồn.']:[]),'','Quy tắc',...rules.map(r=>'#'+r.key),...(project?.rules?[project.rules]:[]),...(!rules.length&&!project?.rules?['Chưa có quy tắc riêng.']:[]),'','/attach để thêm nguồn','/rules xem quy tắc'].join('\n'),
      plan:plan?[plan.title,'ID: '+plan.id,'',...plan.steps.map(s=>`${s.status} · ${s.goal}`),'','/run <id> chạy kế hoạch'].join('\n'):'Chưa có kế hoạch.\n\n/mode plan hoặc /mode pro\nđể lập kế hoạch.',
      journal:progress.length?progress.map(p=>`${p.state} · ${p.title}${p.detail?'\n'+p.detail:''}`).join('\n\n'):'Chưa có hoạt động.\n\n'+this.status,
      review:editing&&this.draft.text!==this.draft.original?'Bản nháp chưa lưu · /diff xem · /save duyệt · /discard bỏ':pending.length?`Chờ duyệt: ${pending[0]!.id} · /approve <id> · /decline <id>`:undefined,
      outline:editing?this.draft.text.split('\n').flatMap((l,i)=>/^#{1,6} /.test(l)?[`${i+1} ${l.replace(/^#+ /,'')}`]:[]).join(' · '):undefined};
  }
  private assertIdle(){if(this.busy)throw Error('Đang xử lý. /stop trước khi thay đổi phiên hoặc quyền.');}
  private writable(){if(this.view?.data.preferences.access==='read')throw Error('Đang Chỉ đọc. Đổi /access ask hoặc full trước.');}
  private async task(fn:()=>Promise<unknown>){
    this.assertIdle();this.busy=true;this.status='Đang xử lý… /stop để dừng';this.changed();
    try{return await fn();}finally{this.busy=false;this.stream='';this.sync();this.changed();}
  }
  async command(raw:string):Promise<void>{
    const input=raw.trim();if(!input)return;this.offset=0;
    const [cmd,...rest]=input.split(/\s+/),arg=rest.join(' ');
    let notice='';
    const output=(value:unknown,preview=false)=>{this.panel=typeof value==='string'?value:JSON.stringify(value,null,2);this.focus=1;this.preview=preview;};
    try{
      switch(cmd){
        case '/help':output(help);break;
        case '/activate':await this.rpc('license.activate',{email:rest[0],code:rest[1]});output('Đã kích hoạt. Dùng /connect để mở hội thoại.');break;
        case '/connect':this.assertIdle();await this.connect();break;
        case '/theme':{
          if(!arg){output(Object.entries(themes).map(([k,v])=>`${k} — ${v.name}`).join('\n'));break;}
          if(!(arg in themes))throw Error('Chủ đề không hợp lệ. /theme để xem danh sách.');
          this.theme=arg as Theme;if(this.configFile)await fs.writeFile(this.configFile,JSON.stringify({theme:this.theme}),{mode:0o600});break;
        }
        case '/mode':{
          this.assertIdle();if(!modes.includes(arg as Mode))throw Error('Chế độ: '+modes.join(', '));
          this.mode=arg as Mode;await this.rpc('preferences',{patch:{mode:this.mode==='code'?'developer':'standard'}});
          notice=`Đã chọn ${labels[this.mode]}.`;this.panel='';this.focus=0;break;
        }
        case '/writing':{
          this.assertIdle();if(!['standard','academic','admin','creative','exact','concise','accounting',...(this.view?.modes.map(m=>m.id)??[])].includes(arg))throw Error('Chế độ viết không hợp lệ.');
          this.mode='write';await this.rpc('preferences',{patch:{mode:arg}});break;
        }
        case '/gap':{
          if(arg&&!['on','off'].includes(arg))throw Error('Dùng /gap, /gap on hoặc /gap off.');
          const on=arg?arg==='on':this.view?.urgency?.urgent!==true;
          const v=await this.rpc('setUrgency',{on}) as {note?:string};output(v?.note??(on?'Cờ đỏ: việc gấp.':'Cờ xanh: chạy mặc định.'));break;
        }
        case '/access':this.assertIdle();if(!['read','ask','full'].includes(arg))throw Error('Quyền: read, ask, full.');await this.rpc('preferences',{patch:{access:arg}});break;
        case '/models':this.openModels();break;
        case '/model':{
          if(!arg){this.openModels();break;}
          this.assertIdle();const [backend,...model]=rest;const [b,provider]=String(backend).split(':');
          if(arg!=='auto'&&(!['agy','claude','codex','api'].includes(b!)||!model.length))throw Error('Dùng /model để chọn nhà cung cấp và model.');
          const choice=arg==='auto'?'auto':{backend:b,model:(provider?provider+'/':'')+model.join(' ')};
          await this.rpc('chatModel',{chatId:this.chatId,choice});
          if(this.chat())this.chat()!.choice=choice as Chat['choice'];
          notice='Đã chọn model: '+arg;this.panel='';this.focus=0;break;
        }
        case '/new':this.assertIdle();this.chatId=String(await this.rpc('newChat',{projectId:this.projectId}));this.sync();break;
        case '/chats':output(this.view?.data.chats.filter(c=>c.projectId===this.projectId).map(c=>`${c.id}  ${c.title}`).join('\n'));break;
        case '/chat':this.assertIdle();if(!this.view?.data.chats.some(c=>c.id===arg&&c.projectId===this.projectId))throw Error('Không tìm thấy hội thoại trong dự án này.');this.chatId=arg;this.sync();break;
        case '/attach':this.assertIdle();output(await this.rpc('attach',{chatId:this.chatId,paths:[await this.draft.resolve(arg)]}));break;
        case '/skills':output(this.view?.skills.map(s=>`/${s.name} — ${s.description}`).join('\n'));break;
        case '/rules':output({global:this.view?.data.ruleBook,project:this.view?.data.projects.find(p=>p.id===this.projectId)?.ruleBook,chat:this.chat()?.ruleBook});break;
        case '/edit':this.assertIdle();if(this.draft.text!==this.draft.original)throw Error('Bản nháp chưa lưu. /save hoặc /discard trước.');await this.draft.load(arg);this.mode='markdown';output(this.draft.text,true);break;
        case '/replace':this.assertIdle();this.writable();this.draft.replace(Number(rest[0]),rest.slice(1).join(' '));output(this.draft.text,true);break;
        case '/editor':this.assertIdle();this.writable();if(!this.draft.file||!this.editor)throw Error('Dùng /edit <tệp> trước.');await this.task(()=>this.editor!(this.draft));output(this.draft.text,true);break;
        case '/browser':if(!this.browser)throw Error('Bản chạy này chưa có trình xem trước.');await this.browser(this.draft.file?this.draft.text:this.chat()?.messages.at(-1)?.text??'');output('Đã mở bản xem trước trong trình duyệt.');break;
        case '/code':{const file=await this.draft.resolve(arg);if((await fs.stat(file)).size>1_000_000)throw Error('Tệp quá lớn.');this.mode='code';output(file+'\n'+(await fs.readFile(file,'utf8')).split('\n').map((l,i)=>`${i+1} ${l}`).join('\n'));break;}
        case '/preview':output(this.draft.text,true);break;
        case '/toc':output(this.draft.text.split('\n').flatMap((l,i)=>/^#{1,6} /.test(l)?[`${i+1}  ${l}`]:[]).join('\n'));break;
        case '/diff':
          if(this.mode==='markdown')output(this.draft.diff());
          else output((await execute('git',['diff','--no-ext-diff','--no-textconv','--'],{cwd:this.cwd,maxBuffer:2_000_000,timeout:15000})).stdout||'Không có diff được Git theo dõi.');break;
        case '/save':this.assertIdle();this.writable();await this.draft.save();output('Đã lưu '+this.draft.file+'; /undo để hoàn tác lần lưu này.');break;
        case '/discard':this.assertIdle();this.draft.text=this.draft.original;output(this.draft.diff());break;
        case '/undo':this.assertIdle();this.writable();await this.draft.undo();output('Đã hoàn tác lần lưu bản nháp.');break;
        case '/actions':output(this.chat()?.messages.flatMap(m=>m.actions??[]));break;
        case '/approve':this.writable();output(await this.rpc('approveAction',{id:this.action(arg)}));break;
        case '/decline':output(await this.rpc('declineAction',{id:this.action(arg)}));break;
        case '/output':output(await this.rpc('openOutput',{id:this.action(arg)}));break;
        case '/plans':output(this.chat()?.messages.flatMap(m=>m.plan?[m.plan]:[]));break;
        case '/run':case '/step':{
          this.writable();const plan=this.plan(rest[0]??'');
          await this.task(()=>this.rpc('runPlan',{id:plan.id,revision:plan.revision??0,...(cmd==='/step'?{stepId:rest[1]}:{})}));output('Đã kết thúc lượt chạy; /plans để xem kết quả từng khâu.');break;
        }
        case '/recovery':output(await this.rpc('inspectPlanRecovery',{id:this.plan(rest[0]??'').id,stepId:rest[1]}));break;
        case '/stop':this.localJob?.abort();output(await this.rpc('cancel',{chatId:this.chatId}));break;
        case '/test':case '/typecheck':case '/build':case '/lint':{
          this.writable();const script=cmd==='/test'?arg||'test':cmd.slice(1);const pkg=JSON.parse(await fs.readFile(path.join(this.cwd,'package.json'),'utf8'));
          if(!Object.hasOwn(pkg.scripts??{},script))throw Error('Không có script npm: '+script);
          output(await this.task(async()=>{this.localJob=new AbortController();try{return await runScript(script,this.cwd,this.localJob.signal);}finally{this.localJob=undefined;}}));break;
        }
        case '/open':await this.draft.open(arg);output('Đã yêu cầu hệ điều hành mở '+arg);break;
        case '/activity':output(await this.rpc('activity',{projectId:this.projectId}));break;
        case '/rpc':{
          this.assertIdle();const method=rest.shift();if(!method)throw Error('/rpc <phương thức> <JSON>');
          const params=JSON.parse(rest.join(' ')||'{}');if(!params||Array.isArray(params)||typeof params!=='object')throw Error('Tham số phải là đối tượng JSON.');
          output(await this.task(()=>this.rpc(method,params)));break;
        }
        default:{
          if(cmd?.startsWith('/')&&!this.view?.skills.some(s=>'/'+s.name===cmd))throw Error('Lệnh không rõ. /help hoặc /skills để xem lệnh.');
          this.stream='';await this.task(()=>this.rpc('send',{chatId:this.chatId,text:input,...(this.mode==='plan'||this.mode==='pro'?{planningMode:this.mode}: {})}));break;
        }
      }
      this.status=this.busy?'Đang xử lý…':notice||'Sẵn sàng';
    }catch(e){this.status='Lỗi — xem cột chi tiết';output(e instanceof Error?e.message:String(e));}
    this.changed();
  }
  private action(id:string){if(!this.chat()?.messages.some(m=>m.actions?.some(a=>a.id===id)))throw Error('Chọn ID đề xuất trong hội thoại hiện tại.');return id;}
  private plan(id:string){const p=this.chat()?.messages.find(m=>m.plan?.id===id)?.plan;if(!p)throw Error('Chọn ID Plan trong hội thoại hiện tại.');return p;}
}
