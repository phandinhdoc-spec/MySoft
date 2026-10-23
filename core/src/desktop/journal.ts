import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export interface Activity {planId?:string;stepId?:string;runId?:string;id:string;kind:string;projectId?:string;chatId?:string;model?:string;state:'running'|'done'|'error'|'interrupted';startedAt:number;endedAt?:number;detail?:string;url?:string}
export class Journal {
 private records=new Map<string,Activity>();readonly file:string;
 constructor(home:string){
  this.file=path.join(home,'chatbox','activity.jsonl');fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  if(fs.existsSync(this.file)){const content=fs.readFileSync(this.file,'utf8');for(const line of content.split('\n')){try{const row=JSON.parse(line);if(row.id&&row.kind)this.records.set(row.id,row);}catch{}}if(content&&!content.endsWith('\n'))fs.appendFileSync(this.file,'\n');}
  for(const row of this.records.values())if(row.state==='running')this.finish(row.id,'interrupted','Ứng dụng đã đóng trước khi ghi nhận kết quả.');
 }
 private append(row:Activity){fs.appendFileSync(this.file,JSON.stringify(row)+'\n',{mode:0o600,flush:true});this.records.set(row.id,row);}
 start(meta:Pick<Activity,'kind'|'projectId'|'chatId'|'model'|'planId'|'stepId'|'runId'>){const row:Activity={...meta,id:randomUUID(),startedAt:Date.now(),state:'running'};this.append(row);return row.id;}
 finish(id:string,state:Activity['state'],detail?:string,url?:string){const row=this.records.get(id);if(row)this.append({...row,state,detail:detail?.slice(0,6000),url,endedAt:Date.now()});}
 setModel(id:string,model:string){const row=this.records.get(id);if(row)this.append({...row,model});}
 list(projectId?:string){return [...this.records.values()].filter(r=>!projectId||r.projectId===projectId).sort((a,b)=>b.startedAt-a.startedAt).slice(0,500);}
}
