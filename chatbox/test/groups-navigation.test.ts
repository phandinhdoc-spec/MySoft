import {it,expect,vi} from 'vitest';
const hooks=vi.hoisted(()=>({states:[] as unknown[]}));
vi.mock('react',async()=>{const real=await vi.importActual<typeof import('react')>('react');return {...real,useState:()=>[hooks.states.shift(),vi.fn()],useEffect:()=>{}};});
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
import {BriefingStrip} from '../src/GroupsPanel';
it('Xem văn bản mới chuyển đúng tab và mã nhóm từ bản tin',()=>{
 hooks.states=[{show:true,greeting:'Chào thầy cô',items:[{id:'docs',text:'Văn bản mới',action:'Xem',target:'documents',group:'toan'}]},false];
 const go=vi.fn();const result=BriefingStrip({state:{groups:{configured:true}} as never,go});
 const item=result!.props.children[1][0];item.props.children[2].props.onClick();
 expect(go).toHaveBeenCalledWith('documents','toan');
});
