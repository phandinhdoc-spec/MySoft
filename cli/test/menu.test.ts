import {it,expect,vi} from 'vitest';
import {Session} from '../src/session.js';
import {suggestions,modelGroups} from '../src/menu.js';
import type {ViewState} from '../../core/src/desktop/types.js';
import {render,themes,type Screen} from '../src/display.js';
it('slash offers commands, descriptions and argument completion',()=>{
  expect(suggestions('/').some(i=>i.value==='/models')).toBe(true);
  expect(suggestions('/att')[0]).toMatchObject({value:'/attach ',complete:true});
  expect(suggestions('/theme trang')[0]?.value).toBe('/theme trang-vo');
});
it('model picker opens instead of showing JSON or sending undefined backend',async()=>{
  const dispatch=vi.fn();const s=new Session({dispatch},process.cwd(),'',()=>{});
  await s.command('/model');expect(dispatch).not.toHaveBeenCalled();
  expect(s.picker?.title).toContain('nhà cung cấp');
});
it('API models preserve provider in the model ID used by Desktop',()=>{
  const view={api:[{id:'provider',label:'API riêng',configured:true,models:[{id:'family/model',label:'Model A'}]}]} as ViewState;
  expect(modelGroups(view)[0]?.items[0]?.value).toBe('/model api provider/family/model');
});
it('selecting a provider and model dispatches the choice and marks it current',async()=>{
  const dispatch=vi.fn();const s=new Session({dispatch},process.cwd(),'',()=>{});
  s.chatId='c';s.view={data:{preferences:{choice:'auto'},chats:[{id:'c',messages:[]}]},api:[{id:'p',label:'Nhà cung cấp',configured:true,models:[{id:'a/b',label:'Model đẹp'}]}]} as unknown as ViewState;
  await s.command('/models');expect(s.picker?.items.some(i=>i.value==='group:Nhà cung cấp')).toBe(true);
  s.openModels('Nhà cung cấp');await s.command(s.picker!.items[0]!.value);
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({method:'chatModel',params:{chatId:'c',choice:{backend:'api',model:'p/a/b'}}}));
  s.openModels('Nhà cung cấp');expect(s.picker!.items[0]!.label).toBe('✓ Model đẹp');
});
it('all themes emit distinct 256-color backgrounds and a separate selected row',()=>{
  vi.stubEnv('COLORTERM','');
  try{
    const backgrounds=new Set<string>();
    for(const theme of Object.keys(themes) as Screen['theme'][]){
      const s:Screen={theme,mode:'chat',title:'Test',access:'ask',left:'',right:'',input:'/',status:'',offset:0,focus:0,menu:{title:'Lệnh',items:['/theme','/models'],selected:1}};
      const colored=render(s,40,12);backgrounds.add(colored.match(/\x1b\[48;5;\d+m/)![0]);
      expect(colored).toContain('› /models');expect(new Set(colored.match(/\x1b\[48;5;\d+m/g)).size).toBeGreaterThan(1);
      expect(render(s,40,12,false)).not.toContain('\x1b');
    }
    expect(backgrounds.size).toBe(5);
  }finally{vi.unstubAllEnvs();}
});
