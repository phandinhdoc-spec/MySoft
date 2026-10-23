import {expect,it} from 'vitest';
import {markdownList,markdownFile,workflowInputLink} from '../src/composer-markdown';
import {inputPath} from '../../core/src/desktop/workflow-language';

it('creates empty list items and handles a selection ending at the next line',()=>{
 expect(markdownList('',0,0,false)).toEqual({text:'- ',caret:2});
 expect(markdownList('',0,0,true)).toEqual({text:'1. ',caret:3});
 expect(markdownList('a\nb\nc',0,4,true).text).toBe('1. a\n2. b\nc');
 expect(markdownList('\na',0,0,false).text).toBe('- \na');
});
it('replaces list markers while preserving indentation and outside text',()=>{
 expect(markdownList('Đầu\n  - Một\n  2. Hai\nCuối',6,21,true).text).toBe('Đầu\n  1. Một\n  2. Hai\nCuối');
});
it('encodes file targets and escapes labels without losing extensions',()=>{
 expect(markdownFile('/tmp/Bài [1] (mới).pdf')).toBe('[Bài \\[1\\] (mới).pdf](</tmp/Bài [1] (mới).pdf>)\n');
 expect(markdownFile('/tmp/a%20>b.txt')).toContain('a%2520%3Eb.txt>');
});
it.each(['/tmp/Bài [1] (mới).pdf','/tmp/ảnh 100%20> "mới".png','C:\\Bài học\\ảnh.png'])('quoted workflow File/Image preserve the path %s',path=>{
 for(const image of [false,true]){
  const link=workflowInputLink(path,image).trim();
  expect(link.startsWith('"')).toBe(true);
  expect(inputPath(link)).toBe(path);
 }
});
