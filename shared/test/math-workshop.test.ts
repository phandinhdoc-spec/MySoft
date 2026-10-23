import {describe,it,expect} from 'vitest';
import {calculateMath,defaultWorksheet,validateWorksheet,graphSegments,geometryDerived,generateVariants,worksheetChecks} from '../src/math-workshop';
describe('máy tính Toán',()=>{
 it('giữ chính xác số hữu tỉ và thứ tự phép toán',()=>{
  expect(calculateMath('0.1+0.2').value).toBe('0.3');
  expect(calculateMath('1/3').fraction).toBe('1/3');
  expect(calculateMath('-2^2').value).toBe('-4');
  expect(calculateMath('2^3^2').value).toBe('512');
 });
 it('tách căn gần đúng, góc độ và radian',()=>{
  expect(calculateMath('sqrt(2)').exact).toBe(false);
  expect(calculateMath('sqrt(2)').fraction).toBeUndefined();
  expect(Number(calculateMath('sin(30)','deg').value)).toBeCloseTo(.5);
  expect(Number(calculateMath('sin(pi/2)','rad').value)).toBeCloseTo(1);
  expect(calculateMath('sin(30)').exact).toBe(false);
 });
 it.each(['1/0','sqrt(-1)','tan(90)','log(0)','sin(30);alert(1)','constructor(1)','round(1,999999999)','sin('.repeat(50)+'1', '2pi'])('từ chối đầu vào %s',expr=>expect(()=>calculateMath(expr)).toThrow());
});
describe('mô hình học liệu',()=>{
 it('không nối đường qua cực hàm tỉ lệ nghịch',()=>{
  const parts=graphSegments({kind:'reciprocal',a:1,b:0,c:0,extent:10});
  expect(parts.length).toBe(2);expect(parts.every(ps=>ps.every(p=>p.x<0)||ps.every(p=>p.x>0))).toBe(true);
 });
 it('từ chối hệ số làm đổi họ hàm và dữ liệu không hữu hạn',()=>{
  const w=defaultWorksheet();w.graph.a=0;expect(()=>worksheetChecks(w)).toThrow();
  w.graph.a=NaN;expect(()=>validateWorksheet(w)).toThrow();
 });
 it('giữ chân đường cao trên đường thẳng, kể cả ngoài đoạn',()=>{
  const g={...defaultWorksheet().geometry,a:{x:7,y:5},b:{x:0,y:0},c:{x:4,y:0}};
  const {h}=geometryDerived(g);expect(h).toEqual({x:7,y:0});
  expect(()=>geometryDerived({...g,a:{x:2,y:0}})).toThrow(/suy biến/);
 });
 it('tái tạo, không lặp và đủ bài trong cả ba họ',()=>{
  for(const family of ['linear','fraction','graph'] as const){
   const vs=generateVariants(family,75,30);expect(vs).toEqual(generateVariants(family,75,30));
   expect(new Set(vs.map(v=>v.question)).size).toBe(30);
  }
 });
 it('đáp án phương trình thỏa phương trình sinh ra qua nhiều mã',()=>{
  for(let seed=1;seed<50;seed++)for(const v of generateVariants('linear',seed,30)){
   const match=v.question.match(/(\d+)x \+ \((-?\d+)\) = (-?\d+)/)!;
   const answer=Number(v.answer.split('=')[1]);expect(Number(match[1])*answer+Number(match[2])).toBe(Number(match[3]));
  }
 });
});
