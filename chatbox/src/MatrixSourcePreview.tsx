import React, {useMemo, useState} from 'react';
import {readMatrixDocument, matrixReportMarkdown} from '../../shared/src/assessment-source';
import './assessment.css';

export function MatrixSourcePreview({source,name,onExport}:{source:string;name:string;onExport:(text:string)=>void}){
 const report=useMemo(()=>readMatrixDocument(source),[source]);
 const [showTotals,setShowTotals]=useState(false);
 if(!source.trim())return <p className="matrix-empty">Chọn tệp ma trận để xem các ô đã đọc. Có thể đọc và xuất báo cáo trước khi nạp bản đặc tả.</p>;
 const rows=(showTotals?report.summaries:report.cells).filter(c=>c.raw.trim());
 return <section className="matrix-preview" aria-label="Kết quả đọc ma trận">
  <div className="matrix-section-heading"><div><h3>2. Kết quả đọc nguồn</h3><p>Giữ số câu, số ý và giá trị nguyên văn. Chưa quy đổi thành điểm.</p></div>
   <button type="button" className="suite-btn secondary" onClick={()=>onExport(matrixReportMarkdown(report,name))}>Xuất báo cáo đọc (.md)</button>
  </div>
  <div className="matrix-view-tabs" role="group" aria-label="Loại dữ liệu">
   <button type="button" aria-pressed={!showTotals} onClick={()=>setShowTotals(false)}>Ô chi tiết</button>
   <button type="button" aria-pressed={showTotals} onClick={()=>setShowTotals(true)}>Tổng ghi trong nguồn</button>
  </div>
  <div className="matrix-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu ma trận">
   <table><thead><tr><th>Chủ đề</th><th>Dạng</th><th>Mức độ</th><th>Mã năng lực</th><th>Giá trị</th><th>Đơn vị</th><th>Vị trí nguồn</th></tr></thead>
    <tbody>{rows.map(c=><tr key={`${c.table}:${c.address}`}><td>{c.topic}</td><td>{c.form}</td><td>{c.level||'Chưa rõ'}</td><td>{c.code||'—'}</td><td>{c.raw}</td><td>{c.unit}</td><td>Bảng {c.table} · {c.address}</td></tr>)}</tbody>
   </table>
   {!rows.length&&<p className="matrix-empty">Chưa có ô đọc được trong phần này. Xem văn bản nguồn bên dưới.</p>}
  </div>
  <p className="matrix-caption">Ô trống được giữ trong dữ liệu nguồn và ẩn khỏi danh sách này; không được coi là số 0. Phần III chưa xác định đơn vị câu hay ý nếu nguồn không ghi rõ.</p>
  {report.issues.length>0&&<details className="matrix-notes"><summary>Cần đối chiếu · {report.issues.length} ghi chú</summary><p>Các ghi chú phản ánh cách đọc tự động; không phải kết luận tài liệu sai.</p><ul>{report.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
 </section>;
}
