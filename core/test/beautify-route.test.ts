import {it,expect} from 'vitest';
import {beautifyRoute} from '../src/desktop/beautify-route';
it('routes Office files and named Office requests to the add-in',()=>{
 for(const name of ['de.docx','diem.xlsx','bai.pptx','old.doc','macro.xlsm'])expect(beautifyRoute('Làm đẹp',[name])).toBe('office');
 for(const text of ['Làm đẹp file Word','Dàn trang Excel','Làm đẹp PowerPoint'])expect(beautifyRoute(text,[])).toBe('office');
 expect(beautifyRoute('Làm đẹp',[],true)).toBe('office');
});
it('keeps text/Typst and asks for a target with mixed attachments',()=>{
 expect(beautifyRoute('Làm đẹp',['draft.md'])).toBe('typst');
 expect(beautifyRoute('Làm đẹp',['draft.md','report.docx'])).toBe('choose');
 expect(beautifyRoute('Làm đẹp draft.md',['draft.md','report.docx'],true)).toBe('typst');
});
