import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openResultFile, revealInFinder} from '../src/docs.js';

describe('mở tệp kết quả', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-open-'));
  const touch = (name: string) => {const f = path.join(dir, name); fs.writeFileSync(f, 'x'); return f;};

  it('mở được ảnh png/jpg/jpeg/webp bằng trình mở của hệ điều hành', () => {
    for (const name of ['a.png', 'b.JPG', 'c.jpeg', 'd.webp']) {
      const calls: [string, string[]][] = [];
      const f = touch(name);
      const r = openResultFile(f, {platform: 'darwin', opener: (cmd: string, args: string[]) => {calls.push([cmd, args]);}} as any);
      expect(r).toEqual({ok: true, file: f});
      expect(calls).toEqual([['open', [f]]]);
    }
  });

  it('vẫn từ chối đuôi không nằm trong danh sách (vd. .exe, .svg)', () => {
    for (const name of ['x.exe', 'y.svg']) {
      const r = openResultFile(touch(name), {platform: 'darwin', opener: () => {throw Error('không được gọi');}} as any);
      expect(r.ok).toBe(false);
    }
  });

  it('revealInFinder hiện tệp ảnh trong Finder (open -R)', () => {
    const f = touch('e.png');
    const calls: [string, string[]][] = [];
    const r = revealInFinder(f, {platform: 'darwin', opener: (cmd: string, args: string[]) => {calls.push([cmd, args]);}} as any);
    expect(r).toEqual({ok: true, file: f});
    expect(calls).toEqual([['open', ['-R', f]]]);
  });
});
