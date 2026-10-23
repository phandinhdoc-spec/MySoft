import {t as uiText} from './i18n';
import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  TEACHER_FEATURES,
  DEFAULT_ASSESSMENT_SPEC,
  buildAssessmentMatrix,
  SAMPLE_RAW_EXAM,
  mixExamVariants,
  SAMPLE_ADMIN_DOC,
  reviewAdminDocument,
  SAMPLE_GRADEBOOK_INPUT,
  analyzeGradebook,
  SAMPLE_LESSON_5512,
  convertLessonPlanToSlides,
  // Bản đặc tả & Bóc tách YCCĐ chuẩn THCS Phan Văn Trị
  type SpecYCCDItem,
  type ParsedSpecification,
  auditSpecification,
  autoBalanceSpecification,
  parseSpecificationDocument,
  SAMPLE_SPEC_KHTN7,
  SAMPLE_SPEC_KHTN8,
  SAMPLE_SPEC_KHTN9,
  parseExcelGradebook,
  SAMPLE_GRADEBOOK_EXCEL_CSV,
  SAMPLE_REAL_EXAM_KHTN7,
  SAMPLE_ADMIN_DOCX_FULL,
  type FeatureKey,
  type SlideOutline,
} from "@pvta/shared";
import { Icon } from "./Icon";
import { pickFiles, rpc } from "./ipc";
import {examPlanPrompt, type MatrixCell} from '../../shared/src/assessment-workflow';
import {MatrixSourcePreview} from './MatrixSourcePreview';

interface Props {
  initialTab?: FeatureKey;
  /** Điều khiển tab từ ngoài (thanh tab của Tiện ích); khi truyền thì ẩn thanh tab nội bộ. */
  tab?: FeatureKey;
  hideTabs?: boolean;
  onSendPrompt: (prompt: string) => void;
  notice: (msg: string) => void;
}

const SUBJECTS = [
  uiText("Khoa học tự nhiên"),
  uiText("Toán"),
  uiText("Ngữ văn"),
  uiText("Tiếng Anh"),
  uiText("Vật lí"),
  uiText("Hóa học"),
  uiText("Sinh học"),
  uiText("Lịch sử và Địa lí"),
  uiText("Tin học"),
  uiText("Công nghệ"),
  uiText("Giáo dục kinh tế và pháp luật"),
];

function downloadBlob(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TeacherSuiteWorkspace({ initialTab = "assessment", tab: controlledTab, hideTabs = false, onSendPrompt, notice }: Props) {
  const [innerTab, setTab] = useState<FeatureKey>(initialTab);
  const tab = controlledTab ?? innerTab;

  // ==========================================================================
  // 1. MA TRẬN & BẢN ĐẶC TẢ GDPT 2018 (BÓC TÁCH YCCĐ)
  // ==========================================================================
  const [specDoc, setSpecDoc] = useState<ParsedSpecification>(SAMPLE_SPEC_KHTN7);
  const [specSource,setSpecSource]=useState('');
  const [specItems, setSpecItems] = useState<SpecYCCDItem[]>(SAMPLE_SPEC_KHTN7.items);
  const [activeSpecFile, setActiveSpecFile] = useState<string>(uiText("KHTN 7 - Phan Văn Trị - deda - matran.docx"));
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("ALL");
  const [allocationMode,setAllocationMode]=useState<'selection'|'matrix'>('selection');
  const [matrixSource,setMatrixSource]=useState('');
  const [matrixName,setMatrixName]=useState('');
  const [manualMatrix,setManualMatrix]=useState(false);
  const [matrixBusy,setMatrixBusy]=useState(false);
  const [matrixError,setMatrixError]=useState('');
  const [fileBusy,setFileBusy]=useState(false);
  const [fileError,setFileError]=useState('');
  const [matrixCheck,setMatrixCheck]=useState<{snapshot:string;cells:MatrixCell[]}>();
  const snapshot=JSON.stringify({matrixSource,specItems,manualMatrix});
  const latestSnapshot=useRef(snapshot);latestSnapshot.current=snapshot;
  const matrixReady=allocationMode==='selection'||matrixCheck?.snapshot===snapshot;
  const matrixFileInputRef=useRef<HTMLInputElement>(null);
  const loadMatrix=(text:string,name:string)=>{setMatrixSource(text);setMatrixName(name);setMatrixCheck(undefined);setMatrixError('');};
  function loadSpecification(text:string,name:string){
    const parsed=parseSpecificationDocument(text);
    setSpecSource(text);setActiveSpecFile(name);
    if(!parsed.items.length){
      setSpecItems([]);setMatrixCheck(undefined);notice('Chưa trích được YCCĐ từ tệp này. Không dùng đặc tả mẫu thay cho nguồn; cần cung cấp bảng văn bản đọc được.');return;
    }
    setSpecDoc(parsed);setSpecItems(parsed.items);setMatrixCheck(undefined);
    if(parsed.issues?.length)notice(parsed.issues.join('\n'));
  }
  async function reconcileMatrix(){
    const request=snapshot;setMatrixBusy(true);setMatrixError('');setMatrixCheck(undefined);
    try{
      const result=await rpc<{items:SpecYCCDItem[];cells:MatrixCell[]}>('assessmentMatrix',{source:matrixSource,items:specItems,manual:manualMatrix});
      if(latestSnapshot.current!==request){setMatrixError('Nguồn hoặc phân bổ vừa đổi; cần kiểm tra lại.');return;}
      setSpecItems(result.items);
      setMatrixCheck({snapshot:JSON.stringify({matrixSource,specItems:result.items,manualMatrix}),cells:result.cells});
    }catch(e){setMatrixError(e instanceof Error?e.message:String(e));}finally{setMatrixBusy(false);}
  }
  function planAssessment(format:string){
    if(!matrixReady||matrixBusy){notice('Cần đối chiếu ma trận và phân bổ trước.');return;}
    if(!specItems.some(x=>x.selected&&(x.part1Count>0||x.part2Count>0||x.part3Points>0))){notice('Chưa có YCCĐ được phân bổ để tạo hồ sơ.');return;}
    onSendPrompt(examPlanPrompt(`Tạo hồ sơ kiểm tra ${format}. ${allocationMode==='selection'?'Lấy đúng các YCCĐ và số câu/điểm người dùng chọn làm chuẩn để sinh ma trận.':'Lấy ma trận đính kèm làm chuẩn; kiểm lại phân bổ đã đối chiếu, không thay ma trận để khớp đặc tả.'}`,{spec:{...specDoc,items:specItems},specSource,specFile:activeSpecFile,mode:allocationMode,matrix:allocationMode==='matrix'?{name:matrixName,source:matrixSource,cells:matrixCheck?.cells}:undefined}));
  }

  const specAudit = useMemo(() => auditSpecification(specItems), [specItems]);

  const topicsList = useMemo(() => {
    const set = new Set<string>();
    specItems.forEach((it) => set.add(it.topic));
    return Array.from(set);
  }, [specItems]);

  const filteredYccdItems = useMemo(() => {
    if (selectedTopicFilter === "ALL") return specItems;
    return specItems.filter((it) => it.topic === selectedTopicFilter);
  }, [specItems, selectedTopicFilter]);

  function toggleYccdSelect(id: string) {
    setSpecItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const nextSelected = !it.selected;
        return {
          ...it,
          selected: nextSelected,
          part1Count: nextSelected && it.part1Count === 0 && it.level === "NB" ? 1 : it.part1Count,
        };
      }),
    );
  }

  function updateYccdCount(id: string, part: "p1" | "p2" | "p3", delta: number) {
    setSpecItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (part === "p1") {
          const next = Math.max(0, (it.part1Count || 0) + delta);
          return { ...it, part1Count: next, selected: next > 0 || it.part2Count > 0 || it.part3Points > 0 };
        }
        if (part === "p2") {
          const next = Math.max(0, (it.part2Count || 0) + delta);
          return { ...it, part2Count: next, selected: next > 0 || it.part1Count > 0 || it.part3Points > 0 };
        }
        if (part === "p3") {
          const next = Math.max(0, Number(((it.part3Points || 0) + delta * 0.5).toFixed(2)));
          return { ...it, part3Points: next, selected: next > 0 || it.part1Count > 0 || it.part2Count > 0 };
        }
        return it;
      }),
    );
  }

  function loadPrebuiltSpec(grade: "7" | "8" | "9") {
    setSpecSource('');
    if (grade === "7") {
      setSpecDoc(SAMPLE_SPEC_KHTN7);
      setSpecItems(SAMPLE_SPEC_KHTN7.items);
      setActiveSpecFile(uiText("KHTN 7 - Phan Văn Trị - Q. Gò Vấp - deda - matran.docx"));
      notice(uiText("Đã nạp Bản đặc tả & Ma trận KHTN 7 (THCS Phan Văn Trị) - 18 YCCĐ."));
    } else if (grade === "8") {
      setSpecDoc(SAMPLE_SPEC_KHTN8);
      setSpecItems(SAMPLE_SPEC_KHTN8.items);
      setActiveSpecFile(uiText("KHTN 8 - Phan Văn Trị - Q. Gò Vấp - deda - matran.docx"));
      notice(uiText("Đã nạp Bản đặc tả & Ma trận KHTN 8 (THCS Phan Văn Trị) - 8 YCCĐ chủ đề Điện, Nhiệt, Cơ thể người."));
    } else {
      setSpecDoc(SAMPLE_SPEC_KHTN9);
      setSpecItems(SAMPLE_SPEC_KHTN9.items);
      setActiveSpecFile(uiText("KHTN 9 - Phan Văn Trị - Q. Gò Vấp - deda - matran.docx"));
      notice(uiText("Đã nạp Bản đặc tả & Ma trận KHTN 9 (THCS Phan Văn Trị) - 10 YCCĐ Hữu cơ, Di truyền, Nhiễm sắc thể."));
    }
  }

  // ==========================================================================
  // 2. TRỘN ĐỀ TRẮC NGHIỆM
  // ==========================================================================
  const [rawExam, setRawExam] = useState<string>(SAMPLE_REAL_EXAM_KHTN7);
  const [activeExamFile, setActiveExamFile] = useState<string>(uiText("KHTN 7 - Phan Văn Trị - deda.docx"));
  const [variantCount, setVariantCount] = useState<number>(4);
  const [startCode, setStartCode] = useState<number>(101);
  const [shuffleQ, setShuffleQ] = useState<boolean>(true);
  const [shuffleOpt, setShuffleOpt] = useState<boolean>(true);
  const [examTitle, setExamTitle] = useState<string>(uiText("Đề kiểm tra Cuối kì II - KHTN 7 (THCS Phan Văn Trị)"));
  const [selectedCodeIdx, setSelectedCodeIdx] = useState<number>(0);

  const mixedResult = useMemo(
    () =>
      mixExamVariants(rawExam, {
        variantCount,
        startCode,
        shuffleQuestions: shuffleQ,
        shuffleOptions: shuffleOpt,
        examTitle,
      }),
    [rawExam, variantCount, startCode, shuffleQ, shuffleOpt, examTitle],
  );
  function planMixer(format:string){
    onSendPrompt(examPlanPrompt(`Kiểm định đề gốc và hoán vị, xuất ${format}. Đối chiếu từng câu, phương án đúng và ánh xạ đáp án của mọi mã đề; không lấy riêng bảng đáp án để dựng lại câu hỏi.`,{source:rawExam,title:examTitle,variants:mixedResult.variants,answerCsv:mixedResult.answerCsv}));
  }

  // ==========================================================================
  // 3. RÀ SOÁT NGHỊ ĐỊNH 30/2020 & CĂN CỨ PHÁP LÝ
  // ==========================================================================
  const [adminInput, setAdminInput] = useState<string>(SAMPLE_ADMIN_DOC);
  const [activeAdminFile, setActiveAdminFile] = useState<string>("Ke-hoach-kiem-tra-dinh-ky.docx");
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(
    () => new Set(["quoc-hieu", "ngay-thang-nd30", "ngay-le-nd30", "tt58-26-expired", "tt30-22-tieu-hoc", "cv5512-update", "dau-cau-khoang-trang"]),
  );
  const adminResult = useMemo(() => reviewAdminDocument(adminInput, acceptedIds), [adminInput, acceptedIds]);

  // ==========================================================================
  // 4. SỔ ĐIỂM & NHẬN XÉT HỌC BẠ TT 22/27
  // ==========================================================================
  const [gradeInput, setGradeInput] = useState<string>(SAMPLE_GRADEBOOK_EXCEL_CSV);
  const [activeGradeFile, setActiveGradeFile] = useState<string>("Bang-diem-KHTN-7A1-PhanVanTri.xlsx");
  const [circular, setCircular] = useState<"TT22" | "TT27">("TT22");
  const [gradeSubject, setGradeSubject] = useState<string>(uiText("Khoa học tự nhiên"));
  const gradeResult = useMemo(
    () => analyzeGradebook(gradeInput, { circular, subject: gradeSubject }),
    [gradeInput, circular, gradeSubject],
  );

  // ==========================================================================
  // 5. GIÁO ÁN 5512 SANG SLIDE
  // ==========================================================================
  const [lessonInput, setLessonInput] = useState<string>(SAMPLE_LESSON_5512);
  const [activeLessonFile, setActiveLessonFile] = useState<string>("KHBD-Bai-19-Tu-truong-KHTN-7.docx");
  const [targetSlideCount, setTargetSlideCount] = useState<number>(5);
  const [customSlides, setCustomSlides] = useState<SlideOutline[]>([]);

  const generatedDeck = useMemo(
    () => convertLessonPlanToSlides(lessonInput, { targetSlideCount }),
    [lessonInput, targetSlideCount],
  );

  useEffect(() => {
    setCustomSlides(generatedDeck.slides);
  }, [generatedDeck]);

  // ==========================================================================
  // FILE ATTACHMENT & DRAG-AND-DROP HELPERS
  // ==========================================================================
  const specFileInputRef = useRef<HTMLInputElement>(null);
  const examFileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const gradeFileInputRef = useRef<HTMLInputElement>(null);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);

  async function handlePickFile(
    fileTypeLabel: string,
    extensions: string[],
    onLoaded: (text: string, filename: string) => void,
    fallbackInputRef?: React.RefObject<HTMLInputElement | null>,
  ) {
    let picks:string[];
    try {
      picks = await pickFiles(false, { name: fileTypeLabel, extensions });
    } catch {
      fallbackInputRef?.current?.click();return;
    }
    if(picks[0])await extractSelectedFile(picks[0],onLoaded);
  }

  async function extractSelectedFile(path:string,onLoaded:(text:string,name:string)=>void){
    setFileBusy(true);setFileError('');
    try{
      const res=await rpc<{text:string;name:string}>('extractText',{path,preserveRefs:onLoaded===loadMatrix||onLoaded===loadSpecification});
      if(!res?.text?.trim())throw new Error('Không trích được văn bản. Với PDF ảnh, cần nguồn có lớp văn bản hoặc bản Word.');
      onLoaded(res.text.trim(),res.name||path.split(/[\\/]/).pop()||path);
      notice(uiText('Đã đọc tệp: {0}',[res.name||path]));
    }catch(error){
      const message=`Không đọc được tệp: ${error instanceof Error?error.message:String(error)}`;
      setFileError(message);notice(message);
    }finally{setFileBusy(false);}
  }

  function handleNativeFileInput(
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (text: string, filename: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name;
    const path = (file as any).path;

    if (path) {
      void extractSelectedFile(path,onLoaded);
      e.target.value='';return;
    }

    if (/\.(txt|md|csv)$/i.test(name)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = String(ev.target?.result ?? "");
        if (content.trim()) {
          onLoaded(content.trim(), name);
          notice(uiText("Đã nạp nội dung: {0}",[name]));
        }
      };
      reader.readAsText(file);
    } else {
      notice(uiText("Chưa đọc được {0}: trình duyệt không cung cấp đường dẫn. Hãy dùng nút chọn tệp trong ứng dụng desktop hoặc dán văn bản nguồn.",[name]));
    }
    e.target.value = "";
  }

  function handleFileDrop(
    e: React.DragEvent,
    onLoaded: (text: string, filename: string) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const name = file.name;
    const path = (file as any).path;

    if (path) {
      void extractSelectedFile(path,onLoaded);
      return;
    }

    if (/\.(txt|md|csv)$/i.test(name)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = String(ev.target?.result ?? "");
        if (content.trim()) {
          onLoaded(content.trim(), name);
          notice(uiText("Đã nạp tệp: {0}",[name]));
        }
      };
      reader.readAsText(file);
    } else {
      notice(uiText("Đã nhận tệp {0}. Bấm vào hộp để chọn và trích xuất qua PVTA.",[name]));
    }
  }

  return (
    <div className="teacher-suite-wrapper">
      {/* Tab Navigation */}
      {!hideTabs && <nav className="suite-tabs" role="tablist">
        {TEACHER_FEATURES.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={tab === f.key}
            className={`suite-tab tone-${f.tone} ${tab === f.key ? "active" : ""}`}
            onClick={() => setTab(f.key)}
          >
            <Icon name={f.icon} size={18} />
            <div className="suite-tab-label">
              <span className="suite-tab-title">{f.shortTitle}</span>
              <span className="suite-tab-badge">{f.badge}</span>
            </div>
          </button>
        ))}
      </nav>}

      {/* ================================================================== */}
      {/* TAB 1: MA TRẬN & BẢN ĐẶC TẢ GDPT 2018 (BÓC TÁCH YCCĐ)             */}
      {/* ================================================================== */}
      {tab === "assessment" && (
        <section className="suite-panel">
          <div className="suite-head">
            <div>
              <span className="suite-badge indigo">{uiText("TÍNH NĂNG 1 · GDPT 2018")}</span>
              <h2>Ma trận & bản đặc tả</h2>
              <p>Nạp tài liệu, xem dữ liệu đã đọc và đối chiếu trước khi lập hồ sơ kiểm tra. Giữ nguyên số liệu và yêu cầu cần đạt từ nguồn.</p>
            </div>
            {allocationMode==='selection'&&<div className="suite-kpis">
              <div className="kpi-chip">
                <span>{uiText("Phần I (TN)")}</span>
                <strong>{specAudit.part1Count}{uiText("/16 câu (")}{specAudit.part1Score.toFixed(2)}{uiText("đ)")}</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("Phần II (Đ/S)")}</span>
                <strong>{specAudit.part2Count}{uiText("/2 câu (")}{specAudit.part2Score.toFixed(2)}{uiText("đ)")}</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("Phần III (TL)")}</span>
                <strong>{specAudit.part3Score.toFixed(2)}{uiText("đ / 4.0đ")}</strong>
              </div>
              <div className="kpi-chip highlight">
                <span>{uiText("Tổng điểm")}</span>
                <strong>{specAudit.totalScore.toFixed(2)} {uiText("/ 10.0đ")}</strong>
              </div>
            </div>}
          </div>

          {/* Hero Upload & Dropzone for Bản đặc tả */}
          <div
            className="hero-file-dropzone indigo-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleFileDrop(e, loadSpecification)
            }
            onClick={() =>
              handlePickFile(
                uiText("Bản đặc tả Ma trận (.docx, .pdf, .txt, .md)"),
                ["docx", "pdf", "txt", "md"],
                loadSpecification,
                specFileInputRef,
              )
            }
          >
            <input
              ref={specFileInputRef}
              type="file"
              accept=".docx,.pdf,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) =>
                handleNativeFileInput(e, loadSpecification)
              }
            />
            <div className="dropzone-icon">
              <Icon name="exam" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>{uiText("Kéo thả hoặc Bấm tải lên Bản đặc tả kiểm tra (.docx, .pdf, .txt)")}</strong>
              <span>{uiText("PVTA tự động đọc bảng đặc tả, trích xuất Chương/Chủ đề, Bài, Mức độ nhận thức và từng YCCĐ để thầy cô chọn")}</span>
            </div>
            <div className="dropzone-status">
              <span className="file-pill">
                {specSource?'Đã đọc: ':'Mẫu minh họa: '}<strong>{activeSpecFile}</strong> ({specItems.length} {uiText("YCCĐ)")}</span>
            </div>
          </div>

          <div className="suite-form-grid">
            <label>Cách lập ma trận<select value={allocationMode} onChange={e=>setAllocationMode(e.target.value as 'selection'|'matrix')}>
              <option value="selection">1. Chọn câu trong đặc tả → sinh ma trận</option>
              <option value="matrix">2. Đính kèm ma trận → phân bổ đặc tả theo ma trận</option>
            </select></label>
          </div>
            {allocationMode==='matrix'&&<div className="matrix-workflow" aria-busy={fileBusy||matrixBusy}>
              <div className="matrix-section-heading"><div><h3>1. Nguồn ma trận</h3><p>Đọc bảng gốc trước, đối chiếu với bản đặc tả sau.</p></div></div>
              <div className="matrix-file-card" onDragOver={e=>e.preventDefault()} onDrop={e=>handleFileDrop(e,loadMatrix)}>
              <div><strong>{matrixName||'Chưa chọn tệp ma trận'}</strong><p>Word, PDF, Excel hoặc văn bản. Kéo thả tệp vào đây hoặc bấm chọn tệp.</p></div>
              <button type="button" className="suite-btn secondary" disabled={fileBusy||matrixBusy} onClick={()=>void handlePickFile('Ma trận',['docx','pdf','xlsx','txt','md','csv'],loadMatrix,matrixFileInputRef)}>{fileBusy?'Đang đọc tệp…':matrixSource?'Thay tệp ma trận':'Đính kèm ma trận'}</button>
              </div>
              <input ref={matrixFileInputRef} type="file" accept=".docx,.pdf,.xlsx,.txt,.md,.csv" hidden onChange={e=>handleNativeFileInput(e,loadMatrix)}/>
              {fileError&&<p className="matrix-status" role="alert">{fileError}</p>}
              <MatrixSourcePreview source={matrixSource} name={matrixName} onExport={text=>downloadBlob('bao-cao-doc-ma-tran.md',text,'text/markdown;charset=utf-8')}/>
              <details><summary>Xem hoặc sửa văn bản nguồn / dán nội dung</summary>
              <textarea aria-label="Nội dung ma trận" value={matrixSource} onChange={e=>loadMatrix(e.target.value,matrixName)} placeholder="Nội dung ma trận trích xuất; có thể dán bảng văn bản tại đây" rows={5}/>
              </details>
              <div className="matrix-process"><h3>3. Đối chiếu và phân bổ</h3>
              <p className="matrix-caption">Bộ phân bổ hiện dùng câu nguyên: TN 0,25 điểm/câu, Đ/S 1 điểm/câu. Báo cáo đọc nguồn ở trên vẫn giữ từng ý và số liệu gốc.</p>
              <label><input type="checkbox" checked={manualMatrix} onChange={e=>setManualMatrix(e.target.checked)}/>Tôi tự phân bổ; chỉ kiểm tra với ma trận</label>
              <button type="button" className="suite-btn primary indigo" disabled={!matrixSource.trim()||!specSource.trim()||!specItems.length||matrixBusy||fileBusy} onClick={()=>void reconcileMatrix()}>{matrixBusy?'Đang phân bổ và kiểm định…':manualMatrix?'Kiểm tra phân bổ đã chọn':'AI chọn YCCĐ và phân bổ theo ma trận'}</button>
              <p className="matrix-status" role={matrixError?'alert':'status'}>{matrixError||(matrixBusy?'Đang đối chiếu nguồn và kiểm định độc lập.':matrixReady?'Đã đối chiếu từng ô và kiểm định AI; Plan Pro sẽ kiểm tra lại trước khi xuất.':!specSource.trim()?'Nạp bản đặc tả của thầy cô để phân bổ; dữ liệu mẫu không được dùng thay nguồn.':'Chưa đối chiếu ma trận hiện tại. Báo cáo đọc nguồn vẫn có thể xuất.')}</p>
              </div>
            </div>}
          <p>Mọi đầu ra đề thi phải qua Plan Pro: đối chiếu nguồn, soạn đề, giải kiểm độc lập, kiểm bao phủ rồi mới xuất.</p>
          {/* Quick Presets based on real school files */}
          <div className="preset-quick-bar">
            <span className="preset-label">{uiText("⚡ Nạp nhanh mẫu chuẩn THCS Phan Văn Trị:")}</span>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("7")}>
              {uiText("KHTN 7 (Cuối kì II · 18 YCCĐ)")}</button>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("8")}>
              {uiText("KHTN 8 (Cuối kì II · Điện, Nhiệt, Cơ thể)")}</button>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("9")}>
              {uiText("KHTN 9 (Cuối kì II · Hữu cơ, Di truyền)")}</button>
            <button
              type="button"
              className="preset-btn"
              disabled={allocationMode==='matrix'}
              onClick={() => {
                setSpecItems((prev) => autoBalanceSpecification(prev));
                notice(uiText("Đã tự động phân bổ chuẩn 10.0 điểm (16 câu Phần I + 2 câu Phần II + 4.0đ Phần III)."));
              }}
            >
              {uiText("⚖️ Tự động cân đối chuẩn 10đ")}</button>
          </div>

          {/* Real-time Audit Progress Banner */}
          <div className={`audit-banner ${specAudit.isStandard10 ? "success" : "warning"}`}>
            <div className="audit-info">
              <strong>
                {specAudit.isStandard10
                  ? uiText("Tổng phân bổ hiện tại: 10.0 điểm. Chưa xác nhận chất lượng đề hoặc phù hợp ma trận.")
                  : uiText("Tổng phân bổ hiện tại: {0} điểm. Cần đối chiếu với cấu trúc đề và ma trận nguồn.",[specAudit.totalScore.toFixed(2)])}
              </strong>
              <div className="audit-sub">
                {uiText("Tỷ lệ nhận thức hiện tại: Nhận biết")}<strong>{specAudit.nbPercent}%</strong> ({specAudit.nbScore}{uiText("đ) ·\n                Thông hiểu")}<strong>{specAudit.thPercent}%</strong> ({specAudit.thScore}{uiText("đ) ·\n                Vận dụng")}<strong>{specAudit.vdPercent}%</strong> ({specAudit.vdScore}{uiText("đ) ·\n                Vận dụng cao")}<strong>{specAudit.vdcPercent}%</strong> ({specAudit.vdcScore}{uiText("đ).")}</div>
            </div>
            <div className="topic-filter-select">
              <label>{uiText("Lọc theo Chủ đề:")}</label>
              <select value={selectedTopicFilter} onChange={(e) => setSelectedTopicFilter(e.target.value)}>
                <option value="ALL">{uiText("Tất cả chủ đề (")}{specItems.length} {uiText("YCCĐ)")}</option>
                {topicsList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive YCCĐ Specification Table */}
          <div className="yccd-table-container">
            <table className="yccd-table">
              <thead>
                <tr>
                  <th style={{ width: 48, textAlign: "center" }}>{uiText("Chọn")}</th>
                  <th style={{ width: 140 }}>{uiText("Chủ đề & Bài")}</th>
                  <th style={{ width: 90, textAlign: "center" }}>{uiText("Mức độ")}</th>
                  <th>{uiText("Yêu cầu cần đạt (YCCĐ)")}</th>
                  <th style={{ width: 120, textAlign: "center" }}>{uiText("Phần I: TN (0.25đ)")}</th>
                  <th style={{ width: 120, textAlign: "center" }}>{uiText("Phần II: Đ/S (1.0đ)")}</th>
                  <th style={{ width: 120, textAlign: "center" }}>{uiText("Phần III: TL (Điểm)")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredYccdItems.map((it) => (
                  <tr key={it.id} className={it.selected ? "row-selected" : "row-unselected"}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={it.selected}
                        onChange={() => toggleYccdSelect(it.id)}
                        title={uiText("Tích chọn đưa YCCĐ này vào đề kiểm tra")}
                      />
                    </td>
                    <td>
                      <div className="unit-name"><strong>{it.unit}</strong></div>
                      <small className="topic-sub">{it.topic}</small>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`level-badge level-${it.level}`}>{it.level}</span>
                    </td>
                    <td className="yccd-content-cell">
                      <span>{it.content}</span>
                      {it.questionRef && <span className="ref-tag">{it.questionRef}</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p1", -1)} disabled={it.part1Count <= 0}>-</button>
                        <span>{it.part1Count || 0}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p1", 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p2", -1)} disabled={it.part2Count <= 0}>-</button>
                        <span>{it.part2Count || 0}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p2", 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p3", -1)} disabled={it.part3Points <= 0}>-</button>
                        <span>{it.part3Points ? it.part3Points.toFixed(1) + uiText("đ") : uiText("0đ")}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p3", 1)}>+</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Toolbar */}
          <div className="matrix-section-heading"><div><h3>Hồ sơ kiểm tra</h3><p>Tạo và kiểm định qua Plan Pro trước khi xuất đề. Báo cáo đọc nguồn có nút xuất riêng ở trên.</p></div></div>
          <div className="suite-actions-bar">
            <button
              type="button"
              className="suite-btn primary indigo"
              disabled={!matrixReady||matrixBusy}
              onClick={() => planAssessment('gồm ma trận, đặc tả, đề và đáp án')}
            >
              <Icon name="exam" size={16} />
              <span>{uiText("✨ Sinh trọn bộ Ma trận + Đặc tả + Đề & Đáp án với PVTA")}</span>
            </button>
            <button
              type="button"
              className="suite-btn secondary"
              disabled={!matrixReady||matrixBusy}
              onClick={() => planAssessment('dạng Markdown sau kiểm định')}
            >
              <Icon name="diff" size={16} />
              <span>Lập Plan Pro để xuất hồ sơ (.md)</span>
            </button>
            <button
              type="button"
              className="suite-btn secondary"
              disabled={!matrixReady||matrixBusy}
              onClick={() => planAssessment('để xem và sao chép sau kiểm định')}
            >
              <span>Lập hồ sơ để xem và sao chép</span>
            </button>
            <button
              type="button"
              className="suite-btn tertiary"
              onClick={() => {
                planAssessment('và tạo các mã đề hoán vị sau khi đã kiểm định đề gốc');
              }}
            >
              <Icon name="shuffle" size={16} />
              <span>{uiText("Đưa sang Trộn đề ↗")}</span>
            </button>
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 2: TRỘN ĐỀ TRẮC NGHIỆM & XUẤT PHIẾU ĐÁP ÁN                    */}
      {/* ================================================================== */}
      {tab === "mixer" && (
        <section className="suite-panel">
          <div className="suite-head">
            <div>
              <span className="suite-badge violet">{uiText("TÍNH NĂNG 2 · HOÁN VỊ ĐỀ THI")}</span>
              <h2>{uiText("Trộn đề trắc nghiệm & Xuất phiếu đáp án chấm tự động")}</h2>
              <p>{uiText("Tải lên Đề thi Word (.docx) hoặc Markdown (.md), PVTA tự động bóc tách từng câu hỏi và phương án A/B/C/D, hoán vị ngẫu nhiên ra nhiều mã đề và xuất CSV đáp án cho TNMaker / Azota / QM.")}</p>
            </div>
            <div className="suite-kpis">
              <div className="kpi-chip">
                <span>{uiText("Số mã đề")}</span>
                <strong>{mixedResult.variants.length} {uiText("mã")}</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("Số câu hỏi")}</span>
                <strong>{mixedResult.variants[0]?.questions.length ?? 0} {uiText("câu")}</strong>
              </div>
            </div>
          </div>

          {/* Hero Upload Dropzone for Đề thi */}
          <div
            className="hero-file-dropzone violet-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleFileDrop(e, (text, name) => {
                setRawExam(text);
                setActiveExamFile(name);
              })
            }
            onClick={() =>
              handlePickFile(
                uiText("Đề thi trắc nghiệm (.docx, .doc, .txt, .md)"),
                ["docx", "doc", "txt", "md"],
                (text, name) => {
                  setRawExam(text);
                  setActiveExamFile(name);
                },
                examFileInputRef,
              )
            }
          >
            <input
              ref={examFileInputRef}
              type="file"
              accept=".docx,.doc,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) =>
                handleNativeFileInput(e, (text, name) => {
                  setRawExam(text);
                  setActiveExamFile(name);
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="shuffle" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>{uiText("Kéo thả hoặc Bấm tải lên Đề thi Word (.docx) hoặc Markdown (.md)")}</strong>
              <span>{uiText("PVTA tự động nhận diện Câu 1, Câu 2... và các phương án A, B, C, D kèm đáp án đúng có dấu *")}</span>
            </div>
            <div className="dropzone-status">
              <span className="file-pill">
                {uiText("📄 Đang nạp:")}<strong>{activeExamFile}</strong> ({mixedResult.variants[0]?.questions.length || 0} {uiText("câu hỏi)")}</span>
            </div>
          </div>

          {/* Presets */}
          <div className="preset-quick-bar">
            <span className="preset-label">{uiText("⚡ Nạp nhanh đề mẫu:")}</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setRawExam(SAMPLE_REAL_EXAM_KHTN7);
                setActiveExamFile("KHTN 7 - De thi Cuoi ki II - Phan Van Tri.docx");
                setExamTitle(uiText("Đề kiểm tra Cuối kì II - KHTN 7 (THCS Phan Văn Trị)"));
                notice(uiText("Đã nạp Đề kiểm tra KHTN 7 Phan Văn Trị (16 câu trắc nghiệm thực tế)."));
              }}
            >
              {uiText("Đề KHTN 7 Phan Văn Trị (16 câu)")}</button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setRawExam(SAMPLE_RAW_EXAM);
                setActiveExamFile("De-kiem-tra-KHTN-8-Giua-ki.txt");
                notice(uiText("Đã nạp đề mẫu KHTN 8 (4 câu ví dụ)."));
              }}
            >
              {uiText("Đề mẫu KHTN 8 (Vật lí & Hoá học)")}</button>
          </div>

          {/* Mixer controls */}
          <div className="suite-form-grid">
            <label>
              {uiText("Tiêu đề đề kiểm tra")}<input type="text" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
            </label>
            <label>
              {uiText("Số lượng mã đề (1–24)")}<input
                type="number"
                min={1}
                max={24}
                value={variantCount}
                onChange={(e) => setVariantCount(Math.max(1, Math.min(24, Number(e.target.value))))}
              />
            </label>
            <label>
              {uiText("Mã đề bắt đầu")}<input
                type="number"
                min={101}
                max={999}
                value={startCode}
                onChange={(e) => setStartCode(Number(e.target.value))}
              />
            </label>
            <div className="checkbox-row" style={{ alignSelf: "flex-end" }}>
              <label>
                <input type="checkbox" checked={shuffleQ} onChange={(e) => setShuffleQ(e.target.checked)} />
                {uiText("Đảo thứ tự câu hỏi")}</label>
              <label>
                <input type="checkbox" checked={shuffleOpt} onChange={(e) => setShuffleOpt(e.target.checked)} />
                {uiText("Đảo thứ tự đáp án A/B/C/D")}</label>
            </div>
          </div>

          {/* Side-by-side View: Raw Exam vs Mixed Variant Preview */}
          <div className="grid-2col">
            <div className="col">
              <div className="col-header">
                <strong>{uiText("Đề gốc đã nhận diện (")}{mixedResult.variants[0]?.questions.length || 0} {uiText("câu)")}</strong>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    handlePickFile(uiText("Đề thi Word (.docx)"), ["docx", "doc", "txt", "md"], (text, name) => {
                      setRawExam(text);
                      setActiveExamFile(name);
                    }, examFileInputRef)
                  }
                >
                  {uiText("Đổi tệp đề khác…")}</button>
              </div>
              <textarea
                className="suite-textarea mono"
                rows={12}
                value={rawExam}
                onChange={(e) => setRawExam(e.target.value)}
                placeholder={uiText("Nội dung đề thi trắc nghiệm...")}
              />
            </div>

            <div className="col">
              <div className="col-header">
                <strong>{uiText("Xem trước mã đề đã trộn:")}</strong>
                <div className="variant-tabs">
                  {mixedResult.variants.map((v, i) => (
                    <button
                      key={v.code}
                      type="button"
                      className={`variant-tab ${selectedCodeIdx === i ? "active" : ""}`}
                      onClick={() => setSelectedCodeIdx(i)}
                    >
                      {uiText("Mã")} {v.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="variant-preview-box">
                <pre>{mixedResult.variants[selectedCodeIdx]?.formattedText ?? uiText("Chưa có nội dung đề.")}</pre>
              </div>
            </div>
          </div>

          <div className="suite-actions-bar">
            <button
              type="button"
              className="suite-btn secondary"
              onClick={() => {
                planMixer('tất cả mã đề dạng .txt');
              }}
            >
              <Icon name="arrow-down" size={16} />
              <span>{uiText("Tải tất cả")} {mixedResult.variants.length} {uiText("mã đề (.txt)")}</span>
            </button>
            <button
              type="button"
              className="suite-btn secondary"
              onClick={() => {
                planMixer('phiếu đáp án .csv cho TNMaker / Azota');
              }}
            >
              <Icon name="arrow-down" size={16} />
              <span>{uiText("Xuất CSV Phiếu đáp án (TNMaker / Azota)")}</span>
            </button>
            <button
              type="button"
              className="suite-btn primary violet"
              onClick={() => planMixer('trọn bộ mã đề và đáp án sang Word (.docx)')}
            >
              <span>{uiText("✨ Xuất trọn bộ Mã đề & Đáp án sang Word (.docx) với PVTA ↗")}</span>
            </button>
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 3: RÀ SOÁT NGHỊ ĐỊNH 30/2020 & CĂN CỨ PHÁP LÝ                  */}
      {/* ================================================================== */}
      {tab === "diff" && (
        <section className="suite-panel">
          <div className="suite-head">
            <div>
              <span className="suite-badge amber">{uiText("TÍNH NĂNG 3 · NGHỊ ĐỊNH 30/2020 & PHÁP LÝ")}</span>
              <h2>{uiText("Trình xem Diff View Rà soát Thể thức & Căn cứ Pháp lý")}</h2>
              <p>{uiText("Tải lên tệp Word (.docx) hoặc PDF (.pdf) công văn, kế hoạch để tự động đối chiếu lỗi thể thức Quốc hiệu, ngày tháng năm theo NĐ 30/2020/NĐ-CP và cảnh báo các Thông tư giáo dục hết hiệu lực.")}</p>
            </div>
            <div className="suite-kpis">
              <div className="kpi-chip">
                <span>{uiText("Phát hiện")}</span>
                <strong>{adminResult.issues.length} {uiText("mục")}</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("Trạng thái")}</span>
                <strong>{adminResult.issues.length > 0 ? uiText("Đã đối chiếu") : uiText("Chuẩn thể thức")}</strong>
              </div>
            </div>
          </div>

          {/* Hero Upload Dropzone for Văn bản */}
          <div
            className="hero-file-dropzone amber-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleFileDrop(e, (text, name) => {
                setAdminInput(text);
                setActiveAdminFile(name);
              })
            }
            onClick={() =>
              handlePickFile(
                uiText("Văn bản hành chính Word (.docx, .doc, .pdf)"),
                ["docx", "doc", "pdf", "txt"],
                (text, name) => {
                  setAdminInput(text);
                  setActiveAdminFile(name);
                },
                adminFileInputRef,
              )
            }
          >
            <input
              ref={adminFileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt"
              style={{ display: "none" }}
              onChange={(e) =>
                handleNativeFileInput(e, (text, name) => {
                  setAdminInput(text);
                  setActiveAdminFile(name);
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="diff" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>{uiText("Kéo thả hoặc Bấm tải lên Công văn, Kế hoạch Word (.docx) hoặc PDF")}</strong>
              <span>{uiText("PVTA tự động rà soát thể thức Quốc hiệu, ngày tháng năm và kiểm tra hiệu lực thông tư quy chế")}</span>
            </div>
            <div className="dropzone-status">
              <span className="file-pill">
                {uiText("📄 Đang rà soát:")}<strong>{activeAdminFile}</strong> ({adminResult.issues.length} {uiText("cảnh báo)")}</span>
            </div>
          </div>

          {/* Presets */}
          <div className="preset-quick-bar">
            <span className="preset-label">{uiText("⚡ Nạp nhanh văn bản mẫu:")}</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setAdminInput(SAMPLE_ADMIN_DOC);
                setActiveAdminFile("Ke-hoach-kiem-tra-dinh-ky-THCS-Phan-Van-Tri.docx");
                notice(uiText("Đã nạp văn bản Kế hoạch kiểm tra THCS Phan Văn Trị có lỗi thể thức & căn cứ cũ."));
              }}
            >
              {uiText("Kế hoạch kiểm tra THCS Phan Văn Trị (Lỗi TT 58/2011, TT 26/2020 & ngày tháng)")}</button>
          </div>

          {/* Diff View 2 Columns */}
          <div className="grid-2col">
            <div className="col">
              <div className="col-header">
                <strong>{uiText("Văn bản gốc cần rà soát")}</strong>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    handlePickFile(uiText("Văn bản Word (.docx, .pdf)"), ["docx", "doc", "pdf", "txt"], (text, name) => {
                      setAdminInput(text);
                      setActiveAdminFile(name);
                    }, adminFileInputRef)
                  }
                >
                  {uiText("Đổi tệp văn bản…")}</button>
              </div>
              <textarea
                className="suite-textarea mono"
                rows={14}
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
                placeholder={uiText("Dán nội dung công văn hoặc tải tệp Word/PDF lên...")}
              />
            </div>

            <div className="col">
              <div className="col-header">
                <strong>{uiText("Bản đã chuẩn hóa (Diff Preview)")}</strong>
                <span className="badge-count">{uiText("Đã chuẩn hóa")} {adminResult.issues.length} {uiText("lỗi")}</span>
              </div>
              <div className="diff-issues-list">
                {adminResult.issues.map((iss) => {
                  const checked = acceptedIds.has(iss.id);
                  return (
                    <div key={iss.id} className={`diff-issue-card category-${iss.category} ${checked ? "applied" : ""}`}>
                      <label className="diff-issue-head">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(acceptedIds);
                            if (e.target.checked) next.add(iss.id);
                            else next.delete(iss.id);
                            setAcceptedIds(next);
                          }}
                        />
                        <span className="diff-issue-title">{iss.title}</span>
                      </label>
                      <div className="diff-issue-chips">
                        <span className="chip-original">{iss.before}</span>
                        <span className="chip-arrow">→</span>
                        <span className="chip-replacement">{iss.after}</span>
                      </div>
                      <small className="diff-issue-reason">{iss.explanation}</small>
                    </div>
                  );
                })}
              </div>
              <div className="diff-preview-box">
                <pre>{adminResult.normalizedText}</pre>
              </div>
            </div>
          </div>

          <div className="suite-actions-bar">
            <button
              type="button"
              className="suite-btn secondary"
              onClick={() => {
                navigator.clipboard.writeText(adminResult.normalizedText);
                notice(uiText("Đã sao chép văn bản chuẩn hóa vào bộ nhớ tạm."));
              }}
            >
              <span>{uiText("📋 Sao chép văn bản chuẩn hóa")}</span>
            </button>
            <button
              type="button"
              className="suite-btn primary amber"
              onClick={() =>
                onSendPrompt(
                  `/office-dap-an Hãy xuất bản lại văn bản hành chính sau đây sang tệp Word (.docx) chuẩn thể thức Nghị định 30/2020/NĐ-CP:\n\n` +
                    adminResult.normalizedText,
                )
              }
            >
              <span>{uiText("✨ Chuẩn hóa & Xuất công văn chuẩn NĐ 30/2020 với PVTA ↗")}</span>
            </button>
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 4: SỔ ĐIỂM & NHẬN XÉT HỌC BẠ TT 22/27                           */}
      {/* ================================================================== */}
      {tab === "gradebook" && (
        <section className="suite-panel">
          <div className="suite-head">
            <div>
              <span className="suite-badge emerald">{uiText("TÍNH NĂNG 4 · THÔNG TƯ 22 & 27")}</span>
              <h2>{uiText("Trợ lý Nhận xét Học bạ & Phân tích Sổ điểm thông minh")}</h2>
              <p>{uiText("Tải lên Sổ điểm Excel (.xlsx, .csv) để tự động tính ĐTBmhk, xếp loại học lực và sinh nhận xét học bạ cá nhân hóa không trùng lặp cho từng học sinh.")}</p>
            </div>
            <div className="suite-kpis">
              <div className="kpi-chip">
                <span>{uiText("Sĩ số")}</span>
                <strong>{gradeResult.students.length} HS</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("ĐTB chung")}</span>
                <strong>{gradeResult.classAverage.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Hero Upload Dropzone for Excel */}
          <div
            className="hero-file-dropzone emerald-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleFileDrop(e, (text, name) => {
                const parsed = parseExcelGradebook(text);
                if (parsed.length > 0) {
                  const lines = parsed.map(
                    (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                  );
                  setGradeInput(lines.join("\n"));
                } else {
                  setGradeInput(text);
                }
                setActiveGradeFile(name);
              })
            }
            onClick={() =>
              handlePickFile(
                uiText("Sổ điểm Excel (.xlsx, .xls, .csv)"),
                ["xlsx", "xls", "csv", "txt"],
                (text, name) => {
                  const parsed = parseExcelGradebook(text);
                  if (parsed.length > 0) {
                    const lines = parsed.map(
                      (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                    );
                    setGradeInput(lines.join("\n"));
                  } else {
                    setGradeInput(text);
                  }
                  setActiveGradeFile(name);
                },
                gradeFileInputRef,
              )
            }
          >
            <input
              ref={gradeFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              style={{ display: "none" }}
              onChange={(e) =>
                handleNativeFileInput(e, (text, name) => {
                  const parsed = parseExcelGradebook(text);
                  if (parsed.length > 0) {
                    const lines = parsed.map(
                      (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                    );
                    setGradeInput(lines.join("\n"));
                  } else {
                    setGradeInput(text);
                  }
                  setActiveGradeFile(name);
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="grade" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>{uiText("Kéo thả hoặc Bấm tải lên Sổ điểm Excel (.xlsx, .xls, .csv)")}</strong>
              <span>{uiText("PVTA tự động đọc danh sách học sinh, điểm TX1..TX4, Giữa kì, Cuối kì và tính ĐTBmhk tự động")}</span>
            </div>
            <div className="dropzone-status">
              <span className="file-pill">
                {uiText("📄 Đang nạp:")}<strong>{activeGradeFile}</strong> ({gradeResult.students.length} {uiText("học sinh)")}</span>
            </div>
          </div>

          {/* Presets */}
          <div className="preset-quick-bar">
            <span className="preset-label">{uiText("⚡ Nạp nhanh sổ điểm mẫu:")}</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                const parsed = parseExcelGradebook(SAMPLE_GRADEBOOK_EXCEL_CSV);
                const lines = parsed.map(
                  (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                );
                setGradeInput(lines.join("\n"));
                setActiveGradeFile("So-diem-Lop-7A1-Phan-Van-Tri-35HS.xlsx");
                notice(uiText("Đã nạp Sổ điểm Lớp 7A1 - THCS Phan Văn Trị (35 học sinh)."));
              }}
            >
              {uiText("Lớp 7A1 THCS Phan Văn Trị (35 học sinh đầy đủ điểm)")}</button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setGradeInput(SAMPLE_GRADEBOOK_INPUT);
                setActiveGradeFile("So-diem-mau-5-hoc-sinh.csv");
                notice(uiText("Đã nạp danh sách 5 học sinh mẫu."));
              }}
            >
              {uiText("Mẫu 5 học sinh cơ bản")}</button>
          </div>

          <div className="suite-form-grid">
            <label>
              {uiText("Quy chuẩn Thông tư đánh giá")}<select value={circular} onChange={(e) => setCircular(e.target.value as "TT22" | "TT27")}>
                <option value="TT22">{uiText("Thông tư 22/2021/TT-BGDĐT (THCS & THPT)")}</option>
                <option value="TT27">{uiText("Thông tư 27/2020/TT-BGDĐT (Tiểu học)")}</option>
              </select>
            </label>
            <label>
              {uiText("Môn học nhận xét")}<input type="text" value={gradeSubject} onChange={(e) => setGradeSubject(e.target.value)} />
            </label>
            <div className="stats-badges-row">
              {Object.entries(gradeResult.counts).map(([lvl, cnt]) => (
                <span key={lvl} className="stat-badge">
                  {lvl}: <strong>{cnt} HS</strong> ({Math.round(((cnt as number) / (gradeResult.students.length || 1)) * 100)}%)
                </span>
              ))}
            </div>
          </div>

          {/* Student Table & Comments */}
          <div className="grade-results-container">
            <div className="col-header">
              <strong>{uiText("Bảng kết quả ĐTBmhk & Nhận xét học bạ gợi ý (")}{gradeResult.students.length} {uiText("học sinh)")}</strong>
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  handlePickFile(uiText("Sổ điểm Excel (.xlsx)"), ["xlsx", "xls", "csv", "txt"], (text, name) => {
                    const parsed = parseExcelGradebook(text);
                    if (parsed.length > 0) {
                      const lines = parsed.map(
                        (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                      );
                      setGradeInput(lines.join("\n"));
                    } else {
                      setGradeInput(text);
                    }
                    setActiveGradeFile(name);
                  }, gradeFileInputRef)
                }
              >
                {uiText("Tải tệp Excel khác…")}</button>
            </div>
            <div className="gradebook-table-wrapper">
              <table className="grade-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>TT</th>
                    <th style={{ width: 170 }}>{uiText("Họ tên")}</th>
                    <th style={{ width: 100 }}>{uiText("Điểm TX")}</th>
                    <th style={{ width: 60 }}>GK</th>
                    <th style={{ width: 60 }}>CK</th>
                    <th style={{ width: 70 }}>{uiText("ĐTBmhk")}</th>
                    <th style={{ width: 80 }}>{uiText("Mức đạt")}</th>
                    <th>{uiText("Nhận xét học bạ gợi ý (không trùng lặp)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeResult.students.map((s) => (
                    <tr key={s.index}>
                      <td style={{ textAlign: "center" }}>{s.index}</td>
                      <td><strong>{s.name}</strong></td>
                      <td className="mono">{s.txScores.join(", ")}</td>
                      <td className="mono">{s.midterm}</td>
                      <td className="mono">{s.finalExam}</td>
                      <td className="mono highlight">{s.average.toFixed(1)}</td>
                      <td>
                        <span className={`level-pill lvl-${s.level.toLowerCase().replace(/\s+/g, "-")}`}>
                          {s.level}
                        </span>
                      </td>
                      <td className="comment-cell">{s.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="suite-actions-bar">
            <button
              type="button"
              className="suite-btn secondary"
              onClick={() => {
                downloadBlob(`Bang-diem-nhan-xet-${gradeSubject.replace(/\s+/g, "-")}.csv`, gradeResult.csvOutput, "text/csv;charset=utf-8");
                notice(uiText("Đã tải tệp CSV Sổ điểm và Nhận xét học bạ."));
              }}
            >
              <Icon name="arrow-down" size={16} />
              <span>{uiText("Tải bảng điểm & nhận xét (.csv)")}</span>
            </button>
            <button
              type="button"
              className="suite-btn primary emerald"
              onClick={() =>
                onSendPrompt(
                  uiText("/office-dap-an Hãy xuất bản Sổ điểm và Bảng nhận xét học bạ môn {0} theo {1} sang bảng tính Excel (.xlsx) định dạng chuẩn, có công thức tính ĐTB tự động và cột nhận xét chi tiết:\n\n",[gradeSubject,circular]) +
                    gradeResult.csvOutput,
                )
              }
            >
              <span>{uiText("✨ Xuất Sổ điểm & Nhận xét sang Excel (.xlsx) với PVTA ↗")}</span>
            </button>
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* TAB 5: GIÁO ÁN 5512 SANG SLIDE POWERPOINT                          */}
      {/* ================================================================== */}
      {tab === "slides" && (
        <section className="suite-panel">
          <div className="suite-head">
            <div>
              <span className="suite-badge rose">{uiText("TÍNH NĂNG 5 · CV 5512 → SLIDE")}</span>
              <h2>{uiText("Chuyển đổi Giáo án 5512 sang Slide PowerPoint 1-Click")}</h2>
              <p>{uiText("Tải lên Kế hoạch bài dạy Word (.docx) hoặc PDF (.pdf). Thầy cô được quyền tự do tăng giảm số lượng slide theo nhu cầu trình chiếu (từ 3 đến 24 slide) và chỉnh sửa chi tiết kịch bản từng slide.")}</p>
            </div>
            <div className="suite-kpis">
              <div className="kpi-chip">
                <span>{uiText("Số slide mục tiêu")}</span>
                <strong>{targetSlideCount} slide</strong>
              </div>
              <div className="kpi-chip">
                <span>{uiText("Khung tỉ lệ")}</span>
                <strong>16:9 Widescreen</strong>
              </div>
            </div>
          </div>

          {/* Hero Upload Dropzone for Giáo án */}
          <div
            className="hero-file-dropzone rose-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleFileDrop(e, (text, name) => {
                setLessonInput(text);
                setActiveLessonFile(name);
              })
            }
            onClick={() =>
              handlePickFile(
                uiText("Kế hoạch bài dạy Word (.docx, .doc, .pdf)"),
                ["docx", "doc", "pdf", "txt"],
                (text, name) => {
                  setLessonInput(text);
                  setActiveLessonFile(name);
                },
                lessonFileInputRef,
              )
            }
          >
            <input
              ref={lessonFileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt"
              style={{ display: "none" }}
              onChange={(e) =>
                handleNativeFileInput(e, (text, name) => {
                  setLessonInput(text);
                  setActiveLessonFile(name);
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="slides" size={32} />
            </div>
            <div className="dropzone-text">
              <strong>{uiText("Kéo thả hoặc Bấm tải lên Kế hoạch bài dạy (KHBD) 5512 Word (.docx) hoặc PDF")}</strong>
              <span>{uiText("PVTA tự động trích xuất Mục tiêu, Thiết bị dạy học và 4 Hoạt động học (Khởi động, Hình thành kiến thức, Luyện tập, Vận dụng)")}</span>
            </div>
            <div className="dropzone-status">
              <span className="file-pill">
                {uiText("📄 Đang nạp:")}<strong>{activeLessonFile}</strong>
              </span>
            </div>
          </div>

          {/* Presets */}
          <div className="preset-quick-bar">
            <span className="preset-label">{uiText("⚡ Nạp nhanh giáo án mẫu:")}</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setLessonInput(SAMPLE_LESSON_5512);
                setActiveLessonFile("KHBD-Bai-15-Ap-suat-KHTN-8-5512.docx");
                notice(uiText("Đã nạp Kế hoạch bài dạy Bài 15: Áp suất trên một bề mặt (KHTN 8 - CV 5512)."));
              }}
            >
              {uiText("Bài 15: Áp suất trên một bề mặt (KHTN 8)")}</button>
          </div>

          {/* Slide count controls */}
          <div className="slide-stepper-bar">
            <div className="stepper-group">
              <span className="stepper-label">{uiText("Quyết định số slide trình chiếu:")}</span>
              <div className="stepper-controls">
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => setTargetSlideCount((prev) => Math.max(3, prev - 1))}
                  disabled={targetSlideCount <= 3}
                >
                  -
                </button>
                <input
                  type="number"
                  min={3}
                  max={24}
                  className="step-input"
                  value={targetSlideCount}
                  onChange={(e) => setTargetSlideCount(Math.max(3, Math.min(24, Number(e.target.value))))}
                />
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => setTargetSlideCount((prev) => Math.min(24, prev + 1))}
                  disabled={targetSlideCount >= 24}
                >
                  +
                </button>
                <span className="step-unit">slide</span>
              </div>
            </div>
            <div className="preset-chips">
              <span>{uiText("Gợi ý nhanh:")}</span>
              {[5, 8, 10, 12, 16].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`preset-chip ${targetSlideCount === num ? "active" : ""}`}
                  onClick={() => setTargetSlideCount(num)}
                >
                  {num} slide
                </button>
              ))}
            </div>
          </div>

          {/* Slide Storyboard Cards */}
          <div className="slides-storyboard">
            <div className="col-header">
              <strong>{uiText("Kịch bản trình chiếu chi tiết (")}{customSlides.length} slide)</strong>
              <small>{uiText("Thầy cô có thể bấm vào để chỉnh sửa tiêu đề và nội dung từng slide")}</small>
            </div>
            <div className="storyboard-grid">
              {customSlides.map((s, idx) => (
                <div key={idx} className="storyboard-card">
                  <div className="card-top">
                    <span className="slide-number">Slide {s.slideNumber}</span>
                    <span className="slide-tag">{s.activityTag}</span>
                  </div>
                  <input
                    type="text"
                    className="slide-title-input"
                    value={s.title}
                    onChange={(e) => {
                      const updated = [...customSlides];
                      if (updated[idx]) {
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setCustomSlides(updated);
                      }
                    }}
                  />
                  <textarea
                    className="slide-bullets-input"
                    rows={4}
                    value={s.bullets.join("\n")}
                    onChange={(e) => {
                      const updated = [...customSlides];
                      if (updated[idx]) {
                        updated[idx] = {
                          ...updated[idx],
                          bullets: e.target.value.split("\n").filter(Boolean),
                        };
                        setCustomSlides(updated);
                      }
                    }}
                  />
                  {s.speakerNotes && (
                    <div className="visual-hint">
                      💡 <em>{s.speakerNotes}</em>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="suite-actions-bar">
            <button
              type="button"
              className="suite-btn secondary"
              onClick={() => {
                downloadBlob(`${generatedDeck.lessonTitle.replace(/\s+/g, "-")}-Slide.md`, generatedDeck.markdownPreview);
                notice(uiText("Đã tải kịch bản Slide dạng Markdown."));
              }}
            >
              <Icon name="arrow-down" size={16} />
              <span>{uiText("Tải kịch bản Slide (.md)")}</span>
            </button>
            <button
              type="button"
              className="suite-btn primary rose"
              onClick={() => onSendPrompt(generatedDeck.promptForPowerPoint)}
            >
              <span>{uiText("✨ Xuất bài thuyết trình PowerPoint (.pptx) với PVTA ↗")}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
