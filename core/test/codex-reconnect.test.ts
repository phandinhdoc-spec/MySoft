import {describe, expect, it} from 'vitest';
import {codexBackend} from '../src/backends/codex.js';

const fresh = () => ({text: '', denied: []}) as any;
const feed = (st: any, ev: unknown) => codexBackend.parseLine(JSON.stringify(ev), st);

describe('codex: thông báo Reconnecting', () => {
  it('không coi "Reconnecting... n/5" là lỗi cuối', () => {
    const st = fresh();
    feed(st, {type: 'error', message: 'Reconnecting... 2/5 (stream disconnected before completion: IO error: Broken pipe (os error 32))'});
    expect(st.error).toBeUndefined();
  });
  it('lỗi thật vẫn được ghi nhận', () => {
    const st = fresh();
    feed(st, {type: 'error', message: 'quota exceeded'});
    expect(st.error?.message).toContain('quota');
  });
  it('turn.completed xóa lỗi trước đó', () => {
    const st = fresh();
    feed(st, {type: 'error', message: 'lỗi tạm'});
    feed(st, {type: 'turn.completed'});
    expect(st.error).toBeUndefined();
  });
});
