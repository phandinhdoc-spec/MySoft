import tempfile
import unittest
import zipfile
from pathlib import Path
from typesetting import create_typst


class TypesettingTest(unittest.TestCase):
    def test_pdf_source_preview_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'result.zip'
            source = '#set text(font: "Libertinus Serif", lang: "vi")\n= Báo cáo\nNội dung tiếng Việt. $x^2 + 1$'
            create_typst({'output': str(out), 'source': source})
            before = out.read_bytes()
            with zipfile.ZipFile(out) as z:
                self.assertEqual(z.read('document.typ').decode(), source)
                self.assertTrue(z.read('document.pdf').startswith(b'%PDF-'))
                self.assertTrue(any(n.startswith('preview-') for n in z.namelist()))
            with self.assertRaises(ValueError):
                create_typst({'output': str(out), 'source': source})
            self.assertEqual(out.read_bytes(), before)

    def test_invalid_source_and_root_escape_publish_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'result.zip'
            for source in ['#not-a-function()', '#read("../../etc/passwd")', '#import "@preview/example:0.1.0": *']:
                with self.assertRaises(ValueError):
                    create_typst({'output': str(out), 'source': source})
                self.assertFalse(out.exists())

if __name__ == '__main__':
    unittest.main()
