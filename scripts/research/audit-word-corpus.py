#!/usr/bin/env python3
"""Read-only structural audit of locally obtained DOCX references; never executes macros.
Usage: python audit-word-corpus.py INPUT_DIR OUTPUT_JSON
Does not rate beauty or infer compliance from keyword matches. No source text is exported.
"""
import collections, hashlib, json, pathlib, sys, zipfile
import xml.etree.ElementTree as ET
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
MAX_XML = 20_000_000

def audit(file):
    raw = file.read_bytes()
    result = {'file': file.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes':len(raw), 'visual_review':False, 'compliance':'not_assessed'}
    try:
        with zipfile.ZipFile(file) as z:
            info = z.getinfo('word/document.xml')
            if info.file_size > MAX_XML: raise ValueError('Document XML exceeds limit')
            xml = z.read(info)
            if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml: raise ValueError('Unsupported XML declarations')
            root = ET.fromstring(xml)
            text = ' '.join(t.text or '' for t in root.iter(W+'t'))
            styles = collections.Counter(x.get(W+'val') for x in root.iter(W+'pStyle'))
            result.update(status='read', paragraphs=len(list(root.iter(W+'p'))),tables=len(list(root.iter(W+'tbl'))), paragraph_styles=dict(styles), heading_paragraphs=sum(v for k,v in styles.items() if k and k.lower().startswith('heading')), repeating_table_headers=len(list(root.iter(W+'tblHeader'))), fixed_height_rows=sum(x.get(W+'hRule')=='exact' for x in root.iter(W+'trHeight')), content_hash=hashlib.sha256(text.encode()).hexdigest(), mentions={'5512':'5512' in text,'digital_competence':'năng lực số' in text.lower(),'ai':'trí tuệ nhân tạo' in text.lower() or ' AI' in text}, sections=[{ET.QName(x.tag).text.split('}')[-1]:{k.split('}')[-1]:v for k,v in x.attrib.items()}} for sec in root.iter(W+'sectPr') for x in sec if x.tag in (W+'pgSz',W+'pgMar')])
    except (ValueError,KeyError,zipfile.BadZipFile,ET.ParseError) as e: result.update(status='failed',error=str(e))
    return result

def main():
    source,out=map(pathlib.Path,sys.argv[1:3]);rows=[audit(f) for f in sorted(source.rglob('*.docx')) if f.is_file() and not f.is_symlink()]
    hashes={};texts={}
    for row in rows:
        for key,seen,label in [('sha256',hashes,'duplicate_of'),('content_hash',texts,'same_text_as')]:
            if key not in row:continue
            if row[key] in seen:row[label]=seen[row[key]]
            else:seen[row[key]]=row['file']
    result={'files':len(rows),'unique_files':len(hashes),'unique_texts':len(texts),'target_lesson_plans':50,'note':'Counts include all inputs, including blank official forms. Keyword hits are screening only; do not count them as validated lessons or good designs.','documents':rows}
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(f'{len(rows)} DOCX audited; no visual or legal compliance claim.')
if __name__=='__main__':main()
