/** Decode pipe chunks independently per stream, including split UTF-8/ANSI sequences. */
export function createOutputDecoder(){
 const decoder=new TextDecoder();
 let state:'text'|'escape'|'csi'|'osc'|'oscEscape'='text',carriage=false;
 const clean=(text:string)=>{
  let result='';
  for(const ch of text){
   if(state==='escape'){state=ch==='['?'csi':ch===']'?'osc':'text';continue;}
   if(state==='csi'){if(ch>='@'&&ch<='~')state='text';continue;}
   if(state==='osc'){if(ch==='\x07')state='text';else if(ch==='\x1b')state='oscEscape';continue;}
   if(state==='oscEscape'){state=ch==='\\'?'text':'osc';continue;}
   if(ch==='\x1b'){state='escape';continue;}
   if(ch==='\r'){result+='\n';carriage=true;continue;}
   if(ch==='\n'&&carriage){carriage=false;continue;}
   carriage=false;
   if(ch==='\n'||ch==='\t'||ch>=' '&&ch!=='\x7f')result+=ch;
  }
  return result;
 };
 return{write:(bytes:Uint8Array)=>clean(decoder.decode(bytes,{stream:true})),finish:()=>clean(decoder.decode())};
}
