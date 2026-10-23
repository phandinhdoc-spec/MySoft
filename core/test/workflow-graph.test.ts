import {expect,it} from 'vitest';
import {forkWorkflow,layoutWorkflow} from '../../chatbox/src/workflow-graph';
import {normalizeWorkflow,WorkflowRunner} from '../src/desktop/workflows';

it('forks a chain into simultaneous branches and joins both actual results',async()=>{
 const wf=normalizeWorkflow({mode:'parallel',steps:[{id:'a',prompt:'A'},{id:'b',prompt:'B',dependsOn:['a']},{id:'c',prompt:'Join {{prev}}',dependsOn:['b']}]});
 const branch=normalizeWorkflow({steps:[{id:'d',name:'D',prompt:'D'}]}).steps[0]!;
 wf.steps=forkWorkflow(wf.steps,'b',branch);
 expect(wf.steps.find(s=>s.id==='c')!.dependsOn).toEqual(['b','d']);
 const graph=layoutWorkflow(wf.steps);
 const b=graph.nodes.find(n=>n.id==='b')!,d=graph.nodes.find(n=>n.id==='d')!;
 expect(b.x).toBe(d.x);expect(b.y).not.toBe(d.y);expect(graph.edges).toHaveLength(4);
 const calls:string[]=[];const pending=new Map<string,(v:string)=>void>();
 const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{
  calls.push(text);if(text.startsWith('B')||text.startsWith('D'))return new Promise(resolve=>pending.set(text[0]!,resolve));return text;
 }});
 const task=runner.run(wf.id);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect([...pending.keys()]).toEqual(['B','D']);expect(calls.some(s=>s.startsWith('Join'))).toBe(false);
 pending.get('B')!('result B');pending.get('D')!('result D');
 expect((await task).status).toBe('success');
 expect(calls.at(-1)).toContain('result B');expect(calls.at(-1)).toContain('result D');
});

it('lays out reversed dependencies and handles a draft cycle without recursion failure',()=>{
 const steps=normalizeWorkflow({steps:[{id:'a'},{id:'b',dependsOn:['a']}]}).steps.reverse();
 const g=layoutWorkflow(steps);expect(g.nodes[0]!.x).toBeGreaterThan(g.nodes[1]!.x);
 steps[1]!.dependsOn=['b'];expect(layoutWorkflow(steps).cyclic).toBe(true);
});
