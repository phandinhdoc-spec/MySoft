import {describe,expect,it} from 'vitest';
import {selfTipTarget} from '../src/self-tip';
import {CAPABILITIES} from '../../core/src/desktop/self-knowledge';
describe('Gợi ý AI nền trên thanh trên',()=>{
 it('các đích điều hướng chỉ gán cho mã có trong danh mục',()=>{
  const ids=new Set(CAPABILITIES.map(c=>c.id));
  for(const id of ['notebook','workflow','skills','resume','history','plan-recovery','learning-folder','workspace','github','terminal','help','appearance','refine','feedback'])expect(ids.has(id),id).toBe(true);
  expect(selfTipTarget('notebook')).toBe('notebook');
  expect(selfTipTarget('plan')).toBeUndefined();
 });
});
