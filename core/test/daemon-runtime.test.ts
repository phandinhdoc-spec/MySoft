import {expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PvtaDaemon} from '../src/desktop/daemon';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {RpcEvent} from '../src/desktop/types';

it('two clients run different chats concurrently, reject a duplicate chat and retain both after takeover', async () => {
 const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-runtime-daemon-'));
 const events: RpcEvent[][] = [[], []];
 const finish: Array<() => void> = [];
 let calls = 0;
 const createRuntime = (emit: (event: RpcEvent) => void) => {
  const runtime = new DesktopRuntime(emit, home);
  vi.spyOn(runtime, 'syncRefine').mockResolvedValue(undefined);
  vi.spyOn(runtime.engine, 'run').mockImplementation(async options => {
   const n = ++calls;
   options.onDelta?.(`answer-${n}`);
   if(n <= 2) await new Promise<void>(resolve => finish.push(resolve));
   return {text: `answer-${n}`, attempts: 1, fullPrompt: true, timings: {totalMs: 0}};
  });
  return runtime;
 };
 const host = new PvtaDaemon({home, createRuntime, onEvent: e => events[0]!.push(e)});
 const client = new PvtaDaemon({home, createRuntime, onEvent: e => events[1]!.push(e)});
 const rpc = (daemon: PvtaDaemon, method: string, params = {}, id = crypto.randomUUID()) => daemon.invoke({id, method, params});
 try {
  await host.start(); await client.start();
  await rpc(host, 'preferences', {patch: {choice: {backend: 'api', model: 'openai/mock'}, learning: false}});
  const a = await rpc(host, 'newChat'); const b = await rpc(client, 'newChat');
  const first = rpc(host, 'send', {chatId: a, text: 'Explain A'}, 'send-a');
  const second = rpc(client, 'send', {chatId: b, text: 'Explain B'}, 'send-b');
  await vi.waitFor(() => expect(finish).toHaveLength(2));
  const running = await rpc(client, 'view') as any;
  expect(running.activeChatIds).toEqual(expect.arrayContaining([a, b]));
  await expect(rpc(client, 'send', {chatId: a, text: 'Duplicate'})).rejects.toThrow();
  expect(events[0]!.some(e => e.event === 'delta' && e.id === 'send-a')).toBe(true);
  expect(events[0]!.some(e => e.event === 'delta' && e.id === 'send-b')).toBe(false);
  expect(events[1]!.some(e => e.event === 'delta' && e.id === 'send-b')).toBe(true);
  expect(events[1]!.some(e => e.event === 'delta' && e.id === 'send-a')).toBe(false);
  finish.forEach(resolve => resolve());
  await Promise.all([first, second]);
  host.close();
  await vi.waitFor(() => expect(client.mode).toBe('host'));
  const restored = await rpc(client, 'view') as any;
  for(const id of [a, b]) expect(restored.data.chats.find((c: any) => c.id === id).messages.some((m: any) => m.role === 'assistant' && /^answer-/.test(m.text))).toBe(true);
 } finally {
  finish.forEach(resolve => resolve()); host.close(); client.close();
  vi.restoreAllMocks(); fs.rmSync(home, {recursive: true, force: true});
 }
});
