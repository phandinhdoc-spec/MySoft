import hashlib
import sys
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
import documents

class DocumentsTests(unittest.TestCase):
    def test_decimal_exactness_and_round_half_up(self):
        self.assertEqual(documents.calculate({'expression':'0.1 + 0.2','digits':2})['exact'],'0.3')
        self.assertEqual(documents.calculate({'expression':'round(1.005, 2)'})['rounded'],'1.01')
        self.assertEqual(documents.calculate({'expression':'wavg([5,8],[1,2])'})['rounded'],'7.00')

    def test_rejects_executable_python(self):
        for expression in ['__import__("os").system("whoami")','(1).__class__','[x for x in [1]]','2**9999999','sum([1],x=2)']:
            with self.subTest(expression=expression),self.assertRaises((ValueError,TypeError)):
                documents.calculate({'expression':expression})

    def test_excel_patch_preserves_structure_and_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'source.xlsx';output=Path(tmp)/'copy.xlsx'
            sheet=b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Title</t></is></c></row><row r="2"><c r="B2"><f>SUM(B3:B5)</f><v>8</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells></worksheet>'
            with zipfile.ZipFile(source,'w') as z:
                z.writestr('xl/worksheets/sheet1.xml',sheet)
                z.writestr('xl/styles.xml','<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts></styleSheet>')
                z.writestr('xl/media/image1.png',b'image-bytes')
            original=source.read_bytes()
            documents.patch({'path':str(source),'output':str(output),'replacements':[{'old':'Title','new':'New title'}],'style':{'font':'Arial','size':12}})
            self.assertEqual(source.read_bytes(),original)
            with zipfile.ZipFile(output) as z:
                root=documents.ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
                self.assertEqual(root.find('s:mergeCells/s:mergeCell',documents.NS).get('ref'),'A1:D1')
                self.assertEqual(root.find('.//s:f',documents.NS).text,'SUM(B3:B5)')
                self.assertEqual(z.read('xl/media/image1.png'),b'image-bytes')
            with self.assertRaises(ValueError):documents.patch({'path':str(source),'output':str(output),'replacements':[]})
            missing=Path(tmp)/'missing.xlsx'
            with self.assertRaises(ValueError):documents.patch({'path':str(source),'output':str(missing),'replacements':[{'old':'not present','new':'x'}]})
            self.assertFalse(missing.exists())

    def test_preserves_namespace_used_only_in_ignorable_attribute(self):
        raw=b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"><w:body/></w:document>'
        root,namespaces=documents.parse_xml(raw)
        result=documents.serialize_xml(root,namespaces)
        self.assertIn(b'xmlns:w14=',result)
        self.assertIn(b'Ignorable="w14"',result)
        documents.ET.fromstring(result)

    def test_rejects_zip_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive=Path(tmp)/'bad.zip';home=Path(tmp)/'home'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('../outside.txt','bad')
            with self.assertRaises(ValueError):documents.backup({'op':'import','path':str(archive),'home':str(home)})
            self.assertFalse((Path(tmp)/'outside.txt').exists())

    def test_ocr_reports_missing_tools_instead_of_failing(self):
        original=shutil.which
        try:
            shutil.which=lambda name,*a,**k:None
            result=documents.ocr(Path('khong-co.pdf'))
        finally:
            shutil.which=original
        self.assertIn('unavailable',result)
        self.assertNotIn('segments',result)

    def test_group_lines_and_clock(self):
        out=documents.group_lines([(0,'xin'),(10,'chào'),(50,'các em'),(3700,'cuối')],window=45)
        self.assertEqual([o['ref'] for o in out],['0:00','1:01:40'])
        self.assertEqual(out[0]['text'],'xin chào các em')

    def test_youtube_rejects_bad_id_and_maps_errors(self):
        with self.assertRaises(ValueError):documents.youtube('../etc')
        import types
        class Snip:
            def __init__(s,st,t):s.start=st;s.text=t
        class Fetched(list):language_code='vi'
        class TranscriptsDisabled(Exception):pass
        class Api:
            mode='ok'
            def fetch(s,vid,languages=()):
                if Api.mode=='off':raise TranscriptsDisabled()
                return Fetched([Snip(0,'Bài 1'),Snip(5,'quang hợp')])
            def list(s,vid):raise TranscriptsDisabled()
        mod=types.ModuleType('youtube_transcript_api');mod.YouTubeTranscriptApi=Api
        saved=sys.modules.get('youtube_transcript_api');sys.modules['youtube_transcript_api']=mod
        try:
            r=documents.youtube('dQw4w9WgXcQ')
            self.assertEqual(r['segments'][0]['text'],'Bài 1 quang hợp');self.assertEqual(r['language'],'vi')
            Api.mode='off'
            self.assertEqual(documents.youtube('dQw4w9WgXcQ'),{'unavailable':'Video đã tắt phụ đề.'})
        finally:
            if saved is None:del sys.modules['youtube_transcript_api']
            else:sys.modules['youtube_transcript_api']=saved

    def test_transcribe_uses_local_model_and_groups_by_time(self):
        import types
        seen={}
        class Seg:
            def __init__(s,st,t):s.start=st;s.text=t
        class Model:
            def __init__(s,size,**k):seen.update(size=size,**k)
            def transcribe(s,path,**k):seen['kw']=k;return iter([Seg(0,' Hôm nay'),Seg(3,' học bài mới')]),types.SimpleNamespace(duration=12)
        mod=types.ModuleType('faster_whisper');mod.WhisperModel=Model
        saved=sys.modules.get('faster_whisper');sys.modules['faster_whisper']=mod
        try:
            with tempfile.TemporaryDirectory() as d:
                f=Path(d)/'bai.mp3';f.write_bytes(b'x')
                r=documents.transcribe(f,Path(d)/'models')
                self.assertEqual(r['segments'],[{'ref':'0:00','text':'Hôm nay học bài mới','start':0}])
                self.assertEqual(seen['device'],'cpu');self.assertEqual(seen['kw']['language'],'vi')
                self.assertTrue(seen['download_root'].endswith('models'))
                with self.assertRaises(ValueError):documents.transcribe(Path(d)/'a.exe',Path(d))
        finally:
            if saved is None:del sys.modules['faster_whisper']
            else:sys.modules['faster_whisper']=saved

    def test_ocr_image_reports_missing_tesseract(self):
        original=shutil.which
        try:
            shutil.which=lambda name,*a,**k:None
            self.assertIn('unavailable',documents.ocr_image(Path('x.png')))
        finally:shutil.which=original

if __name__=='__main__':unittest.main()
