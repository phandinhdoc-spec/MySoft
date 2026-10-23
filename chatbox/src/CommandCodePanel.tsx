import {t as uiText} from './i18n';
import React, {useState} from 'react';
import {API_PROVIDERS} from '@pvta/shared';
import {rpc, type Preferences, type ViewState} from './ipc';

export function CommandCodePanel({state, patch, notice, close}: {
  state: ViewState;
  patch: (value: Partial<Preferences>) => Promise<void>;
  notice: (message: string) => void;
  close: () => void;
}) {
  const provider = state.api.find(item => item.id === 'commandcode');
  const info = API_PROVIDERS.commandcode;
  const choice = state.data.preferences.choice;
  const activeModel = choice !== 'auto' && choice.backend === 'api' && choice.model.startsWith('commandcode/')
    ? choice.model.slice('commandcode/'.length) : '';
  const [key, setKey] = useState('');
  const [model, setModel] = useState(activeModel || provider?.model || info.defaultModel);
  const [models, setModels] = useState(provider?.models ?? info.models);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function loadModels() {
    setBusy(true); setError(''); setStatus('');
    try {
      const entries = await rpc<{id: string; label?: string}[]>('apiModels', {
        provider: 'commandcode', key, baseUrl: info.baseUrl,
      });
      setModels(entries);
      setStatus(uiText("Đã tải {0} model. Danh sách công khai không xác nhận khóa có quyền trò chuyện.",[entries.length]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function save(use: boolean) {
    setBusy(true); setError(''); setStatus('');
    try {
      await rpc('saveApi', {provider: 'commandcode', key, baseUrl: info.baseUrl, model: model.trim(), models});
      setKey('');
      if (use) {
        await patch({choice: {backend: 'api', model: `commandcode/${model.trim()}`}});
        notice(uiText("Đã chọn CommandCode cho cuộc trò chuyện."));
        close();
      } else { setStatus(uiText("Đã lưu cấu hình CommandCode trên máy.")); }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return <div className="settings-section commandcode-panel">
    <div className="row"><span className={provider?.configured ? 'badge success' : 'badge'}>{provider?.configured ? uiText("Đã lưu khóa") : uiText("Chưa có khóa")}</span>{activeModel && <span className="badge success">{uiText("Đang dùng ·")} {activeModel}</span>}</div>
    <p className="muted">{uiText("Quản lý kết nối và chọn model CommandCode cho PVTA.")}</p>
    <label>{uiText("Địa chỉ kết nối")}<input readOnly value={info.baseUrl}/></label>
    <label>{uiText("Khóa CommandCode")}<input type="password" autoComplete="new-password" value={key} disabled={busy} onChange={e => setKey(e.target.value)} placeholder={provider?.configured ? uiText("Đã lưu · để trống để giữ khóa hiện tại") : uiText("Nhập khóa CommandCode")}/></label>
    <button disabled={busy} onClick={() => void loadModels()}>{busy ? uiText("Đang xử lý…") : uiText("Tải danh sách model")}</button>
    {error && <div role="alert" className="error-banner">{error}</div>}
    {status && <p role="status" className="muted">{status}</p>}
    <label>{uiText("Tìm model")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={uiText("Tên hoặc mã model")}/></label>
    <div className="model-list">{models.filter(m => `${m.id} ${m.label ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(m => <button key={m.id} disabled={busy} className={model === m.id ? 'chosen' : ''} onClick={() => setModel(m.id)}><strong>{m.label || m.id}</strong><small>{m.id}</small>{model === m.id && <span>✓</span>}</button>)}</div>
    <label>{uiText("Model sẽ dùng")}<input value={model} disabled={busy} onChange={e => setModel(e.target.value)} placeholder={uiText("Nhập mã model nếu chưa có trong danh sách")}/></label>
    <div className="modal-actions"><button disabled={busy || !model.trim() || (!key.trim() && !provider?.configured)} onClick={() => void save(false)}>{uiText("Lưu cấu hình")}</button><button className="primary" disabled={busy || !model.trim() || (!key.trim() && !provider?.configured)} onClick={() => void save(true)}>{uiText("Lưu và dùng CommandCode")}</button></div>
  </div>;
}
