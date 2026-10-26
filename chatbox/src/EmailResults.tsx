import React, {useState} from 'react';
import type {EmailResultsData} from './email-results';
import {gmailSearchUrl} from './email-results';
import './email-results.css';

export function EmailResults({data, raw}: {data: EmailResultsData; raw: string}) {
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const normalized = filter.trim().toLocaleLowerCase('vi');
  const items = data.items.filter(item => Object.values(item).join(' ').toLocaleLowerCase('vi').includes(normalized));
  const copy = async (text: string) => {
    try {await navigator.clipboard.writeText(text); setStatus('Đã sao chép.');}
    catch {setStatus('Không thể sao chép. Hãy chọn văn bản và sao chép thủ công.');}
  };
  return <section className="email-results" aria-label="Kết quả tìm email">
    <header><strong>Email · {data.items.length} kết quả hiển thị</strong>{data.source && <p>{data.source}</p>}</header>
    {data.notes.map((note, i) => <p className="email-notice" key={i}>{note}</p>)}
    <label className="email-filter">Lọc kết quả<input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Tiêu đề, người gửi, ngày hoặc nội dung…"/></label>
    <p className="email-count" role="status">Đang hiện {items.length}/{data.items.length} · Nội dung do AI trả về, có thể chỉ là tóm tắt.</p>
    <div className="email-list">{items.map((item, i) => <article className="email-card" key={i}>
      <div className="email-meta">{item.date && <span>{item.date}</span>}{item.direction && <span>{item.direction}</span>}</div>
      <h3>{item.subject}</h3>
      <dl>{item.sender && <><dt>Từ</dt><dd>{item.sender}</dd></>}{item.recipient && <><dt>Đến</dt><dd>{item.recipient}</dd></>}</dl>
      {item.summary && <p className="email-summary">{item.summary}</p>}
      {item.body && <details><summary>Xem nội dung được trả về</summary><p className="email-body">{item.body}</p></details>}
      <div className="email-actions">
        <a href={gmailSearchUrl(item, data.account)} target="_blank" rel="noopener noreferrer">Tìm thư trong Gmail ↗</a>
        <button type="button" onClick={() => void copy(item.subject)}>Sao chép tiêu đề</button>
        <button type="button" onClick={() => void copy([item.subject, item.sender && `Từ: ${item.sender}`, item.recipient && `Đến: ${item.recipient}`, item.date, item.summary, item.body].filter(Boolean).join('\n'))}>Sao chép thông tin</button>
      </div>
    </article>)}</div>
    {!items.length && <p>Không có email khớp bộ lọc.</p>}
    <p className="email-count">Gmail mở tìm kiếm theo tiêu đề; kiểm tra đúng tài khoản trước khi thao tác.</p>
    <p role="status">{status}</p>
    <details className="email-raw"><summary>Xem dữ liệu gốc (JSON)</summary><pre>{raw}</pre></details>
  </section>;
}
