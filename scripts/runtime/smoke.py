"""Offline round-trip check for the relocated runtime on every build target."""
import os
import platform
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from decimal import Decimal
import docx
import openpyxl
import pptx
import pypdf
from PIL import Image

# PyPI has no win_arm64 wheel for typst: only there the bundled executable stands in for the module.
WINDOWS_ARM64 = sys.platform == 'win32' and platform.machine().upper() == 'ARM64'
if not WINDOWS_ARM64:
    import typst

assert Decimal('0.1') + Decimal('0.2') == Decimal('0.3')
with TemporaryDirectory(prefix='PVTA files ') as tmp:
    root = Path(tmp)
    document = docx.Document()
    document.add_heading('Giáo án PVTA', 1)
    document.save(root / 'sample.docx')
    assert docx.Document(root / 'sample.docx').paragraphs[0].text == 'Giáo án PVTA'
    workbook = openpyxl.Workbook()
    workbook.active['A1'] = '=SUM(1,2)'
    workbook.save(root / 'sample.xlsx')
    loaded = openpyxl.load_workbook(root / 'sample.xlsx')
    assert loaded.active['A1'].value == '=SUM(1,2)'
    loaded.close()
    slides = pptx.Presentation()
    slides.slides.add_slide(slides.slide_layouts[0])
    slides.save(root / 'sample.pptx')
    assert len(pptx.Presentation(root / 'sample.pptx').slides) == 1
    if WINDOWS_ARM64:
        (root / 'sample.typ').write_text('Hello PVTA', encoding='utf-8')
        subprocess.run([os.environ['PVTA_TYPST'], 'compile', str(root / 'sample.typ'), str(root / 'sample.pdf')], check=True)
    else:
        typst.compile(b'Hello PVTA', output=str(root / 'sample.pdf'))
    assert len(pypdf.PdfReader(root / 'sample.pdf').pages) == 1
    Image.new('RGB', (10, 10)).save(root / 'sample.png')
print('Offline Word, Excel, PowerPoint, PDF and image round trips passed.')
