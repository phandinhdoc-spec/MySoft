import {t as uiText} from './i18n';
import React from 'react';
import {APPEARANCE_PALETTES, appearancePalette, type PaletteId} from '@pvta/shared';
export function AppearancePicker({value,onChange}:{value?:PaletteId;onChange:(id:PaletteId)=>void}) {
  const palette=appearancePalette(value),selected=palette.id;
  const followsSystem=!palette.mode;
  return <section className="appearance-picker" aria-label={uiText("Bảng màu giao diện")}>
    <button type="button" className="system-appearance" aria-label={uiText("Theo hệ thống")} aria-pressed={followsSystem} onClick={()=>onChange(palette.mode?'vscode-contrast':selected)}>
      <strong>{uiText("◐ Theo hệ thống")} {followsSystem?' ✓':''}</strong>
      <span>{uiText("Tự chuyển sáng và tối cùng thiết bị. Nếu đang chọn tương phản cao, giữ độ tương phản cao và chuyển độ sáng theo hệ thống.")}</span>
    </button>
    <p className="muted">{uiText("Chọn bảng màu với nền dịu, màu nhấn ở các chi tiết nhỏ. Các bảng màu thường theo hệ thống; hai lựa chọn tương phản cao giữ cố định sáng hoặc tối.")}</p>
    {(['contrast','minimal','modern','editor'] as const).map(group=><div key={group}>
      <h3>{group==='contrast'?uiText("Tương phản cao · 2 theme"):group==='minimal'?uiText("Tối giản · 3 theme"):group==='modern'?uiText("Hiện đại · 7 theme"):uiText("Cảm hứng VS Code · 3 theme")}</h3>
      <div className="appearance-grid">{APPEARANCE_PALETTES.filter(p=>p.group===group).map(p=><button type="button" key={p.id} aria-pressed={selected===p.id} className={`appearance-option ${selected===p.id?'selected':''}`} onClick={()=>onChange(p.id)}>
        <span className="appearance-preview" aria-hidden="true">{(p.mode?[p[p.mode]]:[p.light,p.dark]).map((c,i)=><span className="appearance-mini" key={i} style={{background:c.bg,borderColor:c.line}}><i style={{background:c.sidebar}}/><span><b style={{background:c.accent}}/><em style={{background:c.surface,borderColor:c.line}}/><small style={{background:c.accent}}/></span></span>)}</span>
        <strong>{p.name}<span aria-hidden="true">{selected===p.id?'✓':''}</span></strong><small>{p.description}</small>
      </button>)}</div>
    </div>)}
  </section>;
}
