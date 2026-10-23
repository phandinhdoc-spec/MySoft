/** Tên dự án gợi ý từ thư mục: lấy tên thư mục cuối, bỏ gạch dưới, tránh trùng tên dự án có sẵn. */
export function suggestProjectName(folder:string,existing:string[]):string{
 const last=folder.split(/[\\/]+/).filter(Boolean).at(-1)??'';
 let base=last.replace(/_+/g,' ').replace(/\s+/g,' ').trim();
 if(/^[A-Za-z]:$/.test(base))base='';
 if(!base)base='Dự án mới';
 base=(base.charAt(0).toLocaleUpperCase('vi')+base.slice(1)).slice(0,90);
 const taken=new Set(existing.map(n=>n.trim().toLocaleLowerCase('vi')));
 if(!taken.has(base.toLocaleLowerCase('vi')))return base;
 for(let n=2;n<1000;n++){const name=`${base} (${n})`;if(!taken.has(name.toLocaleLowerCase('vi')))return name;}
 return `${base} (${Date.now()})`;
}
