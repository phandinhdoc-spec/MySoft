import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {readMatrixDocument, matrixReportMarkdown} from '../../shared/src/assessment-source.js';

const source=readFileSync(new URL('./fixtures/assessment/matrix.txt',import.meta.url),'utf8');
it('reads multi-level headers and mixed-level true/false ideas without allocating whole questions',()=>{
 const report=readMatrixDocument(source);
 expect(report.cells.find(c=>c.address==='R9C4')).toMatchObject({topic:'Chủ đề 1: Năng lượng cơ học',form:'II',value:2,unit:'ý',level:'NB',code:'TN1.1'});
 expect(report.cells.find(c=>c.address==='R9C9')).toMatchObject({value:2,unit:'ý',level:'VD'});
 expect(report.cells.find(c=>c.address==='R7C11')).toMatchObject({form:'III',value:1,unit:'câu/ý',level:'TH'});
 expect(report.cells.some(c=>c.address==='R17C4')).toBe(false);
 expect(report.summaries.some(c=>c.address==='R17C4')).toBe(true);
 expect(report.cells.find(c=>c.address==='R5C5')?.value).toBeNull();
 expect(matrixReportMarkdown(report,'ma tran.docx')).toContain('R9C9');
});
it('does not infer a level across a blank header or turn a fraction into a count',()=>{
 const report=readMatrixDocument(source.replace('[R9C9] 2','[R9C9] 1/2'));
 expect(report.cells.find(c=>c.address==='R9C9')).toMatchObject({value:null,raw:'1/2'});
 expect(report.cells.find(c=>c.address==='R5C5')?.level).toBeNull();
});
it('reports unreadable structure instead of producing a sample',()=>{
 const report=readMatrixDocument('ma trận không có bảng');
 expect(report.cells).toEqual([]);expect(report.issues.length).toBeGreaterThan(0);
});
