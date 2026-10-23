// @vitest-environment jsdom
import {describe, expect, it, vi, beforeEach} from 'vitest';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

describe('composer markdown toolbar and mode', () => {
  it('App source does not render editing mode or markdown draft pills in composer toolbar', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
    // Ensure "Chế độ chỉnh sửa" and "Bản nháp Markdown" are hidden from the composer toolbar
    expect(appSource).not.toContain('{editMode?uiText("Sửa Markdown: bật"):uiText("Chế độ chỉnh sửa")}');
    expect(appSource).not.toContain('<button onClick={()=>void editDraft(undefined,text)}>{uiText("Bản nháp Markdown")}</button>');
  });

  it('App source includes top markdown toolbar with B, I, U, Url, Table, Image, Section buttons', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
    expect(appSource).toContain('composer-md-toolbar');
    expect(appSource).toContain('title={uiText("Chữ đậm (Ctrl+B)")}');
    expect(appSource).toContain('title={uiText("Chữ nghiêng (Ctrl+I)")}');
    expect(appSource).toContain('title={uiText("Gạch chân (<u>)")}');
    expect(appSource).toContain('title={uiText("Chèn liên kết URL")}');
    expect(appSource).toContain('title={uiText("Chèn bảng Markdown")}');
    expect(appSource).toContain('title={uiText("Chèn hình ảnh")}');
    expect(appSource).toContain('title={uiText("Tách phân đoạn / Phase YAML (---)")}');
    expect(appSource).toContain('md-tool-section');
    expect(appSource).toContain('handleInsertSection');
  });

  it('Section separator inserts yaml phase separator (---)', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
    expect(appSource).toContain("insertMd(prefix+'---\\n\\n','')");
  });

  it('App onPaste handles auto-beautification for long text and markdown', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8');
    expect(appSource).toContain('onPaste={handlePaste}');
    expect(appSource).toContain("rpc<{text:string;changed:boolean}>('beautifyMarkdown'");
  });
});
