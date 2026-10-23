import fs from 'node:fs';
const next=process.argv[2];
const checking=next==='--check';
const root=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=checking?root.version:next??root.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Dùng: npm run version:set -- 1.1.1');
let bad=false;
function update(file,text){
 const old=fs.readFileSync(file,'utf8');
 // Git may check text files out with CRLF on Windows. Formatting is not a version change.
 const normalize=s=>s.replace(/\r\n/g,'\n');
 const same=file.endsWith('.json')
  ? JSON.stringify(JSON.parse(old))===JSON.stringify(JSON.parse(text))
  : normalize(old)===normalize(text);
 if(same)return;
 if(checking){console.error('Lệch phiên bản: '+file);bad=true;}
 else fs.writeFileSync(file,old.includes('\r\n')?normalize(text).replace(/\n/g,'\r\n'):text);
}
for(const folder of ['', 'shared/','core/','bridge/','addin/','chatbox/','chatbox/src-tauri/']){
 const file=folder+(folder==='chatbox/src-tauri/'?'tauri.conf.json':'package.json');
 const j=JSON.parse(fs.readFileSync(file,'utf8'));j.version=version;update(file,JSON.stringify(j,null,2)+'\n');
}
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));lock.version=version;
for(const key of ['', 'shared','core','bridge','addin','chatbox'])if(lock.packages[key])lock.packages[key].version=version;
update('package-lock.json',JSON.stringify(lock,null,2)+'\n');
for(const file of ['chatbox/src-tauri/Cargo.toml','chatbox/src-tauri/Cargo.lock']){
 const s=fs.readFileSync(file,'utf8');
 const pattern=/(name = "pvta-chatbox"\r?\nversion = ")[^"]+/;
 if(!pattern.test(s))throw Error('Không tìm thấy phiên bản pvta-chatbox trong '+file);
 update(file,s.replace(pattern, '$1'+version));
}
const manifest='addin/manifest.xml';update(manifest,fs.readFileSync(manifest,'utf8').replace(/<Version>[^<]+<\/Version>/,`<Version>${version}.0</Version>`));
const runtime='core/src/desktop/runtime.ts';update(runtime,fs.readFileSync(runtime,'utf8').replace(/const VERSION='[^']+';/,`const VERSION='${version}';`));
for(const file of ['scripts/windows/studio.iss','scripts/windows/pvta.iss'])update(file,fs.readFileSync(file,'utf8').replace(/#define AppVersion "[^"]+"/,`#define AppVersion "${version}"`));
if(bad)process.exit(1);
console.log(`PVTA Chat + Office: ${version}${checking?' (đồng bộ)':''}`);
