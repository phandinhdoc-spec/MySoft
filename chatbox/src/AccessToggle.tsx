import {t as uiText} from './i18n';
import React from 'react';
import {Icon} from './Icon';
import './access-toggle.css';
const ACCESS_MODES=[
 {id:'read' as const,icon:'eye',label:uiText("Chỉ đọc"),guide:uiText("Chỉ xem: PVTA chỉ nói chuyện, đọc và nhận xét bằng lời, không tạo hay sửa gì.")},
 {id:'ask' as const,icon:'mouth',label:uiText("Nhận xét & đề nghị"),guide:uiText("PVTA nhận xét và đề nghị; chỉ làm khi thầy cô bấm Đồng ý, hoặc bấm Nói chuyện tiếp để bàn thêm.")},
 {id:'full' as const,icon:'pen',label:uiText("Chỉnh sửa tự động"),guide:uiText("PVTA làm ngay, không hỏi lại; chỉ dừng hỏi khi thao tác thật sự nguy hiểm. Tài liệu Office được lưu thành tệp mới hoặc bản sao.")}
];
export function AccessToggle({value,onChange}:{value:'read'|'ask'|'full';onChange:(v:'read'|'ask'|'full')=>void}){
 return <div className="access-picker" role="radiogroup" aria-label={uiText("Quyền của PVTA")} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowLeft'?2:1))%3;buttons[next]?.focus();onChange(ACCESS_MODES[next]!.id);}}>
 {ACCESS_MODES.map(mode=><button key={mode.id} type="button" role="radio" aria-checked={mode.id===value} aria-label={mode.label} className={`access-option access-${mode.id}`} title={`${mode.label}: ${mode.guide}`} onClick={()=>onChange(mode.id)}><Icon name={mode.icon} size={18}/></button>)}
 </div>;
}
