/** Danh mục năng lực của PVTA Chat để AI nền "Tự hiểu" chọn gợi ý. Mỗi mục trỏ về tệp nguồn thật và một ký hiệu phải còn trong tệp đó (kiểm thử chặn lệch). */
export interface Capability{
 id:string;group:'Làm việc nhiều bước'|'Nguồn và ngữ cảnh'|'Tạo tài liệu'|'Kiến thức của PVTA'|'Công cụ'|'Giao diện';
 name:string;summary:string;how:string;
 /** Tệp tương đối từ gốc repo + chuỗi phải còn xuất hiện trong tệp. */
 source:{file:string;symbol:string};
 keywords:string[];
}
export const CAPABILITIES:Capability[]=[
 {id:'plan',group:'Làm việc nhiều bước',name:'Plan',summary:'Khảo sát, hỏi thông tin thiếu rồi lập kế hoạch nhiều bước để duyệt trước khi chạy.',how:'Chọn Plan ở ô nhập, nêu mục tiêu và đầu ra; bấm Duyệt toàn bộ & chạy khi đã xem.',source:{file:'chatbox/src/PlanCard.tsx',symbol:'Duyệt toàn bộ'},keywords:['kế hoạch','nhiều bước','giáo án','soạn','plan']},
 {id:'workflow',group:'Làm việc nhiều bước',name:'Quy trình đa nhánh',summary:'Chuỗi bước lặp lại được, có nhánh độc lập và bước hợp nhất.',how:'Mở mục Quy trình, chọn Tuần tự hoặc Đa nhánh; có thể tự tạo quy trình bằng AI.',source:{file:'core/src/desktop/workflows.ts',symbol:'export'},keywords:['quy trình','lặp lại','nhánh','tự động']},
 {id:'resume',group:'Làm việc nhiều bước',name:'Việc còn dở',summary:'Tìm lại việc bị gián đoạn, đối chiếu rồi làm tiếp.',how:'Mở Nhật kí → Việc còn dở / bị gián đoạn.',source:{file:'chatbox/src/ResumeWork.tsx',symbol:'export'},keywords:['tiếp tục','làm tiếp','dở','gián đoạn','khôi phục']},
 {id:'plan-recovery',group:'Làm việc nhiều bước',name:'Đối chiếu khôi phục',summary:'Kiểm tra tệp và kết quả đã ghi trước khi thử lại bước có tác động chưa rõ.',how:'Dùng khi một bước Plan bị ngắt hoặc lỗi.',source:{file:'core/src/desktop/plan-recovery.ts',symbol:'export'},keywords:['lỗi','thử lại','ngắt','khôi phục']},
 {id:'learning-folder',group:'Nguồn và ngữ cảnh',name:'Học hỏi của dự án',summary:'Dùng thư mục tài liệu năm trước làm nguồn tham khảo cách viết và quy trình, tách khỏi nguồn hiện tại.',how:'Quản lí dự án → Học hỏi → chọn thư mục; có thể Rút kinh nghiệm rồi lưu.',source:{file:'chatbox/src/ProjectLearning.tsx',symbol:'Học hỏi'},keywords:['năm trước','mẫu','kinh nghiệm','báo cáo cũ','tham khảo']},
 {id:'notebook',group:'Nguồn và ngữ cảnh',name:'Sổ nguồn',summary:'Gom nguồn thành sổ, hỏi đáp có trích đoạn; gắn sổ vào chat, dự án hoặc quy trình.',how:'Mở mục Sổ nguồn, thêm nguồn, rồi tích sổ trong chat hoặc dự án.',source:{file:'core/src/desktop/notebook-host.ts',symbol:'grounding'},keywords:['nguồn','sổ','tài liệu tham khảo','trích dẫn','tổng hợp']},
 {id:'workspace',group:'Nguồn và ngữ cảnh',name:'Nhiều thư mục trong dự án',summary:'Dự án làm việc với nhiều thư mục, lời nhắc nêu rõ thư mục chính.',how:'Quản lí dự án → Không gian làm việc → thêm thư mục.',source:{file:'core/src/desktop/runtime.ts',symbol:'workspacePrompt'},keywords:['thư mục','nhiều thư mục','workspace','dự án']},
 {id:'attachments',group:'Nguồn và ngữ cảnh',name:'Đính kèm tệp vào chat',summary:'Tệp và ảnh đính kèm hiện ngay trong hội thoại; PVTA chỉ đọc đoạn cần.',how:'Bấm nút đính kèm ở ô soạn hoặc kéo tệp vào.',source:{file:'chatbox/src/ChatAttachments.tsx',symbol:'export'},keywords:['đính kèm','tệp','ảnh','pdf','docx']},
 {id:'brain',group:'Nguồn và ngữ cảnh',name:'Brain tra mã',summary:'Lập chỉ mục mã của dự án để AI sửa mã không phải đọc lại toàn bộ.',how:'Tự chạy khi mở chat trong dự án có thư mục mã; không cần bật tay.',source:{file:'core/src/desktop/brain.ts',symbol:'brainProjectRoot'},keywords:['mã','code','lập trình','sửa lỗi','chỉ mục']},
 {id:'office-create',group:'Tạo tài liệu',name:'Tạo Word, Excel, PowerPoint',summary:'Xuất tệp .docx, .xlsx, .pptx có định dạng sẵn; tệp chỉ ghi sau khi duyệt.',how:'Yêu cầu soạn tài liệu và nêu loại tệp; duyệt thẻ thao tác.',source:{file:'core/src/desktop/office-capabilities.ts',symbol:'OFFICE_AUTHORING'},keywords:['word','excel','powerpoint','slide','bảng điểm','xuất tệp']},
 {id:'typst',group:'Tạo tài liệu',name:'Xuất PDF bằng Typst',summary:'Dàn trang tài liệu thành PDF kèm mã nguồn .typ để sửa.',how:'Yêu cầu xuất PDF; kết quả là gói ZIP gồm PDF và mã nguồn.',source:{file:'core/src/desktop/typst.ts',symbol:'export'},keywords:['pdf','in ấn','dàn trang','typst']},
 {id:'pdf',group:'Tạo tài liệu',name:'Làm việc với PDF',summary:'Mở, tách và chỉnh PDF ngay trong PVTA.',how:'Mở mục công cụ PDF.',source:{file:'chatbox/src/PdfWorkspace.tsx',symbol:'export'},keywords:['pdf','tách trang','chỉnh sửa pdf']},
 {id:'math',group:'Tạo tài liệu',name:'Xưởng Toán',summary:'Soạn và kiểm tra công thức, bài toán.',how:'Mở Xưởng Toán trong mục công cụ.',source:{file:'chatbox/src/MathWorkshop.tsx',symbol:'export'},keywords:['toán','công thức','latex','phương trình']},
 {id:'editor',group:'Tạo tài liệu',name:'Trình soạn tài liệu Office',summary:'Xem và sửa tệp Office ngay trong PVTA.',how:'Mở tệp Office từ khung chat hoặc dự án.',source:{file:'chatbox/src/OfficeEditor.tsx',symbol:'export'},keywords:['sửa tệp','mở tệp','office','chỉnh']},
 {id:'skills',group:'Kiến thức của PVTA',name:'Skill',summary:'Tệp hướng dẫn giúp PVTA làm đúng một loại việc; PVTA có thể đề xuất skill phù hợp.',how:'Mở mục Skills để bật, tạo hoặc duyệt skill được đề xuất.',source:{file:'core/src/desktop/skill-discovery.ts',symbol:'SkillDiscovery'},keywords:['skill','kỹ năng','hướng dẫn','quy trình']},
 {id:'rules',group:'Kiến thức của PVTA',name:'Quy tắc',summary:'Quy tắc chung và theo dự án mà PVTA luôn tuân theo.',how:'Mở Quy tắc, ghi điều muốn PVTA luôn làm hoặc không làm.',source:{file:'core/src/desktop/rules.ts',symbol:'export'},keywords:['quy tắc','luôn','không bao giờ','thói quen','định dạng']},
 {id:'feedback',group:'Kiến thức của PVTA',name:'Tự học từ góp ý',summary:'PVTA ghi nhận góp ý của thầy cô thành sở thích đã học.',how:'Cài đặt → Chung → Những điều đã học.',source:{file:'core/src/desktop/feedback-learning.ts',symbol:'export'},keywords:['góp ý','học','sở thích','ghi nhớ']},
 {id:'refine',group:'Kiến thức của PVTA',name:'Biên tập nền',summary:'Rà soát kiến thức và skill theo lịch, kết quả là đề xuất để duyệt.',how:'Cài đặt → Biên tập nền → Làm ngay.',source:{file:'core/src/desktop/refine/refiner.ts',symbol:'export'},keywords:['biên tập','rà soát','lịch','định kì']},
 {id:'groups',group:'Kiến thức của PVTA',name:'Nhóm công việc',summary:'Nhóm tự học theo mục tiêu để tạo bản nháp skill.',how:'Mở cửa sổ Nhóm, nhập tên và mục tiêu.',source:{file:'core/src/desktop/groups-host.ts',symbol:'export'},keywords:['nhóm','tổ chuyên môn','mục tiêu']},
 {id:'github',group:'Công cụ',name:'GitHub',summary:'Làm việc với kho GitHub ngay trong vùng nền.',how:'Mở thẻ GitHub trong thanh công cụ.',source:{file:'chatbox/src/GitHubPanel.tsx',symbol:'export'},keywords:['github','kho','commit','pull request']},
 {id:'terminal',group:'Công cụ',name:'Terminal',summary:'Terminal tích hợp trong PVTA.',how:'Bấm nút terminal ở thanh trên.',source:{file:'chatbox/src/CommandCodePanel.tsx',symbol:'export'},keywords:['terminal','lệnh','dòng lệnh']},
 {id:'web',group:'Công cụ',name:'Tìm nguồn trên mạng',summary:'Tìm và đọc nguồn web khi cần, không gửi dữ liệu riêng tư.',how:'Nhờ PVTA tìm nguồn; nó dùng office_web_search và office_web_read.',source:{file:'core/src/desktop/runtime.ts',symbol:'office_web_search'},keywords:['tìm','web','mạng','nguồn mới','tra cứu']},
 {id:'history',group:'Công cụ',name:'Nhật kí hoạt động',summary:'Xem lại các việc đã làm theo hội thoại hoặc dự án.',how:'Mở Nhật kí.',source:{file:'chatbox/src/HistoryPanel.tsx',symbol:'export'},keywords:['nhật kí','lịch sử','việc đã làm']},
 {id:'appearance',group:'Giao diện',name:'Giao diện',summary:'Đổi chủ đề, bảng màu, bộ biểu tượng và độ tương phản.',how:'Cài đặt → Giao diện.',source:{file:'chatbox/src/AppearancePicker.tsx',symbol:'export'},keywords:['giao diện','màu','chữ','tương phản','chủ đề']},
 {id:'help',group:'Giao diện',name:'Hướng dẫn sử dụng',summary:'Hướng dẫn tích hợp, mở bằng F1.',how:'Bấm nút ? ở thanh trên hoặc nhấn F1.',source:{file:'chatbox/src/HelpPanel.tsx',symbol:'export'},keywords:['hướng dẫn','trợ giúp','cách dùng']},
];

const fold=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();
/** Tra danh mục theo từ khóa, bỏ dấu; chỉ trả mục có ít nhất một từ khớp. */
export function findCapabilities(query:string,limit=5,list:Capability[]=CAPABILITIES):Capability[]{
 const terms=fold(query).split(/[^a-z0-9]+/).filter(t=>t.length>1);if(!terms.length)return [];
 return list.map(c=>{const hay=fold([c.id,c.name,c.summary,...c.keywords].join(' '));const kw=fold(c.keywords.join(' '));return {c,score:terms.reduce((n,t)=>n+(hay.includes(t)?1:0)+(kw.includes(t)?1:0),0)};})
  .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.c);
}
export const capabilityById=(id:string,list:Capability[]=CAPABILITIES)=>list.find(c=>c.id===id);
/** Dạng nén cho lời nhắc: một dòng mỗi mục. */
export function catalogPrompt(list:Capability[]=CAPABILITIES,max=40):string{
 return list.slice(0,max).map(c=>`- ${c.id} | ${c.name}: ${c.summary} Cách dùng: ${c.how}`).join('\n');
}
