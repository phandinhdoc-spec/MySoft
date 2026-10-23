/**
 * Quy tắc chuẩn hóa và làm đẹp Markdown cục bộ (chạy tức thì không phụ thuộc mạng).
 */
export function localBeautifyMarkdown(text: string): string {
  if (!text) return '';
  // 1. Chuẩn hóa xuống dòng CRLF / CR -> LF
  let s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Loại bỏ khoảng trắng thừa cuối mỗi dòng
  s = s.split('\n').map(line => line.trimEnd()).join('\n');

  // 3. Gom nhiều dòng trống liên tiếp (tối đa 1 dòng trống giữa các đoạn)
  s = s.replace(/\n{3,}/g, '\n\n');

  // 4. Chuẩn hóa tiêu đề: thêm khoảng trắng sau # nếu thiếu (vd #Tiêu đề -> # Tiêu đề)
  s = s.replace(/^(#{1,6})([^#\s\n])/gm, '$1 $2');

  // 5. Chuẩn hóa danh sách gạch đầu dòng: thêm khoảng trắng sau ký tự đánh dấu nếu thiếu
  s = s.replace(/^(\s*[-*+])([^\s\-*+\[\n])/gm, '$1 $2');

  // 6. Chuẩn hóa danh sách số: 1.mục -> 1. mục
  s = s.replace(/^(\s*\d+\.)([^\s\n])/gm, '$1 $2');

  // 7. Chuẩn hóa dòng kẻ phân đoạn / YAML phase separator (---): đảm bảo có dòng trống trước & sau
  s = s.replace(/(?:^|\n)(-{3,})(?:\n|$)/g, '\n\n$1\n\n');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
