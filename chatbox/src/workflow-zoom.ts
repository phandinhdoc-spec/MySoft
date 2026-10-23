/** Thu phóng sơ đồ Quy trình: phần tính toán thuần, không phụ thuộc giao diện. */
export const ZOOM_MIN=0.25;
export const ZOOM_MAX=2;
export const ZOOM_STEP=1.15;

export const clampZoom=(z:number):number=>Number.isFinite(z)?Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,z)):1;

/** Một nấc phóng (+1) hoặc thu (-1), dùng cho phím ⌘/Ctrl + / − và nút bấm. */
export const stepZoom=(z:number,dir:1|-1):number=>clampZoom(Math.round((dir>0?z*ZOOM_STEP:z/ZOOM_STEP)*100)/100);

/**
 * Hệ số nhân từ một sự kiện con lăn.
 * - Con lăn chuột rời (nấc rời, |dy| lớn hoặc deltaMode theo dòng/trang): mỗi nấc một bước cố định.
 * - Touchpad chụm hai ngón (Chromium gửi wheel + ctrlKey, delta nhỏ): thu phóng liên tục, mượt.
 */
export function wheelFactor(deltaY:number,deltaMode=0):number{
 if(!deltaY||!Number.isFinite(deltaY))return 1;
 if(deltaMode!==0||Math.abs(deltaY)>=50)return deltaY<0?ZOOM_STEP:1/ZOOM_STEP;
 return Math.exp(-Math.max(-25,Math.min(25,deltaY))*0.01);
}

/**
 * Vị trí cuộn mới để điểm dưới con trỏ đứng yên khi đổi mức thu phóng.
 * scroll: scrollLeft/Top hiện tại; offset: vị trí con trỏ trong khung nhìn; pad: lề trong của khung.
 */
export const scrollAfterZoom=(scroll:number,offset:number,pad:number,from:number,to:number):number=>
 Math.max(0,((scroll+offset-pad)/from)*to+pad-offset);

/** Mức thu phóng vừa khít nội dung vào khung nhìn (không phóng quá 100% khi nội dung nhỏ). */
export function fitZoom(contentW:number,contentH:number,viewW:number,viewH:number):number{
 if(!(contentW>0)||!(contentH>0)||!(viewW>0)||!(viewH>0))return 1;
 return clampZoom(Math.min(1,viewW/contentW,viewH/contentH));
}

export const zoomLabel=(z:number):string=>`${Math.round(z*100)}%`;

/** Lưu mức thu phóng theo từng quy trình; giá trị hỏng thì quay về 100%. */
export function readZoom(raw:string|null|undefined):number{
 if(raw==null||raw==='')return 1;
 const n=Number(raw);
 return Number.isFinite(n)?clampZoom(n):1;
}

export type EjectRect={x:number;y:number;w:number;h:number};
/** Lề trống quanh sơ đồ; vị trí nút được phép âm tới −WORKFLOW_MARGIN. */
export const WORKFLOW_MARGIN=320;
const hit=(a:EjectRect,b:EjectRect,gap=0)=>a.x<b.x+b.w+gap&&b.x<a.x+a.w+gap&&a.y<b.y+b.h+gap&&b.y<a.y+a.h+gap;

/**
 * Đưa các nút KHÔNG thuộc khung nào mà đang nằm đè lên hình bao của khung ra ngoài.
 * nodes: hộp của mọi nút; members: id các nút thuộc ít nhất một khung (không bao giờ bị dời);
 * frames: hình bao các khung. Trả về vị trí mới của nút bị dời và các nút không tìm được chỗ trống.
 */
export function ejectOutside(nodes:Record<string,EjectRect>,members:ReadonlySet<string>,frames:EjectRect[],pad=24,minCoord=-WORKFLOW_MARGIN):{moved:Record<string,{x:number;y:number}>;stuck:string[]}{
 const cur:Record<string,EjectRect>={...nodes},moved:Record<string,{x:number;y:number}>={},stuck:string[]=[];
 for(const id of Object.keys(nodes)){
  if(members.has(id))continue;
  const n=cur[id]!,over=frames.filter(f=>hit(n,f));
  if(!over.length)continue;
  const others=Object.entries(cur).filter(([k])=>k!==id).map(([,r])=>r);
  const free=(r:EjectRect)=>r.x>=minCoord&&r.y>=minCoord&&!frames.some(f=>hit(r,f))&&!others.some(o=>hit(r,o,8));
  const cands:{x:number;y:number;d:number}[]=[];
  for(const f of over)for(let step=0;step<12;step++){
   const extra=step*40;
   for(const [x,y] of [[f.x-n.w-pad-extra,n.y],[f.x+f.w+pad+extra,n.y],[n.x,f.y-n.h-pad-extra],[n.x,f.y+f.h+pad+extra]] as [number,number][])
    cands.push({x,y,d:Math.abs(x-n.x)+Math.abs(y-n.y)});
  }
  cands.sort((a,b)=>a.d-b.d);
  const pick=cands.find(c=>free({...n,x:c.x,y:c.y}));
  if(pick){moved[id]={x:pick.x,y:pick.y};cur[id]={...n,x:pick.x,y:pick.y};}else stuck.push(id);
 }
 return {moved,stuck};
}
