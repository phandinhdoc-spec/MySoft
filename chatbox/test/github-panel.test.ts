// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {catalog} from '../../core/src/desktop/github-ops';
import type {GithubStatus,GithubEvent} from '../../core/src/desktop/github-model';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),subscribe:vi.fn(),pickFiles:vi.fn(),listener:undefined as any}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,subscribe:mocks.subscribe,pickFiles:mocks.pickFiles,savePath:vi.fn()}));
import {GitHubPanel,blockedReasons} from '../src/GitHubPanel';
import {Tip} from '../src/HoverTip';
let host:HTMLDivElement,root:Root;
const status:GithubStatus={version:1,observedAt:1,folder:'/project',root:'/project',tools:{git:{installed:true},gh:{installed:true}},auth:{state:'ready',account:'teacher',host:'github.com'},conditions:{git:true,gh:true,authenticated:true,folder:true,repository:true,idle:true,noOperation:true,changes:true,identity:true,head:true,branch:true,origin:true,upstream:true,clean:false},unavailable:{},suggestions:['commit'],repository:{branch:'main',head:'abc',upstream:'origin/main',origin:'https://github.com/teacher/lessons.git',ahead:1,behind:0,changes:[{path:'lesson.md',index:' ',worktree:'M',untracked:false}],operation:'none'}};
const render=async(visible=true)=>{await act(async()=>{root.render(React.createElement(GitHubPanel,{projectId:'p',name:'Bài học',folder:'/project',folders:['/project','/other'],visible,onClose:vi.fn()}));});};
const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button, text).toBeTruthy();await act(async()=>button!.click());};
const emit=async(event:GithubEvent)=>{await act(async()=>mocks.listener({event:'github',data:event}));};
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
 mocks.rpc.mockReset();mocks.pickFiles.mockReset();mocks.subscribe.mockReset();mocks.subscribe.mockImplementation(async(cb)=>{mocks.listener=cb;return()=>{};});
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():method==='githubStatus'?structuredClone(status):method==='githubPreview'?{version:1,previewId:'preview',operationId:'push',target:{folder:'/project'},expiresAt:Date.now()+100000,steps:[{id:'one',label:'Đưa lên',executable:'git',args:['push']}],warnings:['Không tự hoàn tác.'],confirmationText:null}:{runId:'run'}}));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
it('thiếu công cụ hiện hướng dẫn và không gửi yêu cầu đăng nhập',async()=>{
 const unavailable=structuredClone(status);unavailable.tools={git:{installed:false},gh:{installed:false}};unavailable.conditions={git:false,gh:false};unavailable.auth.state='unknown';
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():unavailable}));
 await render();expect(host.textContent).toContain('Cài Git và GitHub CLI');
 await click('Đăng nhập bằng trình duyệt');
 expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubLogin')).toBe(false);
});
it('chưa đăng nhập khóa thao tác cần tài khoản và vẫn cho đăng nhập',async()=>{
 const signedOut=structuredClone(status);signedOut.auth={state:'missing',host:'github.com'};signedOut.conditions.authenticated=false;
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():signedOut}));
 await render();expect(host.textContent).toContain('Chưa xác minh đăng nhập');
 const create=catalog().operations.find(o=>o.id==='repoCreate')!;
 expect(blockedReasons(create,signedOut).length).toBeGreaterThan(0);
 const login=[...host.querySelectorAll('button')].find(b=>b.textContent==='Đăng nhập bằng trình duyệt')!;
 expect(login.getAttribute('aria-disabled')).toBe('false');
});
it('hiện đúng thư mục, nhánh, kho và giải thích nút khóa qua bàn phím',async()=>{
 await render();expect(host.textContent).toContain('teacher');expect(host.textContent).toContain('Nhánh: main');expect(host.textContent).toContain(status.repository!.origin);
 await click('Tải xuống và đồng bộ');const pull=[...host.querySelectorAll('button')].find(b=>b.textContent==='Tải cập nhật từ GitHub về')!;expect(pull.getAttribute('aria-disabled')).toBe('true');
 vi.useFakeTimers();await act(async()=>pull.focus());await act(async()=>vi.advanceTimersByTime(1999));expect(document.querySelector('[role=tooltip]')).toBeNull();await act(async()=>vi.advanceTimersByTime(1));expect(document.querySelector('[role=tooltip]')?.textContent).toContain('Cần lưu hoặc cất tạm');expect(pull.getAttribute('aria-describedby')).toBeTruthy();await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));expect(document.querySelector('[role=tooltip]')).toBeNull();
});
it('xem trước trước khi chạy, chống nhấp lặp và nhận kết quả đến trước trả lời RPC',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');
 mocks.rpc.mockImplementation(async(method)=>{if(method==='githubRun'){
  mocks.listener({event:'github',data:{kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'push',state:'partial',completedStepIds:['one'],output:[],effects:'applied',recovery:{state:'manualRequired',message:'Kiểm tra kho trước khi thử lại.'}}}});return {ok:true,value:{runId:'run'}};
 }return {ok:true,value:structuredClone(status)};});
 const run=[...host.querySelectorAll('button')].find(b=>b.textContent==='Thực hiện: Đưa lên GitHub')!;
 await act(async()=>{run.click();run.click();});expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);expect(host.textContent).toContain('Hoàn thành một phần');expect(host.textContent).toContain('Kiểm tra kho trước khi thử lại.');expect(host.querySelector('select')?.disabled).toBe(false);
});
it('ẩn và mở lại vẫn theo dõi lần chạy, không tự gửi lại',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');await render(false);await render(true);
 expect(host.textContent).toContain('Yêu cầu dừng thao tác');expect(host.querySelector('select')?.disabled).toBe(true);expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'push',state:'success',completedStepIds:['one'],output:[{kind:'message',text:'Đã đưa lên.'}],effects:'applied',recovery:{state:'notNeeded',message:''}}});expect(host.textContent).toContain('Đã đưa lên.');
});
it('sửa biểu mẫu làm mất bản xem trước và bắt nhập đúng xác nhận',async()=>{
 await render();await click('Lịch sử và hoàn tác');await click('Bỏ mọi thay đổi chưa lưu');
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubPreview'?{version:1,previewId:'p',target:{folder:'/project'},steps:[],warnings:[],confirmationText:'BỎ HẾT'}:status}));
 await click('Xem trước tác động');const run=[...host.querySelectorAll('button')].find(b=>b.textContent==='Thực hiện: Bỏ mọi thay đổi chưa lưu')!;expect(run.disabled).toBe(true);
 await click('Lưu và đưa lên');await click('Lưu phiên bản');expect(host.textContent).not.toContain('Kiểm tra trước khi thực hiện');expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubRun')).toBe(false);
});
it('quyền theo kho đích được kiểm tra khi xem trước, không khóa biểu mẫu',()=>{
 expect(blockedReasons(catalog().operations.find(o=>o.id==='repoRename')!,status)).toEqual([]);
});
it('hướng dẫn đóng khi cuộn, bấm và rời tiêu điểm',async()=>{
 vi.useFakeTimers();await act(async()=>root.render(React.createElement(Tip,{text:'Giải thích',children:React.createElement('button',null,'Nút')})));
 const button=host.querySelector('button')!;await act(async()=>button.focus());await act(async()=>vi.advanceTimersByTime(2000));expect(document.querySelector('[role=tooltip]')).not.toBeNull();await act(async()=>window.dispatchEvent(new Event('scroll')));expect(document.querySelector('[role=tooltip]')).toBeNull();await act(async()=>{button.blur();button.focus();});await act(async()=>vi.advanceTimersByTime(2000));await act(async()=>button.click());expect(document.querySelector('[role=tooltip]')).toBeNull();
});
it('đăng nhập hiện mã một lần và yêu cầu dừng không mở khóa trước kết quả',async()=>{
 await render();await click('Đăng nhập bằng trình duyệt');await emit({kind:'login',runId:'run',sequence:1,at:1,state:'waiting',deviceCode:'ABCD-1234',url:'https://github.com/login/device',message:'Nhập mã.'});expect(host.textContent).toContain('ABCD-1234');
 mocks.rpc.mockImplementation(async()=>({ok:true,value:{accepted:true}}));await click('Yêu cầu dừng thao tác');expect(host.textContent).toContain('Đã yêu cầu dừng');expect(host.querySelector('select')?.disabled).toBe(true);
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubLogin')).toHaveLength(1);
});
it('lỗi xem trước hiển thị hướng xử lý và không cho chạy',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');mocks.rpc.mockResolvedValue({ok:false,error:{code:'permission',message:'Không đủ quyền.',hint:'Kiểm tra tài khoản.'}});await click('Xem trước tác động');expect(host.querySelector('[role=alert]')?.textContent).toContain('Kiểm tra tài khoản.');expect(host.textContent).not.toContain('Thực hiện: Đưa lên GitHub');
});
it('kết quả thao tác khác không mở khóa lần chạy hiện tại',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');await emit({kind:'result',runId:'other',sequence:1,at:1,result:{runId:'other',operationId:'push',state:'success',completedStepIds:[],output:[],effects:'none',recovery:{state:'notNeeded',message:''}}});expect(host.querySelector('select')?.disabled).toBe(true);
});
it('thay nội dung ô nhập hủy bản xem trước cũ',async()=>{
 await render();await click('Lưu phiên bản');const input=host.querySelector('textarea')!;
 const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
 await act(async()=>{set.call(input,'Bổ sung bài học');input.dispatchEvent(new Event('input',{bubbles:true}));});await click('Xem trước tác động');expect(host.textContent).toContain('Kiểm tra trước khi thực hiện');
 await act(async()=>{set.call(input,'Đổi nội dung');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(host.textContent).not.toContain('Kiểm tra trước khi thực hiện');expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubRun')).toBe(false);
});
it('chỉ mở khóa thao tác nguy hiểm sau khi gõ chính xác chữ xác nhận',async()=>{
 await render();await click('Lịch sử và hoàn tác');await click('Bỏ mọi thay đổi chưa lưu');mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubPreview'?{version:1,previewId:'p',target:{folder:'/project'},steps:[],warnings:[],confirmationText:'BỎ HẾT'}:{runId:'run'}}));await click('Xem trước tác động');const run=[...host.querySelectorAll('button')].find(b=>b.textContent==='Thực hiện: Bỏ mọi thay đổi chưa lưu')!;const input=host.querySelector('.github-preview input')!;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
 await act(async()=>{set.call(input,'bỏ hết');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(run.disabled).toBe(true);
 await act(async()=>{set.call(input,'BỎ HẾT');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(run.disabled).toBe(false);await act(async()=>run.click());expect(mocks.rpc.mock.calls.find(c=>c[0]==='githubRun')?.[1].confirmation).toBe('BỎ HẾT');
});
it('duyệt thư mục và chuyển nhiều mục đã chọn sang biểu mẫu tải xuống',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'browseFiles',state:'success',completedStepIds:['1'],effects:'none',recovery:{state:'notNeeded',message:''},output:[{kind:'table',columns:[{key:'path',label:'path'},{key:'type',label:'type'},{key:'link',label:'link'}],rows:[{path:'docs',type:'Thư mục',link:'https://github.com/teacher/test/tree/main/docs'},{path:'icon.png',type:'Tệp',link:'https://github.com/teacher/test/blob/main/icon.png'}],truncated:false}]}});
 const boxes=host.querySelectorAll<HTMLInputElement>('input[type=checkbox]');await act(async()=>{boxes[0]!.click();boxes[1]!.click();});await click('Tải các mục đã chọn');
 expect((host.querySelector('#github-paths') as HTMLTextAreaElement).value).toBe('docs\nicon.png');
 expect((host.querySelector('#github-link') as HTMLInputElement).value).toContain('github.com/teacher/test');
 await click('Mở thư mục');expect(host.querySelector('.github-form h3')?.textContent).toBe('Duyệt tệp từ liên kết GitHub');
 expect(host.querySelector('.github-upload-context')?.textContent).toContain('https://github.com/teacher/test/tree/main/docs');
});
it('browse uses the project URL instead of another local origin and runs from one button',async()=>{
 const navigationRequest={operation:'browseFiles'};
 const show=async(projectId:string,projectUrl:string)=>act(async()=>root.render(React.createElement(GitHubPanel,{projectId,projectUrl,folder:'/project',visible:true,onClose:vi.fn(),navigationRequest})));
 await show('p','https://github.com/school/exams');
 expect(host.querySelector('#github-link')).toBeNull();
 await click('Duyệt file');
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='githubPreview')?.[1]).toMatchObject({operationId:'browseFiles',values:{link:'https://github.com/school/exams',ref:''}});
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'browseFiles',state:'success',completedStepIds:[],output:[],effects:'none',recovery:{state:'notNeeded',message:''}}});
 await show('q','https://github.com/school/other');
 await click('Duyệt file');
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubPreview').at(-1)?.[1].values.link).toBe('https://github.com/school/other');
});
it('browse falls back to origin and only asks for a URL when no repository is linked',async()=>{
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'p',folder:'/project',visible:true,onClose:vi.fn(),navigationRequest:{operation:'browseFiles'}})));
 expect(host.querySelector('#github-link')).toBeNull();
 expect(host.querySelector('.github-upload-context')?.textContent).toContain('https://github.com/teacher/lessons');
 const empty={...status,repository:undefined,root:undefined};
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():empty}));
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'new',visible:true,onClose:vi.fn(),navigationRequest:{operation:'browseFiles'}})));
 expect(host.querySelector('#github-link')).not.toBeNull();
 expect(host.querySelector<HTMLButtonElement>('.github-form button[type=submit]')?.disabled).toBe(true);
});
it('sidebar requests open a form, then a compact catalog with every operation reachable once',async()=>{
 await act(async()=>root.render(React.createElement(GitHubPanel,{visible:true,onClose:vi.fn(),navigationRequest:{operation:'uploadFiles'}})));
 expect(host.querySelector('.github-form')?.textContent??host.textContent).toContain('Thư mục:');
 expect(mocks.rpc.mock.calls.some(c=>['githubPreview','githubRun'].includes(c[0]))).toBe(false);
 await act(async()=>root.render(React.createElement(GitHubPanel,{visible:true,onClose:vi.fn(),navigationRequest:{operation:'actions'}})));
 expect([...host.querySelectorAll('.github-grid button')].map(b=>b.textContent)).toEqual(['Lưu phiên bản']);
 expect(host.querySelector('.github-form')).toBeNull();
 for(const group of catalog().groups){
  await click(group.label);
  for(const op of catalog().operations.filter(o=>o.group===group.id)){
   expect([...host.querySelectorAll('button')].filter(b=>b.textContent===op.label)).toHaveLength(1);
  }
 }
 expect(mocks.rpc.mock.calls.some(c=>['githubPreview','githubRun'].includes(c[0]))).toBe(false);
});
it('reuses the selected project GitHub link without asking for it again',async()=>{
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'p',projectUrl:'https://github.com/school/exams',folder:'/project',visible:true,onClose:vi.fn()})));
 await click('Lưu và đưa lên');await click('Cập nhật tệp hoặc thư mục được chọn');
 expect(host.querySelector('#github-link')).toBeNull();
 expect(host.querySelector('.github-upload-context')?.textContent).toContain('https://github.com/school/exams');
 expect(host.querySelector('.github-form')?.textContent).toContain('Thư mục: /project');
});

it('uses origin and its tracked branch; only unlinked targets ask for a URL',async()=>{
 await render();await click('Lưu và đưa lên');await click('Cập nhật tệp hoặc thư mục được chọn');
 expect(host.querySelector('#github-link')).toBeNull();expect(host.querySelector('.github-upload-context')?.textContent).toContain('Nhánh: main');
 const empty={...status,repository:undefined,root:undefined};mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():empty}));
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'new',visible:true,onClose:vi.fn()})));
 await click('Lưu và đưa lên');await click('Cập nhật tệp hoặc thư mục được chọn');expect(host.querySelector('#github-link')).not.toBeNull();
});
it('renders file statuses and percentage, and preserves incomplete progress on failure',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');
 await emit({kind:'upload',runId:'run',sequence:1,at:1,files:[{path:'lesson.md',state:'uploaded'},{path:'image.png',state:'uploading'}],percent:20,message:'Đang tải'});
 expect(host.querySelector('progress')?.value).toBe(20);expect(host.querySelector('.github-file-list')?.textContent).toContain('image.png');expect(host.textContent).toContain('20%');
 await emit({kind:'result',runId:'run',sequence:2,at:2,result:{runId:'run',operationId:'uploadFiles',state:'error',completedStepIds:[],output:[],effects:'unknown',recovery:{state:'manualRequired',message:'Kiểm tra nhánh'}}});
 expect(host.querySelector('progress')?.value).toBe(20);expect(host.textContent).toContain('Không hoàn tất');
});
it.each(['uploadFiles','downloadFiles','browseFiles','sync'])('quick %s opens its own panel without the dashboard',async(operation)=>{
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'p',folder:'/project',visible:true,onClose:vi.fn(),navigationRequest:{operation}})));
 expect(host.querySelector('.github-form')).not.toBeNull();
 expect(host.querySelector('.github-groups')).toBeNull();
 expect(host.textContent).not.toContain('Nên làm bây giờ');
 expect(host.textContent).not.toContain('Thuật ngữ cho người mới');
 expect(host.querySelector('header strong')?.textContent).not.toContain('Chưa chọn dự án');
});

it('updates automatically with one button and still offers manual selection',async()=>{
 await render();await click('Lưu và đưa lên');await click('Cập nhật tệp hoặc thư mục được chọn');
 expect(host.querySelector('#github-paths')).toBeNull();await click('Cập nhật');
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='githubPreview')?.[1].values.selection).toBe('changed');
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
 expect(host.querySelector('progress')?.value).toBe(0);
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'uploadFiles',state:'success',completedStepIds:['1'],output:[],effects:'applied',recovery:{state:'notNeeded',message:''}}});
 await click('Kiểm tra lần cập nhật tiếp theo');
 const mode=host.querySelector('#github-selection') as HTMLSelectElement;
 await act(async()=>{mode.value='selected';mode.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('#github-paths')).not.toBeNull();
});

it('downloads automatically with one button and keeps manual selection with a visible reason',async()=>{
 await render();await click('Tải xuống và đồng bộ');await click('Tải tệp hoặc thư mục được chọn');
 expect(host.querySelector('#github-paths')).toBeNull();expect(host.querySelector('.github-form h3')?.textContent).toBe('Tải về từ GitHub');
 await click('Tải về');
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='githubPreview')?.[1].values.selection).toBe('changed');
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
 expect(host.textContent).not.toContain('Thực hiện:');
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'downloadFiles',state:'success',completedStepIds:['1'],output:[],effects:'applied',recovery:{state:'notNeeded',message:''}}});
 const mode=host.querySelector('#github-selection') as HTMLSelectElement;
 await act(async()=>{mode.value='selected';mode.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('#github-paths')).not.toBeNull();
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Xem trước tác động')?.disabled).toBe(true);
 expect(host.textContent).toContain('Nhập ít nhất một tệp hoặc thư mục cần tải.');
});
it('syncs both ways with one button even when files are unsaved, and still offers a preview',async()=>{
 await render();await click('Tải xuống và đồng bộ');await click('Đồng bộ hai chiều');
 expect(host.textContent).toContain('Có 1 tệp chưa lưu');
 expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Xem trước tác động')).toBe(true);
 const syncButton=host.querySelector<HTMLButtonElement>('.github-form button[type=submit]')!;
 expect(syncButton.textContent).toBe('Đồng bộ hai chiều');
 await act(async()=>syncButton.click());
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='githubPreview')?.[1].operationId).toBe('sync');
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
 expect(host.textContent).not.toContain('Thực hiện:');
});
it('stops displaying comparison progress when preview fails',async()=>{
 await render();await click('Lưu và đưa lên');await click('Cập nhật tệp hoặc thư mục được chọn');
 mocks.rpc.mockResolvedValue({ok:false,error:{code:'commandFailed',message:'Đối chiếu thất bại',hint:'Kiểm tra tệp'}});
 await click('Cập nhật');expect(host.textContent).not.toContain('Đang đối chiếu');expect(host.textContent).toContain('Không thể đối chiếu tệp.');expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubRun')).toBe(false);
});
it('folder menu cancellation keeps preview; choosing a new folder invalidates it',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');
 const open=()=>act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác thư mục đang làm việc"]')!.click());
 const choose=()=>act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());
 mocks.pickFiles.mockResolvedValueOnce([]);await open();await choose();expect(host.querySelector('.github-preview')).not.toBeNull();expect(mocks.rpc.mock.calls.some(c=>c[0]==='setProjectGithubFolder')).toBe(false);
 mocks.pickFiles.mockResolvedValueOnce(['/replacement']);await open();await choose();expect(mocks.rpc).toHaveBeenCalledWith('setProjectGithubFolder',{projectId:'p',folder:'/replacement'});expect(host.querySelector('.github-preview')).toBeNull();expect((host.querySelector('select') as HTMLSelectElement).value).toBe('/replacement');
});
it('missing folder offers a direct replacement and menu locks while an operation runs',async()=>{
 const missing={...status,folderError:'Thư mục không tồn tại'};
 mocks.rpc.mockImplementation(async(method)=>({ok:true,value:method==='githubCatalog'?catalog():method==='githubStatus'?missing:method==='githubPreview'?{version:1,previewId:'p',target:{folder:'/project'},steps:[],warnings:[],confirmationText:null}:{runId:'run'}}));
 await render();expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Chọn lại thư mục…')).toBe(true);
 await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác thư mục đang làm việc"]')!.click());const command=document.querySelector<HTMLButtonElement>('[role=menuitem]')!;expect(command.getAttribute('aria-disabled')).toBe('true');await act(async()=>command.click());expect(mocks.pickFiles).not.toHaveBeenCalled();
});
it('switching project with an open picker does not save a stale folder or keep the previous target',async()=>{
 await render();let resolve!:(paths:string[])=>void;mocks.pickFiles.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác thư mục đang làm việc"]')!.click());await act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());
 await act(async()=>root.render(React.createElement(GitHubPanel,{projectId:'q',name:'Other',folder:'/other',folders:['/other'],visible:true,onClose:vi.fn()})));
 await act(async()=>resolve(['/stale']));expect(mocks.rpc.mock.calls.some(c=>c[0]==='setProjectGithubFolder')).toBe(false);expect((host.querySelector('select') as HTMLSelectElement).value).toBe('/other');
});
it('file menu targets the clicked file and prepares download without executing a GitHub write',async()=>{
 await render();await click('Lưu và đưa lên');await click('Đưa lên GitHub');await click('Xem trước tác động');await click('Thực hiện: Đưa lên GitHub');
 await emit({kind:'result',runId:'run',sequence:1,at:1,result:{runId:'run',operationId:'browseFiles',state:'success',completedStepIds:[],effects:'none',recovery:{state:'notNeeded',message:''},output:[{kind:'table',columns:[{key:'path',label:'path'},{key:'type',label:'type'},{key:'link',label:'link'}],rows:[{path:'a.md',type:'Tệp',link:'https://github.com/teacher/test/blob/main/a.md'},{path:'b.md',type:'Tệp',link:'https://github.com/teacher/test/blob/main/b.md'}],truncated:false}]}});
 const trigger=host.querySelector<HTMLButtonElement>('[aria-label="Thao tác b.md"]')!;
 await act(async()=>trigger.click());const labels=[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent);await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>trigger.closest('tr')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect([...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)).toEqual(labels);
 await act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());expect(mocks.rpc).toHaveBeenCalledWith('openLink',{url:'https://github.com/teacher/test/blob/main/b.md'});
 await act(async()=>trigger.click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Tải xuống…')!.click());expect((host.querySelector('#github-paths') as HTMLTextAreaElement).value).toBe('b.md');expect(mocks.rpc.mock.calls.filter(c=>c[0]==='githubRun')).toHaveLength(1);
});

it('English UI preserves repository values and exact confirmation text',async()=>{
 localStorage.setItem('pvta.chat.language','en');
 try{
  await render();expect(host.textContent).toContain('Branch: main');
  await click('Save and upload');await click('Push to GitHub');await click('Preview impact');
  expect(host.textContent).toContain('Execute: Push to GitHub');
  expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubPreview')).toBe(true);
  expect(mocks.rpc.mock.calls.some(c=>c[0]==='githubRun')).toBe(false);
 }finally{localStorage.removeItem('pvta.chat.language');}
});
