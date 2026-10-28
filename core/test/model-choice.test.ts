import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { builtinCatalog } from '@pvta/shared';
import { DesktopRuntime } from '../src/desktop/runtime';
import {
  AGY_MODEL_VARIANTS,
  CHOICE_MODEL_SKILL_NAME,
  ModelChoiceTracker,
  classifyTask,
  selectSmartModel,
} from '../src/desktop/model-choice';

const runtimes: DesktopRuntime[] = [];
const roots: string[] = [];

afterEach(() => {
  for (const r of runtimes) r.dispose();
  runtimes.length = 0;
  for (const p of roots) fs.rmSync(p, { recursive: true, force: true });
  roots.length = 0;
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-model-choice-'));
  roots.push(dir);
  const r = new DesktopRuntime(() => {}, dir);
  runtimes.push(r);
  r.store.data.documentsDir = path.join(dir, 'Documents');
  (r as unknown as { backends: unknown[] }).backends = [
    { id: 'agy', installed: true, auth: 'ready', version: '1.4.8', efforts: ['low', 'medium', 'high'] },
  ];
  const spy = vi.spyOn(r.engine, 'run');
  return { r, dir, spy };
}

const req = (r: DesktopRuntime, method: string, params: Record<string, unknown> = {}) =>
  r.dispatch({ id: crypto.randomUUID(), method, params });

const reply = (text = 'OK') => ({ text, attempts: 1, fullPrompt: true, timings: { totalMs: 0 } } as never);

describe('smart model selection & choice-model skill', () => {
  it('includes all 13 agy variants and routes tasks by complexity', () => {
    expect(AGY_MODEL_VARIANTS.map((v) => v.slug)).toEqual([
      'gemini-3.8-flash-low',
      'gemini-3.8-flash-medium',
      'gemini-3.8-flash-high',
      'gemini-4-argon-low',
      'gemini-4-argon-medium',
      'gemini-4-argon-high',
      'claude-sonnet-5-5-low',
      'claude-sonnet-5-5-medium',
      'claude-sonnet-5-5-high',
      'claude-opus-5-5-low',
      'claude-opus-5-5-medium',
      'claude-opus-5-5-high',
      'gpt-oss-120b-medium',
    ]);

    const catalog = builtinCatalog();
    expect(selectSmartModel({ task: { text: 'Xin chào, hôm nay thứ mấy?' }, catalog })).toMatchObject({
      choice: { backend: 'agy', model: 'gemini-3.8-flash-low' },
      taskKind: 'simple',
      label: 'Gemini 3.8 Flash (Low)',
    });

    expect(
      selectSmartModel({
        task: { text: 'Soạn kế hoạch bài dạy (KHBD) môn KHTN lớp 8 bài Áp suất theo công văn 5512 chi tiết đầy đủ các hoạt động.' },
        catalog,
      }),
    ).toMatchObject({
      choice: { backend: 'agy', model: 'gemini-4-argon-medium' },
      taskKind: 'office',
      label: 'Gemini 4 Argon (Medium)',
    });

    expect(
      selectSmartModel({
        task: { text: 'Debug và refactor hàm TypeScript xử lý đồ thị trong tệp workflow.ts kèm kiểm thử đơn vị chi tiết.' },
        catalog,
      }),
    ).toMatchObject({
      choice: { backend: 'agy', model: 'claude-sonnet-5-5-medium' },
      taskKind: 'coding',
      label: 'Claude Sonnet 5.5 (Medium)',
    });

    expect(
      selectSmartModel({
        task: { text: 'Xây dựng ma trận, bản đặc tả và đề kiểm tra học kì 1 môn Toán lớp 9 kèm đáp án chi tiết.', attachmentCount: 1 },
        catalog,
      }),
    ).toMatchObject({
      choice: { backend: 'agy', model: 'claude-opus-5-5-high' },
      taskKind: 'exam',
      label: 'Claude Opus 5.5 (High)',
    });

    expect(classifyTask({ text: 'Đặt tên ngắn', light: true }).kind).toBe('background');
  });

  it('automatically selects models in auto mode and updates resolvedChoice immediately for the status bar', async () => {
    const { r, spy } = setup();
    await req(r, 'preferences', { patch: { choice: 'auto', learning: false } });
    const used: string[] = [];
    spy.mockImplementation(async (q: any) => {
      if (!/Đặt một tên|Tóm tắt/.test(q.system ?? '')) used.push(q.model);
      return reply('Đã trả lời.');
    });

    const chatId = (await req(r, 'newChat')) as string;
    await req(r, 'send', { chatId, text: 'Chào bạn' });
    expect(used[0]).toBe('gemini-3.8-flash-low');
    expect(r.view().data.chats.find((c) => c.id === chatId)?.resolvedChoice).toEqual({
      backend: 'agy',
      model: 'gemini-3.8-flash-low',
    });
    expect(r.view().data.chats.find((c) => c.id === chatId)?.messages.at(-1)?.model).toBe('Gemini 3.8 Flash (Low)');

    await req(r, 'send', {
      chatId,
      text: 'Hãy phân tích chuyên sâu và chứng minh bài toán tối ưu hóa đa chiều phức tạp này theo nhiều cách.',
    });
    expect(used[1]).toBe('claude-opus-5-5-high');
    expect(r.view().data.chats.find((c) => c.id === chatId)?.resolvedChoice).toEqual({
      backend: 'agy',
      model: 'claude-opus-5-5-high',
    });
    expect(r.view().data.chats.find((c) => c.id === chatId)?.messages.at(-1)?.model).toBe('Claude Opus 5.5 (High)');
  });

  it('deterministically logs user model switches without AI, binds subsequent prompt context, and updates choice-model skill', async () => {
    const { r, dir, spy } = setup();
    await req(r, 'preferences', { patch: { learning: false } });
    spy.mockResolvedValue(reply('Đã soạn xong.'));

    const chatId = (await req(r, 'newChat')) as string;
    // Người dùng chủ động chọn model claude-sonnet-5-5-high trước khi gửi yêu cầu soạn giáo án (không cần gọi AI)
    const modelRes = await req(r, 'chatModel', {
      chatId,
      choice: { backend: 'agy', model: 'claude-sonnet-5-5-high' },
    });
    expect(modelRes).toMatchObject({
      choice: { backend: 'agy', model: 'claude-sonnet-5-5-high' },
      resolvedChoice: { backend: 'agy', model: 'claude-sonnet-5-5-high' },
      effort: 'high',
    });
    expect(spy).not.toHaveBeenCalled();

    // Khi người dùng gửi tin nhắn, loại việc thực tế (office) được gắn vào lần đổi model vừa rồi và đồng bộ vào choice-model/SKILL.md
    await req(r, 'send', {
      chatId,
      text: 'Soạn kế hoạch bài dạy (giáo án) môn Lịch sử lớp 7 bài 4 theo công văn 5512.',
    });

    const tracker = new ModelChoiceTracker(dir);
    expect(tracker.switches().at(-1)).toMatchObject({
      backend: 'agy',
      model: 'claude-sonnet-5-5-high',
      taskKind: 'office',
    });

    const skillFile = path.join(r.skills.dir, CHOICE_MODEL_SKILL_NAME, 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);
    const skillText = fs.readFileSync(skillFile, 'utf8');
    expect(skillText).toContain('- `office`: claude-sonnet-5-5-high');

    // Ở hội thoại mới để chế độ Tự động, PVTA tự điều phối việc office sang claude-sonnet-5-5-high theo thói quen đã lưu
    const autoChatId = (await req(r, 'newChat')) as string;
    await req(r, 'chatModel', { chatId: autoChatId, choice: 'auto' });
    const autoUsed: string[] = [];
    spy.mockImplementation(async (q: any) => {
      if (!/Đặt một tên|Tóm tắt/.test(q.system ?? '')) autoUsed.push(q.model);
      return reply('Giáo án mới.');
    });
    await req(r, 'send', {
      chatId: autoChatId,
      text: 'Soạn giáo án môn Địa lí lớp 8 bài Khí hậu Việt Nam trong file Word.',
    });
    expect(autoUsed[0]).toBe('claude-sonnet-5-5-high');
  });

  it('combines conversation feedback and user model switch history during self-learning to update choice-model skill', async () => {
    const { r, spy } = setup();
    await req(r, 'preferences', { patch: { learning: true, choice: 'auto' } });

    const chatId = (await req(r, 'newChat')) as string;
    await req(r, 'chatModel', { chatId, choice: { backend: 'agy', model: 'gpt-oss-120b-medium' } });

    spy.mockImplementation(async (q: any) => {
      const sys = String(q.system ?? '');
      if (sys.includes('Rút ra tối đa một quy tắc')) {
        // Kiểm tra lời nhắc tự học có chứa cả lịch sử modelChoices và nội dung hội thoại
        const prompt = String(q.buildPrompt(false, false));
        expect(prompt).toContain('modelChoices');
        expect(prompt).toContain('gpt-oss-120b-medium');
        return reply(
          JSON.stringify({
            rule: 'Luôn kiểm tra kỹ số liệu trước khi xuất bảng.',
            skill: null,
            choiceModel: {
              routing: { simple: 'gemini-3.8-flash-low', coding: 'gpt-oss-120b-medium' },
              note: 'Người dùng ưu tiên gpt-oss-120b-medium cho các việc xử lý mã và dữ liệu vừa phải.',
            },
          }),
        );
      }
      return reply('Đã xử lý.');
    });

    await req(r, 'feedback', {
      chatId,
      text: 'Từ sau nhớ kiểm tra kỹ số liệu và dùng model GPT-OSS 120B cho việc viết mã nhé.',
      about: 'Bảng dữ liệu.',
    });
    await req(r, 'learnNow');

    const skillText = fs.readFileSync(path.join(r.skills.dir, CHOICE_MODEL_SKILL_NAME, 'SKILL.md'), 'utf8');
    expect(skillText).toContain('- `coding`: gpt-oss-120b-medium');
    expect(skillText).toContain('Người dùng ưu tiên gpt-oss-120b-medium cho các việc xử lý mã và dữ liệu vừa phải.');
  });
});
