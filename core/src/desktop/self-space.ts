import fs from 'node:fs';
import path from 'node:path';

/** Vùng làm việc riêng của AI nền "Tự hiểu". Trong dự án: <thư mục chính>/.pvta/self/<loại>-<mã>/; ngoài dự án (chat, sổ nguồn): <home>/self/<loại>-<mã>/. */
export type SelfKind='project'|'chat'|'workflow'|'notebook';
const KINDS=new Set<string>(['project','chat','workflow','notebook']);
const SAFE_ID=/^[\w-]{1,80}$/;
const real=(p:string)=>{try{return fs.realpathSync(p);}catch{return undefined;}};

export class SelfSpace{
 constructor(private home:string){}
 private check(kind:SelfKind,id:string){if(!KINDS.has(kind)||!SAFE_ID.test(id))throw Error('Mã vùng làm việc không hợp lệ.');}
 /** Thư mục cha chứa các vùng. `root` là thư mục chính của dự án (nếu có). */
 private base(root?:string){return root?path.join(root,'.pvta','self'):path.join(this.home,'self');}
 /** Đường dẫn dự kiến, chưa tạo. */
 dir(kind:SelfKind,id:string,root?:string):string{this.check(kind,id);return path.join(this.base(root),`${kind}-${id}`);}
 /** Tạo vùng và trả đường dẫn. Thư mục dự án chỉ đọc hoặc không tồn tại thì dùng vùng trong home. */
 ensure(kind:SelfKind,id:string,root?:string):string{
  this.check(kind,id);
  if(root&&path.isAbsolute(root)&&fs.existsSync(root)){
   try{
    const parent=path.join(root,'.pvta');fs.mkdirSync(path.join(parent,'self'),{recursive:true,mode:0o700});
    const ignore=path.join(parent,'.gitignore');if(!fs.existsSync(ignore))fs.writeFileSync(ignore,'*\n',{mode:0o600});
    const rr=real(root),rb=real(this.base(root));
    if(rr&&rb&&rb===path.join(rr,'.pvta','self')){const d=path.join(rb,`${kind}-${id}`);fs.mkdirSync(d,{recursive:true,mode:0o700});return d;}
   }catch{/* rơi xuống vùng trong home */}
  }
  const d=path.join(this.base(),`${kind}-${id}`);fs.mkdirSync(d,{recursive:true,mode:0o700});return d;
 }
 /**
  * Xóa vùng của một đối tượng ở home và ở mọi thư mục chính đã biết. Chỉ xóa đúng đường dẫn `.pvta/self/<loại>-<mã>`;
  * nếu `.pvta` hoặc `self` là liên kết trỏ ra ngoài thì bỏ qua, không đi theo liên kết.
  */
 remove(kind:SelfKind,id:string,roots:(string|undefined)[]=[]):number{
  this.check(kind,id);let removed=0;
  for(const root of [undefined,...new Set(roots.filter((r):r is string=>!!r&&path.isAbsolute(r)))]){
   const baseDir=this.base(root),target=path.join(baseDir,`${kind}-${id}`);
   try{
    if(!fs.lstatSync(target,{throwIfNoEntry:false}))continue;
    const expectedBase=root?(real(root)?path.join(real(root)!,'.pvta','self'):undefined):(real(this.home)?path.join(real(this.home)!,'self'):undefined);
    if(!expectedBase||real(baseDir)!==expectedBase)continue;
    fs.rmSync(target,{recursive:true,force:true});removed++;
   }catch{/* không chặn thao tác xóa chính */}
  }
  return removed;
 }
}
