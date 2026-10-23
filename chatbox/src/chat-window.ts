import type {ViewState} from './ipc';
import {t as uiText} from './i18n';

export function initialChat(state: ViewState, search = window.location.search) {
 const params = new URLSearchParams(search);
 if(params.has('chat')) return state.data.chats.find(c => c.id === params.get('chat'));
 return state.data.lastChatId ? state.data.chats.find(c => c.id === state.data.lastChatId)
  : state.data.lastProjectId ? undefined : state.data.chats.at(-1);
}

/** Each window keeps its own selected chat and composer; only persisted data is shared. */
export async function openChatWindow(chatId = ''): Promise<void> {
 const url = `index.html?chat=${encodeURIComponent(chatId)}`;
 if(!('__TAURI_INTERNALS__' in window)) {
  if(!window.open(url, '_blank', 'noopener')) return;
  return;
 }
 const {WebviewWindow} = await import('@tauri-apps/api/webviewWindow');
 await new Promise<void>((resolve, reject) => {
  const view = new WebviewWindow(`chat-${crypto.randomUUID()}`, {
   url, title: uiText('PVTA · Trò chuyện'), width: 1180, height: 820, minWidth: 720, minHeight: 600,
  });
  void view.once('tauri://created', () => resolve());
  void view.once('tauri://error', event => reject(Error(String(event.payload))));
 });
}
