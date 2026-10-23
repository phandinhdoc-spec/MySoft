import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type {RpcEvent, RpcRequest} from './types.js';
import {foregroundLock} from './foreground-lock.js';
import {holdAppLock, stopRefiner} from './refine/locks.js';

/**
 * Lớp nối nhiều tiến trình (Desktop, CLI) vào một kho dữ liệu.
 *
 * Một tiến trình giành khóa ghi sẽ là HOST: nó giữ DesktopRuntime duy nhất và mở socket cục bộ.
 * Các tiến trình khác là CLIENT: gửi yêu cầu qua socket và nhận sự kiện. Khi HOST thoát,
 * CLIENT tự giành khóa và trở thành HOST mới. Dữ liệu được lưu sau mỗi thay đổi nên không mất.
 *
 * Định tuyến: sự kiện có `id` của một yêu cầu chỉ đi về kết nối đã gửi yêu cầu đó;
 * sự kiện không có `id` (trạng thái chung) phát cho mọi kết nối.
 */

/** Giới hạn một dòng JSON, đồng bộ với giới hạn yêu cầu ở lớp Tauri. */
const MAX_LINE = 2_000_000;
const MAX_RESPONSE = 32_000_000;
const CONNECT_MS = 500;
const JOIN_MS = 10_000;

export interface DaemonRuntime {
  dispatch(req: RpcRequest): Promise<unknown>;
  dispose(): void;
  publicError(e: unknown): string;
  syncRefine?(): Promise<void>;
}
export type RuntimeFactory = (emit: (e: RpcEvent) => void) => DaemonRuntime;

interface Link {
  send(record: unknown): void;
  close?(): void;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Địa chỉ socket: nằm trong PVTA_HOME, hoặc named pipe trên Windows. */
export function daemonEndpoint(home: string): string {
  const tag = crypto.createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 16);
  if (process.platform === 'win32') return `\\\\.\\pipe\\pvta-${tag}`;
  const direct = path.join(home, 'daemon.sock');
  // Đường dẫn socket trên macOS tối đa khoảng 104 byte; thư mục quá dài thì dùng thư mục tạm riêng.
  return Buffer.byteLength(direct) < 100 ? direct : path.join(os.tmpdir(), `pvta-${tag}.sock`);
}

/** Phía HOST: sở hữu runtime, định tuyến sự kiện và xử lý yêu cầu từ mọi kết nối. */
export class DaemonHost {
  readonly links = new Set<Link>();
  private owners = new Map<string, Link>();
  readonly runtime: DaemonRuntime;

  constructor(factory: RuntimeFactory) {
    this.runtime = factory(e => this.route(e));
  }

  route(e: RpcEvent): void {
    const owner = e.id ? this.owners.get(e.id) : undefined;
    if (e.id) { owner?.send(e); return; }
    for (const link of this.links) link.send(e);
  }

  async invoke(link: Link, req: RpcRequest): Promise<unknown> {
    if (this.owners.has(req.id)) throw Error('Mã yêu cầu bị trùng');
    this.owners.set(req.id, link);
    try {
      return await this.runtime.dispatch(req);
    } catch (e) {
      // Lỗi đã được làm sạch khóa bí mật trước khi rời tiến trình.
      throw Error(this.runtime.publicError(e));
    } finally {
      this.owners.delete(req.id);
    }
  }
}

/** Mở socket cho các CLIENT. Chỉ gọi khi đã giữ khóa ghi. */
function serve(host: DaemonHost, file: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      const link: Link = {
        send: record => { if (!socket.destroyed) socket.write(JSON.stringify(record) + '\n'); },
        close: () => socket.destroy(),
      };
      host.links.add(link);
      const drop = () => { host.links.delete(link); };
      socket.on('close', drop);
      socket.on('error', drop);
      socket.setEncoding('utf8');
      readline.createInterface({input: socket, crlfDelay: Infinity}).on('line', line => {
        let req: RpcRequest;
        try { req = JSON.parse(line); } catch { return; }
        if (!req || typeof req.id !== 'string' || typeof req.method !== 'string') return;
        if (Buffer.byteLength(line) > MAX_LINE) {
          link.send({id: req.id, error: 'Yêu cầu quá dài'}); return;
        }
        void host.invoke(link, req).then(
          result => link.send({id: req.id, result}),
          error => link.send({id: req.id, error: error instanceof Error ? error.message : String(error)}),
        );
      });
    });
    server.once('error', reject);
    server.listen(file, () => {
      server.removeListener('error', reject);
      if (process.platform !== 'win32') { try { fs.chmodSync(file, 0o600); } catch { /* giữ nguyên */ } }
      resolve(server);
    });
  });
}

/** Phía CLIENT: một kết nối tới HOST. */
class SocketClient {
  alive = true;
  private pending = new Map<string, {resolve: (v: unknown) => void; reject: (e: Error) => void}>();

  constructor(readonly socket: net.Socket, private onEvent: (e: RpcEvent) => void, private onLost: () => void) {
    socket.setEncoding('utf8');
    readline.createInterface({input: socket, crlfDelay: Infinity}).on('line', line => this.receive(line));
    const lost = () => {
      if (!this.alive) return;
      this.fail();
      this.onLost();
    };
    socket.on('close', lost);
    socket.on('error', lost);
  }

  invoke(req: RpcRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.alive) { reject(Error('Lõi PVTA đã dừng. Đang kết nối lại.')); return; }
      if (this.pending.has(req.id)) { reject(Error('Mã yêu cầu bị trùng')); return; }
      this.pending.set(req.id, {resolve, reject});
      try { this.socket.write(JSON.stringify(req) + '\n'); }
      catch { this.pending.delete(req.id); reject(Error('Không gửi được yêu cầu tới lõi PVTA.')); }
    });
  }

  close(): void {
    this.alive = false;
    this.failPending();
    this.socket.destroy();
  }

  private fail(): void {
    this.alive = false;
    this.failPending();
  }

  private failPending(): void {
    for (const p of this.pending.values()) p.reject(Error('Lõi PVTA đã dừng. Đang kết nối lại.'));
    this.pending.clear();
  }

  private receive(line: string): void {
    if (Buffer.byteLength(line) > MAX_RESPONSE) { this.socket.destroy(); return; }
    let rec: any;
    try { rec = JSON.parse(line); } catch { return; }
    if (!rec || typeof rec !== 'object') return;
    if (typeof rec.event === 'string') { this.onEvent(rec as RpcEvent); return; }
    if (typeof rec.id !== 'string') return;
    const p = this.pending.get(rec.id);
    if (!p) return;
    this.pending.delete(rec.id);
    if (typeof rec.error === 'string') p.reject(Error(rec.error));
    else p.resolve(rec.result);
  }
}

export interface DaemonOptions {
  home: string;
  createRuntime: RuntimeFactory;
  /** Nhận sự kiện của tiến trình này (cả khi là HOST lẫn CLIENT). */
  onEvent: (e: RpcEvent) => void;
}

/** Điểm vào dùng chung: tự chọn làm HOST hoặc CLIENT, và tự chuyển quyền khi HOST thoát. */
export class PvtaDaemon {
  private host?: DaemonHost;
  private server?: net.Server;
  private client?: SocketClient;
  private releases: Array<() => void> = [];
  private joining?: Promise<void>;
  private closed = false;
  private readonly file: string;
  private readonly localLink: Link;

  constructor(private readonly opts: DaemonOptions) {
    this.file = daemonEndpoint(opts.home);
    this.localLink = {send: record => opts.onEvent(record as RpcEvent)};
  }

  get mode(): 'host' | 'client' | 'idle' {
    return this.host ? 'host' : this.client ? 'client' : 'idle';
  }

  /** Kết nối ngay khi khởi động. Nếu thất bại, mỗi yêu cầu sau đó sẽ thử lại. */
  async start(): Promise<void> {
    await this.ensure();
  }

  async invoke(req: RpcRequest): Promise<unknown> {
    await this.ensure();
    if (this.host) return this.host.invoke(this.localLink, req);
    if (this.client) return this.client.invoke(req);
    throw Error('Chưa kết nối được lõi PVTA.');
  }

  close(): void {
    this.closed = true;
    if (this.client) { this.client.close(); this.client = undefined; }
    if (this.host) {
      const host = this.host;
      this.host = undefined;
      for (const link of host.links) link.close?.();
      host.links.clear();
      this.server?.close();
      this.server = undefined;
      try { host.runtime.dispose(); } catch { /* đóng cho sạch */ }
      if (process.platform !== 'win32') { try { fs.rmSync(this.file, {force: true}); } catch { /* không có */ } }
    }
    for (const release of this.releases.splice(0)) release();
  }

  private ensure(): Promise<void> {
    if (this.closed) return Promise.reject(Error('Kết nối PVTA đã đóng.'));
    if (this.host || this.client?.alive) return Promise.resolve();
    if (!this.joining) this.joining = this.join().finally(() => { this.joining = undefined; });
    return this.joining;
  }

  private async join(): Promise<void> {
    if (await this.connect()) return;
    this.assertOpen();
    const releaseWriter = this.tryLock();
    if (releaseWriter) { await this.becomeHost(releaseWriter); return; }
    // Một tiến trình khác đang giữ khóa nhưng chưa mở socket xong: chờ rồi kết nối.
    const deadline = Date.now() + JOIN_MS;
    while (Date.now() < deadline) {
      await sleep(150);
      this.assertOpen();
      if (await this.connect()) return;
      this.assertOpen();
      const release = this.tryLock();
      if (release) { await this.becomeHost(release); return; }
    }
    throw Error('Không kết nối được lõi PVTA đang chạy. Thử lại sau vài giây.');
  }

  private assertOpen(): void {
    if (this.closed) throw Error('Kết nối PVTA đã đóng.');
  }

  private tryLock(): (() => void) | undefined {
    try { return foregroundLock(this.opts.home); } catch { return undefined; }
  }

  private async becomeHost(releaseWriter: () => void): Promise<void> {
    const releases: Array<() => void> = [releaseWriter];
    let host: DaemonHost | undefined;
    let server: net.Server | undefined;
    try {
      // Biên tập nền đang chạy thì xin dừng trước khi nạp dữ liệu, để không hai bên cùng ghi.
      await stopRefiner(this.opts.home);
      this.assertOpen();
      releases.push(holdAppLock(this.opts.home));
      // Đã giữ khóa nên socket cũ (nếu còn) chắc chắn là của tiến trình đã chết.
      if (process.platform !== 'win32') fs.rmSync(this.file, {force: true});
      host = new DaemonHost(emit => this.opts.createRuntime(emit));
      host.links.add(this.localLink);
      server = await serve(host, this.file);
      this.assertOpen();
      this.server = server;
      this.host = host;
      this.releases = releases;
      void host.runtime.syncRefine?.().catch(() => {});
    } catch (e) {
      for (const link of host?.links ?? []) link.close?.();
      if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
      host?.runtime.dispose();
      for (const release of releases) release();
      throw e;
    }
  }

  private connect(): Promise<boolean> {
    return new Promise(resolve => {
      const socket = net.createConnection(this.file);
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, CONNECT_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        if (this.closed) { socket.destroy(); resolve(false); return; }
        this.client = new SocketClient(socket, this.opts.onEvent, () => this.lost(socket));
        resolve(true);
      });
      socket.once('error', () => { clearTimeout(timer); resolve(false); });
    });
  }

  /** HOST thoát hoặc mất kết nối: thử nhận quyền ngay, không chờ người dùng bấm lệnh. */
  private lost(socket: net.Socket): void {
    if (this.client && this.client.socket === socket) this.client = undefined;
    if (this.closed) return;
    setTimeout(() => { if (!this.closed) void this.ensure().catch(() => {}); }, 300).unref?.();
  }
}
