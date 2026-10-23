// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {initialChat, openChatWindow} from '../src/chat-window';
import type {ViewState} from '../src/ipc';

const created = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/webviewWindow', () => ({WebviewWindow: class {
 constructor(label: string, options: unknown) { created(label, options); }
 async once(event: string, callback: () => void) { if(event === 'tauri://created') callback(); return () => {}; }
}}));
afterEach(() => { delete (window as any).__TAURI_INTERNALS__; vi.clearAllMocks(); });

it('restores the requested chat independently from the most recently used chat', () => {
 const state = {data: {chats: [{id: 'a'}, {id: 'b'}], lastChatId: 'b'}} as ViewState;
 expect(initialChat(state, '?chat=a')?.id).toBe('a');
 expect(initialChat(state, '?chat=')).toBeUndefined();
 expect(initialChat(state, '?chat=deleted')).toBeUndefined();
 expect(initialChat(state, '')?.id).toBe('b');
});

it('opens independent native windows with an encoded chat destination', async () => {
 (window as any).__TAURI_INTERNALS__ = {};
 await openChatWindow('a&chat=b');
 await openChatWindow();
 expect(created.mock.calls[0]![1]).toMatchObject({url: 'index.html?chat=a%26chat%3Db'});
 expect(created.mock.calls[1]![1]).toMatchObject({url: 'index.html?chat='});
 expect(created.mock.calls[0]![0]).toMatch(/^chat-/);
 expect(created.mock.calls[0]![0]).not.toBe(created.mock.calls[1]![0]);
});
