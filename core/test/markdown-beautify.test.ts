import {describe, expect, it} from 'vitest';
import {localBeautifyMarkdown} from '../src/desktop/markdown-beautify.js';

describe('localBeautifyMarkdown', () => {
  it('normalizes line breaks and collapses excessive empty lines', () => {
    const input = 'Đoạn 1\r\n\r\n\r\n\r\nĐoạn 2';
    expect(localBeautifyMarkdown(input)).toBe('Đoạn 1\n\nĐoạn 2');
  });

  it('fixes missing space after markdown headers', () => {
    const input = '#Tiêu đề chính\n##Mục con 1\n###Chi tiết';
    expect(localBeautifyMarkdown(input)).toBe('# Tiêu đề chính\n## Mục con 1\n### Chi tiết');
  });

  it('fixes missing space after bullet points and numbers', () => {
    const input = '-Ý thứ nhất\n*Ý thứ hai\n1.Bước một\n2.Bước hai';
    expect(localBeautifyMarkdown(input)).toBe('- Ý thứ nhất\n* Ý thứ hai\n1. Bước một\n2. Bước hai');
  });

  it('formats YAML phase / section separators with clean spacing', () => {
    const input = 'Phần 1: Khởi động\n---\nPhần 2: Hình thành kiến thức';
    const result = localBeautifyMarkdown(input);
    expect(result).toBe('Phần 1: Khởi động\n\n---\n\nPhần 2: Hình thành kiến thức');
  });

  it('trims trailing whitespace from lines', () => {
    const input = 'Dòng có khoảng trắng cuối     \nDòng tiếp theo   ';
    expect(localBeautifyMarkdown(input)).toBe('Dòng có khoảng trắng cuối\nDòng tiếp theo');
  });
});
