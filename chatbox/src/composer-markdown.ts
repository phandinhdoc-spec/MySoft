/** Format complete selected lines, keeping text outside the selection intact. */
export function markdownList(text:string,start:number,end:number,ordered:boolean){
 const from=start===0?0:text.lastIndexOf('\n',start-1)+1;
 const selectedEnd=end>start&&text[end-1]==='\n'?end-1:end;
 const newline=text.indexOf('\n',selectedEnd);
 const to=newline<0?text.length:newline;
 const block=text.slice(from,to).split('\n').map((line,i)=>{
  const [,indent='',body='']=/^(\s*)(.*)$/.exec(line)!;
  return indent+(ordered?`${i+1}. `:'- ')+body.replace(/^(?:[-+*]|\d+[.)])\s+/, '');
 }).join('\n');
 return {text:text.slice(0,from)+block+text.slice(to),caret:from+block.length};
}

export function markdownFile(path:string){
 const name=path.split(/[\\/]/).pop()??path;
 const label=name.replace(/[\\[\]]/g,'\\$&');
 const target=path.replace(/%/g,'%25').replace(/</g,'%3C').replace(/>/g,'%3E').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
 return `[${label}](<${target}>)\n`;
}

/** Workflow input values are explicit quoted strings, including generated Markdown links. */
export function workflowInputLink(path:string,image=false){
 return JSON.stringify((image?'!':'')+markdownFile(path).trimEnd())+'\n';
}
