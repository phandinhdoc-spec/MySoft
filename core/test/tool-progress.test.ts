import {expect,it} from 'vitest';
import {toolProgressParser} from '../src/tool-progress';
import {progressText,type AiProgressEntry} from '@pvta/shared';
it('tracks Claude tools without emitting thinking, signatures or assistant reasoning',()=>{
 const rows:AiProgressEntry[]=[],parse=toolProgressParser('claude',row=>rows.push(row));
 parse(JSON.stringify({type:'stream_event',event:{type:'content_block_start',content_block:{type:'thinking',thinking:'private reasoning'}}}));
 parse(JSON.stringify({type:'assistant',message:{content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'ordinary answer'}]}}));expect(rows).toEqual([]);
 parse(JSON.stringify({type:'stream_event',event:{type:'content_block_start',content_block:{type:'tool_use',id:'t',name:'Read',input:{}}}}));
 parse(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'t',name:'Read',input:{file_path:'/tmp/bai-hoc.md'}}]}}));
 parse(JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:'t',content:[{type:'text',text:'20 lines'},{type:'thinking',thinking:'private reasoning'}]}]}}));
 expect(rows).toHaveLength(3);expect(rows[0]!.id).toBe(rows[2]!.id);expect(rows[2]).toMatchObject({title:'Đọc tệp',input:'/tmp/bai-hoc.md',output:'20 lines',state:'done'});expect(JSON.stringify(rows)).not.toContain('private reasoning');
});
it('tracks Codex commands, edits, errors and skips reasoning items',()=>{
 const rows:AiProgressEntry[]=[],parse=toolProgressParser('codex',row=>rows.push(row));
 parse(JSON.stringify({type:'item.completed',item:{id:'r',type:'reasoning',text:'hidden'}}));
 parse(JSON.stringify({type:'item.started',item:{id:'c',type:'command_execution',command:'npm run build'}}));
 parse(JSON.stringify({type:'item.completed',item:{id:'c',type:'command_execution',command:'npm run build',exit_code:1,aggregated_output:'Build failed'}}));
 parse(JSON.stringify({type:'item.completed',item:{id:'f',type:'file_change',status:'completed',changes:[{kind:'update',path:'main.ts'}]}}));
 expect(rows).toHaveLength(3);expect(rows[1]).toMatchObject({title:'Chạy lệnh',state:'error',output:'Build failed'});expect(rows[2]).toMatchObject({title:'Sửa tệp',state:'done',output:'update: main.ts'});
});
it('redacts credentials and bounds large tool output',()=>{
 const secret='synthetic-secret';expect(progressText(`API_KEY=${secret} --token ${secret} Authorization: Bearer ${secret}`)).not.toContain(secret);
 expect(progressText('x'.repeat(5000))!.length).toBeLessThan(2500);
});
