import {it,expect,vi} from 'vitest';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {embedDesktopAddin,matchesOfficeDocument,DESKTOP_ADDIN_ID,OFFICE_APPS} from '../src/desktop/office-launch';
import {OfficeLive} from '../src/desktop/office-live';
import * as launcher from '../src/desktop/office-launch';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
it.each(['word','excel','powerpoint'] as const)('embeds auto-open and a launch ticket in a new %s package',host=>{
 const rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="document.xml" Type="original"/></Relationships>';
 const raw=zipSync({'_rels/.rels':strToU8(rels),'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'),'document.xml':strToU8('original')});
 const parts=unzipSync(embedDesktopAddin(raw,host,'a'.repeat(64),'1.4.2.0')),base=`${OFFICE_APPS[host].part}/webextensions`;
 expect(strFromU8(parts['document.xml']!)).toBe('original');expect(strFromU8(parts['_rels/.rels']!)).toContain(`Target="${base}/taskpanes.xml"`);
 expect(strFromU8(parts[`${base}/webextension1.xml`]!)).toContain(DESKTOP_ADDIN_ID);expect(strFromU8(parts[`${base}/webextension1.xml`]!)).toContain('name="PVTA.LaunchTicket" value="&quot;'+ 'a'.repeat(64)+'&quot;"');
 expect(strFromU8(parts[`${base}/taskpanes.xml`]!)).toContain('visibility="1"');expect(strFromU8(parts['[Content_Types].xml']!)).toContain('application/vnd.ms-office.webextension+xml');
});
it('matches only the exact local document, including encoded Vietnamese paths',()=>{
 expect(matchesOfficeDocument('file:///Users/a/B%C3%A0i%20m%E1%BB%9Bi.docx','/Users/a/Bài mới.docx')).toBe(true);
 expect(matchesOfficeDocument('/Users/a/Bài mới.docx','/Users/a/Bài mới.docx')).toBe(true);
 expect(matchesOfficeDocument('file://other/Users/a/a.docx','/Users/a/a.docx')).toBe(false);
 expect(matchesOfficeDocument('/Users/b/a.docx','/Users/a/a.docx')).toBe(false);
});
it('launch creates a unique file after setup, rejects duplicate clicks and releases the lock on failure',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-launch-')),live=new OfficeLive(home,'assets',()=>{});
 const check=vi.spyOn(launcher,'assertOfficeInstalled').mockImplementation(()=>{}),create=vi.spyOn(launcher,'createOfficeDocument').mockResolvedValue(),open=vi.spyOn(launcher,'openOfficeDocument').mockResolvedValue();
 let finish!:()=>void;const setup=vi.spyOn(live,'installMac').mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({installed:true});}));
 try{const first=live.createAndOpen('word');await expect(live.createAndOpen('excel')).rejects.toThrow('Đang chuẩn bị');finish();const result=await first;expect(result.path).toMatch(/Word-.*\.docx$/);expect(create.mock.calls[0]?.[2]).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(result)).not.toContain(create.mock.calls[0]![2]);expect(open).toHaveBeenCalledWith(result.path,'word');
  setup.mockResolvedValue({installed:true});create.mockRejectedValueOnce(Error('Tạo tệp thất bại'));await expect(live.createAndOpen('excel')).rejects.toThrow('Tạo tệp');expect(open).toHaveBeenCalledTimes(1);await expect(live.createAndOpen('powerpoint')).resolves.toMatchObject({host:'powerpoint'});
  await expect(live.createAndOpen('shell')).rejects.toThrow('không hợp lệ');
 }finally{check.mockRestore();create.mockRestore();open.mockRestore();live.stop();fs.rmSync(home,{recursive:true,force:true});}
});
