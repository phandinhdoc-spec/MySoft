import {describe,it,expect} from 'vitest';
import {abortable} from '../src/desktop/request-deadline';
describe('cancellation even for unresponsive providers',()=>{
 it('settles without waiting for the provider',async()=>{
  const ctl=new AbortController();const p=abortable(()=>new Promise(()=>{}),ctl.signal);
  ctl.abort(new Error('deadline'));await expect(p).rejects.toThrow('deadline');
 });
 it('does not start an already cancelled operation',async()=>{
  const ctl=new AbortController();ctl.abort(new Error('stopped'));let called=false;
  await expect(abortable(async()=>{called=true;return 1;},ctl.signal)).rejects.toThrow('stopped');expect(called).toBe(false);
 });
 it('returns normal results',async()=>{await expect(abortable(async()=>42,new AbortController().signal)).resolves.toBe(42);});
});
