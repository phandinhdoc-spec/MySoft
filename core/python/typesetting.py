"""Compile a self-contained Typst draft in an isolated project and publish one bundle."""
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


def _compile(main, output, root, **options):
    """Compile with the Python module, or with the typst executable when the module is
    unavailable (Windows ARM64: PyPI has no wheel; the app bundles the executable)."""
    try:
        import typst
    except ImportError:
        typst = None
    if typst is not None:
        return typst.compile(str(main), output=str(output), root=str(root), **options)
    exe = os.environ.get('PVTA_TYPST') or shutil.which('typst')
    if not exe:
        raise RuntimeError('Không tìm thấy trình biên dịch Typst.')
    command = [exe, 'compile', str(main), str(output), '--root', str(root),
               '--format', options.get('format', 'pdf')]
    if 'ppi' in options:
        command += ['--ppi', str(options['ppi'])]
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    done = subprocess.run(command, capture_output=True, text=True, encoding='utf-8',
                          errors='replace', timeout=120, creationflags=flags)
    if done.returncode != 0:
        raise RuntimeError((done.stderr or done.stdout or 'Typst báo lỗi.').strip())


def create_typst(req):
    source = req.get('source')
    output = Path(req['output'])
    if not output.is_absolute() or output.suffix.lower() != '.zip':
        raise ValueError('Đầu ra Typst phải là đường dẫn .zip tuyệt đối.')
    if not isinstance(source, str) or not source.strip() or len(source) > 1_000_000:
        raise ValueError('Mã nguồn Typst trống hoặc quá dài.')
    # Keep the first version self-contained. The compiler root is the actual
    # filesystem boundary; this conservative check also avoids remote packages.
    if re.search(r'\b(import|include|eval)\b|@preview/|@local/|\\u\{', source):
        raise ValueError('Bản xuất hiện tại cần Typst tự chứa, không import/include/eval hoặc package ngoài.')
    if output.exists():
        raise ValueError('Tệp kết quả đã tồn tại; hãy chọn tên khác.')
    with tempfile.TemporaryDirectory(prefix='pvta-typst-') as tmp:
        root = Path(tmp)
        main = root / 'document.typ'
        main.write_text(source, encoding='utf-8')
        try:
            _compile(main, root / 'document.pdf', root)
            _compile(main, root / 'preview-{n}.png', root, format='png', ppi=72.0)
        except Exception as exc:
            raise ValueError('Không biên dịch được Typst; chưa tạo tệp kết quả. ' + str(exc)[:2500]) from exc
        (root / 'README.txt').write_text(
            'PDF: bản xem và in. document.typ: mã nguồn chỉnh sửa được.\n'
            'Mở document.typ trong Typst hoặc chạy: typst compile document.typ document.pdf\n'
            'Ảnh preview-*.png dùng để kiểm tra bố cục. Biên dịch thành công không thay thế kiểm tra bằng mắt.\n'
            'Cài các phông được mã nguồn sử dụng để giữ nguyên bố cục trên máy khác.\n'
            'Giữ tệp XLSX gốc nếu cần công thức và tính toán; PDF không thay thế bảng tính.\n', encoding='utf-8')
        files = [p for p in root.iterdir() if p.is_file()]
        if sum(p.stat().st_size for p in files) > 100 * 1024 * 1024:
            raise ValueError('Gói xuất quá lớn (trên 100 MB). Hãy chia tài liệu.')
        staged = root / 'bundle.zip'
        with zipfile.ZipFile(staged, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in sorted(files):
                z.write(file, file.name)
        output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation, even if another process won the earlier exists check.
        created = False
        try:
            with output.open('xb') as dst, staged.open('rb') as src:
                created = True
                import shutil
                shutil.copyfileobj(src, dst)
        except Exception:
            if created:
                output.unlink(missing_ok=True)
            raise
    return {'output': str(output), 'format': 'typst-bundle'}
