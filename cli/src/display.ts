import {stripVTControlCharacters} from 'node:util';

export const themes = {
  'bang-xanh': {name:'Bảng xanh', bg:'102b27', bg256:22, fg:'d6ebe5', accent:'38cdb0', muted:'8bb0a6'},
  'trang-vo': {name:'Trang vở', bg:'fffdf5', bg256:230, fg:'242638', accent:'1f907f', muted:'657d78'},
  'soan-bai': {name:'Soạn bài', bg:'1c2129', bg256:235, fg:'e1e7eb', accent:'edb52f', muted:'a0acb8'},
  'than-chi': {name:'Than chì', bg:'191c23', bg256:234, fg:'d6dbe3', accent:'a0b4d0', muted:'87919f'},
  'thanh-lich': {name:'Thanh lịch', bg:'25232d', bg256:60, fg:'ded9e4', accent:'b7aacb', muted:'9890a4'},
} as const;
export type Theme = keyof typeof themes;
export const modes = ['chat','code','markdown','write','plan','pro'] as const;
export type Mode = typeof modes[number];
export const labels:Record<Mode,string>={chat:'Hội thoại',code:'Lập trình viên',markdown:'Chỉnh Markdown',write:'Chế độ viết',plan:'Plan',pro:'Plan Pro'};
export function safe(text:string):string {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\t/g,'    ');
}
const segmenter=new Intl.Segmenter('vi',{granularity:'grapheme'});
export function cells(text:string):string[] {return Array.from(segmenter.segment(safe(text)),s=>s.segment);}
function cellWidth(s:string):number {return /\p{Extended_Pictographic}|[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(s)?2:1;}
export function width(s:string):number {return cells(s).reduce((n,c)=>n+cellWidth(c),0);}
export function fit(s:string,n:number):string {
  let out='',used=0;for(const c of cells(s)){const w=cellWidth(c);if(used+w>n)break;out+=c;used+=w;}return out+' '.repeat(Math.max(0,n-used));
}
export function wrap(text:string,n:number):string[] {
  n=Math.max(2,n);
  const out:string[]=[];
  for(const line of safe(text).split('\n')){
    let row='';
    for(const token of line.match(/\s+|\S+/gu)??[]){
      if(width(row+token)<=n){row+=token;continue;}
      if(row.trim()){out.push(row.trimEnd());row='';}
      if(/^\s+$/u.test(token))continue;
      for(const c of cells(token)){
        if(width(row+c)>n){out.push(row);row='';}
        row+=c;
      }
    }
    out.push(row.trimEnd());
  }
  return out;
}
export function markdown(text:string):string {
  return safe(text).replace(/^#{1,6} (.*)$/gm,'▸ $1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)');
}
export interface Turn {role:string;text:string;error?:boolean}
export interface Screen {theme:Theme;mode:Mode;title:string;access:string;left:string;right:string;input:string;status:string;offset:number;focus:number;messages?:Turn[];source?:boolean;preview?:boolean;navigation?:string;context?:string;plan?:string;journal?:string;review?:string;outline?:string;rightTitle?:string;menu?:{title:string;items:string[];selected:number}}
type Span={text:string;style?:'bold'|'code'|'heading'|'user'|'assistant'};
type RichRow=Span[];
// Parse only supported Markdown; all terminal escapes are removed before styling.
function richText(text:string,n:number):RichRow[]{
  const rows:RichRow[]=[];let fenced=false;
  for(const raw of safe(text).split('\n')){
    if(/^\s*```/.test(raw)){fenced=!fenced;rows.push([{text:fenced?'┌ '+(raw.trim().slice(3)||'Mã'):'└',style:'code'}]);continue;}
    const heading=/^#{1,6}\s+/.test(raw);
    const line=fenced?raw:raw.replace(/^#{1,6}\s+/,'▸ ').replace(/^(\s*)[-*] /,'$1• ').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)');
    const spans:Span[]=[];
    if(fenced)spans.push({text:line,style:'code'});
    else{
      const re=/\*\*([^*]+)\*\*|`([^`]+)`/g;let start=0;
      for(const match of line.matchAll(re)){
        spans.push({text:line.slice(start,match.index),style:heading?'heading':undefined});
        spans.push({text:match[1]??match[2]!,style:match[1]?'bold':'code'});start=match.index!+match[0].length;
      }
      spans.push({text:line.slice(start),style:heading?'heading':undefined});
    }
    const plain=spans.map(s=>s.text).join('');let cursor=0;
    for(const row of wrap(plain,n)){
      const start=plain.indexOf(row,cursor),end=start+row.length;let offset=0;
      rows.push(spans.flatMap(span=>{
        const from=Math.max(start,offset),to=Math.min(end,offset+span.text.length);offset+=span.text.length;
        return to>from?[{...span,text:span.text.slice(from-(offset-span.text.length),to-(offset-span.text.length))}]:[];
      }));cursor=end;
    }
  }
  return rows;
}
function color(hex:string,bg=false,fallback?:number){
  const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  if(/truecolor|24bit/i.test(process.env.COLORTERM??''))return `\x1b[${bg?48:38};2;${rgb.join(';')}m`;
  const [r,g,b]=rgb.map(v=>Math.round(v/255*5));
  const index=rgb.every(v=>v===rgb[0])?Math.max(232,Math.min(255,232+Math.round((rgb[0]!-8)/10))):16+36*r!+6*g!+b!;
  return `\x1b[${bg?48:38};5;${fallback??index}m`;
}
function syntax(text:string,base:string):string {
  return text.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|async|await|import|export|from|class|if|else|def|for|while|true|false|null|None)\b|\b\d+(?:\.\d+)?\b|\/\/.*$)/g,token=>color(/^['"]/.test(token)?'b8bd91':/^\d/.test(token)?'c6aa89':token.startsWith('//')?'88958b':'acb6d3')+token+color(base));
}
export function render(s:Screen,columns:number,rows:number,ansi=true):string {
  const w=Math.max(1,columns-1),h=Math.max(1,rows),t=themes[s.theme];
  const paint=(v:string,n:number,tone:string=t.fg,bg:string=t.bg,code=false)=>{
    const text=fit(v,n);return ansi?color(bg,true,bg===t.bg?t.bg256:undefined)+color(tone)+(code?syntax(text,tone):text)+'\x1b[0m':text;
  };
  if(w<24||h<10)return Array.from({length:h},(_,i)=>paint(i===0?'PVTA':i===h-1?'› '+s.input:s.status,w)).join('\r\n');
  const inner=w-2;
  const line=(v:string,tone:string=t.fg)=>paint('│',1,t.accent)+paint(' '+fit(v,inner-2)+' ',inner,tone)+paint('│',1,t.accent);
  const rule=(left='├',right='┤')=>paint(left+'─'.repeat(inner)+right,w,t.accent);
  const access=({read:'Chỉ đọc',ask:'Hỏi duyệt',full:'Tự sửa'} as Record<string,string>)[s.access]??s.access;
  const title=`PVTA · ${t.name} · ${s.title}`;
  const titleRow=s.theme==='trang-vo'?paint('│',1,t.accent)+paint(' '+fit(title,inner-2)+' ',inner,'ffffff',t.accent)+paint('│',1,t.accent):line(title,t.accent);
  const result=[rule('╭','╮'),titleRow,line(`${labels[s.mode]} · Quyền: ${access} · Tab đổi chế độ`,t.muted),rule()];
  type Pane={title:string;text:string;size:number;tail?:boolean;code?:boolean;messages?:Turn[];rich?:boolean};
  const notebook=s.theme==='trang-vo'&&s.mode==='chat';
  const planning=s.theme==='soan-bai'||s.mode==='plan'||s.mode==='pro';
  const editing=s.mode==='code'||s.mode==='markdown';
  const primary={title:s.source?'MÃ NGUỒN':planning?'BẢN NHÁP':'HỘI THOẠI',text:s.left,tail:!s.source,messages:s.source?undefined:s.messages,rich:!s.source};
  const secondary={title:s.rightTitle??(s.preview?'XEM TRƯỚC':s.mode==='code'?'MÃ / THAY ĐỔI':'CHI TIẾT'),text:s.right,code:s.mode==='code',rich:s.preview};
  let panes:Pane[];
  if(w>=110&&(notebook||planning)&&!editing){
    const side=Math.min(30,Math.floor((inner-2)*0.23));
    panes=[{title:planning?'KẾ HOẠCH':'DỰ ÁN / HỘI THOẠI',text:planning?s.plan??'Chưa có kế hoạch.':s.navigation??'',size:side},
      {...(s.focus&&s.right?secondary:primary),size:inner-2-side*2},
      {title:planning?'NHẬT KÝ':'NGUỒN / QUY TẮC',text:planning?s.journal??'Chưa có hoạt động.':s.context??'',size:side}];
  }else if(w>=90&&s.right.trim()){
    const left=Math.floor((inner-1)*(s.mode==='code'?0.44:0.5));
    panes=[{...primary,size:left},{...secondary,size:inner-1-left}];
  }else panes=[{...(s.focus&&s.right?secondary:primary),size:inner}];
  const details=h>=14?[s.review,s.mode==='markdown'&&s.outline?'Mục lục · '+s.outline:undefined].filter((v):v is string=>!!v):[];
  // Reserve space for status, framed composer and optional review/outline.
  const body=Math.max(0,h-10-details.length);
  const content=panes.map(p=>{
    const size=Math.max(1,p.size-2);
    const lines:RichRow[]=p.messages?.length?p.messages.flatMap((m,i)=>[
      ...(i?[[]]:[]),
      [{text:(m.role==='user'?'▌ THẦY CÔ':'◆ PVTA')+(m.error?' · LỖI':''),style:m.role==='user'?'user' as const:'assistant' as const}],
      ...richText(m.text,size),[],
    ]):p.rich?richText(p.text,size):wrap(p.text,size).map(text=>[{text}]);
    const start=p.tail?Math.max(0,lines.length-body-s.offset):Math.min(s.offset,Math.max(0,lines.length-body));
    return lines.slice(start,start+body);
  });
  const join=(parts:string[])=>paint('│',1,t.accent)+parts.join(paint('│',1,t.muted))+paint('│',1,t.accent);
  result.push(join(panes.map(p=>paint(' '+fit(p.title,p.size-2)+' ',p.size,t.accent))));
  for(let i=0;i<body;i++)result.push(join(panes.map((p,j)=>{
    const spans=content[j]?.[i]??[],value=spans.map(s=>s.text).join('');
    if(ansi&&spans.some(s=>s.style)){
      let remaining=p.size-2;
      const styled=spans.map(span=>{
        const text=fit(span.text,Math.min(remaining,width(span.text)));remaining-=width(text);
        const tone=span.style==='user'||span.style==='assistant'||span.style==='heading'?t.accent:span.style==='code'?t.muted:t.fg;
        return color(tone)+(span.style==='user'?'\x1b[7m':'')+(span.style==='bold'||span.style==='heading'||span.style==='user'||span.style==='assistant'?'\x1b[1m':span.style==='code'?'\x1b[4m':'')+text+'\x1b[22;24;27m';
      }).join('');
      return color(t.bg,true,t.bg256)+' '+styled+' '.repeat(Math.max(0,remaining))+' '+'\x1b[0m';
    }
    const diff=p.code&&/^[+-](?![+-])/.test(value??'');
    const bg=diff?(value!.startsWith('+')?'194b3c':'522632'):t.bg;
    return paint(' '+fit(value??'',p.size-2)+' ',p.size,diff?'ffffff':t.fg,bg,p.code&&!diff);
  })));
  if(s.menu&&body){
    const count=Math.min(8,Math.max(0,body-1)),start=Math.max(0,s.menu.selected-count+1);
    const items=s.menu.items.slice(start,start+count);
    const menuRows=[line(s.menu.title+' · ↑↓ chọn · Enter · Esc đóng',t.accent),...(items.length?items.map((v,i)=>{
      const selected=start+i===s.menu!.selected,text=(selected?'› ':'  ')+v;
      return ansi&&selected?paint('│',1,t.accent)+paint(' '+fit(text,inner-2)+' ',inner,t.bg,t.accent)+paint('│',1,t.accent):line(text);
    }):count?[line('Không có kết quả. Esc để quay lại.')]:[])];
    result.splice(result.length-menuRows.length,menuRows.length,...menuRows);
  }
  for(const detail of details)result.push(line(detail,t.accent));
  result.push(line(s.status,t.muted),rule(),line('› '+(s.input||'Nhập yêu cầu hoặc gõ / để chọn lệnh…')),rule('╰','╯'));
  const footer=s.mode==='markdown'?'/diff · /save duyệt · /undo · F2 đổi vùng':s.mode==='code'?'/diff · /test · /approve <id> · F2 đổi vùng':'/ lệnh · /help · F2 đổi vùng · PgUp/PgDn cuộn';
  result.push(paint(footer+' · Enter gửi · Ctrl+C dừng',w,t.muted));
  return result.slice(0,h).join('\r\n');
}
