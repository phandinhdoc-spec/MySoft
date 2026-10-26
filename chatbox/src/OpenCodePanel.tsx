import {t as uiText} from './i18n';
import React, {useState} from 'react';
import {modelsOf, BACKEND_INFO} from '@pvta/shared';
import {rpc, type Preferences, type ViewState} from './ipc';

/** Quản lý OpenCode: trạng thái cài đặt, tải lại danh sách model, chọn model dùng cho PVTA. */
export function OpenCodePanel({state, patch, notice, close}: {
  state: ViewState;
  patch: (value: Partial<Preferences>) => Promise<void>;
  notice: (message: string) => void;
  close: () => void;
}) {
  const info = state.backends.find(b => b.id === 'opencode');
  const installed = info?.installed === true;
  const models = modelsOf(state.catalog, 'opencode');
  const live = state.catalog?.opencode?.live === true;
  const choice = state.data.preferences.choice;
  const active = choice !== 'auto' && choice.backend === 'opencode' ? choice.model : '';
  const [model, setModel] = useState(active || 'default');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const docs = BACKEND_INFO.opencode;

  async function recheck() {
    setBusy(true); setError('');
    try { await rpc('refresh'); notice(uiText("Đã kiểm tra lại OpenCode và danh sách model.")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function use() {
    setBusy(true); setError('');
    try { await patch({choice: {backend: 'opencode', model: model.trim() || 'default'}}); notice(uiText("Đã chọn OpenCode cho cuộc trò chuyện.")); close(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const shown = models.filter(m => `${m.label ?? ''} ${m.id}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="settings-section opencode-panel">
    <div className="row">
      <span className={installed ? 'badge success' : 'badge'}>{installed ? uiText("Đã cài") : uiText("Chưa cài")}</span>
      {installed && info?.version && <span className="badge">{info.version}</span>}
      {active && <span className="badge success">{uiText("Đang dùng ·")} {active}</span>}
    </div>
    <p className="muted">{uiText("PVTA gọi OpenCode ở chế độ tự duyệt quyền (--auto). Chế độ Chỉ đọc vẫn dùng agent plan, không sửa tệp.")}</p>
    {!installed && <p className="muted">{uiText("Cài bằng brew install sst/tap/opencode (hoặc npm install -g opencode-ai), chạy opencode auth login để thêm nhà cung cấp, rồi bấm Kiểm tra lại.")}</p>}
    <div className="row">
      <button disabled={busy} onClick={() => void recheck()}>{busy ? uiText("Đang xử lý…") : uiText("Kiểm tra lại & tải model")}</button>
      <button onClick={() => void rpc('openLink', {url: docs.docs}).catch(e => setError(String(e)))}>{uiText("Hướng dẫn chính thức ↗")}</button>
    </div>
    {error && <div role="alert" className="error-banner">{error}</div>}
    <p className="small muted">{uiText("{0} model · {1}", [models.length, live ? uiText("lấy trực tiếp từ opencode models") : uiText("danh sách dựng sẵn")])}</p>
    {installed && !live && <div role="status" className="error-banner">{uiText("Chưa lấy được danh sách model từ opencode. Thử chạy opencode models trong terminal, đăng nhập bằng opencode auth login nếu cần, rồi bấm Kiểm tra lại & tải model.")}</div>}
    <label>{uiText("Tìm model")}<input value={query} onChange={e => setQuery(e.target.value)} placeholder={uiText("Tên nhà cung cấp hoặc model")}/></label>
    <div className="model-list">{shown.map(m => <button key={m.id} className={model === m.id ? 'chosen' : ''} onClick={() => setModel(m.id)}><strong>{m.label ?? m.id}</strong><small>{m.id}{m.hint ? ' · ' + m.hint : ''}</small>{model === m.id && <span>✓</span>}</button>)}</div>
    <label>{uiText("Mã model khác")}<input value={model} onChange={e => setModel(e.target.value)} placeholder="provider/model"/></label>
    <div className="modal-actions"><button className="primary" disabled={busy || !installed || !model.trim()} onClick={() => void use()}>{uiText("Dùng model này")}</button></div>
  </div>;
}
