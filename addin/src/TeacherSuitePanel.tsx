import { useMemo, useState, useRef } from "react";
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
  generateExamBundleFromSpec,
  SAMPLE_SPEC_KHTN7,
  SAMPLE_SPEC_KHTN8,
  SAMPLE_SPEC_KHTN9,
  parseExcelGradebook,
  SAMPLE_GRADEBOOK_EXCEL_CSV,
  SAMPLE_REAL_EXAM_KHTN7,
  type FeatureKey,
  type OfficeHost,
  type SlideOutline,
} from "@pvta/shared";
import { Icon } from "./Icon";
import { readSelection, applyText } from "./office/selection";
import { copyText } from "./util";

interface Props {
  host: OfficeHost;
  online: boolean;
  readOnly: boolean;
  onSendPrompt: (prompt: string) => void;
}

export function TeacherSuitePanel({ host, online, readOnly, onSendPrompt }: Props) {
  const defaultTab: FeatureKey =
    host === "excel" ? "gradebook" : host === "powerpoint" ? "slides" : "assessment";
  const [tab, setTab] = useState<FeatureKey>(defaultTab);
  const [note, setNote] = useState<string>("");

  // ==========================================================================
  // 1. MA TRẬN & BẢN ĐẶC TẢ GDPT 2018 (BÓC TÁCH YCCĐ)
  // ==========================================================================
  const [specDoc, setSpecDoc] = useState<ParsedSpecification>(SAMPLE_SPEC_KHTN7);
  const [specItems, setSpecItems] = useState<SpecYCCDItem[]>(SAMPLE_SPEC_KHTN7.items);
  const [activeSpecFile, setActiveSpecFile] = useState<string>("KHTN 7 - Phan Văn Trị - deda - matran.docx");
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("ALL");

  const specAudit = useMemo(() => auditSpecification(specItems), [specItems]);
  const examBundle = useMemo(
    () => generateExamBundleFromSpec({ ...specDoc, items: specItems }),
    [specDoc, specItems],
  );

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
        const next = !it.selected;
        return {
          ...it,
          selected: next,
          part1Count: next && it.part1Count === 0 && it.level === "NB" ? 1 : it.part1Count,
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
    if (grade === "7") {
      setSpecDoc(SAMPLE_SPEC_KHTN7);
      setSpecItems(SAMPLE_SPEC_KHTN7.items);
      setActiveSpecFile("KHTN 7 - Phan Văn Trị - Cuối kì II (18 YCCĐ)");
    } else if (grade === "8") {
      setSpecDoc(SAMPLE_SPEC_KHTN8);
      setSpecItems(SAMPLE_SPEC_KHTN8.items);
      setActiveSpecFile("KHTN 8 - Phan Văn Trị - Điện, Nhiệt, Cơ thể");
    } else {
      setSpecDoc(SAMPLE_SPEC_KHTN9);
      setSpecItems(SAMPLE_SPEC_KHTN9.items);
      setActiveSpecFile("KHTN 9 - Phan Văn Trị - Hữu cơ, Di truyền");
    }
    setNote(`Đã nạp Bản đặc tả KHTN ${grade} THCS Phan Văn Trị.`);
  }

  // ==========================================================================
  // 2. TRỘN ĐỀ
  // ==========================================================================
  const [rawExam, setRawExam] = useState(SAMPLE_REAL_EXAM_KHTN7);
  const [variantCount, setVariantCount] = useState(4);
  const [startCode, setStartCode] = useState(101);
  const mixedResult = useMemo(
    () => mixExamVariants(rawExam, { variantCount, startCode, shuffleQuestions: true, shuffleOptions: true }),
    [rawExam, variantCount, startCode],
  );

  // ==========================================================================
  // 3. RÀ SOÁT NGHỊ ĐỊNH 30/2020
  // ==========================================================================
  const [adminInput, setAdminInput] = useState(SAMPLE_ADMIN_DOC);
  const adminResult = useMemo(() => reviewAdminDocument(adminInput), [adminInput]);

  // ==========================================================================
  // 4. SỔ ĐIỂM TT 22/27
  // ==========================================================================
  const [gradeInput, setGradeInput] = useState(SAMPLE_GRADEBOOK_EXCEL_CSV);
  const [circular, setCircular] = useState<"TT22" | "TT27">("TT22");
  const [gradeSubject, setGradeSubject] = useState("Khoa học tự nhiên");
  const gradeResult = useMemo(
    () => analyzeGradebook(gradeInput, { circular, subject: gradeSubject }),
    [gradeInput, circular, gradeSubject],
  );

  // ==========================================================================
  // 5. SLIDE POWERPOINT
  // ==========================================================================
  const [lessonInput, setLessonInput] = useState(SAMPLE_LESSON_5512);
  const [slideCount, setSlideCount] = useState<number>(5);
  const slideDeck = useMemo(
    () => convertLessonPlanToSlides(lessonInput, { targetSlideCount: slideCount }),
    [lessonInput, slideCount],
  );

  // Native HTML5 File Input Refs
  const specFileInputRef = useRef<HTMLInputElement>(null);
  const examFileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);
  const gradeFileInputRef = useRef<HTMLInputElement>(null);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);

  function handleFileRead(
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (text: string, filename: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result ?? "");
      if (content.trim()) {
        onLoaded(content.trim(), name);
        setNote(`Đã nạp tệp: ${name}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleLoadFromDocument(target: "spec" | "exam" | "admin" | "grade" | "lesson") {
    try {
      const sel = await readSelection(host);
      const selected = sel.text;
      if (!selected.trim()) {
        setNote("Hãy bôi đen văn bản trong tài liệu Office trước.");
        return;
      }
      if (target === "spec") {
        const parsed = parseSpecificationDocument(selected);
        setSpecDoc(parsed);
        setSpecItems(parsed.items);
        setActiveSpecFile("Văn bản bôi đen trong Office");
      } else if (target === "exam") {
        setRawExam(selected);
      } else if (target === "admin") {
        setAdminInput(selected);
      } else if (target === "grade") {
        const parsed = parseExcelGradebook(selected);
        if (parsed.length > 0) {
          const lines = parsed.map((s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`);
          setGradeInput(lines.join("\n"));
        } else {
          setGradeInput(selected);
        }
      } else if (target === "lesson") {
        setLessonInput(selected);
      }
      setNote("Đã trích xuất văn bản từ tài liệu Office.");
    } catch (e) {
      setNote("Không thể đọc vùng chọn Office.");
    }
  }

  return (
    <div className="teacher-panel">
      {/* Tab Navigation */}
      <div className="teacher-tabs" role="tablist">
        {TEACHER_FEATURES.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={tab === f.key}
            className={`teacher-tab-btn tone-${f.tone} ${tab === f.key ? "active" : ""}`}
            onClick={() => setTab(f.key)}
            title={f.title}
          >
            <Icon name={f.icon} size={15} />
            <span>{f.shortTitle}</span>
          </button>
        ))}
      </div>

      {note && (
        <div className="panel-notice">
          <span>{note}</span>
          <button type="button" onClick={() => setNote("")}>×</button>
        </div>
      )}

      {/* ================================================================== */}
      {/* 1. MA TRẬN & BẢN ĐẶC TẢ GDPT 2018 (BÓC TÁCH YCCĐ)                  */}
      {/* ================================================================== */}
      {tab === "assessment" && (
        <div className="tab-pane">
          <div className="tab-hero">
            <h3>Bóc tách Bản đặc tả & Sinh đề kiểm tra 3 phần</h3>
            <p className="tab-desc">
              Tải lên hoặc chọn Bản đặc tả để bóc tách từng YCCĐ theo mức độ nhận thức (NB/TH/VD/VDC), gán số câu và sinh đồng bộ Ma trận + Đề + Đáp án.
            </p>
          </div>

          <div className="hero-file-dropzone indigo-zone" onClick={() => specFileInputRef.current?.click()}>
            <input
              ref={specFileInputRef}
              type="file"
              accept=".docx,.pdf,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) =>
                handleFileRead(e, (text, name) => {
                  const parsed = parseSpecificationDocument(text);
                  setSpecDoc(parsed);
                  setSpecItems(parsed.items);
                  setActiveSpecFile(name);
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="exam" size={24} />
            </div>
            <div className="dropzone-text">
              <strong>Tải lên Bản đặc tả (.docx, .pdf, .txt) hoặc Đọc vùng chọn</strong>
              <span>Đang nạp: <strong>{activeSpecFile}</strong> ({specItems.length} YCCĐ)</span>
            </div>
          </div>

          <div className="preset-quick-bar">
            <button type="button" className="preset-btn" onClick={() => handleLoadFromDocument("spec")}>
              📖 Đọc vùng chọn Word
            </button>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("7")}>
              KHTN 7 (Phan Văn Trị)
            </button>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("8")}>
              KHTN 8 (Phan Văn Trị)
            </button>
            <button type="button" className="preset-btn" onClick={() => loadPrebuiltSpec("9")}>
              KHTN 9 (Phan Văn Trị)
            </button>
          </div>

          <div className={`audit-banner ${specAudit.isStandard10 ? "success" : "warning"}`}>
            <div className="audit-info">
              <strong>
                {specAudit.isStandard10
                  ? "✓ Cấu trúc đạt chuẩn 10.0đ (16 câu TN + 2 câu Đ/S + 4đ TL)"
                  : `⚠️ Tổng điểm: ${specAudit.totalScore.toFixed(2)}/10.0đ (Phần I: ${specAudit.part1Count}/16, Phần II: ${specAudit.part2Count}/2)`}
              </strong>
              <div className="audit-sub">
                Tỷ lệ: {specAudit.nbPercent}% NB · {specAudit.thPercent}% TH · {specAudit.vdPercent}% VD · {specAudit.vdcPercent}% VDC
              </div>
            </div>
          </div>

          <div className="yccd-table-container" style={{ maxHeight: 280 }}>
            <table className="yccd-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>Chọn</th>
                  <th>Yêu cầu cần đạt (YCCĐ)</th>
                  <th style={{ width: 60, textAlign: "center" }}>Mức độ</th>
                  <th style={{ width: 80, textAlign: "center" }}>Phần I (TN)</th>
                  <th style={{ width: 80, textAlign: "center" }}>Phần II (Đ/S)</th>
                  <th style={{ width: 80, textAlign: "center" }}>Phần III (TL)</th>
                </tr>
              </thead>
              <tbody>
                {specItems.map((it) => (
                  <tr key={it.id} className={it.selected ? "row-selected" : "row-unselected"}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={it.selected}
                        onChange={() => toggleYccdSelect(it.id)}
                      />
                    </td>
                    <td>
                      <div><strong>{it.unit}</strong></div>
                      <small style={{ color: "var(--muted)", fontSize: 11 }}>{it.content}</small>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`level-badge level-${it.level}`}>{it.level}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p1", -1)} disabled={it.part1Count <= 0}>-</button>
                        <span>{it.part1Count}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p1", 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p2", -1)} disabled={it.part2Count <= 0}>-</button>
                        <span>{it.part2Count}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p2", 1)}>+</button>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="stepper-inline">
                        <button type="button" onClick={() => updateYccdCount(it.id, "p3", -1)} disabled={it.part3Points <= 0}>-</button>
                        <span>{it.part3Points ? it.part3Points + "đ" : "0đ"}</span>
                        <button type="button" onClick={() => updateYccdCount(it.id, "p3", 1)}>+</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tab-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={() => onSendPrompt(examBundle.promptForAi)}
            >
              ✨ Gửi PVTA hoàn thiện Đề & Đáp án
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={async () => {
                if (host === "word") {
                  await applyText(host, examBundle.fullDossierMarkdown, "replace");
                  setNote("Đã chèn Hồ sơ Ma trận & Đề vào tài liệu Word.");
                } else {
                  await copyText(examBundle.fullDossierMarkdown);
                  setNote("Đã sao chép Hồ sơ Ma trận & Đề thi vào clipboard.");
                }
              }}
            >
              {host === "word" ? "Chèn vào Word" : "Sao chép Markdown"}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 2. TRỘN ĐỀ                                                         */}
      {/* ================================================================== */}
      {tab === "mixer" && (
        <div className="tab-pane">
          <div className="tab-hero">
            <h3>Trộn đề trắc nghiệm & Hoán vị</h3>
            <p className="tab-desc">
              Tải lên đề Word/Markdown, tự động đảo câu hỏi & phương án, xuất các mã đề và bảng đáp án cho máy chấm.
            </p>
          </div>

          <div className="hero-file-dropzone violet-zone" onClick={() => examFileInputRef.current?.click()}>
            <input
              ref={examFileInputRef}
              type="file"
              accept=".docx,.doc,.txt,.md"
              style={{ display: "none" }}
              onChange={(e) => handleFileRead(e, (text) => setRawExam(text))}
            />
            <div className="dropzone-icon">
              <Icon name="shuffle" size={24} />
            </div>
            <div className="dropzone-text">
              <strong>Tải lên Đề thi Word (.docx) hoặc Bấm để chọn tệp</strong>
              <span>Đã nhận diện {mixedResult.variants[0]?.questions.length || 0} câu hỏi trắc nghiệm</span>
            </div>
          </div>

          <div className="preset-quick-bar">
            <button type="button" className="preset-btn" onClick={() => handleLoadFromDocument("exam")}>
              📖 Đọc đề từ Word
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setRawExam(SAMPLE_REAL_EXAM_KHTN7);
                setNote("Đã nạp đề mẫu 16 câu KHTN 7 Phan Văn Trị.");
              }}
            >
              Đề mẫu KHTN 7 Phan Văn Trị (16 câu)
            </button>
          </div>

          <div className="form-row-2">
            <label>
              Số mã đề:
              <input
                type="number"
                min={2}
                max={12}
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
              />
            </label>
            <label>
              Mã đề bắt đầu:
              <input
                type="number"
                min={101}
                max={999}
                value={startCode}
                onChange={(e) => setStartCode(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="preview-card" style={{ maxHeight: 180, overflowY: "auto" }}>
            <pre style={{ margin: 0, fontSize: 11 }}>{mixedResult.variants[0]?.formattedText}</pre>
          </div>

          <div className="tab-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={() =>
                onSendPrompt(
                  `/office-dap-an Hãy xuất bản ${mixedResult.variants.length} mã đề thi trắc nghiệm sang Word:\n\n` +
                    mixedResult.answerMatrixMarkdown,
                )
              }
            >
              ✨ Xuất trọn bộ sang Word với PVTA
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={async () => {
                await copyText(mixedResult.answerCsv);
                setNote("Đã chép CSV đáp án cho máy chấm TNMaker / Azota.");
              }}
            >
              Sao chép CSV đáp án
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 3. RÀ SOÁT NĐ 30/2020                                              */}
      {/* ================================================================== */}
      {tab === "diff" && (
        <div className="tab-pane">
          <div className="tab-hero">
            <h3>Rà soát Thể thức NĐ 30/2020 & Căn cứ Pháp lý</h3>
            <p className="tab-desc">
              Tự động phát hiện lỗi Quốc hiệu, ngày tháng năm (Điều 13 NĐ 30) và cảnh báo Thông tư hết hiệu lực (TT 58/2011, TT 26/2020).
            </p>
          </div>

          <div className="hero-file-dropzone amber-zone" onClick={() => adminFileInputRef.current?.click()}>
            <input
              ref={adminFileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleFileRead(e, (text) => setAdminInput(text))}
            />
            <div className="dropzone-icon">
              <Icon name="diff" size={24} />
            </div>
            <div className="dropzone-text">
              <strong>Tải lên Công văn Word (.docx) hoặc Bấm để chọn tệp</strong>
              <span>Phát hiện {adminResult.issues.length} điểm cần chuẩn hóa thể thức</span>
            </div>
          </div>

          <div className="preset-quick-bar">
            <button type="button" className="preset-btn" onClick={() => handleLoadFromDocument("admin")}>
              📖 Đọc văn bản từ Word
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setAdminInput(SAMPLE_ADMIN_DOC);
                setNote("Đã nạp văn bản mẫu Kế hoạch kiểm tra THCS Phan Văn Trị.");
              }}
            >
              Kế hoạch mẫu (Lỗi TT 58, TT 26 & ngày tháng)
            </button>
          </div>

          <div className="diff-issues-list" style={{ maxHeight: 160, overflowY: "auto" }}>
            {adminResult.issues.map((iss) => (
              <div key={iss.id} className="diff-issue-card">
                <strong>{iss.title}</strong>
                <div style={{ fontSize: 11, color: "var(--muted)", margin: "2px 0" }}>
                  <del>{iss.before}</del> → <ins style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>{iss.after}</ins>
                </div>
                <small style={{ color: "var(--muted)" }}>{iss.explanation}</small>
              </div>
            ))}
          </div>

          <div className="tab-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={async () => {
                if (host === "word") {
                  await applyText(host, adminResult.normalizedText, "replace");
                  setNote("Đã thay thế văn bản chuẩn hóa vào tài liệu Word.");
                } else {
                  await copyText(adminResult.normalizedText);
                  setNote("Đã sao chép văn bản chuẩn hóa vào clipboard.");
                }
              }}
            >
              {host === "word" ? "Áp dụng vào Word" : "Sao chép bản chuẩn hóa"}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 4. SỔ ĐIỂM TT 22/27                                                */}
      {/* ================================================================== */}
      {tab === "gradebook" && (
        <div className="tab-pane">
          <div className="tab-hero">
            <h3>Nhận xét Học bạ & Sổ điểm TT 22/27</h3>
            <p className="tab-desc">
              Tải lên Sổ điểm Excel (.xlsx, .csv) để tự động tính ĐTBmhk, xếp loại và sinh nhận xét học bạ cá nhân hóa.
            </p>
          </div>

          <div className="hero-file-dropzone emerald-zone" onClick={() => gradeFileInputRef.current?.click()}>
            <input
              ref={gradeFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              style={{ display: "none" }}
              onChange={(e) =>
                handleFileRead(e, (text) => {
                  const parsed = parseExcelGradebook(text);
                  if (parsed.length > 0) {
                    const lines = parsed.map(
                      (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                    );
                    setGradeInput(lines.join("\n"));
                  } else {
                    setGradeInput(text);
                  }
                })
              }
            />
            <div className="dropzone-icon">
              <Icon name="grade" size={24} />
            </div>
            <div className="dropzone-text">
              <strong>Tải lên Sổ điểm Excel (.xlsx, .csv) hoặc Đọc bảng tính</strong>
              <span>Đang tính toán cho {gradeResult.students.length} học sinh</span>
            </div>
          </div>

          <div className="preset-quick-bar">
            <button type="button" className="preset-btn" onClick={() => handleLoadFromDocument("grade")}>
              📖 Đọc từ bảng tính Excel
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                const parsed = parseExcelGradebook(SAMPLE_GRADEBOOK_EXCEL_CSV);
                const lines = parsed.map(
                  (s) => `${s.name} | ${s.txScores.join(", ")} | ${s.midterm} | ${s.finalExam}`,
                );
                setGradeInput(lines.join("\n"));
                setNote("Đã nạp Sổ điểm Lớp 7A1 Phan Văn Trị (35 học sinh).");
              }}
            >
              Lớp 7A1 THCS Phan Văn Trị (35 học sinh)
            </button>
          </div>

          <div className="gradebook-table-wrapper" style={{ maxHeight: 220, overflowY: "auto" }}>
            <table className="grade-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>TT</th>
                  <th>Họ tên</th>
                  <th style={{ width: 50 }}>ĐTB</th>
                  <th style={{ width: 60 }}>Mức đạt</th>
                  <th>Nhận xét học bạ</th>
                </tr>
              </thead>
              <tbody>
                {gradeResult.students.slice(0, 10).map((s) => (
                  <tr key={s.index}>
                    <td>{s.index}</td>
                    <td><strong>{s.name}</strong></td>
                    <td className="mono highlight">{s.average.toFixed(1)}</td>
                    <td><span className="level-pill lvl-tốt">{s.level}</span></td>
                    <td style={{ fontSize: 10.5 }}>{s.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tab-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={() =>
                onSendPrompt(
                  `/office-dap-an Hãy hoàn thiện bảng điểm và nhận xét học bạ môn ${gradeSubject} sang Excel:\n\n` +
                    gradeResult.csvOutput,
                )
              }
            >
              ✨ Xuất sang Excel với PVTA
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={async () => {
                await copyText(gradeResult.csvOutput);
                setNote("Đã sao chép bảng điểm CSV.");
              }}
            >
              Sao chép CSV
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 5. SLIDE POWERPOINT                                                */}
      {/* ================================================================== */}
      {tab === "slides" && (
        <div className="tab-pane">
          <div className="tab-hero">
            <h3>Chuyển Giáo án 5512 sang Slide PowerPoint</h3>
            <p className="tab-desc">
              Tải lên KHBD Word/PDF, tự do tăng giảm số slide (3–24 slide) và tạo kịch bản 4 hoạt động học.
            </p>
          </div>

          <div className="hero-file-dropzone rose-zone" onClick={() => lessonFileInputRef.current?.click()}>
            <input
              ref={lessonFileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleFileRead(e, (text) => setLessonInput(text))}
            />
            <div className="dropzone-icon">
              <Icon name="slides" size={24} />
            </div>
            <div className="dropzone-text">
              <strong>Tải lên Kế hoạch bài dạy Word (.docx) hoặc Bấm chọn tệp</strong>
              <span>Đã chuẩn bị kịch bản {slideDeck.slides.length} slide trình chiếu</span>
            </div>
          </div>

          <div className="preset-quick-bar">
            <button type="button" className="preset-btn" onClick={() => handleLoadFromDocument("lesson")}>
              📖 Đọc KHBD từ Word
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => {
                setLessonInput(SAMPLE_LESSON_5512);
                setNote("Đã nạp Giáo án mẫu Bài 15: Áp suất trên một bề mặt.");
              }}
            >
              Bài 15: Áp suất trên một bề mặt (KHTN 8)
            </button>
          </div>

          <div className="slide-stepper-bar" style={{ margin: "8px 0 12px" }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>Số lượng slide:</span>
            <div className="stepper-inline">
              <button type="button" onClick={() => setSlideCount((p) => Math.max(3, p - 1))}>-</button>
              <span>{slideCount}</span>
              <button type="button" onClick={() => setSlideCount((p) => Math.min(24, p + 1))}>+</button>
            </div>
            {[5, 8, 12].map((num) => (
              <button
                key={num}
                type="button"
                className={`preset-btn ${slideCount === num ? "active" : ""}`}
                onClick={() => setSlideCount(num)}
              >
                {num} slide
              </button>
            ))}
          </div>

          <div className="tab-actions">
            <button
              type="button"
              className="action-btn primary"
              onClick={() => onSendPrompt(slideDeck.promptForPowerPoint)}
            >
              ✨ Xuất PowerPoint với PVTA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
