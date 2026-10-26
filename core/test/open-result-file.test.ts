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

  it('mở .md bằng VS Code (open -a ...) khi VS Code có mặt trên macOS', () => {
    const f = touch('readme.md');
    const calls: [string, string[]][] = [];
    // Giả lập VS Code tồn tại bằng cách stub existsSync cho đường dẫn VS Code
    const origExistsSync = fs.existsSync;
    (fs as any).existsSync = (p: string) => {
      if (p.includes('Visual Studio Code.app')) return true;
      return origExistsSync(p);
    };
    try {
      const r = openResultFile(f, {platform: 'darwin', opener: (cmd: string, args: string[]) => {calls.push([cmd, args]);}} as any);
      expect(r).toEqual({ok: true, file: f});
      expect(calls[0]?.[0]).toBe('open');
      expect(calls[0]?.[1]).toContain('-a');
      expect(calls[0]?.[1]?.join(' ')).toContain('Visual Studio Code');
    } finally {
      (fs as any).existsSync = origExistsSync;
    }
  });

  it('mở .md bằng TextEdit (open -e) khi không có VS Code trên macOS', () => {
    const f = touch('note.md');
    const calls: [string, string[]][] = [];
    const origExistsSync = fs.existsSync;
    (fs as any).existsSync = (p: string) => {
      if (p.includes('Visual Studio Code') || p.includes('Antigravity.app')) return false;
      return origExistsSync(p);
    };
    try {
      const r = openResultFile(f, {platform: 'darwin', opener: (cmd: string, args: string[]) => {calls.push([cmd, args]);}} as any);
      expect(r).toEqual({ok: true, file: f});
      expect(calls).toEqual([['open', ['-e', f]]]);
    } finally {
      (fs as any).existsSync = origExistsSync;
    }
  });

  it('mở bằng CHITUP OFFICE (open -a) cho tệp Office; từ chối đuôi không hỗ trợ', () => {
    const f = touch('bai.docx');
    const calls: [string, string[]][] = [];
    const orig = fs.existsSync;
    (fs as any).existsSync = (p: string) => p.includes('CHITUP OFFICE.app') || orig(p);
    try {
      const r = openResultFile(f, {platform: 'darwin', app: 'chitup', opener: (c: string, a: string[]) => {calls.push([c, a]);}} as any);
      expect(r).toEqual({ok: true, file: f});
      expect(calls[0]?.[0]).toBe('open');
      expect(calls[0]?.[1]?.[0]).toBe('-a');
      expect(calls[0]?.[1]?.[1]).toContain('CHITUP OFFICE');
      expect(openResultFile(touch('a.png'), {platform: 'darwin', app: 'chitup', opener: () => {}} as any).ok).toBe(false);
    } finally {
      (fs as any).existsSync = orig;
    }
  });

  it('mở bằng Visual Studio Code cho cả tệp Office; báo lỗi khi chưa cài', () => {
    const f = touch('bang.xlsx');
    const calls: [string, string[]][] = [];
    const orig = fs.existsSync;
    (fs as any).existsSync = (p: string) => p.includes('Visual Studio Code') || orig(p);
    try {
      expect(openResultFile(f, {platform: 'darwin', app: 'vscode', opener: (c: string, a: string[]) => {calls.push([c, a]);}} as any)).toEqual({ok: true, file: f});
      expect(calls[0]?.[1]?.join(' ')).toContain('Visual Studio Code');
    } finally {
      (fs as any).existsSync = orig;
    }
    (fs as any).existsSync = (p: string) => (p.includes('Visual Studio Code') ? false : orig(p));
    try {
      const r = openResultFile(f, {platform: 'darwin', app: 'vscode', opener: () => {}} as any);
      expect(r.ok).toBe(false);
    } finally {
      (fs as any).existsSync = orig;
    }
  });
});
