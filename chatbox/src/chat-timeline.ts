import type {ViewState,Message} from './ipc';
type Attachment=ViewState['data']['attachments'][number];
export type TimelineItem={kind:'message';message:Message}|{kind:'files';key:string;files:Attachment[]};

/** Xen kẽ tệp đính kèm vào dòng thời gian: tệp nằm ngay trước tin nhắn đầu tiên gửi sau lúc đính kèm. */
export function timeline(messages:Message[],files:Attachment[]):TimelineItem[]{
 const sorted=[...files].sort((a,b)=>(a.at??Infinity)-(b.at??Infinity));
 const out:TimelineItem[]=[];let next=0;
 const flush=(until:number)=>{
  const group:Attachment[]=[];
  while(next<sorted.length&&(until===Infinity||(sorted[next]!.at??Infinity)<until))group.push(sorted[next++]!);
  if(group.length)out.push({kind:'files',key:`files-${group[0]!.id}`,files:group});
 };
 for(const m of messages){flush(m.at);out.push({kind:'message',message:m});}
 flush(Infinity);
 return out;
}
