import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseSpecificationDocument} from '../../shared/src/teacherSuite.js';
import {readAssessmentRows,auditAssessmentTable} from '../../shared/src/assessment-source.js';

const source=readFileSync(new URL('./fixtures/assessment/spec.txt',import.meta.url),'utf8');
it('reads the supplied Word table without substituting or allocating a sample',()=>{
 const result=parseSpecificationDocument(source);
 expect(result.items.some(x=>x.content.includes('biểu thức tính động năng'))).toBe(true);
 expect(result.items.every(x=>!x.selected&&x.part1Count===0&&x.part2Count===0&&x.part3Points===0)).toBe(true);
 expect(result.items.some(x=>x.questionRef==='19a')).toBe(true);
 expect(result.items.some(x=>x.content.includes('Tính được năng lượng của dòng điện'))).toBe(true);
});
it('keeps blank quantities and competency codes separate from allocations',()=>{
 const parsed=parseSpecificationDocument(source);
 const row=parsed.items.find(x=>x.questionRef==='19a')!;
 expect(row.source).toMatchObject({form:'II',count:'1',code:'1,1'});
 expect(row.part2Count).toBe(0);
 expect(parsed.items.find(x=>x.content.includes('biểu thức tính động năng'))?.source?.ref).toBe('Bảng 2 · R3C3');
});
it('compares matrix detail against its own totals with table-scoped merge origins',()=>{
 const matrix=readFileSync(new URL('./fixtures/assessment/matrix.txt',import.meta.url),'utf8');
 const rows=readAssessmentRows(matrix);
 expect(rows.find(r=>r.row===9)?.cells[0]?.origin).toBe('R8C1');
 expect(auditAssessmentTable(matrix).some(x=>x.includes('R17C9'))).toBe(true);
});
it('does not invent a specification when the input is empty or unrecognised',()=>{
 expect(parseSpecificationDocument('').items).toEqual([]);
 expect(parseSpecificationDocument('Không có bảng yêu cầu').items).toEqual([]);
});
