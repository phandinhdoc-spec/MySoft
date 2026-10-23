import {describe,it,expect} from 'vitest';
import {createHelpBrain,helpBrain} from '../src/help-brain';
import {HELP_SECTIONS} from '../src/helpData';

describe('Brain hướng dẫn',()=>{
 it('shares one index and reads actual chapters',()=>{
  expect(helpBrain()).toBe(helpBrain());expect(helpBrain().index().sections).toBe(HELP_SECTIONS.length);
  expect(helpBrain().read('hoi-pvta')?.text).toContain('không gọi model AI');
  expect(helpBrain().read('missing')).toBeUndefined();
 });
 it('finds accented, unaccented, uppercase and prefix queries',()=>{
  const brain=createHelpBrain();
  expect(brain.search('QUY TRINH')[0]?.e.s.id).toBe('quy-trinh');
  expect(brain.search('khóa api').map(h=>h.e.s.id)).toEqual(brain.search('khoa api').map(h=>h.e.s.id));
  expect(brain.search('markdo')[0]?.e.s.id).toBe('soan-markdown');
  expect(brain.search('')).toEqual([]);expect(brain.search('xyznotafeature')).toEqual([]);
 });
 it('uses click context for deictic questions but allows a new named topic',()=>{
  const brain=createHelpBrain(),context={label:'Quy trình',topic:'quy-trinh'};
  expect(brain.ask('Chỗ này dùng như thế nào?',context)[0]?.e.s.id).toBe('quy-trinh');
  expect(brain.ask('khóa api',context)[0]?.e.s.id).toBe('khoa-api');
  expect(brain.ask('Tôi cần nhập khóa API ở đâu?',context)[0]?.e.s.id).toBe('khoa-api');
  expect(brain.ask('xyznotafeature',context)).toEqual([]);
 });
 it('keeps book order and all cross references valid',()=>{
  expect(HELP_SECTIONS[0]?.id).toBe('gioi-thieu');
  const ids=HELP_SECTIONS.map(s=>s.id);expect(new Set(ids).size).toBe(ids.length);
  for(const section of HELP_SECTIONS)for(const match of JSON.stringify(section.body).matchAll(/\[\[([a-z0-9-]+)\]\]/g))expect(ids).toContain(match[1]);
 });
});
