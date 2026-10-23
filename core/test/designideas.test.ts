import {it,expect} from 'vitest';
import {parseSuggestion,buildSuggestPrompt} from '../src/themesuggest';
import {buildBeautifyPrompt} from '../src/beautify';
import {designRequest} from '@pvta/shared';
const idea=(n:number)=>({id:`custom-${n}`,name:`Ý tưởng ${n}`,reason:'Phù hợp tài liệu',layout:`Bố cục ${n}`,hierarchy:'Ba cấp rõ ràng',tables:'Đầu bảng lặp lại',fonts:{heading:'Arial',body:'Times New Roman'},colors:{accent:'#203040',text:'#111111',background:'#ffffff'},bodySize:13,headingSizes:[19,16,14]});
it('accepts three AI-authored ideas without any Office catalog',()=>{
 const result=parseSuggestion(JSON.stringify({direction:'Báo cáo',ideas:[idea(1),idea(2),idea(3)]}),'word');
 expect(result.ideas).toHaveLength(3);expect(result.ideas[0]!.name).toBe('Ý tưởng 1');
 expect(buildSuggestPrompt('word','Report','Modern').request).not.toContain('danh_muc');
});
it('does not substitute presets for malformed, duplicate or unsafe ideas',()=>{
 expect(parseSuggestion('invalid').ideas).toEqual([]);
 expect(parseSuggestion(JSON.stringify({ideas:[{...idea(1),colors:{accent:'url(evil)'}}]})).ideas).toEqual([]);
 expect(parseSuggestion(JSON.stringify({ideas:[idea(1),idea(1)]})).ideas).toHaveLength(1);
 expect(parseSuggestion(JSON.stringify({ideas:[{...idea(1),headingSizes:[12,18,16]}]})).ideas).toEqual([]);
 expect(parseSuggestion(JSON.stringify({ideas:[idea(1)]}),'powerpoint').ideas).toEqual([]);
});
it('preserves the selected idea in the actual beautification prompt',()=>{
 const selected=parseSuggestion(JSON.stringify({ideas:[idea(1)]})).ideas[0]!;
 const request=designRequest(selected);const prompt=buildBeautifyPrompt({host:'word',design:request});
 expect(prompt).toContain('Ý tưởng 1');expect(prompt).toContain('Bố cục 1');expect(prompt).toContain('"headingSizes":[19,16,14]');expect(prompt).toContain('Không thay bằng theme/preset Office');
});
