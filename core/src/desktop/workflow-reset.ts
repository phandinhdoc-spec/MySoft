import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Chat,Plan,WorkflowRun} from './types.js';
import {stepActions,stepPaths} from './plan-recovery.js';

/** Inventory only regular files; never follow symlinks or inspect dependency/cache trees. */
export function workflowFiles(root:string|undefined):string[]|undefined{
 if(!root)return undefined;
 const files:string[]=[];let count=0;
 const visit=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(++count>20000)throw Error('inventory limit');
  if(e.name.startsWith('.')||['node_modules','target'].includes(e.name))continue;
  const file=path.join(dir,e.name);
  if(e.isDirectory())visit(file);else if(e.isFile())files.push(file);
 }};
 try{visit(fs.realpathSync(root));return files;}catch{return undefined;}
}
export function captureWorkflowFiles(run:WorkflowRun,root:string|undefined,before:string[]|undefined){
 if(!before)return;
 const after=workflowFiles(root);if(!after)return;
 const old=new Set(before);
 run.generatedFiles=[...new Set([...(run.generatedFiles??[]),...after.filter(f=>!old.has(f))])];
}

/** Move known generated files aside, preserving a recovery copy and rollback on failure. */
export function archiveWorkflowFiles(run:WorkflowRun,protectedPaths:string[]=[]){
 const protectedReal=protectedPaths.map(p=>{try{return fs.realpathSync(p);}catch{return path.resolve(p);}});
 const files=[...new Set(run.generatedFiles??[])].filter(file=>{
  if(!path.isAbsolute(file))return false;
  let real:string;
  try{if(!fs.lstatSync(file).isFile())return false;real=fs.realpathSync(file);}catch{return false;}
  return !protectedReal.some(p=>real===p||real.startsWith(p+path.sep));
 });
 const moved:{from:string;to:string}[]=[];
 try{
  for(const from of files){
   const dir=path.join(path.dirname(from),'.pvta-reset',randomUUID());fs.mkdirSync(dir,{recursive:true});
   const to=path.join(dir,path.basename(from));fs.renameSync(from,to);moved.push({from,to});
  }
 }catch(e){for(const m of moved.reverse())fs.renameSync(m.to,m.from);throw e;}
 run.resetBackup=[...(run.resetBackup??[]),...moved];run.generatedFiles=[];
}

export function resetPlanState(chat:Chat,plan:Plan,run:WorkflowRun,protectedPaths:string[]=[]){
 // Old Plan checkpoints can prove that a declared output did not exist before execution.
 const proven=plan.steps.flatMap(s=>[
  ...stepPaths(chat,s).filter(p=>s.checkpoint?.before.some(m=>m.path===p&&m.state==='missing')),
  ...stepActions(chat,s).filter(a=>a.state==='done'&&['create_office','create_typst'].includes(a.kind)).flatMap(a=>[a.output||a.path].filter((p):p is string=>!!p)),
 ]);
 run.generatedFiles=[...new Set([...(run.generatedFiles??[]),...proven])];
 archiveWorkflowFiles(run,protectedPaths);
 for(const step of plan.steps){
  for(const a of stepActions(chat,step))if(a.state==='pending')a.state='declined';
  step.status='waiting';
  delete step.output;delete step.error;delete step.failure;delete step.checkpoint;delete step.replacements;
  delete step.startedAt;delete step.endedAt;delete step.logs;
 }
 plan.approved=false;
}
