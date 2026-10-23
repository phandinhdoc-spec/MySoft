import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stripVTControlCharacters} from 'node:util';
import {TerminalInput} from '../src/terminal.js';

it('handles split mouse reports and UTF-8 without leaking mouse bytes into typing',()=>{
  const wheels:boolean[]=[];let text='';const input=new TerminalInput(up=>wheels.push(up));
  input.keys.on('data',data=>text+=data.toString());
  const bytes=Buffer.from('Tiếng Việt 📚');for(const byte of bytes)input.feed(Buffer.from([byte]));
  for(const part of ['\x1b','[<64;','12;8M','\x1b[<65;12;8M','\x1b[<0;12;8M','\x1b[<0;12;8m'])input.feed(part);
  input.feed('\x1b[M'+String.fromCharCode(96,40,40));
  input.feed('\x1b[A');
  expect(text).toBe('Tiếng Việt 📚\x1b[A');expect(wheels).toEqual([true,false,true]);input.reset();
});

it('captures wheel input, keeps the composer fixed and restores terminal modes on exit',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'pvta-terminal-'));
  const file=path.join(dir,'cli.cjs');
  await build({entryPoints:['cli/src/main.ts'],outfile:file,bundle:true,platform:'node',format:'cjs',logLevel:'silent',external:['bufferutil','utf-8-validate'],banner:{js:"Object.defineProperty(process.stdin,'isTTY',{value:true});Object.defineProperty(process.stdout,'isTTY',{value:true});process.stdout.columns=80;process.stdout.rows=24;process.stdin.setRawMode=()=>{};"}});
  const child=spawn(process.execPath,[file,'--demo','--no-color'],{stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data);
  const waitFor=async(check:()=>boolean)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for terminal output');};
  const frame=()=>stripVTControlCharacters(output.split('\x1b[H').at(-1)??'');
  try{
    await waitFor(()=>output.includes('\x1b[H'));
    expect(output).toContain('\x1b[?1000h');
    expect(output).toContain('\x1b[?1006h');
    child.stdin.write('/help\r');await waitFor(()=>frame().includes('/activate'));
    child.stdin.write('draft');await waitFor(()=>frame().includes('draft'));
    const before=frame();const composer=before.split('\r\n').find(l=>l.includes('› draft'));
    child.stdin.write('\x1b[<64;20;10M');await waitFor(()=>frame()!==before);
    expect(frame().split('\r\n').find(l=>l.includes('› draft'))).toBe(composer);
    const up=frame();child.stdin.write('\x1b[<65;20;10M');await waitFor(()=>frame()!==up);
    expect(frame()).toBe(before);
    child.stdin.write('\x04');await new Promise<void>(resolve=>child.on('exit',()=>resolve()));
    expect(output).toContain('\x1b[?1000l');expect(output).toContain('\x1b[?1006l');expect(output).toContain('\x1b[?1049l');
  }finally{child.kill();await rm(dir,{recursive:true,force:true});}
});
