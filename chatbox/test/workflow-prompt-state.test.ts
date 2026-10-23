import {afterEach,describe,expect,it,vi} from 'vitest';
import {dismissReviewNotice,reviewSnapshot,withPromptReview} from '../src/workflow-prompt-review';

/** Trạng thái thuần của khung xem trước: hủy khi đang chuẩn bị, từ chối gọi đồng thời, và đóng thông báo. */
const reply={promptReview:{token:'t',workflowId:'w',name:'Bài',steps:[{id:'s',name:'Soạn',original:'Soạn',prompt:'muc_tieu: "x"',canSave:true}]},resume:{method:'workflowRun',params:{id:'w'}}};
const flush=()=>new Promise(r=>setTimeout(r,0));
afterEach(()=>{dismissReviewNotice();});

describe('hủy khi đang viết lại',()=>{
 it('gửi workflowPromptCancel đúng mã quy trình và báo chưa chạy',async()=>{
  let finish!:(v:unknown)=>void;
  const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue(true);
  const pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);
  const state=reviewSnapshot();expect(state?.phase).toBe('preparing');
  (state as {cancel:()=>void}).cancel();
  expect(reviewSnapshot()).toBeNull();
  finish(reply);
  expect((await pending as Error).message).toBe('Đã dừng; quy trình chưa chạy.');
  expect(send).toHaveBeenCalledWith('workflowPromptCancel',{id:'w',plan:false});
  expect(send.mock.calls.some(c=>c[0]==='workflowRun'&&c[1].promptApproval)).toBe(false);
  expect(reviewSnapshot()).toBeNull();
 });
 it('với Plan gửi cờ plan:true để máy chủ tra đúng quy trình gắn Plan',async()=>{
  let finish!:(v:unknown)=>void;
  const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue(true);
  const pending=withPromptReview('runPlan',{id:'p'},send).catch(e=>e);
  (reviewSnapshot() as {cancel:()=>void}).cancel();
  await flush();
  expect(send).toHaveBeenCalledWith('workflowPromptCancel',{id:'p',plan:true});
  finish({promptReady:true,resume:{method:'runPlan',params:{id:'p'}}});await pending;
  // Lượt chuẩn bị gọi runPlan với promptPrepare; không được có lượt thực chạy (không có bản duyệt) sau khi đã hủy.
  expect(send.mock.calls.some(c=>c[0]==='runPlan'&&!c[1].promptPrepare)).toBe(false);
 });
});

describe('từ chối gọi đồng thời và phương thức ngoài luồng duyệt',()=>{
 it('không cho hai lượt duyệt cùng lúc',async()=>{
  let finish!:(v:unknown)=>void;
  const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue(true);
  const first=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);
  await expect(withPromptReview('workflowRun',{id:'v'},vi.fn())).rejects.toThrow('Đang chuẩn bị hoặc duyệt một quy trình');
  (reviewSnapshot() as {cancel:()=>void}).cancel();finish(true);await first;
  expect(reviewSnapshot()).toBeNull();
 });
 it('phương thức không thuộc luồng duyệt được chuyển thẳng, không mở khung',async()=>{
  const send=vi.fn().mockResolvedValue({ok:true});
  await expect(withPromptReview('workflowSave',{workflow:{}},send)).resolves.toEqual({ok:true});
  expect(send).toHaveBeenCalledTimes(1);expect(reviewSnapshot()).toBeNull();
 });
});

describe('thông báo lỗi và đóng',()=>{
 it('đóng thông báo lỗi nhưng không đụng tới bản đang chờ duyệt',async()=>{
  const failing=withPromptReview('workflowRun',{id:'w'},vi.fn().mockRejectedValueOnce(Error('Mô hình lỗi'))).catch(e=>e);
  await failing;
  expect(reviewSnapshot()?.phase).toBe('failed');
  dismissReviewNotice();expect(reviewSnapshot()).toBeNull();
  const waiting=withPromptReview('workflowRun',{id:'w'},vi.fn().mockResolvedValueOnce(reply));
  await flush();expect(reviewSnapshot()?.phase).toBe('review');
  dismissReviewNotice();expect(reviewSnapshot()?.phase).toBe('review');
  (reviewSnapshot() as {decide:(d:null)=>void}).decide(null);await waiting.catch(()=>{});
 });
 // Các thông điệp thật từ core: runtime.ts (Plan, chạy) và workflow-prompts.ts (nguồn đã đổi). Phân loại dựa trên chuỗi, nên cập nhật cùng lúc nếu đổi thông điệp.
 it('đánh dấu lỗi về hiệu lực theo các thông điệp thật của máy chủ',async()=>{
  for(const message of ['Bản nháp hết hiệu lực: quy trình, tài nguyên hoặc lượt chạy đã đổi. Bấm Chạy để xem và duyệt lại.','Kế hoạch đã đổi ở cửa sổ khác. Bản nháp chưa được lưu; bấm Chạy để xem bản mới.','Quy trình vừa thay đổi và cần duyệt lời nhắc. Bấm Chạy để xem bản mới.','Quy trình hoặc tài nguyên đã đổi. Bấm Chạy để xem bản mới.']){
   await withPromptReview('workflowRun',{id:'w'},vi.fn().mockRejectedValueOnce(Error(message))).catch(()=>{});
   const state=reviewSnapshot();
   expect(state).toMatchObject({phase:'failed',stale:true});
   dismissReviewNotice();
  }
 });
 it('lỗi thường không được đánh dấu là cần duyệt lại',async()=>{
  await withPromptReview('workflowRun',{id:'w'},vi.fn().mockRejectedValueOnce(Error('Đĩa đầy'))).catch(()=>{});
  expect(reviewSnapshot()).toMatchObject({phase:'failed',stale:false,message:'Đĩa đầy'});
 });
});
