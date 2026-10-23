import {t as uiText} from './i18n';
import React, {useEffect, useRef, useState} from 'react';
import {Markdown} from './Markdown';
import {rpc, pickFiles} from './ipc';
import {useObjectMenu} from './ObjectMenu';
import './markdown-editor.css';

export interface Draft {
  chatId: string;
  content: string;
  name: string;
  pdf?: boolean;
}

interface TableCell {
  text: string;
  rowspan?: number;
  colspan?: number;
  hidden?: boolean; // cell is covered by another merged cell
}

export function MarkdownEditor({
  draft,
  onClose,
  onSaved
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: (path: string) => void;
}) {
  const [text, setText] = useState(draft.content);
  const [name, setName] = useState(draft.name);
  const [preview, setPreview] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('');

  // Modals for Table, Image, Link
  const [showTableModal, setShowTableModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);

  // Image dialog state
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');

  // Link dialog state
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // Table Manager Grid state
  const [grid, setGrid] = useState<TableCell[][]>(() => [
    [{text: 'Chọn'}, {text: 'Chủ đề & Bài'}, {text: 'Mức độ'}, {text: 'Yêu cầu cần đạt (YCCĐ)'}, {text: 'Phần I: TN (0.25đ)'}, {text: 'Phần II: Đ/S (1.0đ)'}, {text: 'Phần III: TL (Điểm)'}],
    [{text: '[x]'}, {text: 'Bài 19: Từ trường\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Nêu được từ trường là gì và tác dụng lực từ. Câu 1'}, {text: '1'}, {text: '0'}, {text: '0đ'}],
    [{text: '[ ]'}, {text: 'Bài 19: Từ trường\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Nêu được khái niệm từ phổ và tạo được từ phổ bằng mạt sắt.'}, {text: '0'}, {text: '0'}, {text: '0đ'}],
    [{text: '[x]'}, {text: 'Bài 20: Từ trường Trái Đất - La bàn\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Dựa vào ảnh khẳng định được Trái Đất có từ trường; cực Bắc địa từ. Câu 2'}, {text: '1'}, {text: '0'}, {text: '0đ'}],
    [{text: '[x]'}, {text: 'Bài 21: Nam châm điện\nChủ đề 6. Từ'}, {text: 'VD'}, {text: 'Chế tạo được nam châm điện đơn giản và làm thay đổi từ trường. Câu 3'}, {text: '1'}, {text: '0'}, {text: '0đ'}]
  ]);
  const [selectedCell, setSelectedCell] = useState<{r: number; c: number}>({r: 0, c: 0});

  const input = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void rpc<{dir: string}>('outputLocation', {chatId: draft.chatId})
      .then(r => setDestination(r.dir))
      .catch(e => setError(String(e)));
  }, [draft.chatId]);

  // Insert formatting string around selection in textarea
  function insert(before: string, after = '') {
    const el = input.current;
    if (!el) return;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const selected = text.slice(a, b);
    const replacement = before + selected + after;
    setText(text.slice(0, a) + replacement + text.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, b + before.length);
    });
  }

  // Toggle GFM task checkbox directly
  function handleToggleTask(taskIndex: number) {
    setText(current => {
      let count = 0;
      return current.replace(/^(\s*[-*+]\s+\[)([ xX])(\])/gm, (match, prefix, check, suffix) => {
        if (count++ === taskIndex) {
          const newCheck = check.trim() ? ' ' : 'x';
          return `${prefix}${newCheck}${suffix}`;
        }
        return match;
      });
    });
  }

  // Pick image file from local computer
  async function pickImageFile() {
    try {
      const picked = await pickFiles(false, {
        name: uiText("Hình ảnh"),
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
      });
      if (picked.length > 0 && picked[0]) {
        const filePath = picked[0];
        const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'ảnh';
        insert(`![${fileName}](${filePath})\n`);
        setShowImageModal(false);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  function insertCustomImage() {
    if (!imageUrl.trim()) return;
    insert(`![${imageAlt.trim() || 'Hình ảnh'}](${imageUrl.trim()})\n`);
    setImageUrl('');
    setImageAlt('');
    setShowImageModal(false);
  }

  function insertCustomLink() {
    if (!linkUrl.trim()) return;
    insert(`[${linkText.trim() || linkUrl.trim()}](${linkUrl.trim()})`);
    setLinkUrl('');
    setLinkText('');
    setShowLinkModal(false);
  }

  // Expand / collapse all lists in preview
  function expandAllLists() {
    if (!previewRef.current) return;
    const lis = previewRef.current.querySelectorAll('li.has-child-list');
    lis.forEach(li => {
      li.classList.remove('collapsed');
      const btn = li.querySelector('.list-toggle-btn');
      if (btn) {
        btn.textContent = '▾';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function collapseAllLists() {
    if (!previewRef.current) return;
    const lis = previewRef.current.querySelectorAll('li.has-child-list');
    lis.forEach(li => {
      li.classList.add('collapsed');
      const btn = li.querySelector('.list-toggle-btn');
      if (btn) {
        btn.textContent = '▸';
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Table Manager actions
  function addRow(index: number) {
    const colCount = grid[0]?.length ?? 1;
    const newRow: TableCell[] = Array.from({length: colCount}, () => ({text: ''}));
    const newGrid = [...grid];
    newGrid.splice(index, 0, newRow);
    setGrid(newGrid);
  }

  function removeRow(index: number) {
    if (grid.length <= 1) return;
    setGrid(grid.filter((_, i) => i !== index));
    setSelectedCell(prev => ({r: Math.max(0, prev.r - 1), c: prev.c}));
  }

  function addCol(index: number) {
    setGrid(grid.map(row => {
      const next = [...row];
      next.splice(index, 0, {text: ''});
      return next;
    }));
  }

  function removeCol(index: number) {
    if ((grid[0]?.length ?? 0) <= 1) return;
    setGrid(grid.map(row => row.filter((_, i) => i !== index)));
    setSelectedCell(prev => ({r: prev.r, c: Math.max(0, prev.c - 1)}));
  }

  function updateCellText(r: number, c: number, val: string) {
    setGrid(grid.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? {...cell, text: val} : cell)));
  }

  function mergeRight(r: number, c: number) {
    const cell = grid[r]?.[c];
    const rightCell = grid[r]?.[c + 1];
    if (!cell || !rightCell || rightCell.hidden) return;
    const span = (cell.colspan ?? 1) + (rightCell.colspan ?? 1);
    const combinedText = (cell.text + (rightCell.text ? ' ' + rightCell.text : '')).trim();
    setGrid(grid.map((row, ri) => row.map((cur, ci) => {
      if (ri === r && ci === c) return {...cur, text: combinedText, colspan: span};
      if (ri === r && ci === c + 1) return {...cur, hidden: true};
      return cur;
    })));
  }

  function mergeDown(r: number, c: number) {
    const cell = grid[r]?.[c];
    const downCell = grid[r + 1]?.[c];
    if (!cell || !downCell || downCell.hidden) return;
    const span = (cell.rowspan ?? 1) + (downCell.rowspan ?? 1);
    const combinedText = (cell.text + (downCell.text ? ' ' + downCell.text : '')).trim();
    setGrid(grid.map((row, ri) => row.map((cur, ci) => {
      if (ri === r && ci === c) return {...cur, text: combinedText, rowspan: span};
      if (ri === r + 1 && ci === c) return {...cur, hidden: true};
      return cur;
    })));
  }

  function splitCell(r: number, c: number) {
    const cell = grid[r]?.[c];
    if (!cell) return;
    const cs = cell.colspan ?? 1;
    const rs = cell.rowspan ?? 1;
    setGrid(grid.map((row, ri) => row.map((cur, ci) => {
      if (ri >= r && ri < r + rs && ci >= c && ci < c + cs) {
        return {text: cur.text, hidden: false, colspan: 1, rowspan: 1};
      }
      return cur;
    })));
  }

  function loadTablePreset(type: 'matrix' | 'khbd' | 'rubric' | 'simple') {
    if (type === 'matrix') {
      setGrid([
        [{text: 'Chọn'}, {text: 'Chủ đề & Bài'}, {text: 'Mức độ'}, {text: 'Yêu cầu cần đạt (YCCĐ)'}, {text: 'Phần I: TN (0.25đ)'}, {text: 'Phần II: Đ/S (1.0đ)'}, {text: 'Phần III: TL (Điểm)'}],
        [{text: '[x]'}, {text: 'Bài 19: Từ trường\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Nêu được từ trường là gì và tác dụng lực từ. Câu 1'}, {text: '1'}, {text: '0'}, {text: '0đ'}],
        [{text: '[ ]'}, {text: 'Bài 19: Từ trường\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Nêu được khái niệm từ phổ và tạo được từ phổ bằng mạt sắt.'}, {text: '0'}, {text: '0'}, {text: '0đ'}],
        [{text: '[x]'}, {text: 'Bài 20: Từ trường Trái Đất - La bàn\nChủ đề 6. Từ'}, {text: 'NB'}, {text: 'Dựa vào ảnh khẳng định được Trái Đất có từ trường; cực Bắc địa từ. Câu 2'}, {text: '1'}, {text: '0'}, {text: '0đ'}],
        [{text: '[x]'}, {text: 'Bài 21: Nam châm điện\nChủ đề 6. Từ'}, {text: 'VD'}, {text: 'Chế tạo được nam châm điện đơn giản và làm thay đổi từ trường. Câu 3'}, {text: '1'}, {text: '0'}, {text: '0đ'}]
      ]);
    } else if (type === 'khbd') {
      setGrid([
        [{text: 'Hoạt động của GV - HS'}, {text: 'Dự kiến sản phẩm cần đạt'}],
        [{text: '**1. Hoạt động Khởi động:**\n- GV giao nhiệm vụ quan sát thí nghiệm.\n- HS làm việc cá nhân và trả lời.'}, {text: '- Câu trả lời của HS.\n- Xác định được mâu thuẫn nhận thức.'}],
        [{text: '**2. Hoạt động Hình thành kiến thức:**\n- GV tổ chức làm việc nhóm theo trạm.\n- HS hoàn thành phiếu học tập.'}, {text: '- Báo cáo kết quả thảo luận nhóm.\n- Ghi nhớ nội dung cốt lõi của bài học.'}]
      ]);
    } else if (type === 'rubric') {
      setGrid([
        [{text: 'Tiêu chí'}, {text: 'Mức 1: Chưa đạt'}, {text: 'Mức 2: Đạt'}, {text: 'Mức 3: Tốt'}, {text: 'Điểm tối đa'}],
        [{text: 'Nội dung kiến thức'}, {text: 'Chưa chính xác hoặc thiếu ý'}, {text: 'Đầy đủ nội dung cơ bản'}, {text: 'Sâu sắc, liên hệ thực tế sáng tạo'}, {text: '5.0'}],
        [{text: 'Kỹ năng trình bày'}, {text: 'Rụt rè, khó theo dõi'}, {text: 'Rõ ràng, mạch lạc'}, {text: 'Tự tin, sinh động, thuyết phục'}, {text: '3.0'}],
        [{text: 'Tinh thần hợp tác nhóm'}, {text: 'Ít tham gia hoạt động chung'}, {text: 'Tham gia đầy đủ nhiệm vụ'}, {text: 'Chủ động, hỗ trợ thành viên tốt'}, {text: '2.0'}]
      ]);
    } else {
      setGrid([
        [{text: 'Cột 1'}, {text: 'Cột 2'}, {text: 'Cột 3'}],
        [{text: 'Dòng 1 Ô 1'}, {text: 'Dòng 1 Ô 2'}, {text: 'Dòng 1 Ô 3'}],
        [{text: 'Dòng 2 Ô 1'}, {text: 'Dòng 2 Ô 2'}, {text: 'Dòng 2 Ô 3'}]
      ]);
    }
  }

  function applyTableToMarkdown() {
    const hasMerged = grid.some(row => row.some(c => (c.colspan && c.colspan > 1) || (c.rowspan && c.rowspan > 1) || c.hidden));

    if (hasMerged) {
      // Build HTML table for perfect rowspan/colspan support
      let html = '\n<table class="pvta-table">\n  <thead>\n    <tr>\n';
      const headerRow = grid[0] ?? [];
      headerRow.forEach(cell => {
        if (cell.hidden) return;
        const cs = cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
        const rs = cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
        html += `      <th${cs}${rs}>${cell.text.replace(/\n/g, '<br/>')}</th>\n`;
      });
      html += '    </tr>\n  </thead>\n  <tbody>\n';
      grid.slice(1).forEach(row => {
        html += '    <tr>\n';
        row.forEach(cell => {
          if (cell.hidden) return;
          const cs = cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
          const rs = cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
          html += `      <td${cs}${rs}>${cell.text.replace(/\n/g, '<br/>')}</td>\n`;
        });
        html += '    </tr>\n';
      });
      html += '  </tbody>\n</table>\n';
      insert(html);
    } else {
      // Build standard Markdown pipe table
      const header = '| ' + grid[0]?.map(c => c.text.replace(/\n/g, ' ')).join(' | ') + ' |\n';
      const sep = '| ' + grid[0]?.map(() => '---').join(' | ') + ' |\n';
      const rows = grid.slice(1).map(r => '| ' + r.map(c => c.text.replace(/\n/g, '<br/>')).join(' | ') + ' |').join('\n');
      insert('\n' + header + sep + rows + '\n');
    }
    setShowTableModal(false);
  }

  function close() {
    if (text !== draft.content && !confirm(uiText("Đóng bản nháp chưa lưu?"))) return;
    onClose();
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await rpc<{path: string}>('saveDraft', {
        chatId: draft.chatId,
        name,
        content: text
      });
      onSaved(r.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const menu = useObjectMenu<string>({
    contextKey: JSON.stringify([draft.chatId, draft.name]),
    preserveSelection: true,
    onError: e => setError(String(e)),
    commands: () => [
      {
        id: 'preview',
        label: preview ? uiText("Sửa Markdown") : uiText("Xem trước"),
        disabledReason: saving ? uiText("Đang lưu…") : undefined,
        run: () => setPreview(v => !v)
      },
      {
        id: 'close',
        label: uiText("Đóng bản nháp"),
        disabledReason: saving ? uiText("Đang lưu…") : undefined,
        run: close
      }
    ]
  });

  return (
    <div className="modal-backdrop">
      <section
        className="modal markdown-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={uiText("Sửa Markdown")}
        {...menu.handlers('draft')}
      >
        <header className="markdown-editor-header">
          <h2>
            <span>📝</span>
            {uiText("Bản nháp Markdown")}
          </h2>
          <div className="modal-header-actions">
            {!preview && (
              <button
                type="button"
                className={`btn-compact ${splitView ? 'active' : ''}`}
                title={uiText("Bật hoặc tắt xem trước song song")}
                onClick={() => setSplitView(v => !v)}
              >
                {splitView ? uiText("◫ Song song: Bật") : uiText("◫ Song song")}
              </button>
            )}
            <button
              type="button"
              className={`btn-compact ${preview ? 'active' : ''}`}
              onClick={() => setPreview(v => !v)}
            >
              {preview ? uiText("Sửa Markdown") : uiText("Xem trước")}
            </button>
            {menu.trigger('draft', uiText("Thao tác bản nháp Markdown"))}
          </div>
        </header>

        {draft.pdf && (
          <p className="small muted">
            {uiText("Đây là chữ trích từ PDF. Dùng nút Mở PDF để sửa trực tiếp.")}
          </p>
        )}

        <div className="editor-info-strip">
          <label>
            {uiText("Tên bản mới:")}
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              aria-label={uiText("Tên tệp Markdown")}
            />
          </label>
          <div className="editor-dest" title={destination}>
            <span>{uiText("Nơi lưu:")}</span>
            <code>{destination || '...'}</code>
          </div>
        </div>

        {/* TOOLBAR */}
        {!preview && (
          <div className="markdown-toolbar">
            <div className="toolbar-group">
              <button type="button" title="Tiêu đề 1" onClick={() => insert('# ')}>H1</button>
              <button type="button" title="Tiêu đề 2" onClick={() => insert('## ')}>H2</button>
              <button type="button" title="Tiêu đề 3" onClick={() => insert('### ')}>H3</button>
            </div>

            <div className="toolbar-group">
              <button type="button" title="Chữ đậm (Ctrl+B)" onClick={() => insert('**', '**')}>
                <strong>{uiText("Đậm")}</strong>
              </button>
              <button type="button" title="Chữ nghiêng (Ctrl+I)" onClick={() => insert('*', '*')}>
                <em>{uiText("Nghiêng")}</em>
              </button>
              <button type="button" title="Gạch ngang" onClick={() => insert('~~', '~~')}>
                <del>S</del>
              </button>
              <button type="button" title="Gạch chân" onClick={() => insert('<u>', '</u>')}>
                <u>U</u>
              </button>
              <button type="button" title="Đánh dấu nổi bật" onClick={() => insert('<mark>', '</mark>')}>
                🟡
              </button>
              <button type="button" title="Mã nguồn inline" onClick={() => insert('`', '`')}>
                &lt;/&gt;
              </button>
            </div>

            <div className="toolbar-group">
              <button type="button" title="Danh sách gạch đầu dòng" onClick={() => insert('- ')}>
                {uiText("Danh sách")}
              </button>
              <button type="button" title="Danh sách số thứ tự" onClick={() => insert('1. ')}>
                1. 2. 3.
              </button>
              <button type="button" title="Danh sách công việc (Task list)" onClick={() => insert('- [ ] ')}>
                ☑ Task
              </button>
            </div>

            <div className="toolbar-group">
              <button
                type="button"
                className="btn-highlight"
                title={uiText("Chèn bảng đơn giản")}
                onClick={() => insert('\n| Cột 1 | Cột 2 |\n| --- | --- |\n|  |  |\n')}
              >
                {uiText("Bảng")}
              </button>
              <button
                type="button"
                className="btn-highlight"
                title={uiText("Mở bảng quản lý cột, dòng, gộp ô và chia dòng/cột")}
                onClick={() => setShowTableModal(true)}
              >
                📊 {uiText("Quản lý bảng biểu")}
              </button>
              <button
                type="button"
                title={uiText("Chèn hình ảnh")}
                onClick={() => setShowImageModal(true)}
              >
                🖼 {uiText("Chèn ảnh")}
              </button>
              <button
                type="button"
                title={uiText("Chèn liên kết web")}
                onClick={() => setShowLinkModal(true)}
              >
                🔗 {uiText("Liên kết")}
              </button>
              <button
                type="button"
                title={uiText("Chèn công thức toán LaTeX")}
                onClick={() => insert('$', '$')}
              >
                ∑ {uiText("Toán")}
              </button>
            </div>
          </div>
        )}

        {/* WORKSPACE CONTENT */}
        {preview ? (
          <div className="full-preview-container" ref={previewRef}>
            <Markdown text={text} onToggleTask={handleToggleTask} />
          </div>
        ) : splitView ? (
          <div className="editor-workspace" ref={previewRef}>
            <div className="editor-pane">
              <textarea
                ref={input}
                aria-label={uiText("Nội dung Markdown")}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={uiText("Nhập nội dung Markdown tại đây…")}
              />
            </div>
            <div className="live-preview-pane">
              <header className="live-preview-header">
                <span>{uiText("Xem trước trực tiếp (Live)")}</span>
                <div className="preview-tools">
                  <button type="button" title={uiText("Mở rộng toàn bộ danh sách")} onClick={expandAllLists}>
                    {uiText("🔽 Mở rộng hết")}
                  </button>
                  <button type="button" title={uiText("Thu gọn toàn bộ danh sách có mục con")} onClick={collapseAllLists}>
                    {uiText("🔼 Thu gọn hết")}
                  </button>
                </div>
              </header>
              <div className="live-preview-content">
                <Markdown text={text} onToggleTask={handleToggleTask} />
              </div>
            </div>
          </div>
        ) : (
          <div className="editor-workspace" style={{height: 380}}>
            <div className="editor-pane">
              <textarea
                ref={input}
                aria-label={uiText("Nội dung Markdown")}
                value={text}
                onChange={e => setText(e.target.value)}
                style={{height: '100%'}}
              />
            </div>
          </div>
        )}

        {error && <p role="alert" className="danger">{error}</p>}

        <footer className="editor-footer">
          <div className="editor-footer-status">
            <span>{uiText("{0} ký tự · {1} dòng", [String(text.length), String(text.split('\n').length)])}</span>
          </div>
          <div className="editor-footer-actions">
            <button type="button" onClick={close}>
              {uiText("Đóng")}
            </button>
            <button
              className="btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? uiText("Đang lưu…") : uiText("Lưu bản Markdown mới và đính kèm")}
            </button>
          </div>
        </footer>

        {menu.menu}

        {/* MODAL QUẢN LÝ BẢNG BIỂU */}
        {showTableModal && (
          <div className="modal-backdrop" style={{zIndex: 100}}>
            <section className="modal table-manager-dialog" role="dialog" aria-label={uiText("Quản lý bảng biểu")}>
              <header className="markdown-editor-header">
                <h2>📊 {uiText("Quản lý bảng biểu & Ma trận đặc tả")}</h2>
                <button type="button" className="menu-close" onClick={() => setShowTableModal(false)}>✕</button>
              </header>

              <div className="table-preset-bar">
                <strong>{uiText("Mẫu có sẵn:")}</strong>
                <button type="button" onClick={() => loadTablePreset('matrix')}>
                  📋 {uiText("Ma trận GDPT 2018 (như hình)")}
                </button>
                <button type="button" onClick={() => loadTablePreset('khbd')}>
                  📖 {uiText("Kế hoạch bài dạy (KHBD)")}
                </button>
                <button type="button" onClick={() => loadTablePreset('rubric')}>
                  🎯 {uiText("Tiêu chí đánh giá (Rubric)")}
                </button>
                <button type="button" onClick={() => loadTablePreset('simple')}>
                  📐 {uiText("Bảng trống 3x3")}
                </button>
              </div>

              <div className="table-controls-strip">
                <button type="button" onClick={() => addCol(selectedCell.c)}>
                  ➕ {uiText("Cột trái")}
                </button>
                <button type="button" onClick={() => addCol(selectedCell.c + 1)}>
                  ➕ {uiText("Cột phải")}
                </button>
                <button type="button" onClick={() => removeCol(selectedCell.c)}>
                  ➖ {uiText("Xóa cột")}
                </button>
                <span style={{color: 'var(--line)'}}>|</span>
                <button type="button" onClick={() => addRow(selectedCell.r)}>
                  ➕ {uiText("Dòng trên")}
                </button>
                <button type="button" onClick={() => addRow(selectedCell.r + 1)}>
                  ➕ {uiText("Dòng dưới")}
                </button>
                <button type="button" onClick={() => removeRow(selectedCell.r)}>
                  ➖ {uiText("Xóa dòng")}
                </button>
                <span style={{color: 'var(--line)'}}>|</span>
                <button type="button" title={uiText("Gộp với ô bên phải")} onClick={() => mergeRight(selectedCell.r, selectedCell.c)}>
                  🔀 {uiText("Gộp cột")}
                </button>
                <button type="button" title={uiText("Gộp với ô bên dưới")} onClick={() => mergeDown(selectedCell.r, selectedCell.c)}>
                  🔀 {uiText("Gộp dòng")}
                </button>
                <button type="button" title={uiText("Hủy gộp / chia lại ô")} onClick={() => splitCell(selectedCell.r, selectedCell.c)}>
                  ✂️ {uiText("Chia ô")}
                </button>
              </div>

              <div className="table-visual-grid-container">
                <table className="table-visual-grid">
                  <tbody>
                    {grid.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => {
                          if (cell.hidden) return null;
                          const isSel = selectedCell.r === ri && selectedCell.c === ci;
                          return (
                            <td
                              key={ci}
                              className={isSel ? 'selected' : ''}
                              colSpan={cell.colspan ?? 1}
                              rowSpan={cell.rowspan ?? 1}
                              onClick={() => setSelectedCell({r: ri, c: ci})}
                            >
                              {(cell.colspan && cell.colspan > 1) || (cell.rowspan && cell.rowspan > 1) ? (
                                <span className="cell-span-badge">
                                  {cell.colspan ?? 1}x{cell.rowspan ?? 1}
                                </span>
                              ) : null}
                              <textarea
                                className="cell-input"
                                value={cell.text}
                                onChange={e => updateCellText(ri, ci, e.target.value)}
                                placeholder={`Ô [${ri + 1},${ci + 1}]`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions" style={{justifyContent: 'space-between', display: 'flex'}}>
                <small className="muted">
                  {uiText("Đang chọn ô dòng {0}, cột {1}. Nhấp vào ô bất kỳ để sửa nội dung hoặc gộp/chia ô.", [String(selectedCell.r + 1), String(selectedCell.c + 1)])}
                </small>
                <div style={{display: 'inline-flex', gap: 8}}>
                  <button type="button" onClick={() => setShowTableModal(false)}>{uiText("Hủy")}</button>
                  <button type="button" className="primary" onClick={applyTableToMarkdown}>
                    {uiText("Chèn bảng vào văn bản")}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* MODAL CHÈN ẢNH */}
        {showImageModal && (
          <div className="modal-backdrop" style={{zIndex: 100}}>
            <section className="modal" style={{width: 480}} role="dialog" aria-label={uiText("Chèn hình ảnh")}>
              <header className="markdown-editor-header">
                <h2>🖼 {uiText("Chèn hình ảnh")}</h2>
                <button type="button" className="menu-close" onClick={() => setShowImageModal(false)}>✕</button>
              </header>

              <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{padding: '10px 14px', borderRadius: 8}}
                  onClick={() => void pickImageFile()}
                >
                  📁 {uiText("Chọn tệp ảnh từ máy tính (PNG, JPG, SVG…)")}
                </button>

                <div style={{textAlign: 'center', fontSize: 12, color: 'var(--muted)'}}>
                  — {uiText("hoặc nhập đường dẫn / URL")} —
                </div>

                <label>
                  {uiText("Đường dẫn hoặc URL ảnh:")}
                  <input
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://... hoặc /Users/..."
                  />
                </label>

                <label>
                  {uiText("Mô tả / Chú thích ảnh:")}
                  <input
                    value={imageAlt}
                    onChange={e => setImageAlt(e.target.value)}
                    placeholder={uiText("Ví dụ: Sơ đồ từ trường")}
                  />
                </label>
              </div>

              <div className="modal-actions" style={{marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8}}>
                <button type="button" onClick={() => setShowImageModal(false)}>{uiText("Hủy")}</button>
                <button type="button" className="primary" disabled={!imageUrl.trim()} onClick={insertCustomImage}>
                  {uiText("Chèn ảnh")}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* MODAL CHÈN LIÊN KẾT */}
        {showLinkModal && (
          <div className="modal-backdrop" style={{zIndex: 100}}>
            <section className="modal" style={{width: 460}} role="dialog" aria-label={uiText("Chèn liên kết")}>
              <header className="markdown-editor-header">
                <h2>🔗 {uiText("Chèn liên kết")}</h2>
                <button type="button" className="menu-close" onClick={() => setShowLinkModal(false)}>✕</button>
              </header>

              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <label>
                  {uiText("Địa chỉ liên kết (URL):")}
                  <input
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://hoclieu.vn/..."
                  />
                </label>

                <label>
                  {uiText("Chữ hiển thị:")}
                  <input
                    value={linkText}
                    onChange={e => setLinkText(e.target.value)}
                    placeholder={uiText("Ví dụ: Tài liệu hướng dẫn")}
                  />
                </label>
              </div>

              <div className="modal-actions" style={{marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8}}>
                <button type="button" onClick={() => setShowLinkModal(false)}>{uiText("Hủy")}</button>
                <button type="button" className="primary" disabled={!linkUrl.trim()} onClick={insertCustomLink}>
                  {uiText("Chèn liên kết")}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
