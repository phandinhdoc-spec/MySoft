import type {WorkflowStep} from '../../core/src/desktop/types';

/** Keep a fork beside its sibling and make their existing consumers wait for both. */
export function forkWorkflow(steps:WorkflowStep[],sourceId:string,branch:WorkflowStep):WorkflowStep[]{
 const source=steps.find(s=>s.id===sourceId);
 if(!source)return steps;
 return steps.flatMap(s=>[
  {...s,dependsOn:s.dependsOn?.includes(sourceId)?[...s.dependsOn,branch.id]:s.dependsOn},
  ...(s.id===sourceId?[{...branch,dependsOn:[...(source.dependsOn??[])]}]:[]),
 ]);
}

export function layoutWorkflow(steps:WorkflowStep[]){
 const levels=new Map<string,number>();
 const visiting=new Set<string>();
 const byId=new Map(steps.map(s=>[s.id,s]));
 let cyclic=false;
 function level(id:string):number{
  if(levels.has(id))return levels.get(id)!;
  if(visiting.has(id)){cyclic=true;return 0;}
  visiting.add(id);
  const parents=(byId.get(id)?.dependsOn??[]).filter(p=>byId.has(p));
  const n=parents.length?1+Math.max(...parents.map(level)):0;
  visiting.delete(id);levels.set(id,n);return n;
 }
 steps.forEach(s=>level(s.id));
 const rows=new Map<number,number>();
 const nodes=steps.map(s=>{
  const col=levels.get(s.id)!;const row=rows.get(col)??0;rows.set(col,row+1);
  return {id:s.id,x:24+col*310,y:24+row*290};
 });
 const positions=new Map(nodes.map(n=>[n.id,n]));
 const edges=steps.flatMap(s=>(s.dependsOn??[]).flatMap(id=>{
  const from=positions.get(id),to=positions.get(s.id);
  return from&&to?[{from,to}]:[];
 }));
 return {nodes,edges,cyclic,width:Math.max(320,...nodes.map(n=>n.x+280)),height:Math.max(310,...nodes.map(n=>n.y+270))};
}

/** Insert between the chosen node and its consumers without changing other branches. */
export function insertWorkflowAfter<T extends {id:string;dependsOn?:string[]}>(steps:T[],sourceId:string,step:T):T[]{
 if(!steps.some(s=>s.id===sourceId))return steps;
 return steps.flatMap(s=>[
  {...s,dependsOn:s.dependsOn?.map(id=>id===sourceId?step.id:id)},
  ...(s.id===sourceId?[{...step,dependsOn:[sourceId]}]:[]),
 ]);
}
