import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DaemonHost, PvtaDaemon, daemonEndpoint, type DaemonRuntime} from '../src/desktop/daemon.js';
import type {RpcEvent, RpcRequest} from '../src/desktop/types.js';

const homes: string[] = [];
const daemons: PvtaDaemon[] = [];

function temp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-daemon-'));
  homes.push(dir);
  return dir;
}

/** Runtime giả: không gọi AI, chỉ phát sự kiện để kiểm tra định tuyến. */
function fakeRuntime(emit: (e: RpcEvent) => void): DaemonRuntime {
  return {
    async dispatch(req: RpcRequest) {
      if (req.method === 'echo') return {echo: req.params};
      if (req.method === 'stream') {
        emit({id: req.id, event: 'delta', data: 'chữ ' + req.id});
        return 'xong';
      }
      if (req.method === 'broadcast') {
        emit({id: '', event: 'state', data: {from: req.id}});
        return 'đã phát';
      }
      if (req.method === 'fail') throw Error('Lỗi có khóa sk-abcdefghijklmnop');
      throw Error('Không rõ phương thức');
    },
    dispose() {},
    publicError(e: unknown) {
      return (e instanceof Error ? e.message : String(e)).replace(/sk-[\w-]{12,}/g, '[đã ẩn khóa]');
    },
  };
}

function make(home: string, events: RpcEvent[]): PvtaDaemon {
  const daemon = new PvtaDaemon({home, createRuntime: fakeRuntime, onEvent: e => events.push(e)});
  daemons.push(daemon);
  return daemon;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && !check()) await wait(50);
  expect(check()).toBe(true);
}

afterEach(() => {
  for (const d of daemons.splice(0)) d.close();
  for (const h of homes.splice(0)) fs.rmSync(h, {recursive: true, force: true});
});

describe('lõi PVTA dùng chung (daemon)', () => {
  it('đóng trong lúc khởi động không để lại host hoặc khóa ghi', async () => {
    const home = temp();
    const daemon = make(home, []);
    const starting = daemon.start().catch(() => {});
    daemon.close();
    await starting;
    expect(daemon.mode).toBe('idle');
    expect(fs.existsSync(path.join(home, 'foreground.lock'))).toBe(false);
    await expect(daemon.invoke({id: 'closed', method: 'echo'})).rejects.toThrow();
  });

  it('sự kiện có id không còn chủ không bị phát sang phiên khác', () => {
    const events: unknown[] = [];
    const host = new DaemonHost(fakeRuntime);
    host.links.add({send: e => events.push(e)});
    host.route({id: 'finished-request', event: 'delta', data: 'private'});
    expect(events).toEqual([]);
    host.runtime.dispose();
  });

  it('client nhận được trạng thái lớn hơn giới hạn yêu cầu', async () => {
    const home = temp();
    const payload = 'x'.repeat(2_100_000);
    const host = new PvtaDaemon({home, onEvent: () => {}, createRuntime: () => ({
      dispatch: async () => payload, dispose() {}, publicError: String,
    })});
    daemons.push(host);
    await host.start();
    const client = make(home, []);
    await client.start();
    expect(await client.invoke({id: 'large', method: 'view'})).toBe(payload);
  }, 2000);

  it('tiến trình đầu làm HOST, tiến trình sau nối làm CLIENT và dùng chung dữ liệu', async () => {
    const home = temp();
    const hostEvents: RpcEvent[] = [];
    const clientEvents: RpcEvent[] = [];
    const host = make(home, hostEvents);
    await host.start();
    const client = make(home, clientEvents);
    await client.start();
    expect(host.mode).toBe('host');
    expect(client.mode).toBe('client');
    expect(await client.invoke({id: 'a1', method: 'echo', params: {x: 1}})).toEqual({echo: {x: 1}});
    expect(await host.invoke({id: 'h1', method: 'echo', params: {y: 2}})).toEqual({echo: {y: 2}});
  });

  it('sự kiện có id chỉ đi về kết nối đã gửi yêu cầu', async () => {
    const home = temp();
    const hostEvents: RpcEvent[] = [];
    const clientEvents: RpcEvent[] = [];
    const host = make(home, hostEvents);
    await host.start();
    const client = make(home, clientEvents);
    await client.start();
    await client.invoke({id: 'c-stream', method: 'stream'});
    await until(() => clientEvents.some(e => e.id === 'c-stream'));
    expect(hostEvents.some(e => e.id === 'c-stream')).toBe(false);
    expect(clientEvents.find(e => e.id === 'c-stream')).toMatchObject({event: 'delta'});
  });

  it('sự kiện trạng thái chung (không có id) phát cho mọi tiến trình', async () => {
    const home = temp();
    const hostEvents: RpcEvent[] = [];
    const clientEvents: RpcEvent[] = [];
    const host = make(home, hostEvents);
    await host.start();
    const client = make(home, clientEvents);
    await client.start();
    await client.invoke({id: 'b1', method: 'broadcast'});
    await until(() => hostEvents.some(e => e.event === 'state') && clientEvents.some(e => e.event === 'state'));
  });

  it('lỗi trả về đã được làm sạch khóa bí mật', async () => {
    const home = temp();
    const host = make(home, []);
    await host.start();
    const client = make(home, []);
    await client.start();
    await expect(client.invoke({id: 'f1', method: 'fail'})).rejects.toThrow('[đã ẩn khóa]');
    await expect(client.invoke({id: 'f2', method: 'fail'})).rejects.not.toThrow('sk-abcdef');
  });

  it('khi HOST đóng, CLIENT tự nhận quyền làm HOST và vẫn phục vụ được yêu cầu', async () => {
    const home = temp();
    const host = make(home, []);
    await host.start();
    const client = make(home, []);
    await client.start();
    host.close();
    await until(() => client.mode === 'host');
    expect(await client.invoke({id: 'after', method: 'echo', params: {ok: true}})).toEqual({echo: {ok: true}});
  });

  it('socket trên macOS/Linux không vượt giới hạn độ dài đường dẫn', () => {
    const home = temp();
    const endpoint = daemonEndpoint(home);
    if (process.platform === 'win32') expect(endpoint.startsWith('\\\\.\\pipe\\')).toBe(true);
    else expect(Buffer.byteLength(endpoint)).toBeLessThan(104);
    // Cùng một thư mục dữ liệu luôn ra cùng một địa chỉ.
    expect(daemonEndpoint(home)).toBe(endpoint);
  });
});
