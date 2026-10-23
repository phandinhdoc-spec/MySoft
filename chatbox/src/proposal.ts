/** Dòng cuối "[[DE_NGHI]] ..." do PVTA viết khi có đề nghị cần thầy cô quyết định. */
const MARK=/(?:^|\n)[ \t]*\[\[DE_NGHI\]\][ \t]*([^\n]*)\s*$/;
export function splitProposal(text:string):{body:string;proposal:string|null}{
 const m=MARK.exec(text);if(!m)return {body:text,proposal:null};
 return {body:text.slice(0,m.index).trimEnd(),proposal:m[1]!.trim()||'Thực hiện đề nghị trên'};
}
/** Văn bản hiển thị: bỏ dấu hiệu, kể cả khi đang stream dở dòng. */
export function hideProposalMark(text:string):string{
 const {body,proposal}=splitProposal(text);if(proposal!==null)return body;
 const nl=text.lastIndexOf('\n'),tail=text.slice(nl+1).trim();
 return tail.length>=2&&'[[DE_NGHI]]'.startsWith(tail)?text.slice(0,Math.max(nl,0)).trimEnd():text;
}
