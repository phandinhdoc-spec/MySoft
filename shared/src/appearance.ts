export const PALETTE_IDS = ['paper','graphite','sand','ocean','indigo','violet','rose','amber','teal','sage','vscode-classic','vscode-modern','vscode-contrast','contrast-light','contrast-dark'] as const;
export type PaletteId = typeof PALETTE_IDS[number];
export type PaletteColors = Record<'bg'|'surface'|'sidebar'|'line'|'text'|'muted'|'accent'|'accent-soft'|'hover'|'heading'|'heading-em'|'primary'|'primary-hover'|'on-primary'|'danger'|'shadow', string> & Partial<Record<'secondary'|'secondary-soft'|'tertiary'|'tertiary-soft',string>>;
export interface AppearancePalette {id:PaletteId;name:string;description:string;group:'minimal'|'modern'|'editor'|'contrast';mode?:'light'|'dark';light:PaletteColors;dark:PaletteColors}
function colors(dark:boolean,bg:string,sidebar:string,surface:string,accent:string,soft:string):PaletteColors {
  return {bg,surface,sidebar,line:dark?'#424957':'#dfe3ec',text:dark?'#f3f4f6':'#242832',muted:dark?'#c0c6d1':'#555d69',accent,'accent-soft':soft,hover:soft,heading:dark?'#f3f4f6':'#242832','heading-em':accent,primary:accent,'primary-hover':dark?'#e2e8f0':'#242832','on-primary':dark?'#17202a':'#ffffff',danger:dark?'#ffb4a6':'#a0473b',shadow:dark?'0 8px 28px #0004':'0 8px 28px #18203012'};
}
function palette(id:PaletteId,name:string,description:string,group:AppearancePalette['group'],light:string[],dark:string[]):AppearancePalette {
  return {id,name,description,group,light:colors(false,light[0]!,light[1]!,light[2]!,light[3]!,light[4]!),dark:colors(true,dark[0]!,dark[1]!,dark[2]!,dark[3]!,dark[4]!)};
}
export const APPEARANCE_PALETTES:AppearancePalette[] = [
  palette('paper','Sư phạm Hiện đại','Nền Slate sáng rõ, điểm nhấn Xanh Indigo chuyên nghiệp','minimal',['#f7f8fc','#eef1f7','#ffffff','#0963d8','#e7efff'],['#17191f','#1e2129','#242832','#8bbcff','#29394f']),
  palette('graphite','Than chì','Xám lạnh, tập trung','minimal',['#f4f5f7','#e8ebef','#ffffff','#475569','#e2e8f0'],['#181c23','#12161d','#252b35','#cbd5e1','#354050']),
  palette('sand','Cát ấm','Màu kem và nâu dịu','minimal',['#faf7f1','#eee8df','#fffdf8','#75543b','#eee2d3'],['#24201c','#1b1815','#302a24','#e6c9a7','#463a2c']),
  palette('ocean','Đại dương','Nền xám nhẹ, điểm nhấn xanh dương','modern',['#f8f9fa','#eff1f3','#ffffff','#1d4ed8','#eef0f3'],['#1c1e22','#181a1e','#25282d','#93c5fd','#30343b']),
  palette('indigo','Chàm Sắc Nét','Nền trung tính, điểm nhấn chàm','modern',['#f8f9fa','#eff1f3','#ffffff','#4338ca','#eef0f3'],['#1c1e22','#181a1e','#25282d','#b4bbff','#30343b']),
  palette('violet','Mực Tím Tinh Tế','Nền trung tính, điểm nhấn mực tím','modern',['#f8f9fa','#eff1f3','#ffffff','#6d28d9','#eef0f3'],['#1c1e22','#181a1e','#25282d','#d8b4fe','#30343b']),
  palette('rose','Hồng anh đào','Nền trung tính, điểm nhấn hồng trầm','modern',['#f8f9fa','#eff1f3','#ffffff','#be185d','#eef0f3'],['#1c1e22','#181a1e','#25282d','#f9a8d4','#30343b']),
  palette('amber','Hổ phách','Nền trung tính, điểm nhấn hổ phách','modern',['#f8f9fa','#eff1f3','#ffffff','#92400e','#eef0f3'],['#1c1e22','#181a1e','#25282d','#fcd38a','#30343b']),
  palette('teal','Ngọc lam','Nền trung tính, điểm nhấn xanh ngọc','modern',['#f8f9fa','#eff1f3','#ffffff','#0f656b','#eef0f3'],['#1c1e22','#181a1e','#25282d','#83e1df','#30343b']),
  palette('sage','Lá xô thơm','Nền trung tính, điểm nhấn xanh lá trầm','modern',['#f8f9fa','#eff1f3','#ffffff','#35634b','#eef0f3'],['#1c1e22','#181a1e','#25282d','#c1dbb4','#30343b']),
  palette('vscode-classic','VS Code Classic','Xám và xanh như Dark+ / Light+','editor',['#ffffff','#f3f3f3','#ffffff','#005a9e','#e4edf6'],['#1e1e1e','#252526','#252526','#9cdcfe','#37373d']),
  palette('vscode-modern','VS Code Modern','Viền gọn, xám đậm hiện đại','editor',['#ffffff','#f8f8f8','#f3f3f3','#005fb8','#e4eef9'],['#1f1f1f','#181818','#252526','#8cc8ff','#29394a']),
  palette('vscode-contrast','VS Code Tương phản','Nền rõ, đường viền nổi bật','editor',['#ffffff','#ffffff','#ffffff','#003b80','#e6f0ff'],['#000000','#000000','#101010','#8edcff','#142738']),
];
// Fixed contrast presets retain their selected brightness when the OS changes.
for(const mode of ['light','dark'] as const){
  const dark=mode==='dark';
  const c:PaletteColors={...colors(dark,dark?'#000000':'#ffffff',dark?'#101010':'#f4f4f4',dark?'#101010':'#ffffff',dark?'#8edcff':'#003b80',dark?'#242424':'#e8e8e8'),text:dark?'#ffffff':'#000000',muted:dark?'#dddddd':'#333333',heading:dark?'#ffffff':'#000000',line:dark?'#bcbcbc':'#454545',shadow:'none'};
  APPEARANCE_PALETTES.push({id:dark?'contrast-dark':'contrast-light',name:dark?'Tối tương phản cao':'Sáng tương phản cao',description:dark?'Nền đen, chữ trắng, đường viền sáng rõ':'Nền trắng, chữ đen, đường viền đậm rõ',group:'contrast',mode,light:{...c},dark:{...c}});
}
// Complementary accents for the colorful presets; neutral/editor presets stay unchanged.
const companions:Partial<Record<PaletteId,[PaletteId,PaletteId]>>={
  ocean:['teal','amber'],indigo:['rose','teal'],violet:['teal','amber'],
  rose:['indigo','teal'],amber:['teal','violet'],teal:['indigo','rose'],sage:['violet','amber'],
};
for(const p of APPEARANCE_PALETTES){
  const pair=companions[p.id];
  for(const mode of ['light','dark'] as const){
    const secondary=pair?APPEARANCE_PALETTES.find(v=>v.id===pair[0])![mode]:p[mode];
    const tertiary=pair?APPEARANCE_PALETTES.find(v=>v.id===pair[1])![mode]:p[mode];
    Object.assign(p[mode],{secondary:secondary.accent,'secondary-soft':secondary['accent-soft'],tertiary:tertiary.accent,'tertiary-soft':tertiary['accent-soft']});
  }
}
// Editor-inspired variants keep the same readable text pairs as the other palettes.
const highContrast=APPEARANCE_PALETTES.find(p=>p.id==='vscode-contrast')!;
highContrast.light.line='#242832';highContrast.dark.line='#ffffff';
export function appearancePalette(id:unknown):AppearancePalette {
  return APPEARANCE_PALETTES.find(p=>p.id===id) ?? APPEARANCE_PALETTES[0]!;
}

export function appearanceMode(id:unknown,systemDark:boolean):'light'|'dark'{
  return appearancePalette(id).mode??(systemDark?'dark':'light');
}

export const COLOR_ICON_STYLES = [
 {id:'color-spectrum',name:'Phổ màu',description:'Mảng màu tươi, nét gọn và rõ ràng'},
 {id:'color-pastel',name:'Kẹo pastel',description:'Màu phấn mềm, đường nét tròn'},
 {id:'color-ocean',name:'Đại dương',description:'Xanh biển phối san hô, hình học sắc nét'},
 {id:'color-botanical',name:'Vườn xanh',description:'Xanh lá, vàng mật và tím hoa dịu'},
 {id:'color-sunset',name:'Hoàng hôn',description:'Chuyển sắc cam, hồng và tím'},
 {id:'color-aurora',name:'Cực quang',description:'Chuyển sắc xanh ngọc, lam và tím'},
 {id:'color-glass',name:'Kính màu',description:'Ô kính trong nhẹ, điểm sáng nhiều lớp'},
 {id:'color-sticker',name:'Sticker',description:'Viền trắng, màu đậm như nhãn dán'},
 {id:'color-neon',name:'Neon',description:'Màu sáng nổi trên nền mực đậm'},
 {id:'color-origami',name:'Giấy gấp',description:'Mảng màu giấy, góc cạnh và nếp gấp'},
] as const;
export type ColorIconStyleId=typeof COLOR_ICON_STYLES[number]['id'];
export const ICON_STYLES = [
 {id:'lucide',name:'Lucide',description:'Nét tròn, gọn và hiện đại'},
 {id:'lucide-bold',name:'Lucide đậm',description:'Nét dày, nổi bật và dễ nhìn'},
 {id:'tabler',name:'Tabler',description:'Hình học, sắc nét và tối giản'},
 {id:'phosphor',name:'Phosphor',description:'Cân đối, mềm mại'},
 {id:'phosphor-light',name:'Phosphor mảnh',description:'Thanh thoát và nhẹ nhàng'},
 {id:'phosphor-bold',name:'Phosphor đậm',description:'Rõ nét, mạnh mẽ'},
 {id:'phosphor-duotone',name:'Phosphor hai tông',description:'Hai độ đậm cùng màu, có chiều sâu'},
 {id:'phosphor-fill',name:'Phosphor đặc',description:'Mảng đặc, nhận diện nhanh'},
 {id:'classic',name:'PVTA cổ điển',description:'Bộ biểu tượng PVTA ban đầu'},
 ...COLOR_ICON_STYLES,
] as const;
export type IconStyleId=typeof ICON_STYLES[number]['id'];
export const FONT_OPTIONS = [
 {id:'system',name:'Hệ thống',family:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",description:'Quen thuộc với thiết bị'},
 {id:'inter',name:'Inter',family:"'Inter Variable',sans-serif",description:'Gọn, hiện đại, dễ đọc'},
 {id:'be-vietnam-pro',name:'Be Vietnam Pro',family:"'Be Vietnam Pro',sans-serif",description:'Thiết kế cho tiếng Việt'},
 {id:'nunito-sans',name:'Nunito Sans',family:"'Nunito Sans Variable',sans-serif",description:'Tròn, mềm mại và thân thiện'},
 {id:'lora',name:'Lora',family:"'Lora Variable',serif",description:'Có chân, phù hợp đọc văn bản dài'},
] as const;
export type FontId=typeof FONT_OPTIONS[number]['id'];
export function appearanceFont(id:unknown){return FONT_OPTIONS.find(f=>f.id===id)??FONT_OPTIONS[0]!;}
export function appearanceIcons(id:unknown):IconStyleId{return ICON_STYLES.find(s=>s.id===id)?.id??'lucide';}

/** Composer glyph size; button frames grow by the same amount. */
export function appearanceToolbarIconSize(value:unknown):number{return typeof value==='number'&&Number.isFinite(value)?Math.max(14,Math.min(24,Math.round(value))):16;}
