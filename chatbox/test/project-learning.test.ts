import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
const hooks=vi.hoisted(()=>({states:[] as unknown[]}));
vi.mock('react',async()=>{const real=await vi.importActual<typeof import('react')>('react');return {...real,useState:(initial:unknown)=>hooks.states.length?[hooks.states.shift(),vi.fn()]:[initial,vi.fn()]};});
vi.mock('../src/ObjectMenu',()=>({useObjectMenu:()=>({handlers:()=>({}),trigger:()=>null,menu:null})}));
vi.mock('../src/ipc',()=>({rpc:vi.fn(),pickFiles:vi.fn()}));
import {ProjectLearning} from '../src/ProjectLearning';
import {rpc,pickFiles} from '../src/ipc';
const project={id:'stem',name:'Báo cáo STEM',rules:'',learning:{folders:['/STEM/Hoc-hoi'],notes:'Mở đầu nêu vấn đề',enabled:true}};
const files=[{id:'old',name:'bao-cao.md',path:'/STEM/Hoc-hoi/bao-cao.md',scope:'project' as const,scopeId:'stem',purpose:'learning' as const,fingerprint:'a',segments:[{ref:'Dòng 1',text:'Cách viết từ năm trước'}]},
 {id:'new',name:'bao-cao.md',path:'/STEM/bao-cao.md',scope:'project' as const,scopeId:'stem',fingerprint:'b',segments:[{ref:'Dòng 1',text:'PRIVATE_CURRENT_DATA'}]}];
function button(tree:React.ReactNode,label:string):React.ReactElement<any>{
 let found:React.ReactElement<any>|undefined;
 function walk(node:React.ReactNode){React.Children.forEach(node,child=>{if(!React.isValidElement<{children?:React.ReactNode}>(child))return;if(child.type==='button'&&child.props.children===label)found=child;else walk(child.props.children);});}
 walk(tree);if(!found)throw Error('Không có nút '+label);return found;
}
beforeEach(()=>{hooks.states=[];vi.clearAllMocks();});
it('presents historical learning separately and explains current-year data and review',()=>{
 const markup=renderToStaticMarkup(React.createElement(ProjectLearning,{project,files,report:vi.fn()}));
 expect(markup).toContain('Thư mục dự án năm nay');expect(markup).toContain('Số liệu cũ chỉ thuộc báo cáo cũ');
 expect(markup).toContain('Cách viết từ năm trước');expect(markup).not.toContain('PRIVATE_CURRENT_DATA');
 expect(markup).toContain('tệp Markdown riêng trong thư mục Học hỏi');expect(markup).toContain('nguồn tham khảo về cách viết');
});
it('sends folder selection to the learning RPC without attaching it as current material',async()=>{
 vi.mocked(pickFiles).mockResolvedValue(['/Bao-cao-cu']);vi.mocked(rpc).mockResolvedValue({count:1,errors:[]});
 const report=vi.fn();const tree=ProjectLearning({project,files,report});button(tree,'＋ Chọn thư mục Học hỏi').props.onClick();
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledExactlyOnceWith('projectLearningAttach',{projectId:'stem',paths:['/Bao-cao-cu']}));expect(report).not.toHaveBeenCalled();
});
it('draft extraction does not activate or save the generated notes',async()=>{
 hooks.states=['',true,false,''];vi.mocked(rpc).mockResolvedValue({notes:'Ghi chú mới',sourceCount:1,partial:false});
 button(ProjectLearning({project,files,report:vi.fn()}),'Rút kinh nghiệm từ tài liệu').props.onClick();
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledExactlyOnceWith('projectLearningDraft',{projectId:'stem'}));
});
it('saves the edited notes and toggle only through the explicit save button',async()=>{
 hooks.states=['Kinh nghiệm đã sửa',false,false,''];vi.mocked(rpc).mockResolvedValue(true);
 const save=button(ProjectLearning({project,files,report:vi.fn()}),'Lưu kinh nghiệm');expect(save.props.disabled).toBe(false);save.props.onClick();
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledExactlyOnceWith('saveProjectLearning',{projectId:'stem',notes:'Kinh nghiệm đã sửa',enabled:false}));
});
