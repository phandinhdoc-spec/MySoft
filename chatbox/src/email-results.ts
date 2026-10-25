export interface EmailItem {
  subject: string;
  sender: string;
  recipient: string;
  date: string;
  summary: string;
  direction: string;
  body: string;
}
export interface EmailResultsData {
  items: EmailItem[];
  source: string;
  notes: string[];
  account: string;
}
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
function field(row: RecordValue, ...keys: string[]): string {
  for (const key of keys) if (typeof row[key] === 'string') return row[key] as string;
  return '';
}
function emailItem(value: unknown): EmailItem | undefined {
  if (!record(value)) return;
  const subject = field(value, 'tieu_de', 'subject');
  const sender = field(value, 'nguoi_gui', 'from', 'sender');
  const recipient = field(value, 'nguoi_nhan', 'to', 'recipient');
  if (!subject || (!sender && !recipient)) return;
  return {
    subject, sender, recipient,
    date: field(value, 'ngay', 'date', 'sent_at'),
    summary: field(value, 'noi_dung_tom_tat', 'summary', 'snippet'),
    direction: field(value, 'chieu', 'direction'),
    body: field(value, 'noi_dung', 'body', 'body_text'),
  };
}

/** Only complete JSON with recognizable email rows becomes a card; all other code stays code. */
export function parseEmailResults(text: string): EmailResultsData | undefined {
  let value: unknown;
  try {value = JSON.parse(text);} catch {return;}
  const meta = record(value) ? value : {};
  const single = emailItem(value);
  const arrays = Array.isArray(value) ? [value] : Object.values(meta).filter(Array.isArray);
  const items: EmailItem[] = single ? [single] : [];
  for (const rows of arrays) {
    if (!rows.length) continue;
    const parsed = rows.map(emailItem);
    if (parsed.every((row): row is EmailItem => !!row)) items.push(...parsed);
  }
  if (!items.length) return;
  const source = field(meta, 'nguon', 'source');
  // Only explicit account metadata/source identifies the mailbox; never infer it from senders.
  const accountText = field(meta, 'account', 'tai_khoan', 'connected_account') || source;
  const account = accountText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  const notes = Object.entries(meta)
    .filter(([key, v]) => typeof v === 'string' && /^(luu_y|note|warning|tim_trong_thu_muc)/i.test(key))
    .map(([, v]) => v as string);
  return {items, source, notes, account};
}

export function gmailSearchUrl(item: EmailItem, account: string): string {
  // Search instead of treating opaque MCP thread IDs as browser IDs.
  const query = `subject:"${item.subject.replace(/["\\\r\n]/g, ' ')}"`;
  return `https://mail.google.com/mail/${account ? `?authuser=${encodeURIComponent(account)}` : ''}#search/${encodeURIComponent(query)}`;
}
