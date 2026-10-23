import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {DesktopRuntime} from '../src/desktop/runtime';
import {normalizeWorkflow} from '../src/desktop/workflows';
it('RPC gợi ý chỉ dùng bản nháp hiện tại, không tự áp dụng và không bật MCP',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-suggest-'));const r=new DesktopRuntime(()=>{},home);
 try{
  r.store.data.preferences.choice={backend:'api',model:'openai/mock'};
  r.store.data.workflows=[normalizeWorkflow({id:'other',name:'SECRET',steps:[{prompt:'PRIVATE OTHER'}]})];
  r.store.data.chats=[{id:'private',title:'OTHER CHAT',messages:[],summary:'PRIVATE CHAT',updatedAt:1}];
  const spy=vi.spyOn(r.engine,'run').mockResolvedValue({text:'!bien so-lan = 0',attempts:1,fullPrompt:true,timings:{totalMs:0}});
  const workflow={id:'draft',steps:[{id:'s',prompt:'!bien so-lan ='}]};
  expect(await r.dispatch({id:'q',method:'workflowSuggest',params:{workflow,stepId:'s',question:'Điền giá trị'}})).toBe('!bien so-lan = 0');
  const args=spy.mock.calls[0]![0];expect(args.buildPrompt(false,false)).toContain('!bien so-lan =');expect(args.buildPrompt(false,false)).not.toContain('PRIVATE');expect(args.mcp).toBeUndefined();
  expect(args.buildPrompt(false,false)).toContain('không trùng tên hoặc che khuất tên cha');
  expect(args.buildPrompt(false,false)).toContain('Điền tên và giá trị');
  expect(workflow.steps[0]!.prompt).toBe('!bien so-lan =');expect(r.store.data.workflows).toHaveLength(1);
 }finally{r.dispose();fs.rmSync(home,{recursive:true,force:true});}
});
