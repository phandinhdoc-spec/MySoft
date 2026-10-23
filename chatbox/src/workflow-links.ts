import type {WorkflowFrame} from '../../core/src/desktop/types';

export type Point={x:number;y:number};
export type Box=Point&{w:number;h:number};
export type Side='left'|'right'|'top'|'bottom';
export type Attachment={side:Side;offset:number};
export function borderPoint(box:Box,p:Point):Attachment{
 const side=([['left',Math.abs(p.x-box.x)],['right',Math.abs(p.x-box.x-box.w)],['top',Math.abs(p.y-box.y)],['bottom',Math.abs(p.y-box.y-box.h)]] as [Side,number][]).sort((a,b)=>a[1]-b[1])[0]![0];
 return {side,offset:Math.max(0,Math.min(1,side==='left'||side==='right'?(p.y-box.y)/box.h:(p.x-box.x)/box.w))};
}
export function attachmentPoint(b:Box,p:Attachment):Point{return {x:b.x+(p.side==='left'?0:p.side==='right'?b.w:b.w*p.offset),y:b.y+(p.side==='top'?0:p.side==='bottom'?b.h:b.h*p.offset)};}
const compact=(points:Point[])=>points.filter((p,i)=>!i||p.x!==points[i-1]!.x||p.y!==points[i-1]!.y).filter((p,i,ps)=>{const a=ps[i-1],b=ps[i+1];return !a||!b||!((a.x===p.x&&p.x===b.x)||(a.y===p.y&&p.y===b.y));});
const length=(p:Point[])=>p.reduce((s,v,i)=>i?s+Math.abs(v.x-p[i-1]!.x)+Math.abs(v.y-p[i-1]!.y):s,0);
/** Choose ports by bends first, distance second. A dragged waypoint remains fixed. */
export function arrangeLink(a:Box,b:Box,boxes:Box[],fixedA?:Attachment,fixedB?:Attachment,via?:Point):{a:Attachment;b:Attachment;points:Point[]}{
 const candidates=(box:Box,other:Box):Attachment[]=>{
  const target=via??{x:other.x+other.w/2,y:other.y+other.h/2};
  if(!via){
   const x0=Math.max(box.x,other.x),x1=Math.min(box.x+box.w,other.x+other.w),y0=Math.max(box.y,other.y),y1=Math.min(box.y+box.h,other.y+other.h);
   if(x0<x1)target.x=(x0+x1)/2;
   if(y0<y1)target.y=(y0+y1)/2;
  }
  return (['left','right','top','bottom'] as Side[]).map(side=>({side,offset:Math.max(0.05,Math.min(0.95,side==='left'||side==='right'?(target.y-box.y)/box.h:(target.x-box.x)/box.w))}));
 };
 let best:{a:Attachment;b:Attachment;points:Point[]}|undefined;
 for(const pa of fixedA?[fixedA]:candidates(a,b))for(const pb of fixedB?[fixedB]:candidates(b,a)){
  const start=attachmentPoint(a,pa),end=attachmentPoint(b,pb);
  const opposite:Record<Side,Side>={left:'right',right:'left',top:'bottom',bottom:'top'};
  const paths=via?(['left','right','top','bottom'] as Side[]).map(side=>compact([...routeLink(start,pa.side,via,side,boxes),...routeLink(via,opposite[side],end,pb.side,boxes).slice(1)])):[routeLink(start,pa.side,end,pb.side,boxes)];
  for(const points of paths){
   if(via&&!points.some((p,i)=>{const q=points[i+1];return q&&((p.x===via.x&&q.x===via.x&&via.y>=Math.min(p.y,q.y)&&via.y<=Math.max(p.y,q.y))||(p.y===via.y&&q.y===via.y&&via.x>=Math.min(p.x,q.x)&&via.x<=Math.max(p.x,q.x)));}))continue;
   if(!best||points.length<best.points.length||(points.length===best.points.length&&length(points)<length(best.points)))best={a:pa,b:pb,points};
  }
 }
 return best??arrangeLink(a,b,boxes,fixedA,fixedB);
}
export function linkTone(from:string,to:string,frames:Pick<WorkflowFrame,'id'|'stepIds'>[]):'normal'|'outside'|'between'{
 const owner=(id:string)=>frames.filter(f=>f.stepIds.includes(id)).sort((a,b)=>a.stepIds.length-b.stepIds.length)[0]?.id;
 const a=owner(from),b=owner(to);
 return a===b?'normal':a===undefined||b===undefined?'outside':'between';
}

/** Orthogonal visibility grid: ports stay attached, other cards are obstacles. */
export function routeLink(a:Point,aSide:Side,b:Point,bSide:Side,boxes:Box[]):Point[]{
 const gap=14;
 const stub=(p:Point,s:Side):Point=>({x:p.x+(s==='left'?-gap:s==='right'?gap:0),y:p.y+(s==='top'?-gap:s==='bottom'?gap:0)});
 const start=stub(a,aSide),end=stub(b,bSide);
 const obstacles=boxes.map(r=>({x:r.x-10,y:r.y-10,w:r.w+20,h:r.h+20}));
 const clear=(p:Point,q:Point)=>!obstacles.some(r=>p.x===q.x
  ?p.x>r.x&&p.x<r.x+r.w&&Math.max(p.y,q.y)>r.y&&Math.min(p.y,q.y)<r.y+r.h
  :p.y>r.y&&p.y<r.y+r.h&&Math.max(p.x,q.x)>r.x&&Math.min(p.x,q.x)<r.x+r.w);
 const xs=[...new Set([start.x,end.x,...obstacles.flatMap(r=>[r.x,r.x+r.w])])].sort((x,y)=>x-y);
 const ys=[...new Set([start.y,end.y,...obstacles.flatMap(r=>[r.y,r.y+r.h])])].sort((x,y)=>x-y);
 const point=(i:number):Point=>({x:xs[i%xs.length]!,y:ys[Math.floor(i/xs.length)]!});
 const index=(p:Point)=>ys.indexOf(p.y)*xs.length+xs.indexOf(p.x);
 // State includes arrival axis so a shorter zigzag cannot hide a straighter route.
 const axis=(s:Side)=>s==='left'||s==='right'?0:1;
 const first=index(start)*2+axis(aSide),last=index(end),open=new Set([first]),cost=new Map([[first,0]]),prev=new Map<number,number>();
 const bendCost=(xs.at(-1)!-xs[0]!+ys.at(-1)!-ys[0]!+1)*xs.length*ys.length*4;
 const statePoint=(i:number)=>point(Math.floor(i/2));
 const distance=(p:Point,q:Point)=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
 while(open.size){
  let current=-1,best=Infinity;
  for(const i of open){const score=cost.get(i)!+distance(statePoint(i),end)+(Math.floor(i/2)===last&&i%2!==axis(bSide)?bendCost:0);if(score<best){best=score;current=i;}}
  if(Math.floor(current/2)===last){
   const path=[b,end];let at=current;
   while(at!==first){at=prev.get(at)!;path.push(statePoint(at));}
   path.push(a);path.reverse();
   return compact(path);
  }
  open.delete(current);
  const cell=Math.floor(current/2),x=cell%xs.length,y=Math.floor(cell/xs.length),p=point(cell);
  const adjacent=[x>0?cell-1:-1,x<xs.length-1?cell+1:-1,y>0?cell-xs.length:-1,y<ys.length-1?cell+xs.length:-1];
  for(const next of adjacent){if(next<0)continue;const q=point(next);if(!clear(p,q))continue;
   const dir=p.y===q.y?0:1,state=next*2+dir,score=cost.get(current)!+distance(p,q)+(dir===current%2?0:bendCost);
   if(score<(cost.get(state)??Infinity)){cost.set(state,score);prev.set(state,current);open.add(state);}
  }
 }
 // Overlapping cards can enclose a port completely; keep a visible orthogonal connection.
 return [a,start,{x:start.x,y:end.y},end,b];
}

export function linkPath(points:Point[]):string{return points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');}
