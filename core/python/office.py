"""Structured Office authoring. Input is data, never executable Python."""
from pathlib import Path
import io, math, re

def text(v):
    if not isinstance(v,str) or len(v)>50000: raise ValueError('Văn bản không hợp lệ hoặc quá dài.')
    return v

def items(v,limit):
    if not isinstance(v,list) or len(v)>limit: raise ValueError('Danh sách vượt giới hạn.')
    return v

def grid(v):
    rows=items(v,5000)
    if not rows or not isinstance(rows[0],list) or not rows[0]: raise ValueError('Bảng cần ít nhất một ô.')
    width=len(rows[0])
    if width>100 or len(rows)*width>50000: raise ValueError('Bảng quá lớn.')
    for row in rows:
        if not isinstance(row,list) or len(row)!=width: raise ValueError('Các hàng phải có cùng số cột.')
        for x in row:
            if x is not None and not isinstance(x,(str,int,float,bool)):raise ValueError('Giá trị ô không hợp lệ.')
            if isinstance(x,str):text(x)
            if isinstance(x,float) and not math.isfinite(x):raise ValueError('Số phải hữu hạn.')
    return rows

def cell_value(cell,value):
    cell.value=value
    # Formulas are supplied only through the explicit formulas collection.
    if isinstance(value,str):cell.data_type='s'

def _is_total_row(row_vals):
    first=' '.join(str(x or '') for x in row_vals[:2]).strip().lower()
    return any(first.startswith(k) or f' {k}' in first for k in ['tổng','cộng','số dư','trung bình','tb ','đtb'])

def _is_numeric_str(val):
    if isinstance(val,(int,float)) and not isinstance(val,bool): return True
    if not isinstance(val,str): return False
    s=val.strip().replace('.','').replace(',','').replace('%','').replace('đ','').replace('₫','').replace('−','-').replace('–','-')
    return bool(re.fullmatch(r'-?\d+',s))

def excel_sheet(ws,spec):
    from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
    from openpyxl.chart import BarChart,LineChart,Reference
    thin=Side(border_style='thin',color='CBD5E1')
    med_bottom=Side(border_style='medium',color='1E3A8A')
    grid_border=Border(left=thin,right=thin,top=thin,bottom=thin)
    header_border=Border(left=thin,right=thin,top=thin,bottom=med_bottom)
    header_fill=PatternFill('solid',fgColor='1E3A8A')
    zebra_fill=PatternFill('solid',fgColor='F8FAFC')
    total_fill=PatternFill('solid',fgColor='DBEAFE')
    ws.views.sheetView[0].showGridLines=True

    if 'rows' in spec:
        rows=grid(spec['rows'])
        for i,row in enumerate(rows,1):
            is_tot=i>1 and _is_total_row(row)
            ws.row_dimensions[i].height=28 if i==1 else (24 if is_tot else 21)
            for j,value in enumerate(row,1):
                c=ws.cell(i,j)
                cell_value(c,value)
                if i==1:
                    c.font=Font(name='Arial',size=11,bold=True,color='FFFFFF')
                    c.fill=header_fill
                    c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
                    c.border=header_border
                else:
                    is_num=isinstance(value,(int,float)) and not isinstance(value,bool)
                    c.font=Font(name='Arial',size=10.5,bold=is_tot,color='1E3A8A' if is_tot else '0F172A')
                    c.fill=total_fill if is_tot else (zebra_fill if i%2==0 else PatternFill(fill_type=None))
                    c.alignment=Alignment(
                        horizontal='right' if is_num else ('center' if j==1 and len(str(value or ''))<=6 else 'left'),
                        vertical='center',
                        wrap_text=True
                    )
                    c.border=grid_border
                    if is_num and isinstance(value,int) and abs(value)>=1000:
                        c.number_format='#,##0'
                    elif is_num and isinstance(value,float):
                        c.number_format='#,##0.00' if abs(value)>=100 else '0.0'
        ws.freeze_panes='A2'
        ws.auto_filter.ref=ws.dimensions
        for col in ws.columns:
            max_len=max(len(str(c.value or '')) for c in col[:100])
            ws.column_dimensions[col[0].column_letter].width=min(52,max(12,max_len+4))

    for change in items(spec.get('cells',[]),5000):
        addr=text(change.get('cell',''))
        if not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,5}',addr):raise ValueError('Địa chỉ ô không hợp lệ.')
        cell_value(ws[addr],change.get('value'))
    for f in items(spec.get('formulas',[]),5000):
        addr=text(f.get('cell',''));formula=text(f.get('formula',''))
        if not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,5}',addr) or not formula.startswith('='):raise ValueError('Công thức cần ô đích và dấu =.')
        if re.search(r'\[|\]|https?://|file:|\\|\||\b(?:WEBSERVICE|HYPERLINK|RTD|DDE|CALL|REGISTER)\s*\(',formula,re.I):raise ValueError('Chỉ hỗ trợ công thức trong sổ tính, không gọi dữ liệu bên ngoài.')
        ws[addr]=formula
        ws[addr].font=Font(name='Arial',size=10.5,bold=True,color='1E3A8A')
    for m in items(spec.get('merges',[]),100):ws.merge_cells(text(m))
    for chart in items(spec.get('charts',[]),8):
        bounds=[int(chart.get(k,d)) for k,d in [('minRow',1),('maxRow',ws.max_row),('minCol',2),('maxCol',ws.max_column),('categoryCol',1)]]
        r1,r2,c1,c2,cat=bounds
        if not(1<=r1<r2<=ws.max_row and 1<=c1<=c2<=ws.max_column and 1<=cat<=ws.max_column):raise ValueError('Vùng biểu đồ không hợp lệ.')
        ch=LineChart() if chart.get('type')=='line' else BarChart();ch.title=text(chart.get('title','Biểu đồ'))
        ch.add_data(Reference(ws,min_col=c1,max_col=c2,min_row=r1,max_row=r2),titles_from_data=True)
        ch.set_categories(Reference(ws,min_col=cat,min_row=r1+1,max_row=r2));ws.add_chart(ch,text(chart.get('anchor','H2')))

def _style_word_doc(obj,spec):
    from docx.shared import Pt,Cm,RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT,WD_ALIGN_VERTICAL
    from docx.oxml import OxmlElement,parse_xml as oxml_parse
    from docx.oxml.ns import nsdecls,qn

    normal=obj.styles['Normal']
    normal.font.name='Times New Roman'
    normal.font.size=Pt(13)
    normal.font.color.rgb=RGBColor(0x0F,0x17,0x2A)
    normal.paragraph_format.line_spacing=1.25
    normal.paragraph_format.space_after=Pt(4)

    for lvl,(sz,col) in {1:(14,'1E3A8A'),2:(13.5,'0F172A'),3:(13,'334155')}.items():
        st=obj.styles[f'Heading {lvl}']
        st.font.name='Times New Roman'
        st.font.size=Pt(sz)
        st.font.bold=True
        st.font.color.rgb=RGBColor.from_string(col)
        st.paragraph_format.space_before=Pt(10 if lvl==1 else 6)
        st.paragraph_format.space_after=Pt(4)
        st.paragraph_format.keep_with_next=True

    sec=obj.sections[0]
    sec.page_width=Cm(21);sec.page_height=Cm(29.7)
    sec.top_margin=Cm(2);sec.bottom_margin=Cm(2)
    sec.left_margin=Cm(3);sec.right_margin=Cm(1.5)

    def shade_cell(cell,hex_color):
        tcPr=cell._tc.get_or_add_tcPr()
        tcPr.append(oxml_parse(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>'))

    def set_cell_margins(cell,top=100,bottom=100,left=140,right=140):
        tcPr=cell._tc.get_or_add_tcPr()
        tcMar=OxmlElement('w:tcMar')
        for m,val in [('top',top),('bottom',bottom),('left',left),('right',right)]:
            node=OxmlElement(f'w:{m}');node.set(qn('w:w'),str(val));node.set(qn('w:type'),'dxa');tcMar.append(node)
        tcPr.append(tcMar)

    if spec.get('title'):
        tp=obj.add_heading(text(spec['title']),0)
        tp.alignment=WD_ALIGN_PARAGRAPH.CENTER
        for r in tp.runs:
            r.font.name='Times New Roman';r.font.size=Pt(16);r.font.bold=True;r.font.color.rgb=RGBColor(0x1E,0x3A,0x8A)
        tp.paragraph_format.space_after=Pt(10)

    for block in items(spec.get('blocks',[]),1000):
        kind=block.get('type','paragraph')
        if kind=='heading':
            lvl=max(1,min(3,int(block.get('level',1))))
            h=obj.add_heading(text(block['text']),lvl)
            for r in h.runs:
                r.font.name='Times New Roman'
                r.font.color.rgb=RGBColor(0x1E,0x3A,0x8A) if lvl==1 else RGBColor(0x0F,0x17,0x2A)
        elif kind=='paragraph':
            raw_t=text(block['text'])
            p=obj.add_paragraph()
            m_label=re.match(r'^([A-ZÀ-Ỹa-zà-ỹ0-9_\s()/.-]{2,35}:)(\s+.+)$',raw_t)
            if m_label and not raw_t.startswith('http'):
                r1=p.add_run(m_label.group(1));r1.bold=True;r1.font.color.rgb=RGBColor(0x1E,0x3A,0x8A)
                p.add_run(m_label.group(2))
            else:
                p.add_run(raw_t)
            if re.match(r'^(?:Lưu ý|Ghi chú|Kết luận|Mục tiêu|Yêu cầu cần đạt| Trọng tâm)\s*:',raw_t,re.I):
                pPr=p._p.get_or_add_pPr()
                pPr.append(oxml_parse(f'<w:shd {nsdecls("w")} w:fill="EEF2FF"/>'))
                p.paragraph_format.left_indent=Cm(0.4);p.paragraph_format.right_indent=Cm(0.4)
        elif kind=='list':
            ordered=bool(block.get('ordered'))
            for v in items(block['items'],200):
                lp=obj.add_paragraph(style='List Number' if ordered else 'List Bullet')
                item_t=text(v)
                m_lbl=re.match(r'^([^:]{2,35}:)(\s+.+)$',item_t)
                if m_lbl:
                    r1=lp.add_run(m_lbl.group(1));r1.bold=True;lp.add_run(m_lbl.group(2))
                else:
                    lp.add_run(item_t)
        elif kind=='table':
            rows=grid(block['rows']);table=obj.add_table(rows=0,cols=len(rows[0]));table.style='Table Grid'
            table.alignment=WD_TABLE_ALIGNMENT.CENTER
            for i,row in enumerate(rows):
                tr=table.add_row()
                trPr=tr._tr.get_or_add_trPr()
                trPr.append(OxmlElement('w:cantSplit'))
                if i==0: trPr.append(OxmlElement('w:tblHeader'))
                is_tot=i>0 and _is_total_row(row)
                for j,(cell,value) in enumerate(zip(tr.cells,row)):
                    val_str='' if value is None else str(value)
                    cell.text=val_str
                    cell.vertical_alignment=WD_ALIGN_VERTICAL.CENTER
                    set_cell_margins(cell,90,90,120,120)
                    p=cell.paragraphs[0]
                    p.paragraph_format.space_after=Pt(0);p.paragraph_format.line_spacing=1.15
                    if i==0:
                        shade_cell(cell,'1E3A8A')
                        p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                        for run in p.runs:
                            run.bold=True;run.font.name='Times New Roman';run.font.size=Pt(12);run.font.color.rgb=RGBColor(0xFF,0xFF,0xFF)
                    else:
                        if is_tot: shade_cell(cell,'DBEAFE')
                        elif i%2==0: shade_cell(cell,'F8FAFC')
                        if _is_numeric_str(value) and j>0:
                            p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
                        elif j==0 and len(val_str)<=6:
                            p.alignment=WD_ALIGN_PARAGRAPH.CENTER
                        for run in p.runs:
                            run.font.name='Times New Roman';run.font.size=Pt(12);run.bold=is_tot
                            if is_tot: run.font.color.rgb=RGBColor(0x1E,0x3A,0x8A)
        elif kind=='page_break':
            obj.add_page_break()

def _slide_image(image, accent):
    """Decode an approved image snapshot, or draw a neutral educational illustration offline."""
    from PIL import Image, ImageDraw
    import base64
    if image:
        try:
            data=base64.b64decode(image.get('data',''),validate=True)
            if len(data)>5*1024*1024:raise ValueError('Ảnh vượt 5 MB.')
            with Image.open(io.BytesIO(data)) as pic:
                if pic.format not in ('PNG','JPEG') or pic.width*pic.height>20000000:raise ValueError('Ảnh không hợp lệ.')
                pic.verify()
            return io.BytesIO(data)
        except Exception as e:raise ValueError('Không đọc được ảnh slide PNG/JPG.') from e
    # A vector-like book illustration, explicitly decorative rather than a claimed subject photo.
    im=Image.new('RGB',(1200,1000),'#EEF2F0');d=ImageDraw.Draw(im)
    d.ellipse((170,70,1090,990),fill='#DFE8E4')
    d.ellipse((300,800,1010,910),fill='#CBD8D1')
    d.rounded_rectangle((265,650,980,810),radius=32,fill=accent)
    d.rounded_rectangle((300,679,980,780),radius=16,fill='#FCFBF7')
    for y in (700,725,750):d.line((340,y,940,y),fill='#D7DDD8',width=4)
    d.rounded_rectangle((220,505,900,650),radius=26,fill='#B39A74')
    d.rounded_rectangle((250,530,900,620),radius=14,fill='#FFFDF8')
    d.polygon([(260,300),(585,345),(585,560),(260,510)],fill='#FFFDF8')
    d.polygon([(585,345),(930,260),(930,480),(585,560)],fill='#E9EDE7')
    d.line((585,345,585,560),fill=accent,width=8)
    for y in (350,390,430):d.line((310,y,540,y+34),fill='#B9C8BE',width=7)
    for y in (330,370,410):d.line((635,y+15,870,y-44),fill='#B9C8BE',width=7)
    d.ellipse((205,150,285,230),fill='#D2B58B')
    d.line((970,160,970,260),fill=accent,width=10);d.line((920,210,1020,210),fill=accent,width=10)
    buf=io.BytesIO();im.save(buf,format='PNG');buf.seek(0);return buf

def _build_powerpoint_deck(obj,spec):
    from pptx.util import Inches,Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN,MSO_ANCHOR
    from pptx.enum.shapes import MSO_SHAPE

    obj.slide_width=Inches(13.333);obj.slide_height=Inches(7.5)
    slides=items(spec.get('slides',[]),100)
    if not slides:raise ValueError('Cần ít nhất một slide.')

    # Bảng màu Sư phạm Hiện đại (60% nền sáng sạch - 30% cấu trúc Navy/Indigo - 10% điểm nhấn)
    C_BG=RGBColor(0xF8,0xFA,0xFC)
    C_CARD=RGBColor(0xFF,0xFF,0xFF)
    C_NAVY=RGBColor(0x1E,0x3A,0x8A)
    C_INDIGO=RGBColor(0x4F,0x46,0xE5)
    C_TEXT=RGBColor(0x0F,0x17,0x2A)
    C_MUTED=RGBColor(0x47,0x55,0x69)
    C_LINE=RGBColor(0xCB,0xD5,0xE1)
    C_ZEBRA=RGBColor(0xF1,0xF5,0xF9)
    C_BADGE_BG=RGBColor(0xEE,0xF2,0xFF)

    ACCENTS=[
        (RGBColor(0x4F,0x46,0xE5),RGBColor(0xEE,0xF2,0xFF)), # Indigo
        (RGBColor(0x05,0x96,0x69),RGBColor(0xEC,0xFD,0xF5)), # Emerald
        (RGBColor(0xD9,0x77,0x06),RGBColor(0xFF,0xFB,0xEB)), # Amber
        (RGBColor(0x7C,0x3A,0xED),RGBColor(0xF5,0xF3,0xFF)), # Violet
        (RGBColor(0xE1,0x1D,0x48),RGBColor(0xFF,0xF1,0xF2)), # Rose
        (RGBColor(0x02,0x84,0xC7),RGBColor(0xF0,0xF9,0xFF)), # Sky
    ]

    palette={
        'navy':('F7F8FA','20364B','477A83','EDF3F4'),
        'sage':('F6F8F4','294C40','537D66','E8F0E8'),
        'sand':('FAF8F3','51443A','98724E','F0E9DD'),
    }.get(spec.get('theme','navy'))
    if palette is None:raise ValueError('Bảng màu slide không hợp lệ.')
    C_BG,C_NAVY,C_INDIGO,C_BADGE_BG=[RGBColor.from_string(c) for c in palette]
    ACCENTS=[(C_INDIGO,C_BADGE_BG),(C_NAVY,C_ZEBRA)]

    def add_rect(slide,shape_type,x,y,w,h,fill_rgb,border_rgb=None):
        sh=slide.shapes.add_shape(shape_type,Inches(x),Inches(y),Inches(w),Inches(h))
        sh.fill.solid();sh.fill.fore_color.rgb=fill_rgb
        if border_rgb:
            sh.line.color.rgb=border_rgb;sh.line.width=Pt(1)
        else:
            sh.line.fill.background()
        return sh

    def split_title_badge(raw_title,idx,total):
        m=re.match(r'^((?:HOẠT ĐỘNG|BƯỚC|CHUYÊN GIA NHÓM|PHẦN|CHỦ ĐỀ|BÀI|MỤC|I{1,3}|IV|V)\s*[^:.\-]{0,18})\s*[:.\-]\s*(.+)$',raw_title,re.I)
        if m: return m.group(1).strip().upper(),m.group(2).strip()
        if idx==0: return 'BÀI GIẢNG & BÁO CÁO CHUYÊN ĐỀ',raw_title
        if idx==total-1: return 'TỔNG KẾT & NHIỆM VỤ',raw_title
        return f'NỘI DUNG {idx+1:02d}',raw_title

    def split_label_body(b_text,idx):
        m=re.match(r'^([^:]{2,42}):\s*(.+)$',b_text)
        if m: return m.group(1).strip(),m.group(2).strip()
        return f'Điểm chính {idx+1}',b_text

    total_slides=len(slides)
    for idx,s in enumerate(slides):
        slide=obj.slides.add_slide(obj.slide_layouts[6])
        # Nền slide sáng tinh tế
        add_rect(slide,MSO_SHAPE.RECTANGLE,0,0,13.333,7.5,C_BG)

        raw_title=text(s.get('title',''))
        badge_str,clean_title=split_title_badge(raw_title,idx,total_slides)
        if s.get('badge'): badge_str=text(s['badge']).upper()
        has_rows=bool(s.get('rows'))
        bullets=items(s.get('bullets',[]),8) if not has_rows else []

        # Kiểm tra nếu là Slide bìa (Slide 1 và không chứa bảng số liệu)
        is_cover=(idx==0 and not has_rows and not s.get('layout')) or s.get('layout')=='cover'
        is_visual=bool(s.get('image')) or s.get('layout')=='visual' or is_cover

        if is_visual and not has_rows:
            # Editorial split: an embedded image, editable text and blocks, generous whitespace.
            add_rect(slide,MSO_SHAPE.RECTANGLE,0,0,0.12,7.5,C_INDIGO)
            add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,7.35,0.55,5.35,6.4,C_CARD)
            image=_slide_image(s.get('image'),'#'+palette[2])
            picture=slide.shapes.add_picture(image,Inches(7.55),Inches(1.08))
            scale=min(Inches(4.95)/picture.width,Inches(4.7)/picture.height)
            picture.width=int(picture.width*scale);picture.height=int(picture.height*scale)
            picture.left=Inches(7.55)+int((Inches(4.95)-picture.width)/2)
            picture.top=Inches(1.08)+int((Inches(4.7)-picture.height)/2)
            def label(content,x,y,w,h,size,color,bold=False):
                tf=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)).text_frame
                tf.word_wrap=True;tf.margin_left=0;tf.margin_right=0
                pp=tf.paragraphs[0];pp.text=content;pp.font.name='Arial';pp.font.size=Pt(size);pp.font.bold=bold;pp.font.color.rgb=color
                return tf
            label(badge_str,0.7,0.65,6.1,0.45,11,C_INDIGO,True)
            label(clean_title,0.7,1.35,6.05,1.5,30 if len(clean_title)<50 else 24,C_NAVY,True)
            # Limit visible copy, retaining every supplied point in speaker notes.
            shown=bullets[:3]
            for bi,b in enumerate(shown):
                cx=0.7;cy=3.18+bi*1.04
                add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,5.95,0.9,C_CARD,C_LINE)
                add_rect(slide,MSO_SHAPE.RECTANGLE,cx,cy,0.06,0.9,C_INDIGO)
                content=text(b)
                label(content if len(content)<=165 else content[:162]+'…',cx+0.2,cy+0.09,5.55,0.72,15,C_TEXT)
            caption=text(s.get('image',{}).get('caption','Minh họa học tập'))
            label(caption[:180],7.65,6.0,4.75,0.65,11,C_MUTED)
            label(f'{idx+1:02d} / {total_slides:02d}',0.7,6.93,2,0.25,10,C_MUTED)
            slide.notes_slide.notes_text_frame.text='\n\n'.join(filter(None,[text(s.get('notes','')),'\n'.join(text(b) for b in bullets)]))
            continue
        # SLIDE NỘI DUNG: Thanh頂 accent + Badge + Tiêu đề phân cấp + Chân trang
        add_rect(slide,MSO_SHAPE.RECTANGLE,0,0,13.333,0.12,C_NAVY)
        pill=add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,0.65,0.32,3.6,0.38,C_BADGE_BG)
        ptf=pill.text_frame;pp=ptf.paragraphs[0];pp.text=badge_str
        pp.font.name='Arial';pp.font.size=Pt(10.5);pp.font.bold=True;pp.font.color.rgb=C_INDIGO

        # Số trang góc phải trên
        num_pill=add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,11.75,0.32,0.95,0.38,C_ZEBRA)
        ntf=num_pill.text_frame;np=ntf.paragraphs[0];np.text=f'{idx+1:02d} / {total_slides:02d}';np.alignment=PP_ALIGN.CENTER
        np.font.name='Arial';np.font.size=Pt(10.5);np.font.bold=True;np.font.color.rgb=C_MUTED

        # Tiêu đề slide
        title_tf=slide.shapes.add_textbox(Inches(0.65),Inches(0.74),Inches(12.0),Inches(0.72)).text_frame
        title_tf.word_wrap=True
        tp=title_tf.paragraphs[0];tp.text=clean_title if clean_title else raw_title
        tp.font.name='Arial';tp.font.size=Pt(25 if len(tp.text)<=55 else 21);tp.font.bold=True;tp.font.color.rgb=C_NAVY

        # Đường kẻ mảnh phân cách header
        add_rect(slide,MSO_SHAPE.RECTANGLE,0.65,1.48,12.03,0.02,C_LINE)

        if has_rows:
            rows=grid(s['rows'])
            if len(rows)>12 or len(rows[0])>8:raise ValueError('Bảng slide tối đa 12 hàng và 8 cột; hãy chia slide.')
            tbl_h=min(4.3 if s.get('bullets') else 5.1,max(2.2,0.48*len(rows)))
            table_shape=slide.shapes.add_table(len(rows),len(rows[0]),Inches(0.65),Inches(1.68),Inches(12.03),Inches(tbl_h))
            table=table_shape.table
            for i,row in enumerate(rows):
                is_tot=i>0 and _is_total_row(row)
                for j,v in enumerate(row):
                    cell=table.cell(i,j)
                    val_s='' if v is None else str(v)
                    cell.text=val_s
                    cell.vertical_anchor=MSO_ANCHOR.MIDDLE
                    cell.fill.solid()
                    if i==0:
                        cell.fill.fore_color.rgb=C_NAVY
                    elif is_tot:
                        cell.fill.fore_color.rgb=RGBColor(0xDB,0xEA,0xFE)
                    elif i%2==1:
                        cell.fill.fore_color.rgb=C_CARD
                    else:
                        cell.fill.fore_color.rgb=C_ZEBRA
                    p=cell.text_frame.paragraphs[0]
                    if i==0:
                        p.alignment=PP_ALIGN.CENTER
                    elif _is_numeric_str(v) and j>0:
                        p.alignment=PP_ALIGN.RIGHT
                    elif j==0 and len(val_s)<=8:
                        p.alignment=PP_ALIGN.CENTER
                    else:
                        p.alignment=PP_ALIGN.LEFT
                    for run in p.runs:
                        run.font.name='Arial'
                        run.font.size=Pt(14 if len(rows)<=7 else 12.5)
                        run.font.bold=(i==0 or is_tot)
                        run.font.color.rgb=RGBColor(0xFF,0xFF,0xFF) if i==0 else (C_NAVY if is_tot else C_TEXT)
            if s.get('bullets'):
                # Chú thích dưới bảng nếu có
                note_card=add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,0.65,1.8+tbl_h,12.03,0.75,C_BADGE_BG,RGBColor(0xC7,0xD2,0xFE))
                ntf2=note_card.text_frame;ntf2.word_wrap=True
                np2=ntf2.paragraphs[0];np2.text='💡 ' + ' | '.join(text(x) for x in items(s['bullets'],4))
                np2.font.name='Arial';np2.font.size=Pt(13.5);np2.font.color.rgb=C_NAVY
        else:
            # Tự động chọn Bố cục Thẻ (Bento Cards) theo đặc trưng nội dung
            is_quiz=any(re.match(r'^(?:Câu\s*\d+|->\s*Đáp\s*án|Đáp\s*án)',text(b).strip(),re.I) for b in bullets)
            n_b=len(bullets)

            if is_quiz:
                # Bố cục Câu hỏi & Thẻ Đáp án nổi bật
                cy=1.72
                card_h=min(1.15,(5.1 - 0.16*max(0,n_b-1))/max(1,n_b))
                for bi,b in enumerate(bullets):
                    b_str=text(b).strip()
                    is_ans=bool(re.match(r'^(?:->\s*Đáp\s*án|Đáp\s*án|\*)',b_str,re.I))
                    bg_col=RGBColor(0xEC,0xFD,0xF5) if is_ans else C_CARD
                    bd_col=RGBColor(0x10,0xB9,0x81) if is_ans else C_LINE
                    stripe_col=RGBColor(0x05,0x96,0x69) if is_ans else C_INDIGO
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,0.65,cy,12.03,card_h,bg_col,bd_col)
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,0.65,cy,0.14,card_h,stripe_col)
                    qtf=slide.shapes.add_textbox(Inches(0.95),Inches(cy+0.12),Inches(11.55),Inches(card_h-0.2)).text_frame
                    qtf.word_wrap=True
                    qp=qtf.paragraphs[0];qp.text=b_str
                    qp.font.name='Arial';qp.font.size=Pt(17 if is_ans else 18);qp.font.bold=True
                    qp.font.color.rgb=RGBColor(0x06,0x5F,0x46) if is_ans else C_TEXT
                    cy+=card_h+0.16
            elif n_b==3:
                # Bố cục 3 cột chuyên gia (3-Column Bento Cards)
                card_w=3.82;gap_x=0.28;card_h=4.95;cy=1.75
                for bi,b in enumerate(bullets):
                    cx=0.65 + bi*(card_w+gap_x)
                    acc_fg,acc_bg=ACCENTS[bi%len(ACCENTS)]
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,card_h,C_CARD,C_LINE)
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,0.14,acc_fg)
                    num_b=add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx+0.25,cy+0.32,0.58,0.44,acc_bg)
                    n_tf=num_b.text_frame;n_p=n_tf.paragraphs[0];n_p.text=f'0{bi+1}';n_p.alignment=PP_ALIGN.CENTER
                    n_p.font.name='Arial';n_p.font.size=Pt(13);n_p.font.bold=True;n_p.font.color.rgb=acc_fg

                    lbl,body=split_label_body(text(b),bi)
                    ctf=slide.shapes.add_textbox(Inches(cx+0.25),Inches(cy+0.92),Inches(card_w-0.5),Inches(card_h-1.1)).text_frame
                    ctf.word_wrap=True
                    p1=ctf.paragraphs[0];p1.text=lbl
                    p1.font.name='Arial';p1.font.size=Pt(18);p1.font.bold=True;p1.font.color.rgb=acc_fg;p1.space_after=Pt(10)
                    p2=ctf.add_paragraph();p2.text=body
                    p2.font.name='Arial';p2.font.size=Pt(15.5);p2.font.color.rgb=C_TEXT;p2.space_after=Pt(6)
            elif n_b==4:
                # Bố cục Lưới 2x2 Bento Cards hiện đại (thay thế hoàn toàn 4 gạch đầu dòng đơn điệu!)
                card_w=5.86;card_h=2.38;gap_x=0.31;gap_y=0.26
                for bi,b in enumerate(bullets):
                    r_i=bi//2;c_i=bi%2
                    cx=0.65 + c_i*(card_w+gap_x)
                    cy=1.74 + r_i*(card_h+gap_y)
                    acc_fg,acc_bg=ACCENTS[bi%len(ACCENTS)]
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,card_h,C_CARD,C_LINE)
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,0.14,card_h,acc_fg)

                    lbl,body=split_label_body(text(b),bi)
                    # Badge số thứ tự + tiêu đề thẻ
                    badge_box=add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx+0.28,cy+0.22,0.48,0.38,acc_bg)
                    btf=badge_box.text_frame;bp=btf.paragraphs[0];bp.text=f'0{bi+1}';bp.alignment=PP_ALIGN.CENTER
                    bp.font.name='Arial';bp.font.size=Pt(11.5);bp.font.bold=True;bp.font.color.rgb=acc_fg

                    htf=slide.shapes.add_textbox(Inches(cx+0.84),Inches(cy+0.18),Inches(card_w-1.02),Inches(0.5)).text_frame
                    htf.word_wrap=True
                    hp=htf.paragraphs[0];hp.text=lbl
                    hp.font.name='Arial';hp.font.size=Pt(17);hp.font.bold=True;hp.font.color.rgb=acc_fg

                    btf2=slide.shapes.add_textbox(Inches(cx+0.28),Inches(cy+0.74),Inches(card_w-0.48),Inches(card_h-0.86)).text_frame
                    btf2.word_wrap=True
                    bp2=btf2.paragraphs[0];bp2.text=body
                    bp2.font.name='Arial';bp2.font.size=Pt(15.5);bp2.font.color.rgb=C_TEXT
            elif n_b==2:
                # Bố cục 2 Cột đối xứng (2-Column Split Cards)
                card_w=5.86;card_h=4.95;gap_x=0.31;cy=1.74
                for bi,b in enumerate(bullets):
                    cx=0.65 + bi*(card_w+gap_x)
                    acc_fg,acc_bg=ACCENTS[bi%len(ACCENTS)]
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,card_h,C_CARD,C_LINE)
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,0.14,acc_fg)
                    lbl,body=split_label_body(text(b),bi)
                    ctf=slide.shapes.add_textbox(Inches(cx+0.32),Inches(cy+0.35),Inches(card_w-0.64),Inches(card_h-0.55)).text_frame
                    ctf.word_wrap=True
                    p1=ctf.paragraphs[0];p1.text=lbl
                    p1.font.name='Arial';p1.font.size=Pt(20);p1.font.bold=True;p1.font.color.rgb=acc_fg;p1.space_after=Pt(12)
                    p2=ctf.add_paragraph();p2.text=body
                    p2.font.name='Arial';p2.font.size=Pt(17);p2.font.color.rgb=C_TEXT
            else:
                # Bố cục danh sách thẻ ngang hoặc lưới 2 cột cho 1 hoặc 5..8 mục
                cols=2 if n_b>=5 else 1
                rows_cnt=math.ceil(max(1,n_b)/cols)
                card_w=5.86 if cols==2 else 12.03
                gap_y=0.16;gap_x=0.31
                card_h=min(1.35,(5.0 - gap_y*max(0,rows_cnt-1))/max(1,rows_cnt))
                for bi,b in enumerate(bullets):
                    r_i=bi//cols;c_i=bi%cols
                    cx=0.65 + c_i*(card_w+gap_x)
                    cy=1.74 + r_i*(card_h+gap_y)
                    acc_fg,acc_bg=ACCENTS[bi%len(ACCENTS)]
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,card_w,card_h,C_CARD,C_LINE)
                    add_rect(slide,MSO_SHAPE.ROUNDED_RECTANGLE,cx,cy,0.12,card_h,acc_fg)
                    lbl,body=split_label_body(text(b),bi)
                    ctf=slide.shapes.add_textbox(Inches(cx+0.26),Inches(cy+0.12),Inches(card_w-0.42),Inches(card_h-0.24)).text_frame
                    ctf.word_wrap=True
                    cp=ctf.paragraphs[0]
                    r1=cp.add_run();r1.text=lbl+': ';r1.font.name='Arial';r1.font.size=Pt(15.5);r1.font.bold=True;r1.font.color.rgb=acc_fg
                    r2=cp.add_run();r2.text=body;r2.font.name='Arial';r2.font.size=Pt(15.5);r2.font.color.rgb=C_TEXT

        if s.get('notes'):
            slide.notes_slide.notes_text_frame.text=text(s['notes'])

def office_job(req):
    output=Path(req['output']);spec=req.get('document')
    if not isinstance(spec,dict):raise ValueError('Thiếu cấu trúc tài liệu.')
    ext=output.suffix.lower()
    if ext not in ['.docx','.xlsx','.pptx']:raise ValueError('Chỉ tạo DOCX, XLSX hoặc PPTX.')
    if output.exists():raise ValueError('Tệp đích đã tồn tại; chọn tên mới.')
    if req['op']=='edit_excel':
        from openpyxl import load_workbook
        source=Path(req['path'])
        if source.suffix.lower()!='.xlsx' or ext!='.xlsx' or source.resolve()==output.resolve():raise ValueError('Chỉ sửa bản sao XLSX.')
        from documents import bounded_zip
        with bounded_zip(source):pass
        book=load_workbook(source)
        for sh in items(spec.get('sheets',[]),30):
            if sh['name'] not in book.sheetnames:raise ValueError('Không có sheet '+sh['name'])
            excel_sheet(book[sh['name']],sh)
        obj=book
    elif ext=='.docx':
        from docx import Document
        obj=Document()
        _style_word_doc(obj,spec)
    elif ext=='.xlsx':
        from openpyxl import Workbook
        obj=Workbook();obj.remove(obj.active)
        sheets=items(spec.get('sheets',[]),30)
        if not sheets:raise ValueError('Cần ít nhất một sheet.')
        for sh in sheets:excel_sheet(obj.create_sheet(text(sh['name'])),sh)
    else:
        from pptx import Presentation
        obj=Presentation()
        _build_powerpoint_deck(obj,spec)
    buffer=io.BytesIO();obj.save(buffer)
    with open(output,'xb') as f:f.write(buffer.getvalue())
    return {'output':str(output),'bytes':len(buffer.getvalue()),'note':'Excel sẽ tính lại công thức khi mở tệp.' if ext=='.xlsx' else ''}

# Direct editors modify only selected XML parts, retaining all other ZIP members.
def editor_job(req):
    import zipfile, hashlib, posixpath, json
    from lxml import etree as E
    from documents import bounded_zip
    file=Path(req['path']);kind=file.suffix.lower()
    if kind not in ('.xlsx','.docx','.pptx'):raise ValueError('Chỉ hỗ trợ XLSX, DOCX, PPTX.')
    digest=hashlib.sha256(file.read_bytes()).hexdigest()
    parser=E.XMLParser(resolve_entities=False,no_network=True,remove_blank_text=False)
    ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    groups=[];nodes={};trees={}
    with bounded_zip(file) as z:
        if any(n.startswith('_xmlsignatures/') for n in z.namelist()):raise ValueError('Tệp có chữ ký số. Hãy chỉnh sửa trong Office.')
        def tree(part):
            if part not in trees:trees[part]=E.fromstring(z.read(part),parser)
            return trees[part]
        def relation(base,rid):
            rel=posixpath.join(posixpath.dirname(base),'_rels',posixpath.basename(base)+'.rels')
            rs=tree(rel)
            for r in rs:
                if r.get('Id')==rid and r.get('TargetMode')!='External':
                    target=r.get('Target','')
                    return target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base),target))
            raise ValueError('Không đọc được liên kết nội bộ của tài liệu.')
        def add_texts(part,label,xpath):
            entries=[]
            for i,node in enumerate(tree(part).xpath(xpath,namespaces=ns)):
                key=f'{part}#{i}';value=node.text or ''
                nodes[key]=(part,node,'text')
                parents=list(node.iterancestors());para=next((p for p in parents if E.QName(p).localname=='p'),None)
                block=tree(part).getroottree().getpath(para) if para is not None else key
                entry={'id':key,'label':f'Đoạn chữ {i+1}','value':value,'block':block}
                shape=next((p for p in parents if E.QName(p).localname=='sp'),None)
                if shape is not None:
                    off=shape.find('.//a:xfrm/a:off',ns);size=shape.find('.//a:xfrm/a:ext',ns)
                    if off is not None and size is not None:entry['box']=[int(off.get('x',0)),int(off.get('y',0)),int(size.get('cx',1)),int(size.get('cy',1))]
                entries.append(entry)
            groups.append({'id':part,'name':label,'entries':entries})
        if kind=='.xlsx':
            shared=[]
            if 'xl/sharedStrings.xml' in z.namelist():
                shared=[''.join(n.itertext()) for n in tree('xl/sharedStrings.xml').findall('s:si',ns)]
            for sheet in tree('xl/workbook.xml').findall('s:sheets/s:sheet',ns):
                part=relation('xl/workbook.xml',sheet.get('{'+ns['r']+'}id'));entries=[]
                for cell in tree(part).findall('.//s:sheetData/s:row/s:c',ns):
                    address=cell.get('r');v=cell.find('s:v',ns);formula=cell.find('s:f',ns);value=v.text if v is not None and v.text else ''
                    if cell.get('t')=='s':value=shared[int(value)] if value else ''
                    elif cell.get('t')=='inlineStr':value=''.join(cell.xpath('s:is//s:t/text()',namespaces=ns))
                    if formula is not None:value='='+(formula.text or '')
                    key=f'{part}#{address}';nodes[key]=(part,cell,'cell')
                    entries.append({'id':key,'label':address,'value':value,'locked':formula is not None and bool(formula.get('t'))})
                groups.append({'id':part,'name':sheet.get('name'),'entries':entries})
        elif kind=='.docx':
            add_texts('word/document.xml','Nội dung và bảng','//w:body//w:t')
        else:
            for i,slide in enumerate(tree('ppt/presentation.xml').findall('p:sldIdLst/p:sldId',ns)):
                part=relation('ppt/presentation.xml',slide.get('{'+ns['r']+'}id'))
                add_texts(part,f'Slide {i+1}','//a:t')
        if sum(len(g['entries']) for g in groups)>20000:raise ValueError('Tài liệu quá lớn cho trình sửa trực tiếp; hãy mở trong Office.')
        if req['op']=='office_editor_read':
            if not req.get('windowed'):return {'kind':kind[1:],'hash':digest,'groups':groups}
            # Window the UI by sheet rows / paragraph blocks / slides, not invented Word pages.
            group=max(0,min(int(req.get('group') or 0),max(0,len(groups)-1)))
            current=groups[group] if groups else {'entries':[]}
            entries=current['entries'];buckets={}
            for entry in entries:
                key=re.sub(r'^[A-Z]+','',entry['label']) if kind=='.xlsx' else entry.get('block',entry['id'])
                buckets.setdefault(key,[]).append(entry)
            chunks=[part[i:i+100] for part in buckets.values() for i in range(0,len(part),100)] if kind!='.xlsx' else list(buckets.values());limit=40 if kind=='.xlsx' else 24
            pages=max(1,(len(chunks)+limit-1)//limit);page=max(0,min(int(req.get('page') or 0),pages-1))
            visible=[e for block in chunks[page*limit:(page+1)*limit] for e in block]
            column=0;column_pages=1
            if kind=='.xlsx':
                def column_number(label):
                    n=0
                    for ch in re.sub(r'\d+$','',label):n=n*26+ord(ch)-64
                    return n
                columns=sorted(set(column_number(e['label']) for e in entries))
                column_pages=max(1,(len(columns)+15)//16);column=max(0,min(int(req.get('column') or 0),column_pages-1))
                allowed=set(columns[column*16:(column+1)*16]);visible=[e for e in visible if column_number(e['label']) in allowed]
            return {'kind':kind[1:],'hash':digest,'groups':[{'id':g['id'],'name':g['name'],'entries':visible if i==group else []} for i,g in enumerate(groups)],'group':group,'page':page,'pages':pages,'column':column,'columnPages':column_pages}

        if req.get('hash')!=digest:raise ValueError('Tệp nguồn đã thay đổi. Đóng và mở lại để tránh ghi sai nội dung.')
        edits=req.get('edits',[])
        if not isinstance(edits,list) or len(edits)>20000:raise ValueError('Danh sách chỉnh sửa không hợp lệ.')
        changed=set()
        for edit in edits:
            if edit.get('id') not in nodes:raise ValueError('Vị trí chỉnh sửa không hợp lệ.')
            part,node,typ=nodes[edit['id']];value=text(edit.get('value'))
            if typ=='text':node.text=value;node.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
            else:
                formula=node.find('s:f',ns)
                if formula is not None and formula.get('t'):raise ValueError('Công thức mảng/chung cần chỉnh trong Excel.')
                for c in list(node):
                    if E.QName(c).localname in ('f','v','is'):node.remove(c)
                node.attrib.pop('t',None)
                def child(tag):return E.SubElement(node,'{'+ns['s']+'}'+tag)
                if value.startswith('='):
                    child('f').text=value[1:]
                elif re.fullmatch(r'-?(?:0|[1-9]\d*)(?:\.\d+)?',value) and len(value.replace('-','').replace('.',''))<=15:child('v').text=value
                else:
                    node.set('t','inlineStr');t=E.SubElement(child('is'),'{'+ns['s']+'}t');t.text=value;t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
            changed.add(part)
        if kind=='.xlsx' and changed:
            wb=tree('xl/workbook.xml');calc=wb.find('s:calcPr',ns)
            if calc is None:calc=E.SubElement(wb,'{'+ns['s']+'}calcPr')
            calc.set('fullCalcOnLoad','1');calc.set('forceFullCalc','1');changed.add('xl/workbook.xml')
        out=Path(req['output'])
        if out.suffix.lower()!=kind or out.resolve()==file.resolve():raise ValueError('Phải lưu thành tệp mới cùng định dạng.')
        # Exclusive create prevents replacement of any existing file.
        with out.open('xb') as handle:
            try:
                with zipfile.ZipFile(handle,'w',zipfile.ZIP_DEFLATED) as dest:
                    for info in z.infolist():
                        content=E.tostring(trees[info.filename],encoding='UTF-8',xml_declaration=True) if info.filename in changed else z.read(info)
                        dest.writestr(info,content)
            except Exception:
                handle.close();out.unlink(missing_ok=True);raise
        return {'path':str(out),'changed':len(edits)}


def blank_office(req):
    """A genuinely blank document for opening in the installed Office app."""
    output = Path(req['output'])
    ext = output.suffix.lower()
    if ext == '.docx':
        from docx import Document
        obj = Document()
        obj.add_paragraph('')
    elif ext == '.xlsx':
        from openpyxl import Workbook
        obj = Workbook()
    elif ext == '.pptx':
        from pptx import Presentation
        obj = Presentation()
        obj.slides.add_slide(obj.slide_layouts[6])
    else:
        raise ValueError('Định dạng Office không hợp lệ.')
    buffer = io.BytesIO()
    obj.save(buffer)
    with output.open('xb') as stream:
        stream.write(buffer.getvalue())
    return {'path': str(output)}
