import {describe,it,expect} from 'vitest';
import {copyWorkflow,exportWorkflow,importWorkflow,selectWorkflows} from '../src/workflow-tools';
import type {Workflow} from '../../core/src/desktop/types';
const workflow=(id:string,name:string,updatedAt=1):Workflow=>({id,name,updatedAt,mode:'parallel',runs:[],folder:'/private/work',input:{kind:'chat',value:'private input'},steps:[{id:'a',name:'Nguồn',prompt:'Read',choice:'auto',access:'full',dependsOn:[]},{id:'b',name:'Tổng hợp',prompt:'Summarize {{prev}}',choice:'auto',access:'read',dependsOn:['a']}]});
describe('workflow management',()=>{
 it('searches Vietnamese names and steps, filters status, sorts pinned first without mutating source',()=>{
  const a=workflow('a','Đề kiểm tra',2),b={...workflow('b','Bài giảng',3),pinned:true},c={...workflow('c','Ôn tập',1),runs:[{id:'r',status:'error' as const,startedAt:1,steps:[]}]};
  const list=[a,b,c];
  expect(selectWorkflows(list,'de kiem','all','recent').map(w=>w.id)).toEqual(['a']);
  expect(selectWorkflows(list,'tong hop','all','recent').map(w=>w.id)).toEqual(['b','a','c']);
  expect(selectWorkflows(list,'','error','recent')).toEqual([c]);
  expect(selectWorkflows(list,'','new','recent')).toEqual([b,a]);
  expect(selectWorkflows(list,'','pinned','name')).toEqual([b]);
  expect(list).toEqual([a,b,c]);
 });
 it('duplicates with fresh identities and remapped dependencies, isolating mutations',()=>{
  const source={...workflow('old','A'),planId:'plan',pinned:true};const copy=copyWorkflow(source);
  expect(copy.id).not.toBe(source.id);expect(copy.steps[1]!.dependsOn).toEqual([copy.steps[0]!.id]);
  expect(copy).not.toHaveProperty('runs');expect(copy).not.toHaveProperty('planId');expect(copy.pinned).toBe(false);
  copy.steps[0]!.prompt='changed';expect(source.steps[0]!.prompt).toBe('Read');
 });
 it('exports portable templates and imports read-only without local context or history',()=>{
  const source=workflow('a','A'),text=exportWorkflow(source),copy=importWorkflow(text);
  expect(text).not.toContain('/private/work');expect(text).not.toContain('private input');
  expect(copy.folder).toBeUndefined();expect(copy.input).toBeUndefined();expect(copy.steps.every(s=>s.access==='read'&&s.choice==='auto')).toBe(true);
  expect(copy.steps[1]!.dependsOn).toEqual([copy.steps[0]!.id]);
 });
 it('rejects malformed templates and missing references',()=>{
  expect(()=>importWorkflow('{}')).toThrow();expect(()=>importWorkflow('bad')).toThrow();
  const data=JSON.parse(exportWorkflow(workflow('a','A')));data.workflow.steps[1].dependsOn=['missing'];
  expect(()=>importWorkflow(JSON.stringify(data))).toThrow('kết nối');
  data.workflow.steps[1].id='a';expect(()=>importWorkflow(JSON.stringify(data))).toThrow('bước');
 });
});

it('sorts newest creation first even when an older workflow was updated or pinned',()=>{
 const old={...workflow('old','Cũ',900),createdAt:100,pinned:true};
 const newest={...workflow('new','Mới',200),createdAt:200};
 expect(selectWorkflows([old,newest],'','all','created').map(w=>w.id)).toEqual(['new','old']);
});
