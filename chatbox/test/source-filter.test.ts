import {describe,it,expect} from 'vitest';
import {DEFAULT_QUERY,EMPTY_QUERY,ageText,bookCounts,filterSources,isFiltered,isFresh,matchingSegments,originLabel,refreshMessage,scopeCounts,scopeOf,sizeText,typeOf,type SourceFile} from '../src/source-filter';
const NOW=Date.UTC(2026,9,19,12,0,0);
const f=(id:string,name:string,o:Partial<SourceFile>={}):SourceFile=>({id,name,path:`/Users/gv/MySoft/${name}`,scope:'project',segments:[],...o});
const files:SourceFile[]=[
 f('1','HOW-TO-RELEASE.md',{at:NOW-3600_000,segments:[{ref:'Dòng 1',text:'Phát hành PVTA Studio trên MySoft'}]}),
 f('2','README.md',{at:NOW-5*86400_000,segments:[{ref:'Dòng 3',text:'Soạn giáo án, phiếu học tập'}]}),
 f('3','Bảng điểm lớp 8A.xlsx',{scope:'chat',at:NOW-60_000,segments:[{ref:'Sheet1',text:'Nguyễn Minh An 8,5'}]}),
 f('4','icon-32.png',{image:true,at:NOW-9*86400_000}),
 f('5','Đề cương.pdf',{purpose:'learning',scope:'project'}),
 f('6','Bài giảng.pptx',{scope:'chat'}),
];
describe('khung nguồn: loại và nơi lưu',()=>{
 it('mặc định chỉ hiện tài liệu; chọn Tất cả để xem cả icon',()=>{expect(filterSources(files,DEFAULT_QUERY).map(x=>x.id)).toEqual(['1','2','3','5','6']);expect(filterSources(files,EMPTY_QUERY)).toHaveLength(6);});
 it('nhận loại tệp theo đuôi và cờ ảnh',()=>{
  expect(files.map(x=>typeOf(x))).toEqual(['doc','doc','sheet','image','pdf','slide']);
  expect(typeOf({name:'a.CSV'})).toBe('sheet');expect(typeOf({name:'a.xyz'})).toBe('other');expect(typeOf({name:'x',image:true})).toBe('image');
 });
 it('lọc theo nơi lưu: Học hỏi tách riêng khỏi Dự án',()=>{
  expect(filterSources(files,{...EMPTY_QUERY,scope:'project'}).map(x=>x.id)).toEqual(['1','2','4']);
  expect(filterSources(files,{...EMPTY_QUERY,scope:'chat'}).map(x=>x.id)).toEqual(['3','6']);
  expect(filterSources(files,{...EMPTY_QUERY,scope:'learning'}).map(x=>x.id)).toEqual(['5']);
 });
 it('lọc theo loại',()=>{expect(filterSources(files,{...EMPTY_QUERY,type:'sheet'}).map(x=>x.id)).toEqual(['3']);expect(filterSources(files,{...EMPTY_QUERY,type:'image'}).map(x=>x.id)).toEqual(['4']);});
 it('số đếm theo nơi lưu tính trên kết quả đã lọc loại và tìm kiếm',()=>{
  expect(scopeCounts(files,EMPTY_QUERY)).toEqual({all:6,project:3,chat:2,learning:1,notebook:0});
  expect(scopeCounts(files,{...EMPTY_QUERY,type:'doc'})).toEqual({all:2,project:2,chat:0,learning:0,notebook:0});
 });
});
describe('khung nguồn: tìm kiếm',()=>{
 it('tìm theo tên hoặc đường dẫn, không phân biệt dấu và hoa thường',()=>{
  expect(filterSources(files,{...EMPTY_QUERY,query:'bang diem'}).map(x=>x.id)).toEqual(['3']);
  expect(filterSources(files,{...EMPTY_QUERY,query:'DE CUONG'}).map(x=>x.id)).toEqual(['5']);
  expect(filterSources(files,{...EMPTY_QUERY,query:'mysoft readme'}).map(x=>x.id)).toEqual(['2']);
 });
 it('chỉ tìm trong nội dung khi bật, và cần từ 2 ký tự',()=>{
  expect(filterSources(files,{...EMPTY_QUERY,query:'giao an'})).toEqual([]);
  expect(filterSources(files,{...EMPTY_QUERY,query:'giao an',content:true}).map(x=>x.id)).toEqual(['2']);
  // Truy vấn 1 ký tự chỉ khớp theo tên, dù bật tìm nội dung (tránh quét nội dung cho mỗi phím gõ đầu).
  expect(filterSources(files,{...EMPTY_QUERY,query:'a',content:true})).toEqual(filterSources(files,{...EMPTY_QUERY,query:'a'}));
  expect(filterSources(files,{...EMPTY_QUERY,query:'phieu hoc tap'})).toEqual([]);
 });
 it('trả về đoạn khớp để xem trước',()=>{
  const hit=matchingSegments(files[2]!,'minh an');expect(hit).toHaveLength(1);expect(hit[0]!.ref).toBe('Sheet1');
  expect(matchingSegments(files[2]!,'')).toEqual([]);expect(matchingSegments(files[3]!,'abc')).toEqual([]);
 });
 it('biết khi nào đang lọc',()=>{expect(isFiltered(EMPTY_QUERY)).toBe(false);expect(isFiltered({...EMPTY_QUERY,query:' x '})).toBe(true);expect(isFiltered({...EMPTY_QUERY,type:'pdf'})).toBe(true);expect(isFiltered({...EMPTY_QUERY,sort:'name'})).toBe(false);});
});
describe('khung nguồn: sắp xếp',()=>{
 it('theo tên, theo mức mới cập nhật, theo loại',()=>{
  expect(filterSources(files,{...EMPTY_QUERY,sort:'name'}).map(x=>x.name)).toEqual(['Bài giảng.pptx','Bảng điểm lớp 8A.xlsx','Đề cương.pdf','HOW-TO-RELEASE.md','icon-32.png','README.md']);
  expect(filterSources(files,{...EMPTY_QUERY,sort:'recent'}).map(x=>x.id).slice(0,4)).toEqual(['3','1','2','4']);
  expect(filterSources(files,{...EMPTY_QUERY,sort:'type'}).map(x=>typeOf(x))).toEqual(['doc','doc','image','pdf','sheet','slide']);
 });
 it('thứ tự mặc định giữ nguyên',()=>{expect(filterSources(files,EMPTY_QUERY).map(x=>x.id)).toEqual(['1','2','3','4','5','6']);});
});
describe('khung nguồn: hiển thị',()=>{
 it('nhãn Mới chỉ trong 24 giờ',()=>{expect(isFresh({at:NOW-3600_000},NOW)).toBe(true);expect(isFresh({at:NOW-2*86400_000},NOW)).toBe(false);expect(isFresh({},NOW)).toBe(false);expect(isFresh({at:NOW+5000},NOW)).toBe(false);});
 it('dung lượng và tuổi',()=>{
  expect(sizeText(512)).toBe('512 B');expect(sizeText(2048)).toBe('2 KB');expect(sizeText(5*1024*1024+300*1024)).toBe('5,3 MB');expect(sizeText()).toBe('');
  expect(ageText(NOW-30_000,NOW)).toBe('vừa xong');expect(ageText(NOW-5*60_000,NOW)).toBe('5 phút trước');expect(ageText(NOW-3*3600_000,NOW)).toBe('3 giờ trước');expect(ageText(NOW-4*86400_000,NOW)).toBe('4 ngày trước');expect(ageText(undefined,NOW)).toBe('');
 });
 it('câu báo sau khi cập nhật',()=>{
  const base={added:0,updated:0,removed:0,missing:[],errors:[],total:61,folders:2};
  expect(refreshMessage({...base,added:3,updated:1})).toBe('Đã cập nhật nguồn: thêm 3 tệp mới, đọc lại 1 tệp đã đổi.');
  expect(refreshMessage(base)).toBe('Không có tệp mới hoặc thay đổi (61 tài liệu, quét 2 thư mục).');
  expect(refreshMessage({...base,total:0,folders:0})).toMatch(/Chưa có tài liệu/);
  expect(refreshMessage({...base,removed:2,missing:['a.docx','b.docx','c.docx','d.docx']})).toMatch(/gỡ 2 tệp.*4 tệp đính kèm không còn trên máy: a\.docx, b\.docx, c\.docx…/);
 });
});

it('lọc nhanh Tài liệu kết hợp tìm không dấu và phạm vi, không lấy icon',()=>{
 expect(filterSources(files,{...EMPTY_QUERY,type:'documents'}).map(f=>f.id)).toEqual(['1','2','3','5','6']);
 expect(filterSources(files,{...EMPTY_QUERY,type:'documents',scope:'chat',query:'bang diem'}).map(f=>f.id)).toEqual(['3']);
 expect(filterSources(files,{...EMPTY_QUERY,type:'image',scope:'chat'})).toEqual([]);
});

describe('Tệp của sổ nguồn trong tài liệu ngữ cảnh',()=>{
 const nb=(id:string,name:string,book:string,over:Partial<SourceFile>={}):SourceFile=>({id,name,path:'',scope:'project',segments:[],notebook:{id:book,name:`Sổ ${book}`,sid:id,on:true,state:'san-sang'},...over});
 const mixed:SourceFile[]=[{id:'f1',name:'Giáo án.docx',path:'/g.docx',scope:'project',segments:[]},nb('n1','de-cuong.md','A'),nb('n2','de-cuong.md','B'),nb('n3','https://vi.wikipedia.org/x','B')];
 it('có phạm vi riêng và đếm đúng, tệp trùng tên giữ nguyên hai dòng',()=>{
  expect(scopeOf(mixed[1]!)).toBe('notebook');
  expect(scopeCounts(mixed,EMPTY_QUERY)).toEqual({all:4,project:1,chat:0,learning:0,notebook:3});
  expect(filterSources(mixed,{...EMPTY_QUERY,scope:'notebook'}).map(x=>x.id)).toEqual(['n1','n2','n3']);
 });
 it('lọc theo từng sổ và đếm số tệp mỗi sổ',()=>{
  expect(filterSources(mixed,{...EMPTY_QUERY,scope:'notebook',book:'B'}).map(x=>x.id)).toEqual(['n2','n3']);
  expect(bookCounts(mixed,EMPTY_QUERY)).toEqual([{id:'A',name:'Sổ A',count:1},{id:'B',name:'Sổ B',count:2}]);
  expect(isFiltered({...EMPTY_QUERY,book:'A'})).toBe(true);
 });
 it('nguồn không có đuôi tệp (web, YouTube) vẫn là tài liệu nên hiện ở bộ lọc mặc định; tìm được theo tên sổ',()=>{
  expect(filterSources(mixed,DEFAULT_QUERY).map(x=>x.id)).toContain('n3');
  expect(filterSources(mixed,{...EMPTY_QUERY,query:'Sổ B'}).map(x=>x.id)).toEqual(['n2','n3']);
 });
 it('nhãn nơi lưu của tệp sổ ghi tên sổ',()=>{
  const labels={project:'Dự án',chat:'Hội thoại',learning:'Học hỏi',notebook:'Sổ nguồn'};
  expect(originLabel(mixed[1]!,labels)).toBe('Sổ nguồn: Sổ A');expect(originLabel(mixed[0]!,labels)).toBe('Dự án');
 });
});
