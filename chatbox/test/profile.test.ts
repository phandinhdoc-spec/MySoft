// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ProfilePanel, RuleCenter, isOwnSkill} from '../src/ProfilePanel';
import {menuItems} from '../src/Composer';
import {effectiveRules, userInitial, displayName, resolveAssistantModelLabel} from '../src/profile';
import {builtinCatalog} from '@pvta/shared';
import {rpc} from '../src/ipc';
const h = React.createElement;

vi.mock('../src/ipc', () => ({rpc: vi.fn(), subscribe: vi.fn(async () => () => {}), pickFiles: vi.fn(), savePath: vi.fn()}));
vi.mock('../src/Markdown', () => ({Markdown: ({text}: {text: string}) => React.createElement('p', null, text)}));

const rule = (key: string, text: string, always = false) => ({id: `id-${key}`, key, title: `Quy tắc ${key}`, text, always, at: 0});
const base: any = () => ({
  prompts: {favorites: [], own: []},
  skills: [
    {name: 'cua-toi', description: 'Quy trình của tôi', load: 'demand', tier: 4},
    {name: 'tat-roi', description: '', load: 'off', tier: 4},
    {name: 'pvta-word', description: 'Đi kèm', load: 'always', tier: 1},
    {name: 'office-giao-an', description: 'Đi kèm', load: 'demand', tier: 1},
    {name: 'learned-mau', description: 'Tự học', load: 'demand', tier: 2},
    {name: 'tu-github', description: 'GitHub', load: 'demand', tier: 3},
  ],
  data: {
    preferences: {userName: ''},
    ruleBook: [rule('ca-nhan', 'Xưng thầy cô', true)],
    projects: [{id: 'p1', name: 'Lớp 8A', rules: '', ruleBook: [rule('du-an', 'Dùng SGK', true), rule('cuc-bo', 'Cỡ chữ 13', false)]}],
    chats: [{id: 'c1', title: 'Chat 1', projectId: 'p1', messages: [], summary: '', updatedAt: 0, ruleBook: [rule('chat', 'Chỉ tiết 1', true)]}, {id: 'c2', title: 'Chat 2', messages: [], summary: '', updatedAt: 0}],
  },
});

describe('chữ cái đầu của tên', () => {
  it('lấy chữ cái đầu của từ cuối (tên người Việt), giữ dấu và viết hoa', () => {
    expect(userInitial('Phan Đình Đốc')).toBe('Đ');
    expect(userInitial('  nguyễn   an ')).toBe('A');
    expect(userInitial('Ánh')).toBe('Á');
    expect(userInitial('Lan')).toBe('L');
  });
  it('bỏ qua từ không có chữ cái, và rơi về P khi chưa có tên', () => {
    expect(userInitial('Minh 123')).toBe('M');
    expect(userInitial('')).toBe('P');
    expect(userInitial(undefined)).toBe('P');
    expect(userInitial('   ')).toBe('P');
    expect(userInitial('1234')).toBe('P');
  });
  it('tên hiển thị dùng nhãn mặc định khi trống', () => {
    expect(displayName('  ', 'Không gian cá nhân')).toBe('Không gian cá nhân');
    expect(displayName(' Đốc ', 'x')).toBe('Đốc');
    expect(displayName('Phan Anh', 'Thầy cô')).toBe('Phan Anh');
    expect(displayName('', 'Thầy cô')).toBe('Thầy cô');
  });
  it('tên Phan Anh cho avatar A và tên hiển thị Phan Anh', () => {
    expect(userInitial('Phan Anh')).toBe('A');
    expect(displayName('Phan Anh', 'Thầy cô')).toBe('Phan Anh');
  });
});

describe('tên model PVTA trong hội thoại', () => {
  it('lấy nhãn model từ danh mục có sẵn cho backend agy và claude', () => {
    const s: any = {
      catalog: builtinCatalog(),
      data: {preferences: {choice: {backend: 'agy', model: 'gemini-3.8-flash'}}},
      backends: [{id: 'agy', installed: true, auth: 'ready'}],
      api: [],
    };
    expect(resolveAssistantModelLabel(s)).toBe('Gemini 3.8 Flash');

    s.data.preferences.choice = {backend: 'agy', model: 'gemini-3.8-flash-medium'};
    expect(resolveAssistantModelLabel(s)).toBe('Gemini 3.8 Flash');

    s.data.preferences.choice = {backend: 'claude', model: 'sonnet'};
    expect(resolveAssistantModelLabel(s)).toBe('Sonnet');
  });

  it('ưu tiên model riêng của chat hơn cấu hình mặc định', () => {
    const s: any = {
      catalog: builtinCatalog(),
      data: {preferences: {choice: {backend: 'agy', model: 'gemini-3.8-flash'}}},
      backends: [{id: 'agy', installed: true, auth: 'ready'}, {id: 'claude', installed: true, auth: 'ready'}],
      api: [],
    };
    expect(resolveAssistantModelLabel(s, {choice: {backend: 'claude', model: 'sonnet'}})).toBe('Sonnet');
  });

  it('chế độ tự động hoặc chưa cấu hình trả về model khả dụng hoặc fallback Gemini 3.8 Flash', () => {
    const s: any = {
      catalog: builtinCatalog(),
      data: {preferences: {choice: 'auto'}},
      backends: [{id: 'agy', installed: true, auth: 'ready'}],
      api: [],
    };
    expect(resolveAssistantModelLabel(s)).toBe('Gemini 3.8 Flash');
    expect(resolveAssistantModelLabel(null)).toBe('Gemini 3.8 Flash');
  });
});

describe('quy tắc hiệu lực và menu #', () => {
  it('gộp theo khóa, phạm vi hẹp hơn thắng, hội thoại xếp trước', () => {
    const list = effectiveRules({profile: [rule('a', 'cá nhân'), rule('b', 'chỉ cá nhân')], project: [rule('a', 'dự án')], chat: [rule('a', 'chat')]});
    expect(list.map(r => [r.key, r.scope, r.text])).toEqual([['a', 'chat', 'chat'], ['b', 'profile', 'chỉ cá nhân']]);
  });
  it('menu # liệt kê cả ba phạm vi, ghi rõ phạm vi, trong hội thoại không thuộc dự án thì không có quy tắc dự án', () => {
    const state = base();
    const inProject = menuItems('rules', '', state, {files: [], project: state.data.projects[0], chat: state.data.chats[0]});
    expect(inProject.map(i => i.title)).toEqual(['#chat', '#du-an', '#cuc-bo', '#ca-nhan']);
    expect(inProject.find(i => i.title === '#chat')!.group).toContain('Hội thoại này');
    expect(inProject.find(i => i.title === '#du-an')!.group).toContain('Toàn cục');
    expect(inProject.find(i => i.title === '#cuc-bo')!.group).toContain('Cục bộ');
    expect(inProject.find(i => i.title === '#ca-nhan')!.group).toContain('Cá nhân');
    expect(inProject.every(i => i.value === i.title.slice(1))).toBe(true);
    const outside = menuItems('rules', '', state, {files: [], chat: state.data.chats[1]});
    expect(outside.map(i => i.title)).toEqual(['#ca-nhan']);
    expect(menuItems('rules', 'sgk', state, {files: [], project: state.data.projects[0]}).map(i => i.title)).toEqual(['#du-an']);
  });
});

describe('hồ sơ cá nhân', () => {
  let root: Root, host: HTMLElement;
  const report = vi.fn(), notice = vi.fn();
  const patch = vi.fn(async () => {});
  const onSkill = vi.fn();
  const render = (node: React.ReactNode) => act(async () => root.render(node));
  const click = (el: Element | null | undefined) => act(async () => { (el as HTMLElement).click(); });
  const byText = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text);
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    vi.mocked(rpc).mockResolvedValue(true as never);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('chỉ coi là kỹ năng riêng khi thầy cô tự tạo', () => {
    expect(base().skills.filter(isOwnSkill).map((s: any) => s.name)).toEqual(['cua-toi', 'tat-roi']);
  });
  it('lưu tên, xem trước chữ cái đầu, nút lưu chỉ bật khi có thay đổi', async () => {
    await render(h(ProfilePanel as any, {state: base(), patch, report, notice, onSkill}));
    expect(host.querySelector('.profile-avatar')!.textContent).toBe('P');
    expect((byText('Lưu tên') as HTMLButtonElement).disabled).toBe(true);
    const input = host.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Phan Đình Đốc');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(host.querySelector('.profile-avatar')!.textContent).toBe('Đ');
    expect((byText('Lưu tên') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); });
    expect(patch).toHaveBeenCalledWith({userName: 'Phan Đình Đốc'});
    expect(notice).toHaveBeenCalledWith('Đã lưu tên.');
  });
  it('tab Quy tắc chỉ quản lý quy tắc cá nhân và gửi đúng phạm vi khi xóa', async () => {
    await render(h(ProfilePanel as any, {state: base(), patch, report, notice, onSkill}));
    await click(byText('Quy tắc'));
    expect(host.textContent).toContain('ca-nhan');
    expect(host.textContent).not.toContain('du-an');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click(host.querySelector('[aria-label="Thao tác quy tắc Quy tắc ca-nhan"]'));
    await click([...document.querySelectorAll('[role=menuitem]')].find(x => x.textContent === 'Xóa'));
    expect(rpc).toHaveBeenCalledWith('deleteRule', {id: 'id-ca-nhan', scope: {kind: 'profile'}});
  });
  it('tab Kỹ năng chỉ liệt kê kỹ năng tự tạo; mở, tạo mới, bật/tắt và xóa gọi đúng việc', async () => {
    await render(h(ProfilePanel as any, {state: base(), patch, report, notice, onSkill}));
    await click(byText('Kỹ năng'));
    expect(host.textContent).toContain('/cua-toi');
    expect(host.textContent).toContain('/tat-roi · đang tắt');
    for (const hidden of ['pvta-word', 'office-giao-an', 'learned-mau', 'tu-github']) expect(host.textContent).not.toContain(hidden);
    await click(byText('＋ Tự viết skill'));
    expect(onSkill).toHaveBeenCalledWith({create: true});
    await click([...host.querySelectorAll('article')][0]!.querySelector('button:not(.danger)'));
    expect(onSkill).toHaveBeenCalledWith({name: 'cua-toi'});
    await click(host.querySelector('input[aria-label="Bật tat-roi"]'));
    expect(rpc).toHaveBeenCalledWith('toggleSkill', {name: 'tat-roi', enabled: true});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click([...host.querySelectorAll('article')][0]!.querySelector('button.danger'));
    expect(rpc).toHaveBeenCalledWith('deleteSkill', {name: 'cua-toi'});
  });
  it('trung tâm quy tắc: tab theo hội thoại → dự án → cá nhân, lưu quy tắc dự án có phạm vi dự án', async () => {
    await render(h(RuleCenter, {state: base(), report, notice, chatId: 'c1', projectId: 'p1'}));
    const tabs = [...host.querySelectorAll('[role=tab]')].map(t => t.textContent);
    expect(tabs).toEqual(['Hội thoại này', 'Dự án · Lớp 8A', 'Cá nhân']);
    expect(host.textContent).toContain('#chat');
    await click(byText('Dự án · Lớp 8A'));
    expect(host.textContent).toContain('#du-an · toàn cục');
    expect(host.textContent).toContain('#cuc-bo · cục bộ');
    expect(host.textContent).not.toContain('#chat');
    await click(byText('＋ Quy tắc mới'));
    expect(host.textContent).toContain('Toàn cục (cả dự án)');
    const [title, text] = [host.querySelector('input')!, host.querySelector('textarea')!];
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Bài tập');
      title.dispatchEvent(new Event('input', {bubbles: true}));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(text, 'Có 5 câu');
      text.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); });
    expect(rpc).toHaveBeenCalledWith('saveRule', {rule: expect.objectContaining({title: 'Bài tập', text: 'Có 5 câu', always: false}), scope: {kind: 'project', id: 'p1'}});
  });
  it('trung tâm quy tắc: ngoài dự án và hội thoại chỉ còn tab cá nhân; initial chọn sẵn tab', async () => {
    await render(h(RuleCenter, {state: base(), report, notice}));
    expect([...host.querySelectorAll('[role=tab]')].map(t => t.textContent)).toEqual(['Cá nhân']);
    await render(h(RuleCenter, {key: 'x', state: base(), report, notice, chatId: 'c1', projectId: 'p1', initial: 'project'}));
    expect(host.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Dự án · Lớp 8A');
  });
});
