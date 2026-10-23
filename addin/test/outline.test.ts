import {describe,it,expect} from 'vitest';
import {outlineHint,validateOutline,abbreviationRows,type ParagraphInfo} from '../src/office/outline';
const p=(index:number,text:string,more:Partial<ParagraphInfo>={}):ParagraphInfo=>({index,text,style:'Normal',inTable:false,isList:false,...more});
describe('semantic outline',()=>{
 it('does not promote table cells, questions or numbered lists to headings',()=>{
  for(const q of [p(0,'1. Kết quả',{inTable:true}),p(1,'1. Yêu cầu',{isList:true}),p(2,'Câu 1. Tính diện tích'),p(3,'A. Đáp án')])expect(outlineHint(q).role).toBe('body');
 });
 it('returns tentative hierarchy and caption hints, not automatic classifications',()=>{
  expect(outlineHint(p(4,'1.2.3 Phạm vi nghiên cứu'))).toMatchObject({role:'heading3',confidence:'low'});
  expect(outlineHint(p(0,'TRƯỜNG THCS PHAN VĂN TRỊ'))).toMatchObject({role:'title',confidence:'low'});
  expect(outlineHint(p(5,'Bảng 1. Kết quả đo'))).toMatchObject({role:'tableCaption'});
  expect(outlineHint(p(6,'Hình 1. Sơ đồ'))).toMatchObject({role:'figureCaption'});
 });
 it('validates all changes, exact anchors and parent levels before writing',()=>{
  const paras=[p(0,'Báo cáo'),p(1,'Mục tiêu'),p(2,'Đối tượng')];
  expect(validateOutline([{index:1,expectedText:'Mục tiêu',role:'heading1'},{index:2,expectedText:'Đối tượng',role:'heading2'}],paras)).toHaveLength(2);
  expect(()=>validateOutline([{index:1,expectedText:'Mục tiêu cũ',role:'heading1'}],paras)).toThrow('thay đổi');
  expect(()=>validateOutline([{index:1,expectedText:'Mục tiêu',role:'heading3'}],paras)).toThrow('nhảy');
  expect(()=>validateOutline([{index:1,expectedText:'Mục tiêu',role:'heading1'},{index:1,expectedText:'Mục tiêu',role:'heading2'}],paras)).toThrow('hai vai trò');
  expect(()=>validateOutline([{index:0,expectedText:'Tên cột',role:'heading1'}],[p(0,'Tên cột',{inTable:true})])).toThrow('ô bảng');
 });
 it('requires source evidence for each abbreviation and rejects invented meanings',()=>{
  const source='Khoa học tự nhiên (KHTN) là môn học.';
  expect(abbreviationRows([{term:'KHTN',meaning:'Khoa học tự nhiên',evidence:source}],source)).toEqual([['KHTN','Khoa học tự nhiên']]);
  expect(()=>abbreviationRows([{term:'KHTN',meaning:'Nghĩa đoán',evidence:source}],source)).toThrow('dẫn chứng');
 });
});
