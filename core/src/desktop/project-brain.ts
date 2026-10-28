import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brainProjectRoot,brainScope,type BrainScope,type BrainSource} from './brain.js';
import type {Project,Attachment} from './types.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex').slice(0,24);
export const projectBrainDir=(home:string,id:string)=>path.join(home,'project-brains',hash(id));
const within=(file:string,root:string)=>{const rel=path.relative(root,file);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};

/** Every project owns metadata and indexes. Sources are explicit folders/files, never their parents. */
export function projectBrainScope(home:string,project:Project,attachments:Attachment[]=[],chat?:{id:string;projectId?:string;sourceFolders?:string[]}):BrainScope{
 if(chat&&chat.projectId!==project.id)throw Error('Hội thoại không thuộc dự án Brain.');
 const dir=projectBrainDir(home,project.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const indexDir=path.join(dir,'indexes');fs.mkdirSync(indexDir,{recursive:true,mode:0o700});
 const sources:BrainSource[]=[];
 const add=(scope:BrainScope,label:string)=>{
  const id='s-'+hash(JSON.stringify([scope.root,scope.files??null]));
  sources.push({...scope,id,label,indexPath:path.join(indexDir,id+'.idx')});
 };
 const roots=[...new Set([...(project.folders??[]),...(chat?.sourceFolders??[])].map(folder=>brainProjectRoot([folder],project.learning?.folders??[])).filter((r):r is string=>!!r))];
 for(const root of roots.filter(root=>!roots.some(other=>other!==root&&within(root,other))))add({root},path.basename(root));
 // Chat-only files remain available only to their own chat, within this project.
 const loose=attachments.filter(a=>!a.image&&a.purpose!=='learning'&&(a.scope==='project'?a.scopeId===project.id:!!chat&&a.scopeId===chat.id)).map(a=>a.path).filter(file=>!roots.some(root=>within(file,root)));
 // Keep each file batch scoped; do not silently drop attachments beyond the CLI's 200-file limit.
 for(let i=0;i<loose.length;i+=200){const scope=brainScope([],project.learning?.folders??[],loose.slice(i,i+200));if(scope)add(scope,'Tệp đính kèm');}
 // Stable project metadata must not expose one chat's private sources to another chat.
 const content='# Dự án\n\n'+JSON.stringify({id:project.id,name:project.name,folders:project.folders??[],note:'Chỉ đọc các nguồn trong danh sách scope của lượt hiện tại. Khi chưa có nguồn, không suy ra quyền đọc mã của dự án khác hoặc mã của PVTA.'},null,2)+'\n';
 const metadata=path.join(dir,'project.md');
 if(!fs.existsSync(metadata)||fs.readFileSync(metadata,'utf8')!==content)fs.writeFileSync(metadata,content,{mode:0o600});
 add({root:dir,files:['project.md']},'Thông tin dự án');
 return {root:dir,label:`PHẠM VI DỰ ÁN RIÊNG: ${JSON.stringify(project.name)} (${project.id}). Chỉ có dữ liệu của dự án này và nguồn được cấp cho hội thoại hiện tại.`,sources};
}
