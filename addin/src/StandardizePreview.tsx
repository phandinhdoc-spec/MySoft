import {useEffect, useState} from 'react';
import type {ClientMessage, StandardizeReply} from '@pvta/shared';

/** Request IDs and original text prevent late responses from replacing a newer draft. */
export function StandardizePreviewBox({kind, text, reply, send, onApply}: {
  kind: 'skill' | 'rule'; text: string; reply: StandardizeReply | null;
  send(message: ClientMessage): boolean; onApply(text: string): void;
}) {
  const [request, setRequest] = useState<{id: string; text: string} | null>(null);
  const [error, setError] = useState('');
  const current = request?.text === text ? request : null;
  const response = current && reply?.id === current.id ? reply : null;
  const busy = !!current && !response && !error;
  useEffect(() => {setRequest(null); setError('');}, [text, kind]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setError('Chưa nhận được kết quả. Kiểm tra kết nối rồi thử lại.'), 15000);
    return () => clearTimeout(timer);
  }, [busy, current?.id]);
  function run() {
    const id = crypto.randomUUID();
    setError('');
    if (send({type: 'standardize', id, kind, text})) setRequest({id, text});
    else setError('Chưa kết nối với PVTA. Vui lòng thử lại.');
  }
  const result = response?.result;
  return <section aria-label={`Chuẩn hóa ${kind === 'skill' ? 'kỹ năng' : 'quy tắc'}`}>
    <button type="button" disabled={!text.trim() || busy} onClick={run}>{busy ? 'Đang chuẩn hóa…' : 'Chuẩn hóa'}</button>
    {(error || response?.error) && <p role="alert">{error || response?.error}</p>}
    {result && <>
      <textarea rows={5} readOnly value={result.text} aria-label="Xem trước bản chuẩn hóa"/>
      <ul>{[...result.fixes, ...result.issues.map(i => i.message)].map((message, i) => <li key={i}>{message}</li>)}</ul>
      <button type="button" disabled={!result.ok} onClick={() => {onApply(result.text); setRequest(null);}}>Dùng bản chuẩn hóa</button>
      <button type="button" onClick={() => setRequest(null)}>Giữ bản gốc</button>
    </>}
  </section>;
}
