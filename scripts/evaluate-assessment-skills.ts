/** Live, synthetic evaluation. Reads existing API credentials locally; never logs them. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {ApiClient} from '../core/src/api';
const root=process.cwd(),home=process.env.PVTA_HOME??path.join(os.homedir(),'.phananh-office');
const config=JSON.parse(fs.readFileSync(path.join(home,'config.json'),'utf8'));
const provider='commandcode',model=provider+'/'+config.api?.[provider]?.model;
if(!config.api?.[provider]?.key)throw Error('Chưa cấu hình nguồn AI kiểm thử.');
const api=new ApiClient({settings:()=>config.api});
const out=process.env.PVTA_EVAL_OUTPUT??'/private/tmp/pvta-assessment-eval.jsonl';
const prev=fs.existsSync(out)?fs.readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
const done=new Set(prev.filter(x=>x.pass).map(x=>x.id));
const cases:{id:number;skill:string;prompt:string;check:(v:any)=>boolean}[]=[];
for(let i=0;i<25;i++){
 const code='YC'+(i+1),topic=['Áp suất','Tốc độ','Khối lượng riêng','Năng lượng','Điện trở'][i%5]!,level=['NB','TH','VD'][i%3]!;
 const missing=i%5===0;
 cases.push({id:i+1,skill:'office-doc-dac-ta',prompt:`Chỉ đọc đặc tả này và trả JSON {requirements:[{id,topic,level,source}],missingCount:boolean}. Nguồn: Bảng 2 hàng ${i+2}: mã ${code}, chủ đề ${topic}, mức độ ${level}, yêu cầu giải thích hiện tượng thuộc chủ đề. Số câu: ${missing?'ô trống (chưa xác định)':'2'}. Không sinh đề.`,check:v=>v.requirements?.length===1&&v.requirements[0].id===code&&v.requirements[0].topic===topic&&v.requirements[0].level===level&&typeof v.requirements[0].source==='string'&&v.requirements[0].source.includes(String(i+2))&&v.missingCount===missing});
 const n=2+i%5,m=1+i%3,points=(n+m)*0.5,conflict=i%4===0;
 cases.push({id:i+26,skill:'office-doc-ma-tran',prompt:`Đọc ma trận, chỉ trả JSON {questionCount,pointTotal,status,issues:[]}. Bảng: chủ đề ${topic}; NB: ${n} câu TN, mỗi câu 0,5 điểm; TH: ${m} câu TN, mỗi câu 0,5 điểm. Tổng nguồn ghi ${conflict?points+0.5:points} điểm. Kết quả công cụ Python đã xác nhận: số câu ${n+m}; điểm ${points}. status dùng ok hoặc conflict.`,check:v=>v.questionCount===n+m&&v.pointTotal===points&&v.status===(conflict?'conflict':'ok')&&Array.isArray(v.issues)&&(conflict?v.issues.length>0:v.issues.length===0)});
 const force=100+20*i,area=2+i%4,result=force/area;
 cases.push({id:i+51,skill:'office-sinh-de',prompt:`Sinh đúng 1 câu TN bốn lựa chọn áp dụng p=F/S: F=${force} N, S=${area} m², điểm câu 2, thang của bài nhỏ này là 2 (không phải 10). Ma trận và đặc tả đã đối chiếu: mã YCAP, mức VD, áp suất; cần tính p. Công cụ Python xác nhận p=${result} Pa. Chỉ trả JSON {questions:[{id,requirement,level,points,stem,options:[số,số,số,số],answerIndex}],totalPoints}. answerIndex từ 0 đến 3. options là số đo Pa, không có đơn vị trong số. stem có dữ kiện và đơn vị. Dùng đáp án chính xác, không làm tròn.`,check:v=>{const q=v.questions?.[0];return v.questions?.length===1&&q.requirement==='YCAP'&&q.level==='VD'&&q.points===2&&v.totalPoints===2&&typeof q.stem==='string'&&q.stem.includes(String(force))&&q.stem.includes(String(area))&&q.options?.length===4&&new Set(q.options).size===4&&q.options.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))&&Number.isInteger(q.answerIndex)&&Math.abs(q.options[q.answerIndex]-result)<1e-8;}});
 const bad=i%5===0,unknown=i%5===1;
 cases.push({id:i+76,skill:'office-dap-an',prompt:`Chỉ lập đáp án JSON {answers:[{id,answer,status,reason}],totalPoints}. Mã đề D${i}. Câu 1 (2 điểm): p=F/S, F=${force} N, S=${unknown?'chưa cho':area+' m²'}. Các lựa chọn A=${result}, B=${bad?result:result+10}, C=${result+20}, D=${result+30} (Pa). ${unknown?'Thiếu S, không có dữ kiện khác.':`Python đã xác nhận p=${result} Pa.`} status dùng ok, ambiguous hoặc insufficient. answer là nhãn A/B/C/D hoặc null nếu câu lỗi/thiếu dữ kiện; reason giải thích ngắn. Tổng điểm theo đề là 2.`,check:v=>v.answers?.length===1&&String(v.answers[0].id).replace(new RegExp('^D'+i+'-'),'').replace(/^(?:Câu\s*|C)/i,'').trim()==='1'&&v.answers[0].status===(unknown?'insufficient':bad?'ambiguous':'ok')&&v.answers[0].answer===(bad||unknown?null:'A')&&typeof v.answers[0].reason==='string'&&v.answers[0].reason.length>5&&v.totalPoints===2});
}
if(process.argv.includes('--regrade')){
 const latest=new Map(prev.filter(x=>x.response).map(x=>[x.id,x]));
 const results=cases.sort((a,b)=>a.id-b.id).map(c=>{
  const record=latest.get(c.id);if(!record)return {id:c.id,skill:c.skill,pass:false,error:'missing_response'};
  let pass=false;try{pass=!!c.check(JSON.parse(record.response.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'')));}catch{}
  return {...record,initialPass:record.pass,pass};
 });
 const report={model,validatorVersion:2,scope:'100 synthetic AI cases, 25 per skill; supplied calculator results; not 100 full exams or an expert curricular review.',gradingCorrection:'Accept 1, Câu 1 and a matching exam-prefixed question identifier; the prompt did not constrain this representation.',failedConnectionAttempts:prev.filter(x=>x.error==='request_failed').length,completed:results.filter(x=>'response' in x).length,passed:results.filter(x=>x.pass).length,results};
 fs.writeFileSync(path.join(root,'docs/assessment-skill-evaluation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({completed:report.completed,passed:report.passed}));
 process.exit(report.passed===100?0:1);
}
const pending=cases.sort((a,b)=>a.id-b.id).filter(c=>!done.has(c.id));let cursor=0;
async function worker(){while(cursor<pending.length){const c=pending[cursor++]!;const skill=fs.readFileSync(path.join(root,'desktop-skills',c.skill,'SKILL.md'),'utf8');let record:any={id:c.id,skill:c.skill,model,at:new Date().toISOString(),skillHash:crypto.createHash('sha256').update(skill).digest('hex'),prompt:c.prompt};try{
 const result=await api.run({backend:'api',model,cwd:root,permission:'read',system:`Áp dụng skill sau cho yêu cầu kiểm thử. Dữ liệu đều giả lập. Công cụ không khả dụng trong lượt này; dùng kết quả Python đã cung cấp. Trả đúng JSON yêu cầu, không gọi công cụ, không ghi tệp.\n${skill}`,buildPrompt:()=>c.prompt,timeoutMs:90000});
 record.response=result.text;const raw=result.text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');const value=JSON.parse(raw);record.pass=!!c.check(value);
 }catch(e){record.pass=false;record.error=e instanceof SyntaxError?'invalid_json':'request_failed';}
 fs.appendFileSync(out,JSON.stringify(record)+'\n',{mode:0o600});console.log(JSON.stringify({id:record.id,skill:record.skill,pass:record.pass,error:record.error}));
 if(record.error==='request_failed')throw Error('Nguồn AI chưa trả lời; dừng để kiểm tra kết nối, không ghi lỗi hoặc khóa ra log.');
}}
await Promise.all([worker(),worker()]);
const records=fs.readFileSync(out,'utf8').trim().split('\n').map(x=>JSON.parse(x));const latest=new Map(records.map(x=>[x.id,x]));
console.log(JSON.stringify({cases:latest.size,passed:[...latest.values()].filter(x=>x.pass).length,attempts:records.length,output:out}));
