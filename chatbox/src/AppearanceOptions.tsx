import {t as uiText} from './i18n';
import React from 'react';
import {FONT_OPTIONS,ICON_STYLES,COLOR_ICON_STYLES,appearanceToolbarIconSize,appearanceFont,appearanceIcons,type FontId,type IconStyleId} from '@pvta/shared';
import {Icon} from './Icon';
import './appearance-options.css';

export function AppearanceOptions({fontFamily,iconStyle,toolbarIconSize,onChange}:{toolbarIconSize?:number;fontFamily?:FontId;iconStyle?:IconStyleId;onChange:(patch:{toolbarIconSize?:number;fontFamily?:FontId;iconStyle?:IconStyleId})=>void}){
 const size=appearanceToolbarIconSize(toolbarIconSize);
 return <>
 <section className="appearance-custom toolbar-size-settings" aria-label={uiText("Kích thước icon giao diện")}><h3>{uiText("Kích thước icon giao diện")}</h3><p className="muted">{uiText("Kéo thanh trượt để thu nhỏ hoặc phóng to icon trên toàn giao diện. Nút dưới khung chat thay đổi cùng icon. Mặc định 16 px tại khung chat.")}</p><label htmlFor="toolbar-icon-size">{uiText("Kích thước")}<output>{size} px</output></label><input id="toolbar-icon-size" type="range" min={14} max={24} step={1} value={size} onChange={e=>onChange({toolbarIconSize:Number(e.target.value)})}/><div className="toolbar-size-preview" style={{'--composer-icon-size':`${size}px`,'--composer-button-size':`${size+14}px`} as React.CSSProperties}>{['attach','eye','mouth','pen','send'].map(name=><span key={name}><Icon name={name} size={size}/></span>)}</div><button type="button" onClick={()=>onChange({toolbarIconSize:16})}>{uiText("Đặt lại kích thước mặc định")}</button></section>
 <section className="appearance-custom" aria-label={uiText("Chọn bộ biểu tượng")}><h3>{uiText("Bộ icon")}</h3><p className="muted">{uiText("Chọn phong cách cho biểu tượng trên toàn giao diện. Có 10 bộ đa sắc mới và các bộ đơn sắc. Xem trước ngay trên từng thẻ.")}</p>
 {([true,false] as const).map(colored=><div className="icon-style-group" key={String(colored)}><h4>{colored?uiText("Đa sắc · 10 bộ"):uiText("Đơn sắc")}</h4><div className="icon-style-grid">
 {ICON_STYLES.filter(option=>COLOR_ICON_STYLES.some(c=>c.id===option.id)===colored).map(option=><button type="button" key={option.id} className="icon-style-option" aria-label={uiText("Chọn bộ icon {0}",[option.name])} aria-pressed={appearanceIcons(iconStyle)===option.id} onClick={()=>onChange({iconStyle:option.id})}>
 <span className="icon-style-preview">{['chat','project','notebook','workflow','spark','settings'].map(name=><Icon key={name} name={name} size={24} style={option.id}/>)}</span><strong>{option.name}</strong><small>{option.description}</small>
 </button>)}
 </div></div>)}
 </section>
 <section className="appearance-custom" aria-label={uiText("Chọn phông chữ")}><h3>{uiText("Phông chữ giao diện")}</h3><p className="muted">{uiText("Áp dụng cho giao diện và hội thoại. Các font đi kèm dùng được khi không có mạng và có đầy đủ dấu tiếng Việt.")}</p><div className="font-style-grid">
 {FONT_OPTIONS.map(option=><button type="button" key={option.id} className="font-style-option" style={{fontFamily:option.family}} aria-label={uiText("Chọn font {0}",[option.name])} aria-pressed={appearanceFont(fontFamily).id===option.id} onClick={()=>onChange({fontFamily:option.id})}>
 <strong>{option.name}</strong><span>{uiText("Thầy cô cùng PVTA — Khơi nguồn tri thức.")}</span><small>{option.description}</small>
 </button>)}
 </div></section>
 </>;
}
