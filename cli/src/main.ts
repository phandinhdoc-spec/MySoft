import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {pvtaHome} from '../../core/src/paths.js';
import {Session,help} from './session.js';
import {render,cells,modes,themes,type Theme} from './display.js';
import {editExternal,previewBrowser} from './external.js';
import {suggestions,filterItems} from './menu.js';
import {TerminalInput,enterTerminal,leaveTerminal} from './terminal.js';

async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')||args.includes('-h')){process.stdout.write(help+'\n\nnode cli/dist/pvta.cjs [--cwd thư-mục] [--theme tên] [--color | --no-color] [--demo]\n--color: bật màu kể cả khi môi trường đặt NO_COLOR.\n');return;}
  const useColor=!args.includes('--no-color')&&(args.includes('--color')||process.env.NO_COLOR===undefined);
  const option=(name:string)=>{const i=args.indexOf(name);if(i<0)return undefined;const value=args[i+1];if(!value||value.startsWith('--'))throw Error('Thiếu giá trị '+name);return value;};
  const cwd=fs.realpathSync(path.resolve(option('--cwd')??process.cwd()));
  const theme=option('--theme');if(theme&&!(theme in themes))throw Error('Chủ đề không hợp lệ.');
  const demo=args.includes('--demo');
  if(!process.stdin.isTTY||!process.stdout.isTTY){
    if(demo){process.stdout.write(render({theme:(theme as Theme)||'than-chi',mode:theme==='trang-vo'||theme==='soan-bai'?'chat':'code',title:'Bản trình diễn',access:'read',left:'PVTA CLI\nĐây là màn hình mẫu, không gọi AI.\n\nNhập yêu cầu hoặc gõ / để chọn lệnh.',right:'DIFF MINH HỌA\n- const theme = "green";\n+ const theme = "than-chi";\n\nChưa chạy kiểm thử.',input:'',status:'DEMO · không ghi dữ liệu',offset:0,focus:0},120,30,false)+'\n');return;}
    throw Error('CLI tương tác cần Terminal TTY. Dùng --help hoặc --demo để xem qua pipe.');
  }
  let input='',cursor=0,history:string[]=[],historyIndex=0,session:Session|undefined;
  let menuIndex=0,menuDismissed=false;
  const menuItems=()=>session?.picker?filterItems(session.picker.items,input):menuDismissed?[]:suggestions(input,session?.view);
  let timer:ReturnType<typeof setTimeout>|undefined,closing=false,raw=false;
  let dispose=()=>{};
  const previews:string[]=[];
  const paint=()=>{
    if(closing||!session||!raw)return;
    const p=cells(input),limit=Math.max(8,(process.stdout.columns??100)-8);
    const shown=p.slice(Math.max(0,cursor-limit),cursor).join('')+'▏'+p.slice(cursor).join('');
    const screen=session.screen(shown),items=menuItems();
    if(!useColor)screen.status='Màu đang tắt · mở lại với --color để xem theme · '+screen.status;
    menuIndex=Math.max(0,Math.min(menuIndex,items.length-1));
    if(items.length||session.picker)screen.menu={title:session.picker?.title??'Lệnh và kỹ năng',items:items.map(i=>i.label+' — '+i.detail),selected:menuIndex};
    process.stdout.write('\x1b[?25l\x1b[H'+render(screen,process.stdout.columns??100,process.stdout.rows??30,useColor)+'\x1b[J');
  };
  const changed=()=>{if(!timer)timer=setTimeout(()=>{timer=undefined;paint();},40);};
  const terminalInput=new TerminalInput(up=>{
    if(!session||closing||!raw)return;
    const items=menuItems();
    if(items.length)menuIndex=Math.max(0,Math.min(items.length-1,menuIndex+(up?-1:1)));
    else session.offset=Math.max(0,session.offset+(up?3:-3));
    changed();
  });
  const cleanup=()=>{
    if(closing)return;closing=true;if(timer)clearTimeout(timer);session?.close();dispose();
    terminalInput.reset();
    if(raw){process.stdin.setRawMode(false);process.stdout.write(leaveTerminal);}
    for(const dir of previews)try{fs.rmSync(dir,{recursive:true,force:true});}catch{}
  };
  process.on('exit',cleanup);
  process.on('SIGTERM',()=>{cleanup();process.exit(0);});
  process.on('SIGINT',()=>{cleanup();process.exit(0);});
  try{
    if(demo){
      session=new Session({dispatch:async()=>undefined},cwd,'',changed);session.theme=(theme as Theme)||'than-chi';session.mode=theme==='trang-vo'||theme==='soan-bai'?'chat':'code';session.transcript='BẢN TRÌNH DIỄN — không gọi AI, không ghi tệp\n\nNhập yêu cầu hoặc gõ / để chọn lệnh.';session.panel=session.mode==='code'?'DIFF MINH HỌA\n- theme: green\n+ theme: than-chi\n\nChưa chạy kiểm thử.':'';
    }else{
      const home=pvtaHome();fs.mkdirSync(home,{recursive:true,mode:0o700});
      // Import only for live sessions: --help/--demo never initialize the runtime.
      const {DesktopRuntime}=await import('../../core/src/desktop/runtime.js');
      const {PvtaDaemon}=await import('../../core/src/desktop/daemon.js');
      // CLI nối vào lõi đang chạy (Desktop hoặc CLI khác); nếu chưa có thì tự làm lõi. Xem core/src/desktop/daemon.ts.
      const daemon=new PvtaDaemon({home,createRuntime:emit=>new DesktopRuntime(emit,home),onEvent:e=>session?.event(e)});
      dispose=()=>daemon.close();
      session=new Session({dispatch:req=>daemon.invoke(req)},cwd,path.join(home,'cli-settings.json'),changed,
        draft=>editExternal(draft,()=>{raw=false;terminalInput.reset();process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write(leaveTerminal);},()=>{raw=true;process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write(enterTerminal);changed();}),
        async text=>{previews.push(await previewBrowser(text,__dirname));});
      await session.start();if(theme)session.theme=theme as Theme;
    }
    raw=true;process.stdout.write(enterTerminal);process.stdin.setRawMode(true);readline.emitKeypressEvents(terminalInput.keys);process.stdin.on('data',data=>{if(raw)terminalInput.feed(data);});process.stdin.resume();
    process.stdout.on('resize',changed);
    process.stdin.on('end',()=>{cleanup();process.exit(0);});
    terminalInput.keys.on('keypress',(str:string,key:readline.Key)=>{
      if(!session||closing||!raw)return;
      if(key.ctrl&&key.name==='d'){cleanup();process.exit(0);}
      if(key.ctrl&&key.name==='c'){session.picker=undefined;if(session.busy)void session.command('/stop');else{input='';cursor=0;}changed();return;}
      if(key.name==='escape'){session.picker=undefined;menuDismissed=true;input='';cursor=0;changed();return;}
      const items=menuItems();
      if(items.length&&(key.name==='up'||key.name==='down')){menuIndex=(menuIndex+(key.name==='up'?-1:1)+items.length)%items.length;changed();return;}
      if((items.length||session.picker)&&(key.name==='return'||key.name==='tab')){
        const item=items[menuIndex];if(!item)return;
        if(item.value.startsWith('group:')){session.openModels(item.value.slice(6));input='';cursor=0;menuIndex=0;changed();return;}
        session.picker=undefined;input=item.value;cursor=cells(input).length;menuIndex=0;
        if(item.complete||key.name==='tab'){menuDismissed=true;changed();return;}
      }
      if(key.name==='pageup'){session.offset+=10;changed();return;}
      if(key.name==='pagedown'){session.offset=Math.max(0,session.offset-10);changed();return;}
      if(key.name==='f2'){session.focus=1-session.focus;changed();return;}
      if(key.name==='tab'){const next=modes[(modes.indexOf(session.mode)+1)%modes.length]!;if(demo)session.mode=next;else void session.command('/mode '+next);changed();return;}
      if(key.name==='return'){
        const text=input;input='';cursor=0;if(!text.startsWith('/activate ')&&!text.startsWith('/rpc '))history.push(text);historyIndex=history.length;
        menuIndex=0;menuDismissed=false;
        if(text.trim()==='/quit'){cleanup();process.exit(0);}
        if(text.trim()==='/theme'){session.picker={title:'Chọn chủ đề',items:Object.entries(themes).map(([id,t])=>({label:t.name,detail:id,value:'/theme '+id}))};changed();return;}
        if(demo){if(/^\/(theme|models|model|help)(\s|$)/.test(text))void session.command(text);else session.status='DEMO : /theme, /models, Tab, /quit';changed();}
        else void session.command(text);return;
      }
      const parts=cells(input);
      if(key.name==='left')cursor=Math.max(0,cursor-1);
      else if(key.name==='right')cursor=Math.min(parts.length,cursor+1);
      else if(key.name==='home'||key.ctrl&&key.name==='a')cursor=0;
      else if(key.name==='end'||key.ctrl&&key.name==='e')cursor=parts.length;
      else if(key.name==='up'||key.name==='down'){historyIndex=Math.max(0,Math.min(history.length,historyIndex+(key.name==='up'?-1:1)));input=history[historyIndex]??'';cursor=cells(input).length;}
      else if(key.name==='backspace'){if(cursor){parts.splice(--cursor,1);input=parts.join('');}}
      else if(key.name==='delete'){parts.splice(cursor,1);input=parts.join('');}
      else if(key.ctrl&&key.name==='u'){input='';cursor=0;}
      else if(str&&!key.ctrl&&!key.meta){const insert=cells(str).filter(c=>c!=='\n'&&c!=='\r');parts.splice(cursor,0,...insert);input=parts.join('');cursor+=insert.length;}
      menuIndex=0;menuDismissed=false;
      changed();
    });paint();
  }catch(e){cleanup();throw e;}
}
void main().catch(e=>{process.stderr.write('PVTA: '+(e instanceof Error?e.message:String(e))+'\n');process.exitCode=1;});
