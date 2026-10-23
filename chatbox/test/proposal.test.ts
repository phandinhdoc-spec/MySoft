// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
import {hideProposalMark,splitProposal} from '../src/proposal';
import {ProposalBar} from '../src/ProposalBar';
it('tách dòng đề nghị cuối và ẩn dấu hiệu khi đang stream',()=>{
 expect(splitProposal('Nhận xét.\n[[DE_NGHI]] Sửa hàm resetIn')).toEqual({body:'Nhận xét.',proposal:'Sửa hàm resetIn'});
 expect(splitProposal('Chỉ trao đổi.').proposal).toBeNull();
 expect(hideProposalMark('Nhận xét.\n[[DE_NG')).toBe('Nhận xét.');
 expect(hideProposalMark('Dùng [[x]] trong văn bản')).toBe('Dùng [[x]] trong văn bản');
});
it('hiện hai nút Đồng ý và Nói chuyện tiếp',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const agree=vi.fn(),talk=vi.fn();
 try{await act(async()=>root.render(React.createElement(ProposalBar,{summary:'Sửa hàm',onAgree:agree,onTalk:talk})));const b=[...host.querySelectorAll('button')];expect(b.map(x=>x.textContent)).toEqual(['Đồng ý','Nói chuyện tiếp']);await act(async()=>b[0]!.click());await act(async()=>b[1]!.click());expect(agree).toHaveBeenCalledOnce();expect(talk).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());host.remove();}
});
