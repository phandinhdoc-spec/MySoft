import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {CliRun,asksForCode,extractLoginUrl,loginArgs,loginEnv,validCode,type SetupEvent} from '../src/desktop/backend-setup';
import {installerSpawn} from '../src/desktop/backend-install';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>fs.rm(d,{recursive:true,force:true})));});
async function script(body:string){const d=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-setup-test-'));dirs.push(d);const f=path.join(d,'fake.mjs');await fs.writeFile(f,body);return f;}
const node=(file:string,env:NodeJS.ProcessEnv={})=>()=>spawn(process.execPath,[file],{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
const FAKE_CLAUDE=`
process.stdout.write('Opening browser to sign in…\\n');
process.stdout.write('If the browser did not open, visit: https://claude.com/cai/oauth/authorize?code=true&state=SECRET123\\n');
process.stdout.write('Paste code here if prompted > ');
let buf='';process.stdin.on('data',d=>{buf+=d;if(buf.includes('\\n')){const c=buf.trim();if(c==='abc123#def456'){console.log('Login successful');process.exit(0);}console.error('Invalid code');process.exit(1);}});
`;

describe('đường dẫn đăng nhập',()=>{
 it('chỉ nhận địa chỉ HTTPS của đúng nhà cung cấp',()=>{
  expect(extractLoginUrl('claude','visit: https://claude.com/cai/oauth/authorize?code=true&x=1.')).toBe('https://claude.com/cai/oauth/authorize?code=true&x=1');
  expect(extractLoginUrl('codex','navigate to https://auth.openai.com/oauth/authorize?a=b')).toMatch(/^https:\/\/auth\.openai\.com\//);
  expect(extractLoginUrl('claude','https://evil.example/claude.com')).toBeUndefined();
  expect(extractLoginUrl('claude','http://claude.com/x')).toBeUndefined();
  expect(extractLoginUrl('claude','https://user:pw@claude.com/x')).toBeUndefined();
  expect(extractLoginUrl('claude','https://claude.com.evil.example/x')).toBeUndefined();
  expect(extractLoginUrl('codex','https://claude.com/x')).toBeUndefined();
 });
 it('bỏ mã màu của terminal trước khi tìm',()=>{
  expect(extractLoginUrl('claude','\u001b[1mhttps://claude.ai/login\u001b[0m')).toBe('https://claude.ai/login');
 });
});
describe('mã dán và môi trường',()=>{
 it('nhận ra lời nhắc dán mã',()=>{
  expect(asksForCode('Paste code here if prompted > ')).toBe(true);
  expect(asksForCode('Opening browser')).toBe(false);
 });
 it('chỉ chấp nhận mã một dòng gồm ký tự hợp lệ',()=>{
  expect(validCode('abc123#def456')).toBe(true);
  for(const bad of ['','abc','abc 123def','abc\n123456','a;rm -rf /','x'.repeat(4001)])expect(validCode(bad)).toBe(false);
 });
 it('bỏ khóa API và token khỏi môi trường đăng nhập, giữ phần còn lại',()=>{
  const env=loginEnv({PATH:'/bin',HOME:'/h',ANTHROPIC_API_KEY:'k',CLAUDE_CODE_OAUTH_TOKEN:'t',openai_api_key:'o',CODEX_API_KEY:'c'});
  expect(env).toEqual({PATH:'/bin',HOME:'/h'});
 });
 it('claude và codex có lệnh đăng nhập không cần Terminal; agy thì chưa',()=>{
  expect(loginArgs('claude')).toEqual(['auth','login']);
  expect(loginArgs('codex')).toEqual(['login']);
  expect(loginArgs('codex',true)).toEqual(['login','--device-auth']);
  expect(loginArgs('agy')).toBeUndefined();
 });
 it('bộ cài chạy ở nền bằng PowerShell trên Windows, bash/sh nơi khác',()=>{
  expect(installerSpawn('C:\\x\\install.ps1','claude','win32')).toEqual({bin:'powershell.exe',args:['-NoProfile','-ExecutionPolicy','Bypass','-File','C:\\x\\install.ps1']});
  expect(installerSpawn('/x/install.sh','claude','linux').bin).toBe('bash');
  expect(installerSpawn('/x/install.sh','codex','darwin').bin).toBe('sh');
 });
});
describe('CliRun',()=>{
 it('lấy đường dẫn, chờ mã, nhận mã dán và kết thúc thành công',async()=>{
  const events:SetupEvent[]=[];
  const run=new CliRun({backend:'claude',kind:'login',timeoutMs:20_000,watchLogin:true},e=>events.push(e),node(await script(FAKE_CLAUDE)));
  await new Promise<void>(res=>{const t=setInterval(()=>{if(events.some(e=>e.phase==='code')){clearInterval(t);res();}},20);});
  const last=events.at(-1)!;
  expect(last.url).toBe('https://claude.com/cai/oauth/authorize?code=true&state=SECRET123');
  // Chữ hiển thị không lộ địa chỉ đầy đủ (có tham số state).
  expect(last.lines.join('\n')).not.toContain('SECRET123');
  expect(last.lines.join('\n')).toContain('[claude.com]');
  expect(()=>run.sendCode('a b')).toThrow('không hợp lệ');
  run.sendCode('abc123#def456');
  const r=await run.done;
  expect(r).toMatchObject({code:0,timedOut:false,cancelled:false});
  expect(run.snapshot().lines.join('\n')).toContain('Login successful');
 });
 it('từ chối nhận mã khi công cụ chưa hỏi, hoặc khi không phải bước đăng nhập',async()=>{
  const file=await script(`setTimeout(()=>{},3000);`);
  const login=new CliRun({backend:'claude',kind:'login',timeoutMs:20_000,watchLogin:true},()=>{},node(file));
  expect(()=>login.sendCode('abc123#def456')).toThrow('chưa yêu cầu');
  const install=new CliRun({backend:'claude',kind:'install',timeoutMs:20_000},()=>{},node(file));
  expect(()=>install.sendCode('abc123#def456')).toThrow();
  login.cancel();install.cancel();await Promise.all([login.done,install.done]);
 });
 it('mã sai làm công cụ thoát với lỗi',async()=>{
  const events:SetupEvent[]=[];
  const run=new CliRun({backend:'claude',kind:'login',timeoutMs:20_000,watchLogin:true},e=>events.push(e),node(await script(FAKE_CLAUDE)));
  await new Promise<void>(res=>{const t=setInterval(()=>{if(events.some(e=>e.phase==='code')){clearInterval(t);res();}},20);});
  run.sendCode('wrong1#code22');
  expect((await run.done).code).toBe(1);
 });
 it('hết giờ thì dừng tiến trình và báo timedOut',async()=>{
  const run=new CliRun({backend:'codex',kind:'login',timeoutMs:300,watchLogin:true},()=>{},node(await script(`setTimeout(()=>{},30000);`)));
  expect(await run.done).toMatchObject({timedOut:true,cancelled:false});
 });
 it('hủy thì dừng tiến trình và báo cancelled',async()=>{
  const run=new CliRun({backend:'codex',kind:'login',timeoutMs:20_000,watchLogin:true},()=>{},node(await script(`setTimeout(()=>{},30000);`)));
  setTimeout(()=>run.cancel(),150);
  expect(await run.done).toMatchObject({cancelled:true,timedOut:false});
 });
 it('không tìm thấy chương trình thì báo lỗi, không ném ngoại lệ',async()=>{
  const missing=new CliRun({backend:'claude',kind:'install',timeoutMs:5000},()=>{},()=>spawn('/không/có/chương-trình-này',[]));
  expect((await missing.done).spawnError).toBeTruthy();
  const thrown=new CliRun({backend:'claude',kind:'install',timeoutMs:5000},()=>{},()=>{throw Error('hỏng');});
  expect((await thrown.done).spawnError).toBe('hỏng');
 });
 it('chỉ giữ vài dòng cuối của bộ cài và không lộ địa chỉ tải',async()=>{
  const run=new CliRun({backend:'claude',kind:'install',timeoutMs:20_000},()=>{},node(await script(`for(let i=1;i<=30;i++)console.log('dong '+i+' tai https://downloads.claude.ai/x?token=BI-MAT'+i);`)));
  expect((await run.done).code).toBe(0);
  const lines=run.snapshot().lines;
  expect(lines).toHaveLength(8);expect(lines.at(-1)).toContain('dong 30');
  expect(lines.join('\n')).not.toContain('BI-MAT');
 });
});
