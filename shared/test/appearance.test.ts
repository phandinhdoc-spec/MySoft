import {describe,it,expect} from 'vitest';
import {APPEARANCE_PALETTES,appearancePalette} from '../src/appearance';
function luminance(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i]!,0);}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('appearance palettes',()=>{
 for(const p of APPEARANCE_PALETTES)for(const mode of ['light','dark'] as const)it(`${p.id} ${mode}: readable companion accents`,()=>{
  const c=p[mode];
  for(const key of ['secondary','tertiary'] as const){
   const soft=c[`${key}-soft`]!;
   expect(contrast(c[key]!,soft)).toBeGreaterThanOrEqual(4.5);
   for(const fg of ['text','muted'] as const)expect(contrast(c[fg],soft)).toBeGreaterThanOrEqual(4.5);
  }
 });
 it('offers three minimal and seven modern themes with a neutral fallback',()=>{expect(APPEARANCE_PALETTES.filter(p=>p.group==='minimal')).toHaveLength(3);expect(APPEARANCE_PALETTES.filter(p=>p.group==='modern')).toHaveLength(7);expect(APPEARANCE_PALETTES.filter(p=>p.group==='editor')).toHaveLength(3);expect(appearancePalette(undefined).id).toBe('paper');expect(appearancePalette('obsolete').id).toBe('paper');});
 for(const p of APPEARANCE_PALETTES)for(const mode of ['light','dark'] as const)it(`${p.id} ${mode}: readable body, secondary text and buttons`,()=>{const c=p[mode];for(const bg of ['bg','surface','sidebar','hover'] as const)for(const fg of ['text','muted','accent'] as const)expect(contrast(c[fg],c[bg]),`${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);expect(contrast(c['on-primary'],c.primary)).toBeGreaterThanOrEqual(4.5);});
});

it('provides fixed light and dark contrast modes with strong text and visible borders',async()=>{
 const {appearanceMode}=await import('../src/appearance');
 for(const mode of ['light','dark'] as const){
  const id=`contrast-${mode}`,p=appearancePalette(id);expect(p.id).toBe(id);
  for(const systemDark of [false,true])expect(appearanceMode(id,systemDark)).toBe(mode);
  const c=p[mode];
  for(const bg of ['bg','surface','sidebar','hover'] as const){
   for(const fg of ['text','muted','accent'] as const)expect(contrast(c[fg],c[bg])).toBeGreaterThanOrEqual(7);
   expect(contrast(c.line,c[bg])).toBeGreaterThanOrEqual(3);
  }
 }
 expect(appearanceMode('paper',false)).toBe('light');expect(appearanceMode('paper',true)).toBe('dark');
});
