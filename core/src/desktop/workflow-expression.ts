/** Small, pure expression language. Never evaluates JavaScript or accesses prototypes. */
export type Value = null | boolean | number | string | Value[] | {[key:string]:Value};
type Expr = {kind:'literal';value:Value}|{kind:'ref';name:string;path:string[]}|{kind:'array';items:Expr[]}|{kind:'object';items:[string,Expr][]}|{kind:'unary';op:string;arg:Expr}|{kind:'binary';op:string;left:Expr;right:Expr};
const forbidden=new Set(['__proto__','prototype','constructor']);
export const identifier=/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
export function validName(name:string){if(!identifier.test(name)||forbidden.has(name)||['input','prev'].includes(name))throw Error(`Tên “${name}” không hợp lệ hoặc dành cho hệ thống.`);}
export function parseExpression(source:string):Expr{
 if(source.length>8000)throw Error('Biểu thức quá dài.');
 const tokens:string[]=[];let pos=0;
 const re=/\s*(\$[A-Za-z_][A-Za-z0-9_-]*|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_-]*|==|!=|<=|>=|&&|\|\||[+*/%<>()\[\]{},:.!\-])/y;
 while(pos<source.trimEnd().length){re.lastIndex=pos;const m=re.exec(source);if(!m)throw Error(`Biểu thức không hợp lệ tại “${source.slice(pos,pos+30)}”.`);tokens.push(m[1]!);pos=re.lastIndex;}
 let i=0,depth=0;const peek=()=>tokens[i],take=()=>tokens[i++];
 const need=(s:string)=>{if(take()!==s)throw Error(`Thiếu “${s}” trong biểu thức.`);};
 const priority:Record<string,number>={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
 function atom():Expr{
  if(++depth>64)throw Error('Biểu thức lồng quá sâu.');
  const token=take();let out:Expr;
  if(!token)throw Error('Thiếu giá trị.');
  if(token==='!'||token==='-'||token==='+')out={kind:'unary',op:token,arg:atom()};
  else if(token==='('){out=expression();need(')');}
  else if(token==='['){const items:Expr[]=[];if(peek()!==']')do{items.push(expression());if(peek()!==',')break;take();}while(true);need(']');out={kind:'array',items};}
  else if(token==='{'){
   const items:[string,Expr][]=[];const seen=new Set<string>();
   if(peek()!=='}')do{const raw=take()??'';const key=raw.startsWith('"')?JSON.parse(raw):raw;
    if(typeof key!=='string'||(!raw.startsWith('"')&&!identifier.test(key))||forbidden.has(key)||seen.has(key))throw Error('Tên trường không hợp lệ hoặc bị trùng.');
    seen.add(key);need(':');items.push([key,expression()]);if(peek()!==',')break;take();
   }while(true);need('}');out={kind:'object',items};
  }else if(token.startsWith('$')){
   const path:string[]=[];while(peek()==='.'||peek()==='['){const access=take();let key=take()??'';if(access==='['){if(key.startsWith('"'))key=JSON.parse(key);else if(!/^\d+$/.test(key))throw Error('Chỉ số cần số nguyên hoặc tên trường trong dấu nháy.');need(']');}else if(!identifier.test(key))throw Error('Tên trường không hợp lệ.');if(forbidden.has(key))throw Error('Tên trường không hợp lệ.');path.push(key);}
   out={kind:'ref',name:token.slice(1),path};
  }else if(token.startsWith('"'))out={kind:'literal',value:JSON.parse(token)};
  else if(['true','false','null'].includes(token))out={kind:'literal',value:JSON.parse(token)};
  else if(/^\d/.test(token)&&Number.isFinite(Number(token)))out={kind:'literal',value:Number(token)};
  else throw Error(`Giá trị “${token}” không hợp lệ. Chuỗi dùng dấu nháy kép, tham chiếu dùng $tên.`);
  depth--;return out;
 }
 function expression(min=0):Expr{let left=atom();while(peek()!==undefined&&(priority[peek()!]??-1)>=min){const op=take()!,p=priority[op]!;left={kind:'binary',op,left,right:expression(p+1)};}return left;}
 const result=expression();if(i!==tokens.length)throw Error(`Thừa “${peek()}” trong biểu thức.`);return result;
}
export function references(expr:Expr):string[]{
 switch(expr.kind){case 'ref':return [expr.name];case 'literal':return [];case 'array':return expr.items.flatMap(references);case 'object':return expr.items.flatMap(([,e])=>references(e));case 'unary':return references(expr.arg);case 'binary':return [...references(expr.left),...references(expr.right)];}
}
export function evaluate(expr:Expr,read:(name:string)=>Value):Value{
 const run=(e:Expr):Value=>{
  switch(e.kind){
   case 'literal':return e.value;
   case 'ref':{let v=read(e.name);for(const key of e.path){if(v===null||typeof v!=='object'||!Object.hasOwn(v,key))throw Error(`Không có trường “${key}” của $${e.name}.`);v=(v as Record<string,Value>)[key]!;}return v;}
   case 'array':return e.items.map(run);
   case 'object':return Object.fromEntries(e.items.map(([k,v])=>[k,run(v)]));
   case 'unary':{const a=run(e.arg);if(e.op==='!'){if(typeof a!=='boolean')throw Error('Điều kiện phải là true/false.');return !a;}if(typeof a!=='number')throw Error('Phép tính cần số.');return e.op==='-'?-a:a;}
   case 'binary':{
    const a=run(e.left);
    if(e.op==='&&'||e.op==='||'){if(typeof a!=='boolean')throw Error('Điều kiện phải là true/false.');if(e.op==='&&'&&!a||e.op==='||'&&a)return a;const b=run(e.right);if(typeof b!=='boolean')throw Error('Điều kiện phải là true/false.');return b;}
    const b=run(e.right);if(e.op==='==')return JSON.stringify(a)===JSON.stringify(b);if(e.op==='!=')return JSON.stringify(a)!==JSON.stringify(b);
    if(e.op==='+'&&typeof a==='string'&&typeof b==='string')return a+b;
    if(typeof a!=='number'||typeof b!=='number')throw Error('Phép tính và so sánh thứ tự cần hai số.');
    switch(e.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':if(b===0)throw Error('Không chia được cho 0.');return a/b;case '%':if(b===0)throw Error('Không chia được cho 0.');return a%b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;}
   }
  }throw Error('Toán tử không hỗ trợ.');
 };
 const value=run(expr);
 const finite=(v:Value):boolean=>typeof v==='number'?Number.isFinite(v):v!==null&&typeof v==='object'?Object.values(v).every(finite):true;
 if(!finite(value)||JSON.stringify(value).length>60000)throw Error('Kết quả vượt giới hạn.');return value;
}
export const displayValue=(v:Value)=>typeof v==='string'?v:JSON.stringify(v);
