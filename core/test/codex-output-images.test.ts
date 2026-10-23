import {expect, it} from 'vitest';
import {codexBackend} from '../src/backends/codex.js';
import {newParseState} from '../src/backends/types.js';

it('giữ ảnh trong kết quả MCP hoàn tất và không lặp ảnh khi nhận lại sự kiện', () => {
  const state = newParseState();
  const event = {type: 'item.completed', item: {id: 'img-1', type: 'mcp_tool_call', status: 'completed', result: {content: [{type: 'image', mimeType: 'image/png', data: 'YQ=='}]}}};
  const delta = codexBackend.parseLine(JSON.stringify(event), state);
  expect(delta).toBe('![Ảnh từ công cụ AI](data:image/png;base64,YQ==)');
  expect(state.text).toBe(delta);
  expect(codexBackend.parseLine(JSON.stringify(event), state)).toBeUndefined();
});

it('không hiển thị kết quả lỗi, dữ liệu không phải ảnh hoặc base64 không hợp lệ', () => {
  for (const result of [
    {isError: true, content: [{type: 'image', mimeType: 'image/png', data: 'YQ=='}]},
    {content: [{type: 'image', mimeType: 'text/html', data: 'YQ=='}]},
    {content: [{type: 'image', mimeType: 'image/png', data: 'bad)![link](https://x)'}]},
  ]) {
    const state = newParseState();
    expect(codexBackend.parseLine(JSON.stringify({type: 'item.completed', item: {id: 'x', type: 'mcp_tool_call', result}}), state)).toBeUndefined();
    expect(state.text).toBe('');
  }
});
