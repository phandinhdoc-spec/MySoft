import {PassThrough} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';

export const enterTerminal='\x1b[?1049h\x1b[2J\x1b[?1000h\x1b[?1006h';
export const leaveTerminal='\x1b[?1000l\x1b[?1006l\x1b[0m\x1b[?25h\x1b[?1049l';

// Remove mouse reports before readline: otherwise report bytes become typed text.
export class TerminalInput {
  readonly keys=new PassThrough();
  private decoder=new StringDecoder('utf8');
  private pending='';
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(private wheel:(up:boolean)=>void){}
  feed(data:Buffer|string){
    if(this.timer)clearTimeout(this.timer);
    this.pending+=typeof data==='string'?data:this.decoder.write(data);
    while(this.pending){
      const match=/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(this.pending);
      if(match){
        const button=Number(match[1]);
        if(match[4]==='M'&&(button&~28)===64)this.wheel(true);
        if(match[4]==='M'&&(button&~28)===65)this.wheel(false);
        this.pending=this.pending.slice(match[0].length);continue;
      }
      // Legacy X10 reports may still arrive from terminal multiplexers.
      if(this.pending.startsWith('\x1b[M')&&this.pending.length>=6){
        const button=this.pending.charCodeAt(3)-32;
        if((button&~28)===64)this.wheel(true);
        if((button&~28)===65)this.wheel(false);
        this.pending=this.pending.slice(6);continue;
      }
      if(this.pending==='\x1b'||this.pending==='\x1b['||/^\x1b\[<[\d;]*$/.test(this.pending)||this.pending.startsWith('\x1b[M')&&this.pending.length<6)break;
      const char=String.fromCodePoint(this.pending.codePointAt(0)!);
      this.keys.write(char);this.pending=this.pending.slice(char.length);
    }
    if(this.pending)this.timer=setTimeout(()=>{
      // Preserve Escape; discard truncated mouse reports instead of inserting them.
      if(!this.pending.startsWith('\x1b[<')&&!this.pending.startsWith('\x1b[M'))this.keys.write(this.pending);
      this.pending='';this.timer=undefined;
    },100);
  }
  reset(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.pending='';this.decoder=new StringDecoder('utf8');}
}
