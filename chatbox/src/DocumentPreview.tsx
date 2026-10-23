import {t as uiText} from './i18n';
import React,{createContext,useContext,useState,useCallback} from 'react';
import type {Action} from './ipc';
import {OfficePreview} from './OfficePanel';
import {Markdown} from './Markdown';
import {Icon} from './Icon';
type Preview={action:Action|null;show:(action:Action)=>void;close:()=>void};
const Context=createContext<Preview>({action:null,show:()=>{},close:()=>{}});
export const useDocumentPreview=()=>useContext(Context);
export function DocumentPreviewProvider({children}:{children:React.ReactNode}){
 const [action,setAction]=useState<Action|null>(null);
 const close=useCallback(()=>setAction(null),[]);
 return <Context.Provider value={{action,show:setAction,close}}>{children}</Context.Provider>;
}
export function DocumentReader(){
 const {action:a,close}=useDocumentPreview();if(!a)return null;
 const name=(a.output??a.path).split(/[\\/]/).pop()??uiText("Tài liệu");
 return <aside className="document-reader" aria-label={uiText("Xem tài liệu cạnh trò chuyện")}><header><Icon name="file"/><div><strong>{name}</strong><small>{uiText("Xem nội dung · Bố cục khi xuất có thể khác")}</small></div><button title={uiText("Đóng khung tài liệu")} aria-label={uiText("Đóng khung tài liệu")} onClick={close}><Icon name="close"/></button></header><div className="document-scroll"><article className="document-paper">{a.document?<OfficePreview document={a.document}/>:a.content?<Markdown text={a.content}/>:<p>{uiText("Tài liệu này chưa có nội dung xem trước.")}</p>}<small className="file-path">{a.output??a.path}</small></article></div></aside>;
}
