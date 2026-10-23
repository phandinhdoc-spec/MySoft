import {describe,expect,it} from 'vitest';
import {summarizeIndex,parseDigest,digestPrompt} from '../src/desktop/brain-digest.js';

const rec=(path:string,name:string,kind='function')=>JSON.stringify({_type:'tag',path,name,kind,line:1});
describe('Brain digest',()=>{
 const jsonl=[rec('core/src/a.ts','runA'),rec('core/src/b.ts','runB'),rec('chatbox/src/App.tsx','App'),rec('node_modules/x/i.js','skip')].join('\n');
 it('groups by directory, skips vendor dirs, sends names only',()=>{
  const {areas,fingerprint}=summarizeIndex(jsonl);
  expect(areas.map(a=>a.path).sort()).toEqual(['chatbox/src','core/src']);
  expect(areas.find(a=>a.path==='core/src')).toMatchObject({files:2,symbols:2,sample:['runA','runB']});
  expect(fingerprint).toBe(summarizeIndex(jsonl).fingerprint);
  expect(summarizeIndex(jsonl+'\n'+rec('core/src/c.ts','runC')).fingerprint).not.toBe(fingerprint);
 });
 it('drops roles for unknown paths and bad JSON',()=>{
  const {areas}=summarizeIndex(jsonl);
  const out=parseDigest('{"areas":[{"path":"core/src","role":"Backend"},{"path":"fake","role":"x"}]}',areas);
  expect(out).toEqual([{path:'core/src',files:2,symbols:2,role:'Backend'}]);
  expect(parseDigest('không phải json',areas)).toEqual([]);
 });
 it('renders nothing without a digest',()=>{expect(digestPrompt(undefined)).toBe('');});
});
