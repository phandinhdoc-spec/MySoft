import {describe,expect,it} from 'vitest';
import {pickHomeTools} from '../../shared/src/home-tools';

describe('Công cụ gợi ý trên trang chủ theo dự án',()=>{
 it('không có tín hiệu thì giữ bộ mặc định như trước',()=>{
  const pick=pickHomeTools(undefined);
  expect(pick.defaults).toBe(true);
  expect(pick.features).toEqual(['assessment','mixer','diff','gradebook','slides']);
  expect(pick.prompts.map(p=>p.id)).toEqual(['lesson','data','plan','read']);
 });

 it('dự án mã nguồn ưu tiên công cụ tra cứu mã và ẩn thẻ sư phạm',()=>{
  const pick=pickHomeTools({projectName:'PVTA',folders:['chatbox','core'],brain:['core/src/desktop/runtime.ts: Điều phối lệnh và phiên làm việc của máy','chatbox/src/App.tsx: Giao diện trò chuyện và lỗi kiểm thử']});
  expect(pick.defaults).toBe(false);
  expect(pick.prompts[0]!.id).toBe('code');
  expect(pick.features).toEqual([]);
 });

 it('dự án giáo viên đưa đúng thẻ theo nội dung',()=>{
  const pick=pickHomeTools({projectName:'Toán 8 - Học kỳ 1',rules:'Ưu tiên bảng điểm và nhận xét học sinh',folders:['Sổ điểm']});
  expect(pick.features[0]).toBe('gradebook');
  expect(pick.prompts.map(p=>p.id)).toContain('data');
 });

 it('khớp nguyên từ, không khớp chuỗi con',()=>{
  const pick=pickHomeTools({projectName:'capital city'});
  expect(pick.prompts.map(p=>p.id)).not.toContain('code');
 });

 it('luôn trả tối đa bốn gợi ý soạn sẵn',()=>{
  const pick=pickHomeTools({projectName:'Giáo án bài giảng kiểm tra điểm tài liệu code'});
  expect(pick.prompts).toHaveLength(4);
  expect(new Set(pick.prompts.map(p=>p.id)).size).toBe(4);
 });
});
