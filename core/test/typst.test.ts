import {it,expect} from 'vitest';
import {buildSuggestPrompt} from '../src/themesuggest';
import {validateTypstProposal} from '../src/desktop/typst';
it('suggests independent layout without defaulting to Office catalog',()=>{
 const p=buildSuggestPrompt('word','Báo cáo có bảng','Làm đẹp',{host:'word',themes:[],colors:[],fonts:[],source:'builtin',dirs:[]});
 expect(p.system).toContain('ĐÚNG 3 phương án');expect(p.system).toContain('Không dùng danh mục');
});
it('rejects invalid bundle destinations and empty source',()=>{
 expect(validateTypstProposal({path:'/tmp/document.pdf',content:'text'})).toBe(false);
 expect(validateTypstProposal({path:'/tmp/document.zip',content:''})).toBe(false);
 expect(validateTypstProposal({path:'/tmp/document.zip',content:'= Report'})).toBe(true);
});
