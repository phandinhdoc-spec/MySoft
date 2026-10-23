import {expect,it,vi} from 'vitest';
import {render,themes,width,wrap,safe,type Screen} from '../src/display.js';
import {Session,help} from '../src/session.js';
import type {ViewState} from '../../core/src/desktop/types.js';

const screen:Screen={theme:'trang-vo',mode:'chat',title:'Phiếu ôn tập',access:'ask',left:'THẦY CÔ\nSoạn phiếu ôn tập.',right:'',input:'',status:'Sẵn sàng',offset:0,focus:0,navigation:'KHTN 8',context:'Nguồn\nBài học.md'};
it('notebook preserves the three-pane hierarchy and keeps help out of the welcome screen',()=>{
  const text=render(screen,140,30,false);
  expect(text).toContain('DỰ ÁN / HỘI THOẠI');expect(text).toContain('NGUỒN / QUY TẮC');
  expect(text).toContain('KHTN 8');expect(text).toContain('Bài học.md');
  expect(text).not.toContain('/activate');expect(text).toContain('Nhập yêu cầu');
});
it('all modes, themes, sizes and menu states preserve terminal bounds and the input row',()=>{
  for(const theme of Object.keys(themes) as Screen['theme'][])for(const mode of ['chat','code','markdown','write','plan','pro'] as const)
    for(const cols of [24,40,89,90,109,110,140,222])for(const rows of [10,12,24,60])for(const menu of [undefined,{title:'Chọn lệnh',items:['/help','/models'],selected:1}]){
      const text=render({...screen,theme,mode,menu,input:'con trỏ',review:'Chờ duyệt',outline:'1 Mở đầu'},cols,rows,false),lines=text.split('\r\n');
      expect(lines).toHaveLength(rows);expect(lines.every(l=>width(l)===cols-1)).toBe(true);expect(text).toContain('con trỏ');
    }
});
it('a command result remains readable in a narrow viewport and F2 restores conversation',()=>{
  expect(render({...screen,right:help,focus:1},50,24,false)).toContain('PVTA CLI');
  expect(render({...screen,right:help,focus:0},50,24,false)).toContain('Soạn phiếu');
});
it('session supplies scoped real context, numbered Markdown, and ignores unrelated progress',async()=>{
  const s=new Session({dispatch:vi.fn()},process.cwd(),'',()=>{});s.chatId='c';s.projectId='p';
  s.view={data:{preferences:{access:'ask'},projects:[{id:'p',name:'KHTN',folders:[],ruleBook:[{key:'su-pham'}]}],chats:[{id:'c',projectId:'p',title:'Ôn tập',messages:[]}],attachments:[{scopeId:'p',name:'Bài học.md'},{scopeId:'other',name:'Riêng tư.md'}]}} as unknown as ViewState;
  expect(s.screen('').left).not.toContain(help);expect(s.screen('').context).toContain('Bài học.md');expect(s.screen('').context).not.toContain('Riêng tư.md');
  s.event({id:'',event:'progress',data:{chatId:'other',entry:{id:'e',title:'Đang đọc',kind:'tool',state:'running',at:0}}});expect(s.status).toBe('Sẵn sàng');
  s.busy=true;s.event({id:'',event:'progress',data:{chatId:'c',entry:{id:'e',title:'Đang đọc',kind:'tool',state:'running',at:0}}});expect(s.status).toContain('Đang đọc');
  s.mode='markdown';s.draft.file='lesson.md';s.draft.original='# Cũ';s.draft.text='# Mới\nNội dung';
  expect(s.screen('').left).toContain('1  # Mới');expect(s.screen('').left).not.toContain('-1 # Cũ');expect(s.screen('').review).toContain('/save');expect(s.screen('').outline).toContain('1 Mới');
});
it('wraps Vietnamese at spaces and only splits tokens longer than the viewport',()=>{
  expect(wrap('không nằm trong dự án',12)).toEqual(['không nằm','trong dự án']);
  expect(wrap('Tệp /Users/phananh/MySoft',24)).toEqual(['Tệp','/Users/phananh/MySoft']);
  const token='/Users/phananh/MySoft/đường-dẫn-rất-dài';
  const lines=wrap(token,10);expect(lines.join('')).toBe(token);expect(lines.every(l=>width(l)<=10)).toBe(true);
});
it('does not reserve an empty code pane and routes model notices to status',async()=>{
  const s=new Session({dispatch:vi.fn()},process.cwd(),'',()=>{});s.mode='code';s.theme='trang-vo';
  await s.command('/model codex example');
  expect(s.screen('').right).toBe('');expect(s.status).toContain('Đã chọn model');
  expect(render(s.screen(''),140,30,false)).not.toContain('MÃ / THAY ĐỔI');
  expect(render({...s.screen(''),right:'- old\n+ new'},140,30,false)).toContain('MÃ / THAY ĐỔI');
});
it('renders styled turns and Markdown without losing text or trusting ANSI from messages',()=>{
  const messages=[{role:'user',text:'Xin giúp tôi.'},{role:'assistant',text:'# Bài học\n**Nội dung quan trọng** và `README.md`\n- Đọc sách\n```ts\nconst x = "**literal**";\n```\n\x1b[2JKhông xóa màn hình'}];
  for(const cols of [40,100,140]){
    const state={...screen,mode:'code' as const,messages};
    const colored=render(state,cols,30),plain=render(state,cols,30,false);
    expect(colored).toContain('\x1b[1m');expect(colored).toContain('\x1b[4m');expect(colored).not.toContain('\x1b[2J');
    expect(safe(colored).replace(/\r/g,'')).toBe(plain.replace(/\r/g,''));
    expect(plain).toContain('▌ THẦY CÔ');expect(plain).toContain('◆ PVTA');expect(plain).toContain('▸ Bài học');
    expect(plain).not.toContain('**Nội dung');expect(plain).toContain('**literal**');
    expect(colored.split('\r\n').every(l=>width(l)===cols-1)).toBe(true);
  }
});
