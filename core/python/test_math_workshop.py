import tempfile
import unittest
from html import unescape
from pathlib import Path
from zipfile import ZipFile
from math_workshop import export_math


class MathExportTests(unittest.TestCase):
    def test_student_outputs_never_include_answers(self):
        for ext in ['docx', 'pptx', 'xlsx']:
            with self.subTest(ext=ext), tempfile.TemporaryDirectory() as tmp:
                target = Path(tmp) / ('student.' + ext)
                spec = dict(title='Phiếu khám phá Toán', revision=2, question='Giải thích cách làm',
                            description='Mã bộ đề: 1', teacher=False, answer='SECRET-ANSWER',
                            checks=['Đã kiểm tra'], rows=[], variants=[dict(question='Giải phương trình', answer='SECRET-SOLUTION', check='Kiểm tra')])
                export_math(dict(output=str(target), document=spec))
                with ZipFile(target) as archive:
                    xml = ''.join(archive.read(name).decode() for name in archive.namelist() if name.endswith('.xml'))
                    self.assertNotIn('SECRET-', xml)
                    self.assertIn('Giải phương trình', unescape(xml))

    def test_teacher_outputs_include_answers(self):
        for ext in ['docx', 'pptx', 'xlsx']:
            with self.subTest(ext=ext), tempfile.TemporaryDirectory() as tmp:
                target = Path(tmp) / ('teacher.' + ext)
                spec = dict(title='Đáp án', revision=2, question='Tính', description='Bộ đề',
                            teacher=True, answer='Hướng dẫn', checks=['Kiểm tra'], rows=[],
                            variants=[dict(question='Câu hỏi', answer='RESULT', check='Đã thế nghiệm')])
                export_math(dict(output=str(target), document=spec))
                with ZipFile(target) as archive:
                    xml = ''.join(archive.read(name).decode() for name in archive.namelist() if name.endswith('.xml'))
                    self.assertIn('RESULT', xml)

    def test_graph_image_is_embedded_in_word_and_powerpoint(self):
        import base64
        # Tiny valid PNG fixture; tests the image packaging route, not visual quality.
        png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        for ext in ['docx', 'pptx']:
            with self.subTest(ext=ext), tempfile.TemporaryDirectory() as tmp:
                target = Path(tmp) / ('graph.' + ext)
                spec = dict(title='Đồ thị', revision=1, question='Quan sát', description='Hình tĩnh', teacher=False,
                            checks=[], rows=[], variants=[], png='data:image/png;base64,' + png)
                export_math(dict(output=str(target), document=spec))
                with ZipFile(target) as archive:
                    media = [n for n in archive.namelist() if '/media/' in n]
                    self.assertTrue(media)
                    self.assertEqual(archive.read(media[0]), base64.b64decode(png))


if __name__ == '__main__':
    unittest.main()
