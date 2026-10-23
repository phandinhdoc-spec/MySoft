import {marked} from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
async function show(){
const encoded=document.querySelector('#source')?.textContent??'';
const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
const text=new TextDecoder().decode(bytes);
const root=document.querySelector('main')!;
root.innerHTML=DOMPurify.sanitize(await marked.parse(text),{FORBID_TAGS:['iframe','script','object','embed','form'],FORBID_ATTR:['style']});
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral'});
for(const code of root.querySelectorAll('code.language-mermaid')){
  const div=document.createElement('div');div.className='mermaid';div.textContent=code.textContent;code.parentElement?.replaceWith(div);
}
try{await mermaid.run({querySelector:'.mermaid'});}catch{const p=document.createElement('p');p.textContent='Có sơ đồ Mermaid không hợp lệ; hãy kiểm tra mã nguồn.';root.prepend(p);}
}
void show();
