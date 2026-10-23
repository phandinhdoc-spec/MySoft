/** Routing only; instructions always come from the user's installed (possibly edited) skill. */
export function assessmentSkillNames(text:string):string[]{
 const names:string[]=[];
 if(/đặc tả|dac ta/i.test(text))names.push('office-doc-dac-ta');
 if(/ma trận|ma tran/i.test(text))names.push('office-doc-ma-tran');
 if(/(?:sinh|soạn|tạo|ra|lập|thiết kế)\s+(?:bộ\s+)?đề|hồ sơ kiểm tra/i.test(text))names.push('office-sinh-de');
 if(/đáp án|dap an|hướng dẫn chấm|giải đề/i.test(text))names.push('office-dap-an');
 if(names.length>1||/hồ sơ kiểm tra/i.test(text))names.unshift('office-ho-so-kiem-tra');
 return names;
}
