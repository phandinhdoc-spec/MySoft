import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {isCorrection,lightFeedbackModel,feedbackRuleKey,learningBatch} from '../src/desktop/feedback-learning';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;vi.restoreAllMocks();});
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-feedback-'));roots.push(root);const r=new DesktopRuntime(()=>{},root);runtimes.push(r);return r;}
async function chatting(){
 const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});
 r.store.data.preferences.choice={backend:'api',model:'openai/mock-mini'};
 const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 const spy=vi.spyOn(r.engine,'run').mockResolvedValue({text:'Đã trả lời.',attempts:1,fullPrompt:true,timings:{totalMs:0}} as any);
 const send=(text:string)=>r.dispatch({id:crypto.randomUUID(),method:'send',params:{chatId,text}});
 return {r,chatId,spy,send};
}
it('learns explicit preferences from the first desktop message',async()=>{
 const {r,send}=await chatting();await send('Hãy nhớ: tôi thích câu trả lời ngắn gọn.');
 expect(r.view().learning?.pending).toBe(1);
});
it('collects repeated desktop work and applies a rule only after enough observations',async()=>{
 const {r,spy,send}=await chatting();
 await send('Giải thích áp suất bằng ví dụ thực tế.');
 const before=spy.mock.calls.length;await (r as any).learnNext();expect(spy).toHaveBeenCalledTimes(before);
 await send('Giải thích lực ma sát bằng ví dụ thực tế.');
 await send('Giải thích lực đẩy bằng ví dụ thực tế.');
 spy.mockResolvedValue({text:'{"rule":"Giải thích kiến thức bằng ví dụ thực tế."}'} as any);
 await (r as any).learnNext();
 expect(r.store.data.learned).toEqual([expect.objectContaining({status:'active',rule:'Giải thích kiến thức bằng ví dụ thực tế.'})]);
 expect(r.view().learning?.pending).toBe(0);
});
it('captures praise in desktop chat without learning from a single compliment',async()=>{
 const {r,spy,send}=await chatting();await send('Giải thích áp suất.');await send('Hay quá, ví dụ rất rõ ràng.');
 expect((r as any).learningQueue.some((x:any)=>x.kind==='praise')).toBe(true);
 const before=spy.mock.calls.length;await (r as any).learnNext();expect(spy).toHaveBeenCalledTimes(before);
});
it('keeps batches separate by chat and kind, and prioritizes explicit feedback',()=>{
 const habit=(chatId:string)=>({chatId,text:'Ví dụ thực tế',about:'',retries:0,kind:'habit' as const});
 expect(learningBatch([habit('a'),habit('a'),habit('b')])).toEqual([]);
 const praise={...habit('a'),kind:'praise' as const};
 expect(learningBatch([praise,{...praise}])).toHaveLength(2);
 const feedback={...habit('b'),kind:'feedback' as const};
 expect(learningBatch([habit('a'),habit('a'),habit('a'),feedback])).toEqual([feedback]);
});
it('persists partial habit batches and honors disabled learning on desktop send',async()=>{
 const {r,send}=await chatting();await send('Giải thích bằng ví dụ thực tế.');
 r.store.data.preferences.learning=false;await send('Hãy nhớ dùng câu ngắn.');
 expect(r.view().learning?.pending).toBe(1);r.dispose();
 const reopened=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reopened);
 expect((reopened as any).learningQueue).toEqual([expect.objectContaining({kind:'habit',text:'Giải thích bằng ví dụ thực tế.'})]);
});
it('does not learn habits from a failed desktop turn',async()=>{
 const {r,spy,send}=await chatting();spy.mockRejectedValue(new Error('AI unavailable'));
 await expect(send('Giải thích bằng ví dụ thực tế.')).rejects.toThrow();
 expect(r.view().learning?.pending).toBe(0);
});
it('detects disagreement and explicit corrections',()=>{expect(isCorrection('Tôi không đồng ý, chữ nhỏ quá')).toBe(true);expect(isCorrection('lần sau dùng tiêu đề đen')).toBe(true);expect(isCorrection('Tạo bài tập')).toBe(false);});
it('picks an existing light candidate and never falls back to a heavy model',()=>{expect(lightFeedbackModel([{backend:'api',model:'x/large-pro'},{backend:'api',model:'x/flash-lite'},{backend:'api',model:'x/flash'}])?.model).toBe('x/flash-lite');expect(lightFeedbackModel([{backend:'api',model:'x/opus'}])).toBeUndefined();expect(feedbackRuleKey('Cỡ chữ 13.')).toBe(feedbackRuleKey('cỡ chữ 13'));});
it('queues feedback without invoking AI while foreground work is active',async()=>{const r=setup();const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});const spy=vi.spyOn(r.engine,'run');(r as any).jobs.set('foreground',new AbortController());await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await (r as any).learnNext();expect(spy).not.toHaveBeenCalled();expect((r as any).learningQueue).toHaveLength(1);});
it('extracts one rule with the light model and deduplicates repeated rules',async()=>{const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});const spy=vi.spyOn(r.engine,'run').mockResolvedValue({text:'{"rule":"Dùng chữ đen cho tiêu đề."}'} as any);
 for(let i=0;i<2;i++){await r.dispatch({id:'b'+i,method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await (r as any).learnNext();}
 expect(r.store.data.learned).toHaveLength(1);expect(spy.mock.calls[0]![0].model).toBe('openai/mock-mini');expect(spy.mock.calls[0]![0].permission).toBe('read');});
it('does not create a rule from a generic rejection and honours learning off',async()=>{const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});vi.spyOn(r.engine,'run').mockResolvedValue({text:'{"rule":""}'} as any);await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Sai rồi'}});await (r as any).learnNext();expect(r.store.data.learned).toEqual([]);r.store.data.preferences.learning=false;expect(await r.dispatch({id:'c',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}})).toEqual({queued:false});});
it('retains malformed feedback for retry and reports failure',async()=>{const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});vi.spyOn(r.engine,'run').mockResolvedValue({text:'not JSON'} as any);await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await (r as any).learnNext();expect(r.view().learning?.pending).toBe(1);expect(r.view().learning?.message).toMatch(/Chưa học xong/);});
it('automatically applies a learned rule to subsequent chat instructions',async()=>{const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});vi.spyOn(r.engine,'run').mockResolvedValue({text:'{"rule":"Dùng chữ đen."}'} as any);await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await (r as any).learnNext();expect(r.store.data.learned[0]).toMatchObject({status:'active',chatId});expect((r as any).context(r.store.data.chats[0],'hello')).toContain('Dùng chữ đen.');});
it('keeps disabled choice and queued feedback across restart',async()=>{const r=setup();const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await r.dispatch({id:'c',method:'preferences',params:{patch:{learning:false}}});r.dispose();const reopened=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reopened);expect(reopened.view().learning).toMatchObject({enabled:false,pending:1});await (reopened as any).learnNext();expect(reopened.view().learning?.pending).toBe(1);});
it('keeps edits active and removes deleted rules from instructions across restart',async()=>{
 const r=setup();await r.dispatch({id:'a',method:'newChat',params:{}});const chat=r.store.data.chats[0]!;
 r.store.data.learned.push({id:'rule',rule:'Quy tắc riêng thử nghiệm',source:'test',at:1,status:'active'});
 await r.dispatch({id:'edit',method:'editLearned',params:{id:'rule',rule:'Quy tắc đã sửa'}});
 expect((r as any).context(chat,'hello')).toContain('Quy tắc đã sửa');
 await r.dispatch({id:'remove',method:'reviewLearned',params:{id:'rule',status:'rejected'}});
 expect((r as any).context(chat,'hello')).not.toContain('Quy tắc đã sửa');r.dispose();
 const reopened=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reopened);
 expect(reopened.store.data.learned[0]?.status).toBe('rejected');
 expect((reopened as any).context(reopened.store.data.chats[0],'hello')).not.toContain('Quy tắc đã sửa');
});
it('stages skills until user approval, allows approved editing, and protects external changes',async()=>{
 const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});
 const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});
 const skill={name:'learned-review',description:'Quy trình soạn tài liệu',body:'Kiểm tra mục tiêu rồi soạn nội dung phù hợp.'};
 vi.spyOn(r.engine,'run').mockResolvedValue({text:JSON.stringify({rule:'',skill})} as any);
 await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau kiểm tra mục tiêu trước'}});await (r as any).learnNext();
 const draft=r.store.data.learnedDrafts![0]!;const file=path.join(r.skills.dir,skill.name,'SKILL.md');
 expect(draft.status).toBe('proposed');expect(fs.existsSync(file)).toBe(false);
 expect((r as any).context(r.store.data.chats[0],'/learned-review')).not.toContain('[Dữ liệu quy trình learned-review]');
 await r.dispatch({id:'approve',method:'reviewLearnedSkill',params:{id:draft.id,action:'approve'}});
 expect(draft.status).toBe('active');expect(fs.readFileSync(file,'utf8')).toContain(skill.body);
 const body='Đối chiếu mục tiêu rồi kiểm tra nội dung đã soạn.';
 await r.dispatch({id:'edit',method:'reviewLearnedSkill',params:{id:draft.id,action:'edit',...skill,body}});
 expect(draft.status).toBe('active');expect(fs.readFileSync(file,'utf8')).toContain(body);
 fs.appendFileSync(file,'\nNgười dùng đã sửa.');const original=fs.readFileSync(file,'utf8');
 await expect(r.dispatch({id:'edit',method:'reviewLearnedSkill',params:{id:draft.id,action:'edit',...skill}})).rejects.toThrow(/đã tồn tại|đã đổi/);
 expect(fs.readFileSync(file,'utf8')).toBe(original);expect(draft.body).toBe(body);
 await r.dispatch({id:'remove',method:'reviewLearnedSkill',params:{id:draft.id,action:'reject'}});
 expect(draft.status).toBe('rejected');expect(r.view().skills.find(s=>s.name===skill.name)?.load).toBe('off');
 r.dispose();const reopened=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reopened);
 expect(reopened.store.data.learnedDrafts![0]?.status).toBe('rejected');
});
it('migrates pending memory without reactivating rejected entries and resolves collisions by renaming',async()=>{
 const r=setup();
 r.store.data.learned=[{id:'pending',rule:'Trình bày ngắn gọn.',source:'test',at:1,status:'proposed'},{id:'deleted',rule:'Không dùng nữa.',source:'test',at:1,status:'rejected'}];
 const skill={id:'skill',name:'learned-collision',description:'Quy trình kiểm tra bài',body:'Kiểm tra mục tiêu và nội dung trước khi xuất.',source:'test',at:1,status:'proposed' as const};
 const file=path.join(r.skills.dir,skill.name,'SKILL.md');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'Tệp riêng cần giữ nguyên.');
 r.store.data.learnedDrafts=[skill];r.store.save();r.dispose();
 const reopened=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reopened);
 expect(reopened.store.data.learned.map(x=>x.status)).toEqual(['active','rejected']);
 expect(reopened.store.data.learnedDrafts![0]).toMatchObject({status:'proposed'});
 expect(fs.readFileSync(file,'utf8')).toBe('Tệp riêng cần giữ nguyên.');
 await reopened.dispatch({id:'rename',method:'reviewLearnedSkill',params:{id:skill.id,action:'edit',name:'learned-renamed',description:skill.description,body:skill.body}});
 expect(reopened.store.data.learnedDrafts![0]).toMatchObject({status:'proposed',name:'learned-renamed',activationError:undefined});
 await reopened.dispatch({id:'approve',method:'reviewLearnedSkill',params:{id:skill.id,action:'approve'}});
 expect(fs.readFileSync(file,'utf8')).toBe('Tệp riêng cần giữ nguyên.');
 expect(fs.readFileSync(path.join(reopened.skills.dir,'learned-renamed','SKILL.md'),'utf8')).toContain(skill.body);
});
it('automatically uses reflection lessons but stages skills for approval',async()=>{
 const r=setup();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});
 r.store.data.preferences.choice={backend:'api',model:'openai/mock-mini'};
 r.store.data.preferences.reflect=true;
 r.store.data.chats[0]!.messages.push({id:'ask',role:'user',text:'Soát nội dung trước khi xuất.',at:1});
 vi.spyOn(r as any,'model').mockResolvedValue(JSON.stringify({lessons:['Kiểm tra nội dung trước khi xuất.'],skill:{name:'learned-reflect',description:'Rà soát nội dung đã soạn',body:'Đọc lại mục tiêu và đối chiếu nội dung trước khi xuất.'}}));
 await (r as any).reflectNow(chatId,true);
 expect(r.store.data.learned[0]?.status).toBe('active');
 expect(r.store.data.learnedDrafts![0]?.status).toBe('proposed');
 expect((r as any).context(r.store.data.chats[0],'hello')).toContain('Kiểm tra nội dung trước khi xuất.');
});
it('keeps the in-flight item on disk and records cancellation',async()=>{const r=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const chatId=await r.dispatch({id:'a',method:'newChat',params:{}});vi.spyOn(r.engine,'run').mockImplementation(async()=>{expect(JSON.parse(fs.readFileSync(path.join(r.store.home,'chatbox','learning-queue.json'),'utf8'))).toHaveLength(1);await r.dispatch({id:'off',method:'preferences',params:{patch:{learning:false}}});return {text:'{"rule":"Không được lưu"}'} as any;});await r.dispatch({id:'b',method:'feedback',params:{chatId,text:'Lần sau dùng chữ đen'}});await (r as any).learnNext();expect(r.view().learning).toMatchObject({enabled:false,pending:1,last:{state:'interrupted'}});expect(r.store.data.learned).toEqual([]);});
