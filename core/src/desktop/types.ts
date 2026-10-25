import type {CloudFolder} from './cloud.js';
/**
 * Nguồn gốc bền vững của bản sao chèn (mã mẫu + mã nhóm chèn). Lưu cùng bước, qua lưu/tải/dựng lại từ Plan.
 * Chỉ có nghĩa khi templateCopy là true. Dữ liệu cũ không có trường này: không suy ra mẫu từ màu nhóm hay tên bước.
 * Không dùng insertGroup (chỉ để đổi màu khung, mất khi lưu) để quyết định quyền biên tập.
 */
export interface TemplateOrigin {templateId:string;group:string}
/** Nguồn gốc bền vững của bản sao chèn; không dùng màu insertGroup để quyết định quyền biên tập. */
export interface WorkflowStep {templateCopy?:true;origin?:TemplateOrigin;promptFormat?:'yaml-v1';/** Dấu nội bộ khi trải phẳng nút gốc của Plan. */planPrompt?:true}
export interface PlanStep {templateCopy?:true;origin?:TemplateOrigin;promptFormat?:'yaml-v1'}
export interface Chat { planningDraft?:Plan; planningSession?:'plan'|'pro'; pendingPrompts?:import('./prompt-queue.js').PendingPrompt[]; promptQueuePaused?:boolean }
export interface WorkflowRun {approvedPrompts?:import('./workflow-prompts.js').ApprovedPrompts}
export interface Workflow {functions?:import('./workflow-language.js').FunctionImplementation[];/** Hội thoại được tạo khi mở chat của quy trình độc lập. */chatId?:string}
export interface WorkflowStepRun {transfer?:import('./workflow-expression.js').Value}
import type { PaletteId, FontId, IconStyleId, ModelChoice, Effort, ModelCatalog, CustomMode, LibraryPrompt } from '@pvta/shared';
export type StepStatus = 'waiting'|'running'|'done'|'error'|'interrupted'|'skipped'|'blocked';
export interface PlanStepContract { inputs?:string[]; outputs?:string[]; dependsOn?:string[]; completion?:string; onError?:string }
export interface PlanVersion { revision:number; title:string; context?:string; steps:PlanStep[]; savedAt:number }
export interface PlanStep extends PlanStepContract { failure?:import('./task-failure.js').TaskFailure; checkpoint?:import('./plan-recovery.js').PlanCheckpoint; replacements?:Record<string,string>; logs?:{at:number;text:string}[]; output?:string;startedAt?:number;endedAt?:number; id:string; goal:string; task:string; files:string[]; risk:string; status:StepStatus; error?:string }
export interface Plan { /** Quy trình đề thi bắt buộc kiểm định trước xuất. */ assessment?:boolean; /** true = tạo bằng Plan Pro; khi chạy, mỗi bước qua cổng kiểm định của quy tắc lõi. */ pro?:boolean; workflowHidden?:boolean; versions?:PlanVersion[]; workflowId?:string;context?:string;revision?:number; id:string; chatId:string; title:string; steps:PlanStep[]; approved:boolean }
export interface Action { /** true = thầy cô đã mở kết quả trong PVTA (hoặc bấm «Đã xem»). */ viewed?:boolean; /** true = tệp đang nằm ở thư mục tạm dùng chung (chưa có nơi lưu); thẻ hiện cảnh báo và yêu cầu «Lưu như…». */ tempOutput?:boolean;draftSession?:string;draftSavedPath?:string;draftRevision?:number; id:string; kind:'create_typst'|'write_text'|'patch_office'|'open_file'|'create_office'|'edit_excel'|'office_live'; path:string; content?:string; document?:Record<string,unknown>; sessionId?:string; tool?:string; args?:Record<string,unknown>; replacements?:{old:string;new:string}[]; style?:{font?:string;size?:number;accent?:string}; reason:string; state:'pending'|'done'|'declined'|'undone'; output?:string; savedPath?:string; savedPaths?:string[]; outputHash?:string; backup?:string; destination?:CloudFolder; cloudUrl?:string; cloudId?:string; uploadError?:string; projectId?:string; outputDir?:string; projectUrl?:string }
export interface Message { model?:string; planning?:import('./planning.js').PlanningRun; failure?:import('./task-failure.js').TaskFailure; id:string; role:'user'|'assistant'; text:string; at:number; actions?:Action[]; plan?:Plan; error?:boolean; /** Kết quả chạy quy trình gọi từ hội thoại: dùng để hiện nút Mở / Chạy tiếp từ khâu lỗi. */ workflow?:{id:string;status:WorkflowRun['status']} }
export interface Chat { /** Ghim lên đầu danh sách hội thoại. */ pinned?:boolean; /** Model riêng của hội thoại này; thiếu = dùng model mặc định. 'auto' = chủ động chọn Tự động. PVTA không tự đổi. */ choice?:ModelChoice|'auto'; /** Mức suy nghĩ riêng của hội thoại (chỉ có nghĩa khi đã có choice). */ effort?:Effort|null; /** Quy tắc đặt tên chỉ áp dụng trong hội thoại này. */ ruleBook?:Rule[]; /** Sổ nguồn liên kết riêng cho hội thoại này (cộng với sổ của dự án). */ notebookIds?:string[]; workflowDesign?:{workflowId?:string}; /** true = tên do PVTA đặt tự động, còn có thể thay bằng tên AI đề xuất; khi thầy cô tự đổi tên thì false. */ titleAuto?:boolean; outputDir?:string; sourceFolders?:string[]; id:string; title:string; projectId?:string; messages:Message[]; summary:string; updatedAt:number }
export interface Project {/** Quy tắc đặt tên chỉ áp dụng trong dự án này: luôn áp dụng (toàn cục) hoặc chỉ chạy khi gọi #khóa (cục bộ). */ ruleBook?:Rule[];/** Sổ nguồn liên kết với dự án; mọi chat/quy trình trong dự án đều tra cứu được. */ notebookIds?:string[];id:string;name:string;rules:string;url?:string;cloud?:CloudFolder;folders?:string[];outputDir?:string;learning?:{folders:string[];notes:string;enabled:boolean;noteFile?:{path:string;fingerprint:string}}}
export interface Attachment {extractionVersion?:number;id:string;name:string;path:string;scopeId:string;scope:'chat'|'project';purpose?:'learning';fingerprint:string;segments:{ref:string;text:string;section?:string;atomic?:boolean}[];image?:boolean;/** Lúc đọc/lập chỉ mục lần gần nhất (ms). */at?:number;/** Dung lượng tệp khi đọc (byte). */bytes?:number}
export type LearningReview='proposed'|'approved'|'active'|'rejected';
export interface Learned {id:string;rule:string;source:string;at:number;status?:LearningReview;chatId?:string;edited?:boolean}
export interface LearnedDraft {reviewedAt?:number;activationError?:string;existingHash?:string;id:string;name:string;description:string;body:string;source:string;at:number;status:LearningReview;chatId?:string}
export interface LearningLast {at:number;state:'running'|'done'|'error'|'interrupted';message:string}
/** Quy tắc đặt tên riêng, gọi bằng #khóa trong ô chat. always = luôn áp dụng cho mọi yêu cầu. */
export interface Rule {id:string;key:string;title:string;text:string;always:boolean;at:number}
/** Biên tập nền: chạy bằng bộ lập lịch của hệ điều hành khi PVTA đã đóng và máy rảnh. */
export interface RefineSettings {enabled:boolean;time:string;everyDays:1|3|7|30;model:'auto'|ModelChoice;autoCatchUp?:boolean}
export interface RefineStatus {at:number;state:'done'|'partial'|'no-model'|'error';updated:number;unchanged:number;failed:number;model?:string;message?:string}
export interface RefineProgress {completed:number;total:number;message:string}
export interface RefineView { nextAt?:number;missedAt?:number;progress?:RefineProgress;running?:boolean;settings:RefineSettings;last?:RefineStatus;pending:number;schedule:{registered:boolean;error?:string}}
/** Quyền của PVTA với tệp: read = chỉ đọc · ask = đề xuất, chờ duyệt · full = tự áp dụng không hỏi. */
export type AccessLevel='read'|'ask'|'full';
/** Kết nối công cụ ngoài (MCP) qua chính CLI. Mặc định tắt; PVTA không làm MCP client. */
export interface McpSettings {enabled:boolean;allowedTools:string[]}
export interface Preferences {/** Tên hiển thị của người dùng trong hồ sơ cá nhân; chữ cái đầu của tên hiện ở biểu tượng hồ sơ. */ userName?:string;/** false = tắt AI nền gợi ý tính năng (mặc định bật). */ selfAdvice?:boolean;quickAccess?:string[];language?:'vi'|'en';theme:'system'|'light'|'dark';palette?:PaletteId;fontFamily?:FontId;iconStyle?:IconStyleId;toolbarIconSize?:number;fontSize:number;learning:boolean;/** true = nút Não bộ đang sáng: sau mỗi tiến trình, model mặc định rút kinh nghiệm và lưu đề xuất vào bộ nhớ. */ reflect?:boolean;hints:boolean;rag:boolean;rules:string;choice:ModelChoice|'auto';effort?:Effort|null;mode:string;access?:AccessLevel;bridge:boolean;bridgeToken?:string;refine?:RefineSettings;mcp?:McpSettings}
/** Nội dung riêng được lưu cùng nút; phạm vi workflow có hiệu lực với mọi nút, kể cả nút thêm sau. */
export interface WorkflowResource {id:string;kind:'rule'|'skill'|'prompt';name:string;body:string;scope:'step'|'workflow'}
export interface WorkflowStep {resources?:WorkflowResource[]}
export interface PlanStep {resources?:WorkflowResource[]}
export interface TemplateStep {resources?:WorkflowResource[]}
/** Một nút của quy trình: tên, prompt, model riêng và quyền (chỉ đọc hoặc chỉnh sửa trong thư mục làm việc). */
export interface WorkflowStep extends PlanStepContract {/** Mã nhóm bước vừa chèn từ mẫu; chỉ để đổi màu khung, mất khi lưu. */ insertGroup?:string;/** Nút này chạy cả một quy trình khác (tham chiếu theo id); khi chạy được trải phẳng vào quy trình cha. */ subWorkflowId?:string;/** Tệp, ảnh, thư mục riêng của nút (đường dẫn tuyệt đối); đọc khi nút chạy. */ files?:string[];id:string;name:string;prompt:string;choice:ModelChoice|'auto';access:'read'|'full';continueOnError?:boolean;dependsOn?:string[]}
/** Mã AI sinh trong khung có biến/hàm: cảnh báo của phản biện và quyết định của giáo viên. */
export interface CodeReview {lang:string;code:string;file?:string;findings:{level:'high'|'medium'|'low';text:string;source:'scan'|'ai'}[];canRun:boolean;/** waiting = đang chờ giáo viên duyệt. */ decision:'waiting'|'approved'|'forced'|'rejected'|'not-run';exitCode?:number|null}
export interface WorkflowStepRun {code?:CodeReview;fingerprint?:string;handoff?:string;checkpoint?:import('./plan-recovery.js').PlanCheckpoint;outputFiles?:string[];stepId:string;name:string;status:'waiting'|'running'|'success'|'error'|'skipped'|'blocked'; logs?:{at:number;text:string}[];startedAt?:number;endedAt?:number;output?:string;error?:string}
export interface WorkflowRun { generatedFiles?:string[];generatedFileHashes?:Record<string,string>;resetBackup?:{from:string;to:string}[]; /** Thư mục con của lượt chạy mã (nơi làm việc) và số tệp đính kèm đã chép. */ workdir?:string;copied?:number;approvedPlan?:PlanVersion;signature?:string;id:string;startedAt:number;endedAt?:number;status:'running'|'success'|'error'|'cancelled'|'paused';steps:WorkflowStepRun[]}
export interface WorkflowInput {kind:'folder'|'file'|'chat'|'prompt';value:string}
/** Liên kết nét đứt do PVTA gợi ý: chưa có hiệu lực khi chạy cho đến khi người dùng chấp nhận (thành phụ thuộc thật). */
export interface SuggestedLink {id:string;from:string;to:string;reason?:string}
/** Khung bọc các nút. decl là văn bản khai báo ở viền khung: {{a = 2}} (biến) và !{{tinhTong: cộng hai số}} (hàm). */
export interface WorkflowFrame {id:string;name:string;stepIds:string[];decl:string}
export interface Workflow { /** Gợi ý liên kết (nét đứt) sau khi chèn mẫu. */ suggestedLinks?:SuggestedLink[]; /** Khung bọc nút; mang khai báo biến và hàm. */ frames?:WorkflowFrame[]; /** Thư mục nhận kết quả khi chạy mã; mỗi lượt chạy tạo một thư mục con. */ outputDir?:string; /** Tệp và thư mục đính kèm, được chép vào thư mục con của lượt chạy. */ attachments?:string[]; /** Thời gian tối đa cho mỗi lần chạy mã (ms), mặc định 30 phút. */ codeTimeoutMs?:number; /** Sổ nguồn liên kết riêng cho quy trình. */ notebookIds?:string[]; projectId?:string; createdAt?:number; pinned?:boolean;planId?:string;mode?:'sequential'|'parallel';maxConcurrency?:number;id:string;name:string;folder?:string;input?:WorkflowInput;steps:WorkflowStep[];runs:WorkflowRun[];updatedAt:number}
/** Tham số của quy trình mẫu: đầu vào chưa xác định, người dùng điền mỗi lần dùng (số câu, mức độ, nội dung…). */
export interface TemplateParam {key:string;label:string;hint?:string;required:boolean;default?:string;long?:boolean}
/** Một khâu của quy trình mẫu. prompt có thể chứa {{khóa-tham-số}}; skills/rules/prompts là tên skill, khóa quy tắc, mã lời nhắc mẫu cần dùng. */
export interface TemplateStep extends PlanStepContract {id:string;name:string;prompt:string;access:'read'|'full';/** Model riêng của khâu; thiếu = Tự động. Chỉ quy trình (Workflow) dùng; Plan chạy theo model của hội thoại. */ choice?:ModelChoice|'auto';skills?:string[];rules?:string[];prompts?:string[]}
/** Đầu ra: fixed = người dùng đã quy định sẵn trong mẫu; ask = mỗi lần dùng người dùng tự quy định (text là gợi ý cách quy định). */
export interface TemplateOutput {mode:'fixed'|'ask';text:string}
export interface WorkflowTemplate {id:string;name:string;description?:string;params:TemplateParam[];steps:TemplateStep[];output:TemplateOutput;createdAt:number;updatedAt:number}
export interface DesktopData { workflowTemplates?:WorkflowTemplate[];learningLast?:LearningLast;learnedDrafts?:LearnedDraft[]; workflows?:Workflow[];documentsDir?:string;version:1;lastProjectId?:string;lastChatId?:string;chats:Chat[];projects:Project[];attachments:Attachment[];learned:Learned[];ruleBook?:Rule[];preferences:Preferences}
export interface BackendStatus {id:'agy'|'claude'|'codex';installed:boolean;auth:'ready'|'missing'|'unknown';version:string;efforts:Effort[]}
export interface ViewState {/** Cờ việc gấp và áp lực RAM. */urgency?:import('./urgency.js').UrgencyView;/** Bản đồ Brain theo mã dự án: mỗi dòng "đường/dẫn: vai trò". Dùng để chọn công cụ gợi ý ở trang chủ. */homeBrain?:Record<string,string[]>;selfTip?:import('./self-advisor.js').SelfTipView;skillDiscovery?:ReturnType<import('./skill-discovery.js').SkillDiscovery['view']>;activeChatIds?:string[];chatProgress?:Record<string,import('@pvta/shared').AiProgressEntry[]>;modelUsage?:Partial<Record<ModelChoice['backend'],import('@pvta/shared').ProviderUsage>>;learning?:{reflect?:{enabled:boolean;running:boolean;message:string};last?:LearningLast;enabled:boolean;pending:number;running:boolean;message:string;skills:{name:string;description:string;body:string}[]};license?:import('../license/index.js').LicenseStatus;groups?:import('../groups/store.js').GroupsView;toolActivity?:import('./tool-activity.js').ToolActivity;office?:{running:boolean;selected:string;sessions:{id:string;host:string;name:string;launchId?:string}[];manifest:string};version:string;home:string;data:DesktopData;backends:BackendStatus[];catalog:ModelCatalog;modes:CustomMode[];api:{id:string;label:string;configured:boolean;baseUrl:string;model?:string;models:{id:string;label?:string}[]}[];skills:{tier?:1|2|3|4;guide?:{summary:string;body:string};name:string;description:string;load:string;body:string;source?:string}[];prompts:{own:LibraryPrompt[];favorites:string[]};refine:RefineView}
export interface RpcRequest { id:string; method:string; params?:Record<string,unknown> }
export type RpcEvent =
 | {id:string;event:'usage';data:{backend:ModelChoice['backend'];usage:import('@pvta/shared').ProviderUsage}}
 | {id:string;event:'progress';data:import('@pvta/shared').AiProgressEvent}
 | {id:string;event:'github';data:import('./github-model.js').GithubEvent}
 | {id:string;event:'delta'|'state'|'status'|'update'|'setup'|'notebook'|'editSession';data:unknown};
/** Additive contract for the new GitHub RPC; legacy method `github` stays unchanged. */
export type {GithubRpcMethods,GithubRpcReply} from './github-model.js';
export interface RpcResponse {id:string;result?:unknown;error?:string}
