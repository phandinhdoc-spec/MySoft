import {describe,expect,it} from 'vitest';
import {catalog} from '../src/desktop/github-ops';
import {confirmationText,githubRequirementHelp,unavailableReasons,validateValues} from '../src/desktop/github-model';
import type {GithubStatus} from '../src/desktop/github-model';

const find=(id:string)=>{
 const op=catalog().operations.find(op=>op.id===id);
 if(!op)throw Error(`Missing ${id}`);
 return op;
};
describe('GitHub catalog contract',()=>{
 it('covers the agreed operations in eight groups and survives JSON transport',()=>{
  const data=catalog();
  expect(data.operations).toHaveLength(53);
  expect(data.groups).toHaveLength(8);
  expect(new Set(data.operations.map(op=>op.id)).size).toBe(data.operations.length);
  expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  for(const op of data.operations){
   expect(data.groups.some(group=>group.id===op.group)).toBe(true);
   expect(op.label.trim()).not.toBe('');
   expect(op.help.trim()).not.toBe('');
   expect(op.result.description.trim()).not.toBe('');
   for(const requirement of op.requires)expect(githubRequirementHelp[requirement]).toBeTruthy();
   expect(new Set(op.fields.map(f=>f.key)).size).toBe(op.fields.length);
   for(const f of op.fields){
    expect(f.help).toBeTruthy();
    expect(f.maxLength).toBeGreaterThan(0);
    if(f.kind==='select')expect(!!f.options?.length||!!f.source).toBe(true);
    if(f.default!==undefined)expect(f.options?.some(o=>o.value===f.default)).toBe(true);
   }
   if(op.risk==='danger')expect(op.confirmation.kind).not.toBe('none');
   if(op.confirmation.kind==='field'||op.confirmation.kind==='when'){
    const key=op.confirmation.field;
    expect(op.fields.some(f=>f.key===key&&f.required)).toBe(true);
   }
  }
 });
 it('cannot corrupt the catalog by mutating a response',()=>{
  const data=catalog();
  data.operations[0]!.label='broken';
  data.operations.length=0;
  expect(catalog().operations[0]!.label).not.toBe('broken');
  expect(catalog().operations).toHaveLength(53);
 });
 it.each([
  ['repoDelete',{repository:'school/lessons'},'school/lessons'],
  ['discardAll',{},'BỎ HẾT'],['discardFile',{path:'lesson.txt'},'BỎ'],
  ['deleteBranch',{branch:'lesson'},'lesson'],
  ['collaboratorRemove',{account:'teacher'},'teacher'],
  ['repoVisibility',{visibility:'public'},'CÔNG KHAI'],
  ['repoVisibility',{visibility:'private'},null],
  ['repoCreate',{visibility:'public'},'CÔNG KHAI'],
  ['createFromFolder',{visibility:'public'},'CÔNG KHAI'],
 ] as [string,Record<string,string>,string|null][])('resolves confirmation for %s',(id,values,expected)=>{
  expect(confirmationText(find(id),values)).toBe(expected);
 });
 it('fails closed for a missing target confirmation',()=>{
  expect(()=>confirmationText(find('repoDelete'),{})).toThrow();
 });
 it('rejects malformed inputs, unknown fields, invalid choices and oversized messages',()=>{
  expect(validateValues(find('commit'),null)).not.toEqual([]);
  expect(validateValues(find('commit'),{message:3})).not.toEqual([]);
  expect(validateValues(find('commit'),{message:'   '})).not.toEqual([]);
  expect(validateValues(find('commit'),{message:'a'.repeat(2001)})).not.toEqual([]);
  expect(validateValues(find('commit'),{message:'ok',shell:'rm'})).not.toEqual([]);
  expect(validateValues(find('commit'),{message:'a\0b'})).not.toEqual([]);
  expect(validateValues(find('repoCreate'),{repository:'a/b',visibility:'internal'})).not.toEqual([]);
  expect(validateValues(find('issueClose'),{repository:'a/b',number:'-1'})).not.toEqual([]);
  expect(validateValues(find('commit'),{message:'Sửa giáo án'})).toEqual([]);
  expect(validateValues(find('repoDescription'),{repository:'a/b',description:''})).toEqual([]);
 });
 it('does not require a local repository for account and remote-only actions',()=>{
  for(const id of ['repoList','repoCreate','repoDelete','logout','clone']){
   expect(find(id).requires).not.toContain('repository');
  }
  expect(find('init').requires).toContain('noRepository');
 });
 it('requires clean state and no unfinished operation for merging',()=>{
  for(const id of ['merge','pull']){
   expect(find(id).requires).toEqual(expect.arrayContaining(['clean','noOperation','idle']));
  }
  // Sync saves unsaved work itself, so it only needs no unfinished operation.
  expect(find('sync').requires).toEqual(expect.arrayContaining(['noOperation','idle','identity']));
  expect(find('sync').requires).not.toContain('clean');
  expect(find('undoCommit').requires).toContain('unpublishedHead');
  expect(find('repoDelete').requires).toEqual(expect.arrayContaining(['repoAdmin','deleteScope']));
 });
 it('treats unknown conditions as unavailable and shows Vietnamese reasons',()=>{
  const status:GithubStatus={
   version:1,observedAt:0,tools:{git:{installed:true},gh:{installed:false}},
   auth:{state:'unknown',host:'github.com'},conditions:{git:true},unavailable:{folder:'Chọn thư mục trước.'},suggestions:[],
  };
  expect(unavailableReasons(find('init'),status)).toContain('Chọn thư mục trước.');
  expect(unavailableReasons(find('init'),status)).toContain(githubRequirementHelp.idle);
  expect(unavailableReasons(find('init'),status)).not.toContain(githubRequirementHelp.git);
 });
});
