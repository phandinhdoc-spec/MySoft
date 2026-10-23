import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect,afterEach} from 'vitest';
import {GroupStore} from '../src/groups/store';
import {discoverAll,discoverGroup,SearchBudget} from '../src/groups/discover';
const dirs:string[]=[];
const setup=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-discovery-'));dirs.push(dir);return new GroupStore(dir,{extract:async()=>({segments:[]}),memoryIndex:true});};
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
it('does not report a failed search as a successful daily check',async()=>{
 const s=setup();s.setEnabled(['giao-vien']);const r=await discoverGroup(s,'giao-vien',{now:()=>1e12,budget:new SearchBudget(),fetcher:async()=>new Response('blocked',{status:503})});
 expect(r.errors.length).toBeGreaterThan(0);expect(s.state().discover?.lastRun?.['giao-vien']).toBeUndefined();s.close();
});
it('gives every enabled role a search opportunity instead of starving the last roles',async()=>{
 const s=setup();s.setEnabled(['giao-vien','to-truong','hieu-pho','hieu-truong','ke-toan']);const r=await discoverAll(s,{now:()=>1e12,budget:new SearchBudget(),fetcher:async()=>new Response('<div class="no-results">No results found</div>')});
 expect(r.filter(x=>x.skipped==='budget')).toEqual([]);s.close();
});
it('follows a local institutional page for teachers using a saved profile, deduplicates and retains source health',async()=>{
 const s=setup();s.setEnabled(['giao-vien']);s.patchState({profile:{province:'Hồ Chí Minh',locality:'',school:'Trường riêng tư',level:'THCS',subjects:'Khoa học tự nhiên',keywords:''}});
 const calls:string[]=[];const fetcher=async(url:string|URL|Request)=>{calls.push(String(url));return String(url).includes('duckduckgo')?new Response('<div class="no-results">No results found</div>'):new Response('<a href="/cong-van/89">Công văn 89 hướng dẫn công tác giáo viên năm học mới</a>');};
 const deps={now:()=>1e12,budget:new SearchBudget(),fetcher,resolve:async()=>['8.8.8.8']};
 const r=await discoverGroup(s,'giao-vien',deps,{force:true});
 expect(r.added.some(d=>d.url==='https://hcm.edu.vn/cong-van/89')).toBe(true);
 expect(r.added.every(d=>d.status==='chua-xac-dinh')).toBe(true);
 expect(calls.some(u=>decodeURIComponent(u).includes('Hồ Chí Minh'))).toBe(true);
 expect(calls.join(' ')).not.toContain(encodeURIComponent('Trường riêng tư'));
 expect(s.view().sources?.find(x=>x.id==='hcm-edu')?.lastChecked).toBe(1e12);
 expect((await discoverGroup(s,'giao-vien',deps,{force:true})).added).toHaveLength(0);
 const restored=new GroupStore(s.home,{extract:async()=>({segments:[]}),memoryIndex:true});expect(restored.view().profile?.province).toBe('Hồ Chí Minh');restored.close();s.close();
});
it('does not fetch local-network sources or follow a redirect to one',async()=>{
 const {fetchSource}=await import('../src/groups/source-fetch');let fetched=0;
 await expect(fetchSource('https://school.edu.vn/',async()=>{fetched++;return new Response('');},async()=>['127.0.0.1'])).rejects.toThrow('nội bộ');expect(fetched).toBe(0);
 await expect(fetchSource('https://school.edu.vn/',async()=>new Response('',{status:302,headers:{location:'http://localhost/'}}),async()=>['8.8.8.8'])).rejects.toThrow('HTTPS');
});
it('switches automatic regional sources when the user changes province',async()=>{
 const {trackingSources,cleanProfile}=await import('../src/groups/profile');
 const hcm=trackingSources(cleanProfile({province:'Hồ Chí Minh'}));
 const hanoi=trackingSources(cleanProfile({province:'Hà Nội'}),hcm);
 expect(hanoi.some(s=>s.id==='hcm-edu')).toBe(false);expect(hanoi.some(s=>s.id==='moet')).toBe(true);
});
