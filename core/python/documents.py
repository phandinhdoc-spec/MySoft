#!/usr/bin/env python3
"""PVTA document worker: bounded data operations, never executes model code."""
import ast
import csv
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import tempfile
import zipfile
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path
import xml.etree.ElementTree as ET

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
for prefix,uri in NS.items(): ET.register_namespace(prefix,uri)
# Register all original prefixes per XML document before serializing; Office ignorable
# namespaces must retain their exact names and declarations.
def parse_xml(raw):
    namespaces={prefix:uri for _,(prefix,uri) in ET.iterparse(io.BytesIO(raw),events=['start-ns'])}
    for prefix,uri in namespaces.items():
        if not re.fullmatch(r'ns\d+',prefix): ET.register_namespace(prefix,uri)
    return ET.fromstring(raw),namespaces

def serialize_xml(root,namespaces):
    out=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    # ElementTree drops declarations used only inside attribute values (mc:Ignorable).
    for prefix,uri in namespaces.items():
        key=('xmlns:'+prefix if prefix else 'xmlns').encode()
        if key+b'=' not in out:
            start=out.find(b'<',out.find(b'?>')+2)
            end=out.find(b'>',start)
            out=out[:end]+b' '+key+b'="'+uri.encode()+b'"'+out[end:]
    return out

def bounded_zip(file):
    z=zipfile.ZipFile(file)
    if len(z.infolist())>15000 or sum(x.file_size for x in z.infolist())>150_000_000:
        z.close();raise ValueError('Tệp nén quá lớn sau giải nén.')
    return z

def extract(file):
    ext=file.suffix.lower();segments=[]
    if ext=='.pdf':
        try: from pypdf import PdfReader
        except ImportError: raise ValueError('Đọc PDF cần pypdf. Cài Python và chọn hỗ trợ PDF trong trình cài PVTA.')
        reader=PdfReader(str(file))
        if len(reader.pages)>2000: raise ValueError('PDF quá 2.000 trang.')
        for i,p in enumerate(reader.pages): segments.append({'ref':f'Trang {i+1}','text':p.extract_text() or ''})
        return {'segments':segments}
    with bounded_zip(file) as z:
        if ext=='.docx':
            root=ET.fromstring(z.read('word/document.xml'))
            paragraphs={id(p):i+1 for i,p in enumerate(root.findall('.//w:p',NS))}
            table_no=0
            def words(p):return ''.join(t.text or '' for t in p.findall('.//w:t',NS))
            def number(node,default=1):
                v=int(node.get('{'+NS['w']+'}val',str(default))) if node is not None else default
                if v<0 or v>2048:raise ValueError('Kích thước ô gộp không hợp lệ.')
                return v
            def walk(parent):
                nonlocal table_no
                for el in parent:
                    if el.tag=='{'+NS['w']+'}p':
                        value=words(el)
                        if value:segments.append({'ref':f'Đoạn {paragraphs[id(el)]}','text':value})
                    elif el.tag=='{'+NS['w']+'}tbl':
                        table_no+=1;tid=table_no;merged={}
                        for ri,row in enumerate(el.findall('w:tr',NS),1):
                            col=1+number(row.find('w:trPr/w:gridBefore',NS),0);cells=[]
                            next_merged={}
                            for cell in row.findall('w:tc',NS):
                                span=max(1,number(cell.find('w:tcPr/w:gridSpan',NS)))
                                vm=cell.find('w:tcPr/w:vMerge',NS)
                                origin=f'R{ri}C{col}';merge_note=''
                                if vm is not None:
                                    if vm.get('{'+NS['w']+'}val')=='restart':merge_note='; bắt đầu gộp dọc'
                                    else:
                                        origin=merged.get(col,'chưa xác định');merge_note='; gộp dọc từ '+origin
                                    for c in range(col,col+span):next_merged[c]=origin
                                value=' / '.join(words(p) for p in cell.findall('w:p',NS))
                                cells.append(f'[R{ri}C{col}'+(f'–C{col+span-1}' if span>1 else '')+merge_note+'] '+(value or '[trống]'))
                                col+=span
                            merged=next_merged
                            segments.append({'ref':f'Bảng {tid} · Hàng {ri}','text':' | '.join(cells),'section':f'Bảng {tid}','atomic':True})
                            for cell in row.findall('w:tc',NS):
                                for nested in cell.findall('w:tbl',NS):
                                    wrapper=ET.Element('wrapper');wrapper.append(nested);walk(wrapper)
                    else:walk(el)
            walk(root)
        elif ext=='.pptx':
            slides=sorted((n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)),key=lambda n:int(re.search(r'slide(\d+)',n).group(1)))
            for i,n in enumerate(slides):
                root=ET.fromstring(z.read(n));text='\n'.join(''.join(t.text or '' for t in p.findall('.//a:t',NS)) for p in root.findall('.//a:p',NS))
                segments.append({'ref':f'Slide {i+1}','text':text,'atomic':True})
        elif ext=='.xlsx':
            shared=[]
            if 'xl/sharedStrings.xml' in z.namelist():
                shared=[''.join(t.text or '' for t in item.findall('.//s:t',NS)) for item in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
            names={}
            if 'xl/workbook.xml' in z.namelist() and 'xl/_rels/workbook.xml.rels' in z.namelist():
                rels={r.get('Id'):r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
                for s in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
                    target=rels.get(s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'),'')
                    target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
                    names[target]=s.get('name')
            for n in sorted(n for n in z.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',n)):
                root=ET.fromstring(z.read(n));sheet=names.get(n,Path(n).stem)
                for c in root.findall('.//s:sheetData/s:row/s:c',NS):
                    v=c.find('s:v',NS);text=v.text if v is not None else ''
                    if c.get('t')=='s' and text: text=shared[int(text)]
                    if c.get('t')=='inlineStr':text=''.join(t.text or '' for t in c.findall('.//s:t',NS))
                    formula=c.find('s:f',NS)
                    if formula is not None: text=f'{text or "[chưa có giá trị cache]"} (công thức ={formula.text})'
                    if text: segments.append({'ref':f'{sheet}!{c.get("r")}','text':text,'section':sheet,'atomic':True})
                merged=root.find('s:mergeCells',NS)
                if merged is not None:segments.append({'ref':sheet+' · ô gộp','text':', '.join(c.get('ref','') for c in merged),'section':sheet})
        else:raise ValueError('Định dạng không được hỗ trợ.')
    return {'segments':segments}

OCR_MAX_PAGES=30
OCR_BUDGET_SECONDS=100

def ocr(file):
    """Đọc chữ trong PDF ảnh scan bằng tesseract + pdftoppm nếu máy đã cài; không cài thêm gì, không chạy mạng."""
    tess=shutil.which('tesseract');ppm=shutil.which('pdftoppm')
    if not tess or not ppm:
        return {'unavailable':'Máy chưa có công cụ đọc chữ trong ảnh (cần tesseract và poppler/pdftoppm).'}
    try:
        langs=subprocess.run([tess,'--list-langs'],capture_output=True,text=True,timeout=15).stdout.split()
    except Exception:
        return {'unavailable':'Không chạy được tesseract.'}
    if 'vie' not in langs:
        return {'unavailable':'tesseract chưa có dữ liệu tiếng Việt (vie). Cài gói ngôn ngữ vie rồi thử lại.'}
    segments=[];started=time.monotonic()
    with tempfile.TemporaryDirectory() as d:
        try:
            subprocess.run([ppm,'-r','200','-f','1','-l',str(OCR_MAX_PAGES),'-png',str(file),str(Path(d)/'p')],capture_output=True,timeout=90,check=True)
        except Exception:
            return {'unavailable':'Không tách được trang ảnh từ PDF.'}
        for i,img in enumerate(sorted(Path(d).glob('p-*.png'))):
            if time.monotonic()-started>OCR_BUDGET_SECONDS: break
            try:
                out=subprocess.run([tess,str(img),'stdout','-l','vie'],capture_output=True,text=True,timeout=40).stdout
            except Exception:
                continue
            if out.strip(): segments.append({'ref':f'Trang {i+1}','text':out})
    if not segments: return {'unavailable':'OCR không nhận ra chữ nào.'}
    return {'segments':segments}

MEDIA_EXT={'.mp3','.wav','.m4a','.aac','.ogg','.flac','.mp4','.mov','.mkv','.webm','.avi'}
WHISPER_MODEL='small'

def clock(sec):
    sec=int(sec or 0);h,rem=divmod(sec,3600);m,s=divmod(rem,60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'

def group_lines(items,window=45):
    """Gộp các câu phụ đề/phiên âm ngắn thành đoạn ~45 giây; nhãn là mốc thời gian bắt đầu."""
    out=[];cur=[];start=None
    for st,text in items:
        text=(text or '').replace('\n',' ').strip()
        if not text: continue
        if start is None: start=st
        cur.append(text)
        if st-start>=window:
            out.append({'ref':clock(start),'text':' '.join(cur),'start':int(start)});cur=[];start=None
    if cur: out.append({'ref':clock(start),'text':' '.join(cur),'start':int(start or 0)})
    return out

def transcribe(file,models):
    """Phiên âm âm thanh/video ngay trên máy bằng faster-whisper (không gửi tệp đi đâu). Lần đầu tải mô hình về thư mục models."""
    if file.suffix.lower() not in MEDIA_EXT: raise ValueError('Định dạng âm thanh/video chưa hỗ trợ.')
    try: from faster_whisper import WhisperModel
    except ImportError: return {'unavailable':'Máy chưa có bộ phiên âm (faster-whisper).'}
    model=WhisperModel(WHISPER_MODEL,device='cpu',compute_type='int8',download_root=str(models))
    segs,info=model.transcribe(str(file),language='vi',vad_filter=True,beam_size=1)
    lines=[(s.start,s.text) for s in segs]
    if not lines: return {'unavailable':'Không nghe được lời nói nào trong tệp.'}
    return {'segments':group_lines(lines),'duration':int(getattr(info,'duration',0) or 0)}

def youtube(video_id):
    """Lấy phụ đề có sẵn của video YouTube (ưu tiên tiếng Việt, rồi tiếng Anh, rồi bất kỳ). Không tải video."""
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}',video_id or ''): raise ValueError('Mã video YouTube không hợp lệ.')
    try: from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError: return {'unavailable':'Máy chưa có bộ đọc phụ đề YouTube.'}
    api=YouTubeTranscriptApi()
    try:
        try: fetched=api.fetch(video_id,languages=['vi','en'])
        except Exception:
            listing=api.list(video_id);fetched=next(iter(listing)).fetch()
    except StopIteration:
        return {'unavailable':'Video không có phụ đề.'}
    except Exception as e:
        name=type(e).__name__
        msg={'TranscriptsDisabled':'Video đã tắt phụ đề.','NoTranscriptFound':'Video không có phụ đề.','VideoUnavailable':'Video không xem được hoặc đã bị xóa.','AgeRestricted':'Video giới hạn độ tuổi nên không lấy được phụ đề.','IpBlocked':'YouTube đang chặn lượt tải từ mạng này. Thử lại sau hoặc dùng mạng khác.','RequestBlocked':'YouTube đang chặn lượt tải từ mạng này. Thử lại sau hoặc dùng mạng khác.','PoTokenRequired':'YouTube yêu cầu xác minh thêm nên chưa lấy được phụ đề.'}.get(name,'Không lấy được phụ đề của video.')
        return {'unavailable':msg}
    lang=getattr(fetched,'language_code','')
    return {'segments':group_lines([(x.start,x.text) for x in fetched]),'language':lang}

def ocr_image(file):
    """Đọc chữ trong một ảnh (vùng khoanh trên PDF) bằng tesseract nếu máy có. Không có thì báo, không lỗi."""
    tess=shutil.which('tesseract')
    if not tess: return {'unavailable':'Máy chưa có tesseract để đọc chữ trong ảnh.'}
    try: langs=subprocess.run([tess,'--list-langs'],capture_output=True,text=True,timeout=15).stdout.split()
    except Exception: return {'unavailable':'Không chạy được tesseract.'}
    lang='vie+eng' if 'vie' in langs and 'eng' in langs else 'vie' if 'vie' in langs else 'eng'
    try: out=subprocess.run([tess,str(file),'stdout','-l',lang,'--psm','6'],capture_output=True,text=True,timeout=40).stdout
    except Exception: return {'unavailable':'Đọc chữ quá lâu hoặc lỗi.'}
    text=out.strip()
    if not text: return {'unavailable':'Không nhận ra chữ trong vùng đã chọn.'}
    return {'text':text,'lang':lang}

def patch(req):
    source=Path(req['path']);output=Path(req['output']);ext=source.suffix.lower()
    if ext not in ['.docx','.xlsx','.pptx'] or output.suffix.lower()!=ext or source.resolve()==output.resolve(): raise ValueError('Chỉ sửa bản sao Office cùng định dạng.')
    if output.exists():raise ValueError('Tệp đích đã tồn tại; chọn một bản sao mới.')
    reps=req.get('replacements') or [];style=req.get('style') or {};found=set();changes=0
    with bounded_zip(source) as zin:
        temp=tempfile.NamedTemporaryFile(dir=output.parent,suffix=ext,delete=False);temp.close()
        try:
            with zipfile.ZipFile(temp.name,'w') as zout:
                for item in zin.infolist():
                    raw=zin.read(item.filename);modified=False
                    is_content=(ext=='.docx' and re.fullmatch(r'word/(document|header\d+|footer\d+)\.xml',item.filename)) or (ext=='.pptx' and re.fullmatch(r'ppt/slides/slide\d+\.xml',item.filename)) or (ext=='.xlsx' and (item.filename=='xl/sharedStrings.xml' or re.fullmatch(r'xl/worksheets/sheet\d+\.xml',item.filename)))
                    is_styles=ext=='.xlsx' and item.filename=='xl/styles.xml'
                    if is_content or is_styles:
                        root,namespaces=parse_xml(raw)
                        tags=[f'{{{NS[k]}}}t' for k in ['w','a','s']]
                        for t in root.iter():
                            if t.tag in tags and t.text:
                                for i,r in enumerate(reps):
                                    old=r.get('old');new=r.get('new')
                                    if not isinstance(old,str) or not old or not isinstance(new,str):raise ValueError('Thay thế phải là chuỗi chính xác.')
                                    if old in t.text: t.text=t.text.replace(old,new);found.add(i);modified=True;changes+=1
                        if ext=='.docx' and style:
                            for r in root.findall('.//w:r',NS):
                                pr=r.find('w:rPr',NS)
                                if pr is None:pr=ET.Element(f'{{{NS["w"]}}}rPr');r.insert(0,pr)
                                if style.get('font'):
                                    fonts=pr.find('w:rFonts',NS)
                                    if fonts is None:fonts=ET.SubElement(pr,f'{{{NS["w"]}}}rFonts')
                                    for a in ['ascii','hAnsi','eastAsia','cs']:fonts.set(f'{{{NS["w"]}}}{a}',style['font'])
                                if style.get('size'):
                                    size=pr.find('w:sz',NS)
                                    if size is None:size=ET.SubElement(pr,f'{{{NS["w"]}}}sz')
                                    size.set(f'{{{NS["w"]}}}val',str(round(float(style['size'])*2)))
                            modified=True
                        elif ext=='.pptx' and style:
                            for r in root.findall('.//a:r',NS):
                                pr=r.find('a:rPr',NS)
                                if pr is None:pr=ET.Element(f'{{{NS["a"]}}}rPr');r.insert(0,pr)
                                if style.get('size'):pr.set('sz',str(round(float(style['size'])*100)))
                                if style.get('font'):
                                    latin=pr.find('a:latin',NS)
                                    if latin is None:latin=ET.SubElement(pr,f'{{{NS["a"]}}}latin')
                                    latin.set('typeface',style['font'])
                            modified=True
                        elif is_styles and style:
                            # Edit existing font records only; retain merges, cell formats,
                            # number formats, formulas, dimensions, headings and cell styles.
                            for font in root.findall('s:fonts/s:font',NS):
                                for tag,key in [('name','font'),('sz','size')]:
                                    if style.get(key):
                                        node=font.find('s:'+tag,NS)
                                        if node is None:node=ET.SubElement(font,f'{{{NS["s"]}}}{tag}')
                                        node.set('val',str(style[key]))
                            modified=True
                        if modified:raw=serialize_xml(root,namespaces);changes+=1
                    zout.writestr(item,raw)
            missing=[i+1 for i in range(len(reps)) if i not in found]
            if missing:raise ValueError('Không tìm thấy nguyên văn thay thế số '+', '.join(map(str,missing))+'. Chưa tạo bản sửa. Chuỗi có thể bị chia thành nhiều đoạn định dạng.')
            if not changes:raise ValueError('Không có thay đổi được hỗ trợ để áp dụng.')
            # O_EXCL prevents racing another writer; the original is never opened for writing.
            with open(output,'xb') as dst,open(temp.name,'rb') as src:shutil.copyfileobj(src,dst)
        finally:
            if os.path.exists(temp.name):os.unlink(temp.name)
    return {'output':str(output),'changes':changes,'originalUnchanged':True}

def calculate(req):
    expression=req.get('expression','')
    if not isinstance(expression,str) or len(expression)>4000:raise ValueError('Biểu thức quá dài.')
    tree=ast.parse(expression,mode='eval');nodes=list(ast.walk(tree))
    if len(nodes)>1000:raise ValueError('Biểu thức quá phức tạp.')
    def seq(x):return x if isinstance(x,list) else [x]
    def avg(v):return sum(v,Decimal(0))/Decimal(len(v))
    def wavg(v,w):
        if len(v)!=len(w) or not v:raise ValueError('Danh sách giá trị và hệ số phải cùng độ dài.')
        return sum((a*b for a,b in zip(v,w)),Decimal(0))/sum(w,Decimal(0))
    funcs={'sum':lambda v:sum(seq(v),Decimal(0)),'avg':avg,'mean':avg,'min':lambda v:min(seq(v)),'max':lambda v:max(seq(v)),'abs':abs,'percent':lambda a,b:a/b*100,'wavg':wavg,'round':lambda a,n=Decimal(0):a.quantize(Decimal(1).scaleb(-int(n)),rounding=ROUND_HALF_UP),'median':lambda v:avg(sorted(v)[(len(v)-1)//2:len(v)//2+1])}
    def number(node):
        if isinstance(node,ast.Constant) and type(node.value) in (int,float):
            raw=ast.get_source_segment(expression,node)
            value=Decimal(raw)
            if not value.is_finite() or abs(value.adjusted())>1000:raise ValueError('Số ngoài giới hạn.')
            return value
        if isinstance(node,(ast.List,ast.Tuple)):return [number(x) for x in node.elts]
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.USub,ast.UAdd)):
            v=number(node.operand);return -v if isinstance(node.op,ast.USub) else v
        if isinstance(node,ast.BinOp):
            a=number(node.left);b=number(node.right)
            if isinstance(node.op,ast.Add):return a+b
            if isinstance(node.op,ast.Sub):return a-b
            if isinstance(node.op,ast.Mult):return a*b
            if isinstance(node.op,ast.Div):return a/b
            if isinstance(node.op,ast.Pow) and b==int(b) and abs(b)<=100:return a**int(b)
            raise ValueError('Phép toán không hỗ trợ hoặc số mũ quá lớn.')
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in funcs and not node.keywords:return funcs[node.func.id](*[number(a) for a in node.args])
        raise ValueError('Chỉ cho phép số, danh sách, + - * / ** và sum/avg/mean/min/max/abs/percent/wavg/round/median; không chạy mã Python.')
    with localcontext() as ctx:
        ctx.prec=50;value=number(tree.body)
        if not isinstance(value,Decimal) or not value.is_finite():raise ValueError('Kết quả phải là một số hữu hạn.')
        digits=max(0,min(12,int(req.get('digits',2))));rounded=value.quantize(Decimal(1).scaleb(-digits),rounding=ROUND_HALF_UP)
        formatted=f'{rounded:,.{digits}f}'.replace(',','X').replace('.',',').replace('X','.')
    return {'expression':expression,'exact':str(value),'rounded':str(rounded),'vietnamese':formatted,'rounding':'ROUND_HALF_UP','precision':50}

def backup(req):
    op=req['op'];file=Path(req['path'])
    if op=='export':
        out=Path(req['output'])
        if not file.is_dir() or out.exists():raise ValueError('Dữ liệu không tồn tại hoặc tệp đích đã có.')
        if out.resolve().is_relative_to(file.resolve()):raise ValueError('Chọn vị trí sao lưu ngoài thư mục dữ liệu PVTA.')
        temp=tempfile.NamedTemporaryFile(dir=out.parent,suffix='.zip',delete=False);temp.close()
        try:
            with zipfile.ZipFile(temp.name,'w',zipfile.ZIP_DEFLATED) as z:
                for f in file.rglob('*'):
                    if f.is_file() and not f.is_symlink() and not any(p in ['workspace','learn','hint','backups'] for p in f.relative_to(file).parts):z.write(f,f.relative_to(file).as_posix())
            with open(out,'xb') as dst,open(temp.name,'rb') as src:shutil.copyfileobj(src,dst)
        finally:os.unlink(temp.name)
        return {'output':str(out),'note':'Bản sao lưu có thể chứa khóa API; chỉ lưu ở nơi riêng tư.'}
    home=Path(req['home']);staging=Path(tempfile.mkdtemp(prefix='pvta-import-'));old=home/'backups'/str(int(__import__('time').time()))
    try:
        with bounded_zip(file) as z:
            for info in z.infolist():
                rel=Path(info.filename)
                if rel.is_absolute() or '..' in rel.parts or '\\' in info.filename or ':' in info.filename or (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Bản sao lưu chứa đường dẫn không an toàn.')
                target=staging/rel
                if info.is_dir():target.mkdir(parents=True,exist_ok=True);continue
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info));target.chmod(0o600)
        state=staging/'chatbox'/'state.json'
        if not state.is_file() or json.loads(state.read_text()).get('version')!=1:raise ValueError('Không phải bản sao lưu Chatbox hợp lệ.')
        old.mkdir(parents=True,exist_ok=False)
        copied=[]
        try:
            for src in staging.iterdir():
                if src.name in ['backups','workspace']:continue
                dst=home/src.name
                if dst.exists():shutil.move(str(dst),str(old/src.name))
                shutil.move(str(src),str(dst));copied.append(dst)
        except Exception:
            for dst in copied:
                if dst.is_dir():shutil.rmtree(dst)
                elif dst.exists():dst.unlink()
            for src in old.iterdir():shutil.move(str(src),str(home/src.name))
            raise
        return {'backup':str(old),'restored':True}
    finally:shutil.rmtree(staging)

def use_utf8_streams():
    """Windows: stdin/stdout mặc định theo bảng mã ANSI (cp1252/cp437), không có chữ Việt.
    Ép UTF-8 để JSON vào/ra không lỗi charmap với các ký tự như Đ, ề, ộ."""
    for stream in (sys.stdin,sys.stdout,sys.stderr):
        try: stream.reconfigure(encoding='utf-8',errors='strict')
        except Exception: pass

def read_request():
    """Đọc JSON đầu vào theo byte UTF-8, không phụ thuộc bảng mã console."""
    raw=getattr(sys.stdin,'buffer',None)
    data=raw.read() if raw is not None else sys.stdin.read()
    return json.loads(data.decode('utf-8-sig') if isinstance(data,bytes) else data)

def emit(payload):
    """In JSON UTF-8; nếu console vẫn không nhận (bảng mã lạ) thì lùi về JSON thuần ASCII."""
    text=json.dumps(payload,ensure_ascii=False)
    try:
        sys.stdout.write(text+'\n');sys.stdout.flush()
    except UnicodeEncodeError:
        sys.stdout.write(json.dumps(payload)+'\n');sys.stdout.flush()

def main():
    req=read_request();op=req.get('op')
    if op=='office_blank':
        from office import blank_office
        return blank_office(req)
    if op=='create_typst':
        from typesetting import create_typst
        return create_typst(req)
    if op in ['office_editor_read','office_editor_save']:
        from office import editor_job
        return editor_job(req)
    if op=='extract':return extract(Path(req['path']))
    if op=='ocr':return ocr(Path(req['path']))
    if op=='ocr_image':return ocr_image(Path(req['path']))
    if op=='transcribe':return transcribe(Path(req['path']),Path(req['models']))
    if op=='youtube':return youtube(str(req.get('id','')))
    if op=='patch':return patch(req)
    if op=='calc':return calculate(req)
    if op=='math_export':
        from math_workshop import export_math
        return export_math(req)
    if op in ['create_office','edit_excel']:
        from office import office_job
        return office_job(req)
    if op in ['export','import']:return backup(req)
    raise ValueError('Thao tác không hỗ trợ.')
if __name__=='__main__':
    use_utf8_streams()
    try:emit(main())
    except Exception as e:emit({'error':str(e)});sys.exit(0)
