import {useState} from 'react';
import {designRequest,type DesignSuggestion,type OfficeHost} from '@pvta/shared';
import type {Strings} from './i18n';
import {analyzeDocument} from './office/analyze';
export type Suggestion=DesignSuggestion;
async function readProfile(host:OfficeHost):Promise<string>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([analyzeDocument(host),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Office chưa trả cấu trúc tài liệu sau 20 giây. Hãy đóng hộp thoại đang mở trong Office rồi thử lại.')),20000);})]);}
 finally{clearTimeout(timer);}
}
interface Props {t:Strings;host:OfficeHost;online:boolean;suggest(profile:string,wish:string):Promise<Suggestion>;onChoose(text:string):Promise<void>;disabledReason?:string}
export function ThemePanel({host,online,suggest,onChoose,disabledReason}:Props){
 const [wish,setWish]=useState('');const [result,setResult]=useState<Suggestion|null>(null);const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [profile,setProfile]=useState('');
 async function generate(){
  if(busy)return;setBusy(true);setError('');setResult(null);setSelected('');
  try{const facts=await readProfile(host);setProfile(facts);const next=await suggest(facts,wish);if(!Array.isArray(next.ideas)||next.ideas.length!==3)throw Error('AI chưa trả về đủ phương án hợp lệ. Hãy thử lại hoặc mô tả rõ hơn; PVTA không thay bằng mẫu có sẵn.');setResult(next);}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 async function apply(){
  if(!idea||busy)return;
  setBusy(true);setError('');
  try{await onChoose(designRequest(idea));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 const idea=result?.ideas.find(i=>i.id===selected);
 return <div className="panel ai-design-panel"><h3>AI thiết kế theo tài liệu</h3><p>AI đang chọn sẽ đọc cấu trúc tài liệu và sáng tạo 3 phương án. Bạn chọn ý tưởng trước khi thay đổi tệp.</p>
  {disabledReason&&<p role="status" className="banner warn">{disabledReason}</p>}
  <label>Mong muốn của bạn<textarea value={wish} disabled={busy} onChange={e=>setWish(e.target.value)} placeholder="Ví dụ: trang trọng, dễ in; tiêu đề rõ cấp; bảng số liệu dễ đọc…"/></label>
  <button className="primary" disabled={!online||busy} onClick={()=>void generate()}>{busy?'AI đang xây dựng phương án…':result?'Tạo các ý tưởng khác':'Đề xuất 3 ý tưởng'}</button>
  {error&&<p role="alert" className="error">{error}</p>}
  {result&&<><p>{result.direction}</p><p className="opt-hint">Các thẻ dưới đây minh họa hệ chữ và màu, chưa phải bản xem trước của tài liệu Office.</p>
   <div className="ai-design-ideas" role="radiogroup" aria-label="Chọn ý tưởng thiết kế">{result.ideas.map(i=><label className={`ai-design-card ${selected===i.id?'selected':''}`} key={i.id}>
    <div className="row"><input type="radio" name="design-idea" checked={selected===i.id} onChange={()=>setSelected(i.id)}/><strong>{i.name}</strong></div>
    <div className="ai-design-sample" style={{background:i.colors.background,color:i.colors.text,fontFamily:i.fonts.body,fontSize:12}}><strong style={{display:'block',fontFamily:i.fonts.heading,color:i.colors.accent,fontSize:12*i.headingSizes[0]/i.bodySize}}>Tiêu đề tài liệu</strong><span style={{display:'block',color:i.colors.accent,fontFamily:i.fonts.heading,fontSize:12*i.headingSizes[1]/i.bodySize}}>Một mục nội dung</span><p>Nội dung được trình bày theo hệ chữ và khoảng cách thống nhất.</p><div style={{borderTop:`2px solid ${i.colors.accent}`,paddingTop:8}}>Dữ liệu · Nội dung · Ghi chú</div></div>
    <p>{i.reason}</p><dl><dt>Bố cục</dt><dd>{i.layout}</dd><dt>Phân cấp</dt><dd>{i.hierarchy}</dd><dt>Bảng</dt><dd>{i.tables}</dd></dl><small>{i.fonts.heading} / {i.fonts.body} · Thân {i.bodySize}pt · Các cấp {i.headingSizes.join(' / ')}pt</small>
   </label>)}</div>
   <button className="primary" disabled={!online||busy||!idea} onClick={()=>void apply()}>Dùng phương án đã chọn</button>
  </>}
  {profile&&<details><summary>Cấu trúc đã gửi cho AI</summary><pre>{profile}</pre></details>}
 </div>;
}
