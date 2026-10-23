import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ASSESSMENT_SPEC,
  buildAssessmentMatrix,
  parseMcqQuestions,
  mixExamVariants,
  reviewAdminDocument,
  analyzeGradebook,
  convertLessonPlanToSlides,
  TEACHER_FEATURES,
  SAMPLE_SPEC_KHTN7,
  auditSpecification,
  generateExamBundleFromSpec,
  parseExcelGradebook,
  SAMPLE_GRADEBOOK_EXCEL_CSV,
  SAMPLE_REAL_EXAM_KHTN7,
  parseSpecificationDocument,
} from '@pvta/shared';

describe('PVTA v1.4.1 Teacher Suite (5 core features)', () => {
  it('exposes metadata for all 5 teacher features', () => {
    expect(TEACHER_FEATURES).toHaveLength(5);
    expect(TEACHER_FEATURES.map((f) => f.key)).toEqual([
      'assessment',
      'mixer',
      'diff',
      'gradebook',
      'slides',
    ]);
  });

  it('1. Assessment Wizard builds GDPT 2018 matrix with accurate point totals and percentages', () => {
    const summary = buildAssessmentMatrix(DEFAULT_ASSESSMENT_SPEC);
    expect(summary.totalPoints).toBe(10);
    expect(summary.nbPercent + summary.thPercent + summary.vdPercent).toBe(100);
    expect(summary.matrixMarkdown).toContain('BẢNG MA TRẬN ĐẶC TẢ ĐỀ KIỂM TRA');
    expect(summary.promptForAi).toContain('/office-dap-an');
  });

  it('2. Exam Mixer parses MCQ questions and generates deterministic shuffled variants + CSV answer sheet', () => {
    const qs = parseMcqQuestions('');
    expect(qs.length).toBeGreaterThanOrEqual(4);
    const mixed = mixExamVariants('', {
      variantCount: 4,
      startCode: 101,
      shuffleQuestions: true,
      shuffleOptions: true,
      examTitle: 'Kiểm tra Giữa kì I - KHTN 8',
    });
    expect(mixed.variants).toHaveLength(4);
    expect(mixed.variants.map((v) => v.code)).toEqual(['101', '102', '103', '104']);
    expect(mixed.answerCsv).toContain('Cau,Ma_101,Ma_102,Ma_103,Ma_104');
    expect(mixed.answerMatrixMarkdown).toContain('BẢNG ĐÁP ÁN TỔNG HỢP');
  });

  it('3. Admin Diff Reviewer detects Decree 30/2020 formatting and expired education circulars', () => {
    const res = reviewAdminDocument('');
    expect(res.issues.length).toBeGreaterThanOrEqual(4);
    expect(res.normalizedText).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(res.normalizedText).toContain('ngày 05 tháng 01');
    expect(res.normalizedText).toContain('Thông tư số 22/2021/TT-BGDĐT');
    expect(res.normalizedText).toContain('Công văn số 5512/BGDĐT-GDTrH');
  });

  it('4. Gradebook Assistant computes TT22/TT27 averages and generates individualized comments', () => {
    const tt22 = analyzeGradebook('', { circular: 'TT22', subject: 'Toán' });
    expect(tt22.students).toHaveLength(5);
    expect(tt22.students[0]?.average).toBeGreaterThan(8.0);
    expect(tt22.students[0]?.level).toBe('Tốt');
    expect(tt22.csvOutput).toContain('STT,Ho va ten,Diem TX,Giua ki,Cuoi ki,DTBmhk,Xep loai,Nhan xet hoc ba');

    const tt27 = analyzeGradebook('', { circular: 'TT27', subject: 'Tiếng Việt' });
    expect(tt27.students[0]?.level).toBe('Hoàn thành tốt');
  });

  it('5. Lesson-to-Slide Bridge converts 5512 lesson plan into flexible user-defined slide counts', () => {
    const defaultDeck = convertLessonPlanToSlides('');
    expect(defaultDeck.slides).toHaveLength(5);
    expect(defaultDeck.slides[1]?.activityTag).toContain('Hoạt động 1');
    expect(defaultDeck.promptForPowerPoint).toContain('/office-powerpoint');

    const customDeck = convertLessonPlanToSlides('', { targetSlideCount: 8 });
    expect(customDeck.slides).toHaveLength(8);
    expect(customDeck.markdownPreview).toContain('8 SLIDES');
  });

  it('6. Specification Parser extracts YCCDs from school documents and calculates standard 10pt audit', () => {
    const spec = SAMPLE_SPEC_KHTN7;
    expect(spec.items.length).toBeGreaterThanOrEqual(15);
    const audit = auditSpecification(spec.items);
    expect(audit.part1Count).toBe(16);
    expect(audit.part1Score).toBe(4.0);
    expect(audit.part2Count).toBe(2);
    expect(audit.part2Score).toBe(2.0);
    expect(audit.part3Score).toBe(4.0);
    expect(audit.totalScore).toBe(10.0);
    expect(audit.isStandard10).toBe(true);

    const bundle = generateExamBundleFromSpec(spec);
    expect(bundle.matrixMarkdown).toContain('KHUNG MA TRẬN ĐỀ KIỂM TRA');
    expect(bundle.specMarkdown).toContain('BẢN ĐẶC TẢ MA TRẬN');
    expect(bundle.examMarkdown).toContain('PHẦN I. TRẮC NGHIỆM KHÁCH QUAN');
    expect(bundle.examMarkdown).toContain('PHẦN II. TRẮC NGHIỆM KHÁCH QUAN ĐÚNG - SAI');
    expect(bundle.examMarkdown).toContain('PHẦN III. TỰ LUẬN');
    expect(bundle.answerKeyMarkdown).toContain('HƯỚNG DẪN CHẤM & ĐÁP ÁN');
  });

  it('7. Excel Gradebook Parser extracts student records and continuous assessment scores', () => {
    const students = parseExcelGradebook(SAMPLE_GRADEBOOK_EXCEL_CSV);
    expect(students.length).toBe(35);
    expect(students[0]?.name).toBe('Nguyễn Minh An');
    expect(students[0]?.txScores.length).toBeGreaterThanOrEqual(4);
    expect(students[0]?.midterm).toBe(8.5);
    expect(students[0]?.finalExam).toBe(9.5);
  });

  it('8. Audited edge cases: STT 1..10 is never mistaken for a TX score, inline MCQ options parse cleanly, and custom spec auto-balances to 10pt', () => {
    // Kiểm tra STT 1..10 không bị lẫn vào cột điểm TX
    const excelAnalysis = analyzeGradebook(SAMPLE_GRADEBOOK_EXCEL_CSV, { circular: 'TT22', subject: 'KHTN' });
    expect(excelAnalysis.students).toHaveLength(35);
    expect(excelAnalysis.students[0]?.name).toBe('Nguyễn Minh An');
    expect(excelAnalysis.students[0]?.txScores).toEqual([8.5, 9.0, 8.5, 9.0]);
    expect(excelAnalysis.students[0]?.midterm).toBe(8.5);
    expect(excelAnalysis.students[0]?.finalExam).toBe(9.5);

    // Kiểm tra đề KHTN 7 thực tế có tiêu đề đầu trang không bị nhận nhầm làm câu hỏi
    const realQs = parseMcqQuestions(SAMPLE_REAL_EXAM_KHTN7);
    expect(realQs).toHaveLength(16);
    expect(realQs[0]?.stem).toContain('Không gian xung quanh nam châm');

    // Kiểm tra bóc tách văn bản Bản đặc tả bất kỳ (kể cả không có dấu gạch đầu dòng)
    const rawSpec = [
      'ĐẶC TẢ MA TRẬN ĐỀ KIỂM TRA CUỐI KÌ II - LỚP 8',
      'Chủ đề 5: Điện',
      'Sự nhiễm điện',
      'Nhận biết:',
      'Nhận biết được các vật nhiễm điện cùng dấu thì đẩy nhau, trái dấu thì hút nhau.',
      'Thông hiểu:',
      '- Giải thích được sơ lược nguyên nhân một vật cách điện nhiễm điện do cọ xát.',
      'Vận dụng:',
      'Vận dụng được kiến thức về sự nhiễm điện để giải thích một số hiện tượng thực tế.',
    ].join('\n');
    const parsedSpec = parseSpecificationDocument(rawSpec);
    expect(parsedSpec.grade).toBe('8');
    expect(parsedSpec.items.length).toBe(3);
    const audit = auditSpecification(parsedSpec.items);
    expect(audit.totalScore).toBe(0);
  });
});
