import {afterEach,describe,it,expect,vi} from 'vitest';
import {codexBackend} from '../src/backends/codex';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {brainBinary,prepareBrainMcp} from '../src/desktop/brain';
import {DesktopRuntime} from '../src/desktop/runtime';
import {Engine} from '../src/engine';
import {ProbeStore} from '../src/probe';

const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{for(const runtime of runtimes.splice(0))runtime.dispose();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});vi.restoreAllMocks();});
function fixture(){const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'brain-mcp-')));roots.push(dir);const root=path.join(dir,'project');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'allowed.ts'),'export function chosenSymbol() { return 42; }\n');fs.writeFileSync(path.join(root,'secret.ts'),'export const hiddenSecret = 99;\n');return {dir,root};}
function exchange(config:{command:string;args:string[]},requests:unknown[]){
 const result=execFileSync(config.command,config.args,{input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n',encoding:'utf8',timeout:15000});
 return result.trim().split('\n').map(line=>JSON.parse(line));
}

describe('Brain native tools in Codex',()=>{
 it('registers a required, scoped MCP server without changing the user configuration',()=>{
  const brain={command:'/tmp/PVTA tools/pvta-brain',args:['mcp','/tmp/phiên/brain.json']};
  const inv=codexBackend.invocation({model:'sol',prompt:'sửa mã',permission:'read',brain});
  const configs=inv.args.filter(a=>a.flag==='--config').map(a=>a.value);
  expect(configs).toContain('mcp_servers.pvta_brain.command='+JSON.stringify(brain.command));
  expect(configs).toContain('mcp_servers.pvta_brain.args='+JSON.stringify(brain.args));
  expect(configs).toContain('mcp_servers.pvta_brain.required=true');
  expect(inv.args.filter(a=>a.value?.startsWith('mcp_servers.pvta_brain.')).every(a=>a.essential)).toBe(true);
 });
 it.each(['darwin','win32','linux'] as const)('Engine forwards the scoped server on %s',async platform=>{
  const {dir,root}=fixture();const log=path.join(dir,'calls.jsonl');
  const brain={command:path.join(dir,'Brain tools','pvta-brain'),args:['mcp',path.join(dir,'scope.json')]};
  const engine=new Engine({probe:new ProbeStore(path.join(dir,'probe.json')),platform,env:{...process.env,PVTA_CODEX_BIN:path.resolve('bridge/test/fixtures/fake-codex.mjs'),FAKE_LOG:log}});
  try{
   await engine.run({backend:'codex',model:'sol',cwd:root,permission:'read',brain,buildPrompt:()=> 'Read chosenSymbol'});
   const args=JSON.parse(fs.readFileSync(log,'utf8').trim().split('\n').at(-1)!);
   expect(args).toContain('mcp_servers.pvta_brain.command='+JSON.stringify(brain.command));
   expect(args).toContain('mcp_servers.pvta_brain.args='+JSON.stringify(brain.args));
  }finally{engine.dispose();}
 });
});

describe.skipIf(!brainBinary())('native Brain MCP integration',()=>{
 it('handshakes, discovers tools, reads real code and rejects files outside its fixed scope',async()=>{
  const {dir,root}=fixture();
  const connection=await prepareBrainMcp(dir,{root,files:['allowed.ts']},new AbortController().signal);
  const replies=exchange(connection.config,[
   {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}},
   {jsonrpc:'2.0',method:'notifications/initialized'},
   {jsonrpc:'2.0',id:2,method:'tools/list'},
   {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'brain_find',arguments:{query:'chosenSymbol'}}},
   {jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'brain_read',arguments:{file:'allowed.ts',symbol:'chosenSymbol'}}},
   {jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'brain_read',arguments:{file:'secret.ts',start:1,end:1}}},
   {jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'patch',arguments:{}}},
  ]);
  expect(replies).toHaveLength(6);
  expect(replies[0].result.protocolVersion).toBe('2025-03-26');
  expect(replies[1].result.tools.map((t:any)=>t.name)).toEqual(['brain_overview','brain_outline','brain_find','brain_refs','brain_read']);
  expect(replies[2].result.isError).toBe(false);expect(replies[2].result.content[0].text).toContain('chosenSymbol');
  expect(replies[2].result.content[0].text).not.toContain('hiddenSecret');
  expect(replies[3].result.content[0].text).toContain('return 42');
  expect(replies[4].result.isError).toBe(true);expect(replies[4].result.content[0].text).toContain('outside');
  expect(replies[5].result.isError).toBe(true);
  await connection.dispose();expect(fs.existsSync(connection.config.args[1]!)).toBe(false);
 });
 it('desktop passes the connection to Codex and cleans descriptors on success and failure',async()=>{
  const {dir,root}=fixture();const runtime=new DesktopRuntime(()=>{},path.join(dir,'home'));runtimes.push(runtime);
  const r=runtime as any;const files:string[]=[];
  const spy=vi.spyOn(runtime.engine,'run').mockImplementation(async req=>{
   expect(req.brain).toBeDefined();const file=req.brain!.args[1]!;files.push(file);
   expect(JSON.parse(fs.readFileSync(file,'utf8'))).toEqual({root,files:['allowed.ts']});
   expect(req.buildPrompt(false,false)).toContain('BRAIN MCP');
   return {text:'Read code',attempts:1,fullPrompt:true,timings:{totalMs:0}};
  });
  const run=()=>r.executeModel('find code','system',new AbortController().signal,undefined,{backend:'codex',model:'sol'},undefined,false,{permission:'read',allowMcp:false,brainScope:{root,files:['allowed.ts']}});
  expect(await run()).toBe('Read code');expect(fs.existsSync(files[0]!)).toBe(false);
  spy.mockImplementationOnce(async req=>{files.push(req.brain!.args[1]!);throw Error('model failed');});
  await expect(run()).rejects.toThrow('model failed');expect(fs.existsSync(files[1]!)).toBe(false);
 });
});
