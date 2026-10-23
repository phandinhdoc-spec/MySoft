import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const execute=promisify(execFile);
export class Draft {
  original='';text='';file='';private saved?:string;private previous?:string;
  constructor(private root:string){}
  async resolve(file:string):Promise<string>{
    const root=await fs.realpath(this.root);const real=await fs.realpath(path.resolve(root,file));const rel=path.relative(root,real);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Tệp nằm ngoài thư mục làm việc.');
    return real;
  }
  async load(file:string){
    const real=await this.resolve(file);if(!/\.(md|markdown|txt)$/i.test(real))throw Error('Chọn tệp .md, .markdown hoặc .txt.');
    if((await fs.stat(real)).size>1_000_000)throw Error('Tệp quá lớn (tối đa 1 MB).');
    const text=await fs.readFile(real,'utf8');this.file=real;this.text=this.original=text;this.saved=this.previous=undefined;
  }
  replace(line:number,text:string){
    if(!this.file)throw Error('Dùng /edit <tệp> trước.');const lines=this.text.split('\n');
    if(!Number.isInteger(line)||line<1||line>lines.length+1)throw Error('Số dòng không hợp lệ.');
    lines[line-1]=text;this.text=lines.join('\n');
  }
  diff(){
    if(!this.file)return 'Chưa mở bản nháp. /edit <tệp.md>';
    const a=this.original.split('\n'),b=this.text.split('\n');return [...Array(Math.max(a.length,b.length))].flatMap((_,i)=>a[i]===b[i]?[` ${i+1} ${a[i]??''}`]:[...(a[i]===undefined?[]:[`-${i+1} ${a[i]}`]),...(b[i]===undefined?[]:[`+${i+1} ${b[i]}`])]).join('\n');
  }
  async save(){
    if(!this.file)throw Error('Chưa có bản nháp.');
    await this.resolve(this.file);
    if(await fs.readFile(this.file,'utf8')!==this.original)throw Error('Tệp đã đổi bên ngoài; mở lại trước khi lưu.');
    this.previous=this.original;await fs.writeFile(this.file,this.text);this.saved=this.text;this.original=this.text;
  }
  async undo(){
    if(this.previous===undefined||this.saved===undefined)throw Error('Chưa có lần lưu để hoàn tác.');
    await this.resolve(this.file);
    if(await fs.readFile(this.file,'utf8')!==this.saved)throw Error('Tệp đã đổi bên ngoài; không hoàn tác đè lên.');
    await fs.writeFile(this.file,this.previous);this.text=this.original=this.previous;this.previous=this.saved=undefined;
  }
  async open(file:string){const real=await this.resolve(file);await execute(process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open',[real]);}
}
