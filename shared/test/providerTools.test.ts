import {describe,it,expect} from 'vitest';
import {parseProviderCalls,visibleModelText} from '../src/providerTools';
const call='<｜DSML｜function_calls><｜DSML｜invoke name="office_rag_search"><｜DSML｜parameter name="query" string="true">Ngày 7 &amp; báo cáo</｜DSML｜parameter><｜DSML｜parameter name="k" string="false">3</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜function_calls>';
describe('provider tool compatibility',()=>{
 it('parses DSML string and JSON arguments',()=>{expect(parseProviderCalls(call)).toEqual({invalid:false,calls:[{tool:'office_rag_search',args:{query:'Ngày 7 & báo cáo',k:3}}]});});
 it('accepts ASCII calls markers and legacy fences',()=>{expect(parseProviderCalls(call.replaceAll('｜','|').replaceAll('function_calls','calls')).calls).toHaveLength(1);expect(parseProviderCalls('```office-tool\n{"tool":"office_rag_search","args":{"query":"a"}}\n```').calls).toHaveLength(1);});
 it('never exposes DSML even when the stream is split at every character',()=>{const raw='Đang đọc. '+call+'\nKết quả.';let sent='';for(let i=1;i<=raw.length;i++){const next=visibleModelText(raw.slice(0,i),true);expect(next).not.toMatch(/DSML|invoke|parameter|office_rag/);expect(next.startsWith(sent)).toBe(true);sent=next;}expect(sent).toBe('Đang đọc. \nKết quả.');});
 it('removes historic and truncated tool markup but keeps normal prose and code',()=>{expect(visibleModelText(call)).toBe('');expect(visibleModelText(call.slice(0,100))).toBe('');expect(visibleModelText('Ví dụ:\n```python\nprint(1)\n```')).toContain('print(1)');});
 it('rejects malformed argument JSON and prototype keys without evaluating markup',()=>{expect(parseProviderCalls(call.replace('>3<','>not-json<')).invalid).toBe(true);expect(parseProviderCalls(call.replace('name="query"','name="__proto__"')).invalid).toBe(true);expect(parseProviderCalls('<invoke name="anything"></invoke>').calls).toEqual([]);});
});
