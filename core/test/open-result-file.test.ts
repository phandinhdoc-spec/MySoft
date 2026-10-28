import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openOffice, openResultFile, revealInFinder} from '../src/docs.js';

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

  it('mở bằng Microsoft Office (open -a) cho tệp Word/Excel/PowerPoint; từ chối đuôi không hỗ trợ', () => {
    const docx = touch('bai.docx');
    const xlsx = touch('bang.xlsx');
    const pptx = touch('trinh-chieu.pptx');
    const calls: [string, string[]][] = [];
    const orig = fs.existsSync;
    (fs as any).existsSync = (p: string) =>
      p.includes('Microsoft Word.app') || p.includes('Microsoft Excel.app') || p.includes('Microsoft PowerPoint.app') || orig(p);
    try {
      expect(openResultFile(docx, {platform: 'darwin', app: 'office', opener: (c: string, a: string[]) => {calls.push([c, a]);}} as any)).toEqual({ok: true, file: docx});
      expect(openResultFile(xlsx, {platform: 'darwin', app: 'office', opener: (c: string, a: string[]) => {calls.push([c, a]);}} as any)).toEqual({ok: true, file: xlsx});
      expect(openResultFile(pptx, {platform: 'darwin', app: 'office', opener: (c: string, a: string[]) => {calls.push([c, a]);}} as any)).toEqual({ok: true, file: pptx});
      expect(calls[0]?.[0]).toBe('open');
      expect(calls[0]?.[1]?.[0]).toBe('-a');
      expect(calls[0]?.[1]?.[1]).toContain('Microsoft Word.app');
      expect(calls[1]?.[1]?.[1]).toContain('Microsoft Excel.app');
      expect(calls[2]?.[1]?.[1]).toContain('Microsoft PowerPoint.app');
      expect(openResultFile(touch('a.png'), {platform: 'darwin', app: 'office', opener: () => {}} as any).ok).toBe(false);
    } finally {
      (fs as any).existsSync = orig;
    }
  });

  it('openOffice ưu tiên mở bằng Microsoft Office (open -a) trên macOS khi đã cài đặt', () => {
    const docx = touch('hop-dong.docx');
    const xlsx = touch('so-lieu.xlsx');
    const pptx = touch('bai-giang.pptx');
    const calls: [string, string[]][] = [];
    const orig = fs.existsSync;
    (fs as any).existsSync = (p: string) =>
      p.includes('Microsoft Word.app') || p.includes('Microsoft Excel.app') || p.includes('Microsoft PowerPoint.app') || orig(p);
    try {
      expect(openOffice(docx, {platform: 'darwin', opener: (c, a) => {calls.push([c, a]);}})).toEqual({ok: true, file: docx});
      expect(openOffice(xlsx, {platform: 'darwin', opener: (c, a) => {calls.push([c, a]);}})).toEqual({ok: true, file: xlsx});
      expect(openOffice(pptx, {platform: 'darwin', opener: (c, a) => {calls.push([c, a]);}})).toEqual({ok: true, file: pptx});
      expect(calls).toEqual([
        ['open', ['-a', '/Applications/Microsoft Word.app', docx]],
        ['open', ['-a', '/Applications/Microsoft Excel.app', xlsx]],
        ['open', ['-a', '/Applications/Microsoft PowerPoint.app', pptx]],
      ]);
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
