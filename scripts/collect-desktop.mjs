import fs from 'node:fs';import path from 'node:path';
const arch=process.argv[2]??'x64';const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const root='chatbox/src-tauri/target/release/bundle';fs.mkdirSync('release/chatbox',{recursive:true});
for(const folder of ['dmg','nsis','deb','appimage']){const dir=path.join(root,folder);if(!fs.existsSync(dir))continue;for(const name of fs.readdirSync(dir)){if(!/\.(dmg|exe|deb|AppImage)$/.test(name))continue;const ext=name.slice(name.lastIndexOf('.'));fs.copyFileSync(path.join(dir,name),`release/chatbox/PVTA-Chatbox-${version}-${arch}${ext}`);}}
