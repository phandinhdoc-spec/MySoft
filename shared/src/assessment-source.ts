/** Coordinates from the Office extractor. Values stay verbatim; blank is not zero. */
export interface SourceCell {column:number; endColumn:number; address:string; origin?:string; text:string}
export interface SourceRow {table:string; row:number; cells:SourceCell[]}
export function readAssessmentRows(source:string):SourceRow[] {
 const rows:SourceRow[]=[];
 let table='1', lastRow=0;
 for(const line of source.split(/\r?\n/)){
  const label=line.match(/\[Bảng (\d+) · Hàng \d+\]/);
  const matches=[...line.matchAll(/\[R(\d+)C(\d+)(?:[–-]C(\d+))?(?:;([^\]]*))?\]\s*([\s\S]*?)(?=\s*\|\s*\[R\d+C|$)/g)];
  if(!matches.length)continue;
  const row=Number(matches[0]![1]);
  if(label)table=label[1]!;
  else if(row<=lastRow)table=String(Number(table)+1);
  lastRow=row;
  rows.push({table,row,cells:matches.map(m=>({column:Number(m[2]),endColumn:Number(m[3]||m[2]),address:`R${m[1]}C${m[2]}`,origin:m[4]?.match(/gộp dọc từ (R\d+C\d+)/)?.[1],text:m[5]!.trim()==='[trống]'?'':m[5]!.trim()}))});
 }
 return rows;
}

export interface MatrixSourceCell {
 table:string; address:string; topic:string; form:string; headers:string[];
 level:'NB'|'TH'|'VD'|'VDC'|null; code:string; raw:string; value:number|null;
 unit:'câu'|'ý'|'câu/ý';
}
export interface MatrixReading {
 cells:MatrixSourceCell[]; summaries:MatrixSourceCell[]; issues:string[];
}
const cleanHeader=(text:string)=>text.replace(/\s*\/\s*/g,' ').replace(/\s+/g,' ').trim();
const sourceNumber=(text:string):number|null=>{
 // The extractor uses slash separators for paragraphs. Only empty edge paragraphs
 // may be stripped; 1/2 is not the number 12 or two independent counts.
 const literal=text.replace(/^(?:\s*\/)+|(?:\/\s*)+$/g,'').trim();
 return /^\d+(?:[.,]\d+)?$/.test(literal)?Number(literal.replace(',','.')):null;
};

/** Read counts as source evidence, independently of the whole-question allocator. */
export function readMatrixDocument(source:string):MatrixReading {
 const rows=readAssessmentRows(source),cells:MatrixSourceCell[]=[],summaries:MatrixSourceCell[]=[],issues:string[]=[];
 const byAddress=new Map(rows.flatMap(r=>r.cells.map(c=>[`${r.table}:${c.address}`,c] as const)));
 function resolve(table:string,cell:SourceCell):string {
  const seen=new Set<string>();let current:SourceCell|undefined=cell;
  while(current?.origin){
   if(seen.has(current.origin))return '';
   seen.add(current.origin);current=byAddress.get(`${table}:${current.origin}`);
  }
  return current?.text||'';
 }
 for(const table of new Set(rows.map(r=>r.table))){
  const tableRows=rows.filter(r=>r.table===table);
  const first=tableRows.findIndex(r=>r.cells.some(c=>/^(I|II|III)$/.test(resolve(table,c).trim())));
  if(first<0)continue;
  const headerRows=tableRows.slice(0,first);
  const boundary=headerRows.flatMap(r=>r.cells).find(c=>/tổngsố/.test(cleanHeader(c.text).replace(/\s/g,'').toLowerCase()))?.column;
  if(boundary===undefined){issues.push(`Bảng ${table}: chưa xác định cột tổng số; giữ văn bản nguồn để đối chiếu.`);continue;}
  for(const row of tableRows.slice(first)){
   const formCell=row.cells.find(c=>/^(I|II|III)$/.test(resolve(table,c).trim()));
   if(!formCell)continue;
   const form=resolve(table,formCell).trim();
   const summary=row.cells.some(c=>/số câu tn\s*\/\s*số ý|^tổng\b/iu.test(resolve(table,c).trim()));
   const topic=cleanHeader(resolve(table,row.cells[0]!));
   for(const cell of row.cells){
    if(cell.column<=formCell.column||cell.column>=boundary||cell.origin)continue;
    const headers=headerRows.flatMap(r=>r.cells.filter(c=>c.column<=cell.column&&c.endColumn>=cell.endColumn).map(c=>cleanHeader(resolve(table,c)))).filter(Boolean);
    const levelText=headers.find(h=>/^(biết|nhận biết|hiểu|thông hiểu|vận dụng|vận dụng cao)$/i.test(h));
    const level:MatrixSourceCell['level']=!levelText?null:/cao/i.test(levelText)?'VDC':/vận dụng/i.test(levelText)?'VD':/hiểu/i.test(levelText)?'TH':'NB';
    const code=headers.find(h=>/^TN\d/i.test(h))?.replace(/\s/g,'')||'';
    const value=sourceNumber(cell.text);
    const entry:MatrixSourceCell={table,address:cell.address,topic,form,headers,level,code,raw:cell.text,value,unit:form==='I'?'câu':form==='II'?'ý':'câu/ý'};
    (summary?summaries:cells).push(entry);
    if(cell.text.trim()&&value===null)issues.push(`Bảng ${table} ${cell.address}: giữ nguyên “${cell.text}”, chưa xác định số lượng.`);
    if(value!==null&&value>0&&!level)issues.push(`Bảng ${table} ${cell.address}: tiêu đề chưa xác định mức độ.`);
   }
  }
 }
 if(!cells.length)issues.push('Chưa nhận diện được bảng ma trận theo hàng dạng I, II, III và cột tổng số. Xem văn bản nguồn; không dùng ma trận mẫu thay thế.');
 return {cells,summaries,issues:[...issues,...auditAssessmentTable(source)]};
}

export function matrixReportMarkdown(report:MatrixReading,name:string):string {
 const escape=(value:unknown)=>String(value??'Chưa xác định').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
 const table=(rows:MatrixSourceCell[])=>['| Vị trí | Chủ đề | Dạng | Mức độ | Mã năng lực | Giá trị nguồn | Đơn vị |','| --- | --- | --- | --- | --- | --- | --- |',...rows.filter(c=>c.raw.trim()).map(c=>'| '+[ `Bảng ${c.table} · ${c.address}`,c.topic,c.form,c.level,c.code,c.raw,c.unit].map(escape).join(' | ')+' |')].join('\n');
 return `# Kết quả đọc ma trận\n\nNguồn: ${escape(name||'Văn bản đã dán')}\n\nSố liệu nguyên văn; ô trống chưa xác định. Báo cáo đọc nguồn, chưa phải hồ sơ đề đã kiểm định.\n\n## Ô chi tiết\n\n${table(report.cells)}\n\n## Tổng ghi trong nguồn\n\n${table(report.summaries)}\n\n## Cần đối chiếu\n\n${report.issues.length?report.issues.map(x=>`- ${escape(x)}`).join('\n'):'Chưa phát hiện cảnh báo tự động; vẫn cần đối chiếu tài liệu gốc.'}\n`;
}

/** Compare detail with the source's own total rows, never with a fixed exam template. */
export function auditAssessmentTable(source:string):string[] {
 const rows=readAssessmentRows(source),issues:string[]=[];
 const origins=new Map<string,string>();
 const totals=new Map<string,number>();
 for(const row of rows){
  for(const cell of row.cells)origins.set(`${row.table}:${cell.address}`,cell.text);
  const text=(cell:SourceCell)=>cell.origin?origins.get(`${row.table}:${cell.origin}`)||'':cell.text;
  const form=row.cells.find(c=>/^(I|II|III)$/.test(text(c).trim()));
  if(!form)continue;
  const summary=row.cells.some(c=>/số câu tn\s*\/\s*số ý|^tổng\b/iu.test(text(c).trim()));
  for(const cell of row.cells){
   if(cell.column<=form.column||cell.origin||cell.endColumn!==cell.column)continue;
   // Only competency columns, before the declared total-count column.
   const header=rows.find(r=>r.table===row.table&&r.cells.some(c=>/tổn\s*\/?\s*g số/i.test(c.text)));
   const boundary=header?.cells.find(c=>/tổn\s*\/?\s*g số/i.test(c.text))?.column;
   if(boundary===undefined||cell.column>=boundary)continue;
   const parts=cell.text.split('/').map(x=>x.trim()).filter(Boolean);
   if(parts.length!==1)continue;
   const literal=parts[0]!;
   if(!/^\d+(?:[,.]\d+)?$/.test(literal))continue;
   const value=Number(literal.replace(',','.')),key=`${row.table}:${text(form).trim()}:${cell.column}`;
   if(summary){
    const actual=totals.get(key);
    if(actual!==undefined&&Math.abs(actual-value)>1e-6)issues.push(`Bảng ${row.table} ${cell.address}: tổng nguồn ${literal}, tổng các ô chi tiết đã ghi ${actual}; cần đối chiếu nguồn, không tự sửa.`);
   }else totals.set(key,(totals.get(key)||0)+value);
  }
 }
 return issues;
}

export const ASSESSMENT_SOURCE_RULES = `Đọc nguồn theo bảng, hàng, cột và vùng gộp. Giữ nguyên văn và tọa độ từng dữ kiện. Ô trống là chưa xác định; gộp dọc chỉ kế thừa từ ô gốc được ghi. Nếu dùng quy ước để trống lặp lại nội dung/mức độ, ghi rõ là suy luận cần xác nhận. Mã năng lực (ví dụ 1.1, TN1.3) không phải số câu hay mức độ. Tách số câu, số ý, điểm và mã câu; 19a là một ý của câu 19, không phải một câu Đ/S hoàn chỉnh. Phần III có thể là trả lời ngắn hoặc tự luận: lấy tên dạng từ nguồn. Bảng năng lực và bảng đặc tả có thể mô tả cùng câu, không cộng hai lần. Giữ số câu và điểm thiếu ở trạng thái chưa xác định; không tự phân bổ theo mẫu. Đối chiếu cấu trúc, phạm vi và từng ô trước khi phân bổ; bất đồng giữa hai nguồn không phải lỗi định dạng và không được tự sửa nguồn.`;
