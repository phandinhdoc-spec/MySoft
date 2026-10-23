import type {GithubCatalog,GithubConfirmation,GithubField,GithubGroup,GithubOperation,GithubRequirement,GithubRisk} from './github-model.js';

const groups:GithubCatalog['groups']=[
 {id:'start',label:'Bắt đầu'},{id:'save',label:'Lưu và đưa lên'},
 {id:'sync',label:'Tải xuống và đồng bộ'},{id:'branches',label:'Nhánh làm việc'},
 {id:'history',label:'Lịch sử và hoàn tác'},{id:'repositories',label:'Kho trên GitHub'},
 {id:'collaboration',label:'Chia sẻ và cộng tác'},{id:'settings',label:'Thiết lập'},
];
const field=(key:string,label:string,kind:GithubField['kind'],help:string,extra:Partial<GithubField>={}):GithubField=>
 ({key,label,kind,help,required:true,maxLength:200,...extra});
const repo=()=>field('repository','Kho GitHub','repository','Nhập chủ/tên-kho; chỉ hỗ trợ github.com.',{source:'repositories'});
const branch=()=>field('branch','Nhánh','branch','Chọn tên nhánh; không nhập lệnh Git.',{source:'branches'});
const revision=()=>field('revision','Phiên bản','revision','Chọn mã phiên bản đã tồn tại trong kho.',{source:'commits'});
const file=()=>field('path','Tệp trong kho','file','Chọn một tệp bên trong thư mục kho.',{source:'changes',maxLength:4096});
const folder=()=>field('destination','Thư mục đích','folder','Chọn thư mục mới hoặc trống; không ghi đè dữ liệu.',{maxLength:4096});
const message=()=>field('message','Nội dung lần lưu','multiline','Mô tả ngắn gọn những thay đổi cần lưu.',{maxLength:2000});
const title=()=>field('title','Tiêu đề','text','Tên ngắn gọn để người cùng làm nhận biết.');
const body=()=>field('body','Nội dung','multiline','Mô tả mục đích, thay đổi hoặc vấn đề.',{maxLength:20000});
const name=()=>field('name','Tên kho','text','Tên kho, không gồm tên chủ sở hữu.',{maxLength:100});
const account=()=>field('account','Tài khoản GitHub','account','Tên đăng nhập GitHub; không nhập email.');
const number=()=>field('number','Số thứ tự','number','Số của vấn đề hoặc đề nghị gộp.',{maxLength:10});
const tag=()=>field('tag','Nhãn phiên bản','text','Chọn nhãn Git đã tồn tại, ví dụ v1.0.0.');
const visibility=()=>field('visibility','Ai được xem kho','select','Kho công khai có thể được mọi người xem.',{
 default:'private',options:[{value:'private',label:'Riêng tư'},{value:'public',label:'Công khai'}],
});
const local:GithubRequirement[]=['git','folder','repository'];
const edit:GithubRequirement[]=[...local,'idle','noOperation'];
const online:GithubRequirement[]=['gh','authenticated'];
const remoteWrite:GithubRequirement[]=[...online,'idle','repoWrite'];
const admin:GithubRequirement[]=[...online,'idle','repoAdmin'];
const publish:GithubRequirement[]=[...edit,'head','branch','origin','upstream'];
const none:GithubConfirmation={kind:'none'};
const literal=(text:string):GithubConfirmation=>({kind:'literal',text});
const confirmField=(field:string):GithubConfirmation=>({kind:'field',field});
const publicConfirmation:GithubConfirmation={kind:'when',field:'visibility',equals:'public',text:'CÔNG KHAI'};
function op(id:string,group:GithubGroup,label:string,help:string,fields:GithubField[],requires:GithubRequirement[],
 risk:GithubRisk,description:string,kind:GithubOperation['result']['kind']='message',confirmation=none):GithubOperation {
 return {id,group,label,help,fields,requires,risk,confirmation,result:{kind,description}};
}

const link=()=>field('link','Liên kết GitHub','text','Dán liên kết kho, thư mục hoặc tệp trên github.com.',{maxLength:4096});
const remoteRef=()=>field('ref','Nhánh hoặc mã phiên bản','text','Để trống để nhận diện từ liên kết; cập nhật lên phải chọn tên nhánh.',{required:false,maxLength:200});
const paths=()=>field('paths','Tệp và thư mục được chọn','multiline','Mỗi dòng một đường dẫn tính từ gốc kho hoặc thư mục nguồn. Thư mục gồm mọi tệp bên trong; không xóa tệp trên GitHub.',{maxLength:20000});
const operations:GithubOperation[]=[
 op('browseFiles','repositories','Duyệt tệp từ liên kết GitHub','Xem tệp, mở thư mục con và chọn nội dung cần tải từ liên kết GitHub.',
  [link(),remoteRef()],online,'read','Danh sách tệp và thư mục.','table'),
 op('downloadFiles','sync','Tải tệp hoặc thư mục được chọn','Tải các mục đã chọn thẳng vào thư mục dự án đang làm việc, giữ đường dẫn trong kho. Tệp trùng tên sẽ được thay bằng bản trên GitHub. Tối đa 500 tệp, 100 MB mỗi lần.',
  [field('selection','Cách tải','select','Tự tìm tệp mới hoặc khác nội dung trên GitHub; giữ nguyên tệp trên máy đang có thay đổi chưa lưu.',{required:false,default:'selected',options:[{value:'changed',label:'Tải tự động'},{value:'selected',label:'Chọn tệp và thư mục'}]}),link(),remoteRef(),{...paths(),required:false}],[...online,'idle'],'write','Thư mục dự án chứa các tệp đã tải.','file'),
 op('uploadFiles','save','Cập nhật tệp hoặc thư mục được chọn','Tạo một phiên bản trên nhánh GitHub từ các tệp đã chọn. Giữ các tệp khác; không xóa tệp vắng trong nguồn. Tối đa 500 tệp, 100 MB; mỗi tệp tối đa 20 MB.',
  [field('selection','Cách cập nhật','select','Tự tìm tệp mới hoặc khác nội dung trên GitHub; tôn trọng .gitignore.',{required:false,default:'selected',options:[{value:'changed',label:'Cập nhật tự động'},{value:'selected',label:'Chọn tệp và thư mục'}]}),link(),remoteRef(),field('source','Thư mục nguồn','folder','Đường dẫn tính từ thư mục này sẽ được đặt tại gốc kho GitHub.',{maxLength:4096}),{...paths(),required:false},message()],['gh','authenticated','idle'],'write','Phiên bản mới chứa nội dung đã chọn.','message'),

 op('init','start','Biến thư mục này thành kho Git','Bắt đầu theo dõi phiên bản trong thư mục đã chọn; chưa gửi gì lên GitHub.',
  [],['git','folder','noRepository','idle'],'write','Kho Git được khởi tạo.'),
 op('createFromFolder','start','Đưa thư mục này lên GitHub','Tạo kho từ kho Git hiện tại rồi đưa nhánh lên. Hãy lưu phiên bản trước; nếu tạo kho thành công nhưng đưa lên thất bại, kết quả sẽ báo riêng.',
  [repo(),visibility()],[...edit,...online,'head','branch','clean'],'danger','Kho mới và kết quả đưa nhánh lên.','message',publicConfirmation),
 op('clone','start','Tải kho từ GitHub về máy','Tải một bản sao có lịch sử vào thư mục mới hoặc trống.',
  [repo(),folder()],['git','gh','idle'],'write','Đường dẫn kho đã tải.','file'),
 op('commit','save','Lưu phiên bản','Đưa tất cả thay đổi không bị bỏ qua vào lần lưu, kể cả tệp mới và tệp bị xóa. Kiểm tra danh sách trước khi lưu.',
  [message()],[...edit,'changes','identity'],'write','Mã phiên bản mới; chưa đưa lên GitHub.'),
 op('push','save','Đưa lên GitHub','Đưa các phiên bản trên nhánh hiện tại lên nhánh theo dõi; không ép ghi đè lịch sử.',
  [],publish,'write','Kết quả đưa phiên bản lên.'),
 op('saveAndPush','save','Lưu và đưa lên GitHub','Lưu tất cả thay đổi rồi đưa lên. Nếu đưa lên lỗi, phiên bản đã lưu vẫn được giữ trên máy.',
  [message()],[...edit,'changes','identity','branch','origin','upstream'],'write','Kết quả riêng của bước lưu và bước đưa lên.'),
 op('pull','sync','Tải cập nhật từ GitHub về','Chỉ cập nhật khi có thể tiến thẳng; lịch sử phân kỳ thì dừng và hướng dẫn đồng bộ.',
  [],[...publish,'clean'],'write','Nhánh được cập nhật hoặc lý do không thể tiến thẳng.'),
 op('fetch','sync','Kiểm tra có gì mới trên GitHub','Tải thông tin nhánh từ origin; không đổi các tệp đang làm.',
  [],[...edit,'origin'],'write','Thông tin nhánh từ xa và số phiên bản chênh lệch.'),
 op('sync','sync','Đồng bộ hai chiều','Lưu thay đổi chưa lưu (nếu có), tải thông tin, gộp nhánh theo dõi rồi đưa lên. Khi xung đột thì dừng để kiểm tra, không tự ghi đè.',
  [field('message','Nội dung lần lưu (nếu có thay đổi chưa lưu)','multiline','Khi thư mục còn tệp chưa lưu, PVTA lưu chúng thành một phiên bản với nội dung này trước khi đồng bộ.',{required:false,maxLength:2000})],[...publish,'identity'],'write','Kết quả từng bước; ghi rõ xung đột hoặc bước đã thành công.'),
 op('archive','sync','Nén phiên bản hiện tại thành ZIP','Xuất các tệp đã lưu tại HEAD; không gồm thay đổi chưa lưu và tệp chưa được theo dõi.',
  [field('output','Tệp ZIP mới','file','Chọn đường dẫn .zip chưa tồn tại.',{maxLength:4096})],[...local,'head','idle'],'write','Đường dẫn ZIP đã xuất.','file'),
 op('branches','branches','Xem các nhánh','Liệt kê các nhánh và đánh dấu nhánh đang làm.',
  [],local,'read','Danh sách nhánh.','table'),
 op('createBranch','branches','Tạo nhánh mới','Tạo nhánh từ phiên bản hiện tại và chuyển sang nhánh đó.',
  [branch()],[...edit,'head','clean'],'write','Tên nhánh mới đang làm.'),
 op('switch','branches','Chuyển sang nhánh khác','Chuyển sang nhánh có sẵn sau khi đã lưu hoặc cất tạm thay đổi.',
  [branch()],[...edit,'head','clean'],'write','Nhánh hiện tại sau khi chuyển.'),
 op('merge','branches','Gộp nhánh khác vào nhánh hiện tại','Giữ lịch sử của hai nhánh. Dừng khi xung đột; không tự chọn nội dung thắng.',
  [branch()],[...edit,'head','branch','clean','identity'],'write','Phiên bản sau gộp hoặc tình trạng phục hồi.'),
 op('renameBranch','branches','Đổi tên nhánh hiện tại','Đổi tên nhánh trên máy; không đổi hoặc xóa nhánh trên GitHub.',
  [field('name','Tên nhánh mới','branch','Tên mới chưa tồn tại.')],[...edit,'branch'],'write','Tên nhánh mới trên máy.'),
 op('deleteBranch','branches','Xóa nhánh','Chỉ xóa nhánh trên máy đã được gộp; không xóa nhánh hiện tại và không ép xóa.',
  [branch()],[...edit,'branch'],'danger','Nhánh trên máy đã xóa.','message',confirmField('branch')),
 op('log','history','Xem lịch sử các phiên bản','Xem các lần lưu gần nhất cùng tác giả và thời gian.',
  [],[...local,'head'],'read','Danh sách phiên bản; báo rõ nếu giới hạn số dòng.','history'),
 op('diff','history','Xem tệp nào đã thay đổi','Xem thay đổi đã chọn và chưa chọn để lưu; tệp mới được liệt kê trong trạng thái.',
  [],local,'read','Nội dung khác biệt và dấu hiệu bị cắt ngắn.','diff'),
 op('discardFile','history','Bỏ thay đổi của một tệp','Khôi phục tệp được theo dõi về HEAD, bỏ cả thay đổi đã chọn và chưa chọn để lưu. Không xóa tệp mới chưa theo dõi.',
  [file()],[...edit,'head','changes'],'danger','Tệp được khôi phục về phiên bản đã lưu.','message',literal('BỎ')),
 op('discardAll','history','Bỏ mọi thay đổi chưa lưu','Bỏ thay đổi của các tệp được theo dõi, gồm vùng đã chọn để lưu. Tệp mới chưa theo dõi và tệp bị bỏ qua vẫn được giữ.',
  [],[...edit,'head','changes'],'danger','Các tệp được theo dõi trở về HEAD; liệt kê phần còn lại.','message',literal('BỎ HẾT')),
 op('undoCommit','history','Hoàn tác lần lưu gần nhất','Bỏ lần lưu cuối trên máy nhưng giữ nội dung trong vùng chờ lưu; chỉ cho phép khi đã xác minh phiên bản chưa được công bố.',
  [],[...edit,'head','clean','parentCommit','unpublishedHead'],'danger','Nội dung lần lưu cuối được giữ để chỉnh sửa.','message',literal('HOÀN TÁC')),
 op('revert','history','Hủy một phiên bản cũ','Tạo phiên bản đảo ngược, không viết lại lịch sử. Phiên bản gộp cần xử lý riêng và bị từ chối trong biểu mẫu này.',
  [revision()],[...edit,'head','clean','identity'],'write','Phiên bản đảo ngược mới hoặc xung đột cần xử lý.'),
 op('restoreFile','history','Khôi phục một tệp từ phiên bản cũ','Thay nội dung tệp hiện tại bằng nội dung ở phiên bản đã chọn; chưa tự lưu thành phiên bản mới.',
  [file(),revision()],[...edit,'head','clean'],'danger','Tệp được khôi phục, chờ người dùng lưu phiên bản.','message',literal('KHÔI PHỤC')),
 op('stash','history','Cất tạm thay đổi','Cất cả tệp mới chưa theo dõi; không cất tệp bị bỏ qua.',
  [field('message','Ghi chú','text','Ghi chú để dễ tìm lần cất tạm.',{required:false})],[...edit,'head','changes'],'write','Thay đổi được cất tạm.'),
 op('stashPop','history','Lấy lại thay đổi đã cất','Lấy lần cất đã chọn. Nếu xung đột, giữ bản cất và báo các tệp cần xử lý; không tự xóa thay đổi.',
  [field('stash','Lần cất tạm','select','Chọn một lần đã cất.',{source:'stashes'})],[...edit,'head','clean','stashes'],'write','Kết quả lấy lại và trạng thái bản cất.'),
 op('stashList','history','Xem các lần đã cất tạm','Liệt kê các bản cất tạm trong kho này.',
  [],local,'read','Danh sách các lần cất tạm.','table'),
 op('repoList','repositories','Danh sách kho của tôi','Liệt kê kho của tài khoản đang đăng nhập.',
  [],online,'read','Danh sách kho và chế độ hiển thị.','table'),
 op('repoCreate','repositories','Tạo kho trống','Tạo kho trên GitHub; chưa nối với thư mục trên máy.',
  [repo(),visibility()],[...online,'idle'],'danger','Tên và địa chỉ kho mới.','message',publicConfirmation),
 op('repoRename','repositories','Đổi tên kho','Đổi tên kho trên GitHub; địa chỉ origin trên máy cần được kiểm tra lại.',
  [repo(),name()],admin,'write','Tên và địa chỉ mới của kho.'),
 op('repoDescription','repositories','Sửa mô tả kho','Cập nhật mô tả ngắn trên trang kho; để trống để xóa mô tả.',
  [repo(),field('description','Mô tả','multiline','Mô tả ngắn gọn kho.',{required:false,maxLength:350})],admin,'write','Mô tả kho sau cập nhật.'),
 op('repoVisibility','repositories','Đổi công khai hoặc riêng tư','Thay đổi người có thể xem kho và lịch sử của kho; đọc cảnh báo của GitHub trước khi xác nhận.',
  [repo(),visibility()],admin,'danger','Chế độ hiển thị mới.','message',publicConfirmation),
 op('repoDelete','repositories','Xóa kho','Xóa kho trên GitHub, không xóa thư mục trên máy. Cần quyền quản trị và quyền delete_repo.',
  [repo()],[...admin,'deleteScope'],'danger','Tên kho đã xóa trên GitHub.','message',confirmField('repository')),
 op('fork','repositories','Sao chép kho về tài khoản tôi','Tạo bản fork trên tài khoản GitHub đang đăng nhập; không tự tải về máy.',
  [repo()],[...online,'idle'],'write','Địa chỉ bản fork.'),
 op('collaboratorAdd','collaboration','Mời người cùng làm việc','Gửi lời mời với quyền đã chọn. Người được mời có thể cần chấp nhận trước khi truy cập.',
  [repo(),account(),field('permission','Quyền truy cập','select','Chọn quyền tối thiểu cần thiết.',{
   default:'pull',options:[{value:'pull',label:'Chỉ đọc'},{value:'push',label:'Đọc và ghi'}],
  })],admin,'write','Lời mời đã gửi hoặc quyền cộng tác được cập nhật.'),
 op('collaboratorList','collaboration','Xem ai đang cùng làm','Liệt kê người cộng tác; danh sách lời mời đang chờ không đồng nghĩa người đã có quyền.',
  [repo()],admin.filter(r=>r!=='idle'),'read','Danh sách người cộng tác và quyền.','table'),
 op('collaboratorRemove','collaboration','Thôi mời một người','Gỡ quyền cộng tác trực tiếp của tài khoản. Quyền qua tổ chức hoặc nhóm có thể vẫn còn.',
  [repo(),account()],admin,'danger','Kết quả gỡ quyền trực tiếp.','message',confirmField('account')),
 op('releaseCreate','collaboration','Tạo bản phát hành','Tạo bản phát hành nháp từ nhãn đã tồn tại trên GitHub; không tự công bố hay tạo nhãn.',
  [repo(),tag(),title(),body()],remoteWrite,'write','Địa chỉ bản phát hành nháp.'),
 op('releaseList','collaboration','Xem các bản phát hành','Liệt kê bản phát hành của kho đã chọn.',
  [repo()],online,'read','Danh sách bản phát hành.','table'),
 op('releaseDownload','collaboration','Tải tệp của một bản phát hành','Tải tài sản đính kèm của nhãn đã chọn vào thư mục mới hoặc trống; không ghi đè.',
  [repo(),tag(),folder()],[...online,'idle'],'write','Thư mục chứa tệp đã tải.','file'),
 op('prCreate','collaboration','Tạo đề nghị gộp','Đề nghị gộp nhánh nguồn đã đưa lên GitHub vào nhánh đích; chưa tự gộp.',
  [repo(),field('head','Nhánh nguồn','branch','Nhánh nguồn trên GitHub.'),field('base','Nhánh đích','branch','Nhánh nhận thay đổi.'),title(),body()],remoteWrite,'write','Số và địa chỉ đề nghị gộp.'),
 op('prList','collaboration','Xem các đề nghị gộp','Liệt kê đề nghị gộp đang mở trong kho.',
  [repo()],online,'read','Danh sách đề nghị gộp đang mở.','table'),
 op('prMerge','collaboration','Gộp một đề nghị gộp','Gộp theo cách đã chọn, tuân thủ kiểm tra và bảo vệ nhánh; không vượt quyền quản trị và không tự xóa nhánh.',
  [repo(),number(),field('method','Cách gộp','select','Chọn cách lưu lịch sử.',{
   default:'merge',options:[{value:'merge',label:'Giữ lịch sử và tạo phiên bản gộp'},{value:'squash',label:'Gộp thành một phiên bản'},{value:'rebase',label:'Đặt các phiên bản nối tiếp'}],
  })],remoteWrite,'danger','Trạng thái gộp hoặc xếp hàng; không báo đã gộp khi chỉ mới xếp hàng.','message',confirmField('number')),
 op('issueCreate','collaboration','Ghi nhận một vấn đề','Tạo vấn đề để theo dõi lỗi hoặc công việc cần làm.',
  [repo(),title(),body()],[...online,'idle'],'write','Số và địa chỉ vấn đề mới.'),
 op('issueList','collaboration','Xem các vấn đề đang mở','Liệt kê công việc và lỗi chưa đóng của kho.',
  [repo()],online,'read','Danh sách vấn đề đang mở.','table'),
 op('issueClose','collaboration','Đóng một vấn đề đã xong','Đánh dấu vấn đề đã hoàn thành; vẫn giữ nội dung và lịch sử trao đổi.',
  [repo(),number()],remoteWrite,'write','Vấn đề đã đóng.'),
 op('identity','settings','Đặt tên và email người lưu','Lưu tên và email trong cấu hình của kho này; không đổi tài khoản GitHub hoặc cấu hình toàn máy.',
  [field('name','Tên người lưu','text','Tên hiển thị trong lịch sử.'),field('email','Email người lưu','text','Email dùng cho phiên bản; có thể dùng email riêng tư của GitHub.',{maxLength:254})],
  edit,'write','Danh tính người lưu của kho.'),
 op('remote','settings','Nối thư mục với kho trên GitHub','Tạo hoặc thay địa chỉ origin bằng HTTPS; không tự đưa dữ liệu lên.',
  [repo()],edit,'danger','Địa chỉ origin mới.','message',confirmField('repository')),
 op('gitignore','settings','Tạo tệp bỏ qua','Tạo mới .gitignore; nếu đã có thì dừng để tránh ghi đè. Không ngừng theo dõi tệp đã có trong lịch sử.',
  [field('patterns','Các mẫu bỏ qua','multiline','Mỗi dòng một mẫu, ví dụ node_modules/ hoặc .env.',{maxLength:20000})],edit,'write','Tệp .gitignore mới.','file'),
 op('trustFolder','settings','Tin cậy thư mục này','Thêm đúng đường dẫn thực của thư mục đã chọn vào safe.directory toàn máy. Chỉ dùng với thư mục bạn biết rõ; không dùng dấu *.',
  [],['git','folder','idle'],'danger','Đường dẫn cụ thể đã được tin cậy.','message',literal('TIN CẬY')),
 op('logout','settings','Đăng xuất GitHub','Gỡ đăng nhập do gh lưu cho tài khoản đã chọn trên github.com. Token từ biến môi trường không bị xóa bởi thao tác này.',
  [account()],['gh','idle'],'write','Trạng thái đăng nhập sau thao tác.'),
];

/** Return independent JSON data so callers cannot mutate the shared definitions. */
export function catalog():GithubCatalog {
 return structuredClone({version:1,groups,operations});
}
