import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DesktopRuntime } from '../src/desktop/runtime.js';
import type { ResourceRef } from '../src/desktop/learning-policy.js';
import {BASELINE_DEFS} from '../src/desktop/learning-baseline.js';

const roots: string[] = [];
const runtimes: DesktopRuntime[] = [];

afterEach(() => {
  runtimes.forEach((r) => r.dispose?.());
  runtimes.length = 0;
  roots.forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
  roots.length = 0;
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-learning-rpc-'));
  roots.push(dir);
  const r = new DesktopRuntime(() => {}, dir);
  runtimes.push(r);
  return { r, dir };
}

const req = (r: DesktopRuntime, method: string, params: Record<string, unknown> = {}) =>
  r.dispatch({ id: crypto.randomUUID(), method, params });

describe('Learning RPC', () => {
  it.each(['project','chat','workflow','plan'] as const)('reviews %s scope only while the local resource exists',async kind=>{
    const {r}=setup();const now='2026-10-24T03:00:00.000Z';
    await req(r,'seedBaseline',{now});
    r.store.data.projects.push({id:'project'} as any);
    r.store.data.chats.push({id:'chat',projectId:'project',messages:[{plan:{id:'plan'}}]} as any);
    r.store.data.workflows=[{id:'workflow',projectId:'project'} as any];
    const reg=r.learningStore.read();const lesson=reg.lessons.find(l=>l.classification.groupIds.includes('workflow'))!;
    const scope=kind==='project'?{kind,projectId:'project'}:kind==='chat'?{kind,projectId:'project',chatId:'chat'}:kind==='workflow'?{kind,projectId:'project',workflowId:'workflow'}:{kind,projectId:'project',chatId:'chat',planId:'plan'};
    r.learningStore.revise(reg.generation,{kind:'lesson',id:lesson.id,revision:1},{...lesson,scope},{actor:{kind:'user',id:'teacher'},context:{now,groups:['workflow'],canAccess:()=>true,sourceAvailable:()=>true,readArtifact:()=>null},canReview:()=>true});
    const ref={kind:'lesson',id:lesson.id,revision:2};
    await expect(req(r,'learning.review',{ref,action:'approve',now})).resolves.toMatchObject({ok:true});
    await expect(req(r,'learning.review',{ref,action:'activate',now})).resolves.toMatchObject({ok:true});
    r.store.data.projects=[];
    await expect(req(r,'learning.review',{ref,action:'suspend',now})).rejects.toThrow('REVIEW_AUTH');
  });
  it('does not bypass the registry using a legacy active skill or direct skill read',async()=>{
    const {r}=setup();const now=new Date().toISOString();const base=BASELINE_DEFS[0]!;
    await req(r,'seedBaseline',{now,defs:[{...base,skill:{...base.skill,name:'learned-registry'}}]});
    const reg=r.learningStore.read();const skill=reg.skills.find(s=>s.classification.groupIds.includes('workflow'))!;
    const file=path.join(r.skills.dir,skill.name,'SKILL.md');fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,`---\nname: ${skill.name}\ndescription: Test\nload: demand\n---\n${skill.bodyMarkdown}`);
    r.store.data.learnedDrafts=[{id:'old',name:skill.name,description:skill.description,body:skill.bodyMarkdown,status:'active',reviewedAt:Date.now(),at:Date.now(),source:'test',existingHash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}];
    const chatId=await req(r,'newChat');const chat=r.store.data.chats.find(c=>c.id===chatId)!;
    expect((r as any).context(chat,'/'+skill.name)).not.toContain('[Dữ liệu quy trình '+skill.name+']');
    expect(()=>(r as any).readSource(chat,{tool:'office_skill_read',args:{name:skill.name}})).toThrow('chưa được duyệt');
    const lesson=reg.lessons.find(l=>l.id===skill.lessonRefs[0]!.id)!;
    for(const action of ['approve','activate'])await req(r,'learning.review',{ref:{kind:'lesson',id:lesson.id,revision:1},action,now});
    await req(r,'reviewLearnedSkill',{id:'old',action:'approve'});
    expect(r.learningStore.read().skills.find(s=>s.id===skill.id)?.review.status).toBe('active');
    expect((r as any).context(chat,'/'+skill.name)).toContain('[Dữ liệu quy trình '+skill.name+']');
    await req(r,'learning.review',{ref:{kind:'skill',id:skill.id,revision:1},action:'suspend',now});
    expect(()=>(r as any).readSource(chat,{tool:'office_skill_read',args:{name:skill.name}})).toThrow('chưa được duyệt');
    await req(r,'reviewLearnedSkill',{id:'old',action:'reject'});
    expect(r.learningStore.read().skills.find(s=>s.id===skill.id)?.review.status).toBe('rejected');
  });
  it('reviews a research baseline with its stored subtype', async () => {
    const {r}=setup();const now='2026-10-24T03:00:00.000Z';
    await req(r,'seedBaseline',{now});
    const reg=r.learningStore.read();
    const lesson=reg.lessons.find(l=>l.classification.researchSubtype==='legal')!;
    await expect(req(r,'learning.review',{ref:{kind:'lesson',id:lesson.id,revision:1},action:'approve',now})).resolves.toMatchObject({ok:true});
  });
  it('thực hiện seedBaseline và đảm bảo tính idempotent', async () => {
    const { r } = setup();
    const t0 = '2026-10-24T03:00:00.000Z';

    const res1 = (await req(r, 'seedBaseline', { now: t0 })) as {
      created: string[];
      skipped: string[];
      generation: number;
    };
    expect(res1.created.length).toBe(5); // 5 bộ baseline: workflow, planning, research/legal, research/news, research/professional
    expect(res1.skipped.length).toBe(0);
    expect(res1.generation).toBeGreaterThan(1);

    // Lặp lại seedBaseline: toàn bộ 5 bộ phải được skip
    const res2 = (await req(r, 'learning.seedBaseline', { now: '2026-10-25T03:00:00.000Z' })) as {
      created: string[];
      skipped: string[];
      generation: number;
    };
    expect(res2.created.length).toBe(0);
    expect(res2.skipped.length).toBe(5);
    expect(res2.generation).toBe(res1.generation);
  });

  it('select từ chối các mục proposed và chỉ chọn các mục đã active', async () => {
    const { r } = setup();
    const t0 = '2026-10-24T03:00:00.000Z';
    await req(r, 'seedBaseline', { now: t0 });

    // Khi chưa duyệt: select trả về 0 mục selected, tất cả bị từ chối do NOT_ACTIVE
    const resWorkflow = (await req(r, 'select', {
      now: t0,
      groupIds: ['workflow'],
    })) as {
      selected: { ref: ResourceRef; content: string }[];
      denied: { ref: ResourceRef; reason: string }[];
    };
    expect(resWorkflow.selected.length).toBe(0);
    expect(resWorkflow.denied.length).toBeGreaterThan(0);
    expect(resWorkflow.denied.some((d) => d.reason === 'NOT_ACTIVE')).toBe(true);

    // Research thiếu subtype phải bị từ chối do SUBTYPE đối với các mục research
    const resResearchNoSubtype = (await req(r, 'learning.select', {
      now: t0,
      groupIds: ['research'],
    })) as {
      selected: unknown[];
      denied: { ref: ResourceRef; reason: string }[];
    };
    expect(resResearchNoSubtype.selected.length).toBe(0);
    expect(resResearchNoSubtype.denied.some((d) => d.reason === 'SUBTYPE')).toBe(true);
  });

  it('review cho phép approve, activate, suspend, reject và từ chối model actor', async () => {
    const { r } = setup();
    const t0 = '2026-10-24T03:00:00.000Z';
    await req(r, 'seedBaseline', { now: t0 });

    const reg = (await req(r, 'learning.read')) as any;
    const lesson = reg.lessons.find((l: any) => l.classification.groupIds.includes('workflow'));
    expect(lesson).toBeDefined();

    // 1. Model actor không có quyền duyệt -> phải bị từ chối
    await expect(
      req(r, 'review', {
        ref: { kind: 'lesson', id: lesson.id, revision: 1 },
        action: 'approve',
        actor: { kind: 'model', id: 'fake-ai' },
        now: t0,
      }),
    ).rejects.toThrow();

    // 2. User approve bài học
    const appRes = (await req(r, 'review', {
      ref: { kind: 'lesson', id: lesson.id, revision: 1 },
      action: 'approve',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    })) as any;
    expect(appRes.ok).toBe(true);

    // 3. User activate bài học
    const actRes = (await req(r, 'learning.review', {
      ref: { kind: 'lesson', id: lesson.id, revision: 1 },
      action: 'activate',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    })) as any;
    expect(actRes.ok).toBe(true);

    // 4. Tìm rule phụ thuộc bài học này và approve + activate
    const regAfter = (await req(r, 'learning.read')) as any;
    const rule = regAfter.rules.find((rl: any) =>
      rl.lessonRefs.some((lr: any) => lr.id === lesson.id),
    );
    expect(rule).toBeDefined();

    await req(r, 'review', {
      ref: { kind: 'rule', id: rule.id, revision: 1 },
      action: 'approve',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });
    await req(r, 'review', {
      ref: { kind: 'rule', id: rule.id, revision: 1 },
      action: 'activate',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });

    // 5. Select bây giờ phải chọn được rule vừa activate
    const selectRes = (await req(r, 'select', {
      now: t0,
      groupIds: ['workflow'],
    })) as {
      selected: { ref: ResourceRef; content: string }[];
      denied: { ref: ResourceRef; reason: string }[];
    };
    expect(selectRes.selected.some((s) => s.ref.id === rule.id)).toBe(true);

    // 6. Suspend rule: tạm dừng áp dụng
    await req(r, 'review', {
      ref: { kind: 'rule', id: rule.id, revision: 1 },
      action: 'suspend',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });
    const selectSuspended = (await req(r, 'select', {
      now: t0,
      groupIds: ['workflow'],
    })) as {
      selected: { ref: ResourceRef; content: string }[];
      denied: { ref: ResourceRef; reason: string }[];
    };
    expect(selectSuspended.selected.some((s) => s.ref.id === rule.id)).toBe(false);
    expect(selectSuspended.denied.some((d) => d.ref.id === rule.id && d.reason === 'NOT_ACTIVE')).toBe(true);

    // 7. Reject một mục khác
    const otherLesson = regAfter.lessons.find((l: any) => l.id !== lesson.id);
    await req(r, 'review', {
      ref: { kind: 'lesson', id: otherLesson.id, revision: 1 },
      action: 'reject',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });
    const regFinal = (await req(r, 'learning.read')) as any;
    const rejected = regFinal.lessons.find((l: any) => l.id === otherLesson.id);
    expect(rejected.review.status).toBe('rejected');
  });

  it('restore khôi phục phiên bản cũ thành revision mới ở trạng thái proposed', async () => {
    const { r } = setup();
    const t0 = '2026-10-24T03:00:00.000Z';
    await req(r, 'seedBaseline', { now: t0 });

    const reg = (await req(r, 'learning.read')) as any;
    const lesson = reg.lessons[0];

    // Duyệt và kích hoạt revision 1
    await req(r, 'review', {
      ref: { kind: 'lesson', id: lesson.id, revision: 1 },
      action: 'approve',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });
    await req(r, 'review', {
      ref: { kind: 'lesson', id: lesson.id, revision: 1 },
      action: 'activate',
      actor: { kind: 'user', id: 'teacher' },
      now: t0,
    });

    // Sửa tạo revision 2 qua revise
    const authority = {
      actor: { kind: 'user' as const, id: 'teacher' },
      context: {
        now: '2026-10-24T04:00:00.000Z',
        groups: reg.groups.map((g: any) => g.id),
        canAccess: () => true,
        sourceAvailable: () => true,
        readArtifact: () => null,
      },
      canReview: () => true,
    };
    const regCurrent = r.learningStore.read();
    r.learningStore.revise(
      regCurrent.generation,
      { kind: 'lesson', id: lesson.id, revision: 1 },
      { ...lesson, statement: 'Nội dung sửa đổi revision 2' },
      authority,
    );

    const regRev2 = (await req(r, 'learning.read')) as any;
    expect(regRev2.lessons.some((l: any) => l.id === lesson.id && l.revision === 2)).toBe(true);

    // Gọi RPC restore về revision 1
    const restoreRes = (await req(r, 'restore', {
      current: { kind: 'lesson', id: lesson.id, revision: 2 },
      revision: 1,
      actor: { kind: 'user', id: 'teacher' },
      now: '2026-10-24T05:00:00.000Z',
    })) as any;
    expect(restoreRes.ok).toBe(true);

    const regRev3 = (await req(r, 'learning.read')) as any;
    const rev3 = regRev3.lessons.find((l: any) => l.id === lesson.id && l.revision === 3);
    expect(rev3).toBeDefined();
    expect(rev3.statement).toBe(lesson.statement); // nội dung lấy từ revision 1
    expect(rev3.review.status).toBe('proposed'); // khôi phục luôn ở proposed chờ duyệt
    expect(rev3.previousRevision).toBe(2);
  });

  it('exportRecovery xuất bản sao lưu ra thư mục mới và không ghi đè', async () => {
    const { r, dir } = setup();
    const dest = path.join(dir, 'recovery-output');

    const res = (await req(r, 'exportRecovery', { destination: dest })) as any;
    expect(res.ok).toBe(true);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.existsSync(path.join(dest, 'state.json'))).toBe(true);

    // Gọi lại vào thư mục đã tồn tại -> phải ném lỗi (không ghi đè)
    await expect(req(r, 'exportRecovery', { destination: dest })).rejects.toThrow();
  });

  it('import khử trùng triệt để trạng thái duyệt từ tệp nhập ngoại lai', async () => {
    const { r, dir } = setup();
    const t0 = '2026-10-24T03:00:00.000Z';
    // Khởi tạo store sạch
    r.ensureLearningStore();

    // Chuẩn bị fixture ngoại lai cố tình đánh dấu active và mang approval/activation giả
    const foreignLessonId = crypto.randomUUID();
    const foreignRuleId = crypto.randomUUID();
    const foreignSrcId = crypto.randomUUID();
    const foreignEviId = crypto.randomUUID();

    const foreignRegistry = {
      schemaVersion: 1,
      registryId: crypto.randomUUID(),
      generation: 1,
      groups: [],
      lessons: [
        {
          id: foreignLessonId,
          revision: 1,
          previousRevision: null,
          createdAt: t0,
          createdBy: { kind: 'user', id: 'foreign-user' },
          classification: {
            state: 'classified',
            groupIds: ['workflow'],
            researchSubtype: null,
            reason: 'Kinh nghiệm quy trình nhập từ ngoài',
          },
          scope: { kind: 'global' },
          sourceIds: [foreignSrcId],
          evidenceIds: [foreignEviId],
          review: {
            status: 'active', // CỐ TÌNH ĐỂ ACTIVE
            approval: {
              revision: 1,
              by: 'hacker',
              at: t0,
              groupIds: ['workflow'],
              scope: { kind: 'global' },
            },
            activation: {
              revision: 1,
              at: t0,
              basis: 'approval',
              artifactHash: null,
            },
          },
          reviewDueAt: '2026-12-31T00:00:00.000Z',
          supersedes: [],
          legacyRef: null,
          extensions: {},
          title: 'Bài học nhập từ ngoài',
          statement: 'Nội dung quy trình nhập ngoại lai',
          claimKind: 'procedure',
          limitations: [],
          relatedLessonRefs: [],
        },
      ],
      skills: [],
      rules: [
        {
          id: foreignRuleId,
          revision: 1,
          previousRevision: null,
          createdAt: t0,
          createdBy: { kind: 'user', id: 'foreign-user' },
          classification: {
            state: 'classified',
            groupIds: ['workflow'],
            researchSubtype: null,
            reason: 'Quy tắc nhập từ ngoài',
          },
          scope: { kind: 'global' },
          sourceIds: [foreignSrcId],
          evidenceIds: [foreignEviId],
          review: {
            status: 'approved', // CỐ TÌNH ĐỂ APPROVED
            approval: {
              revision: 1,
              by: 'hacker',
              at: t0,
              groupIds: ['workflow'],
              scope: { kind: 'global' },
            },
            activation: null,
          },
          reviewDueAt: '2026-12-31T00:00:00.000Z',
          supersedes: [],
          legacyRef: null,
          extensions: {},
          key: 'foreign-rule-key',
          title: 'Quy tắc ngoại lai',
          text: 'Chỉ dẫn an toàn nhập từ ngoài',
          lessonRefs: [{ kind: 'lesson', id: foreignLessonId, revision: 1 }],
          conflictKey: null,
          trigger: 'automatic',
        },
      ],
      sources: [
        {
          id: foreignSrcId,
          kind: 'workflow_design',
          capturedAt: t0,
          locator: { workflowId: 'wf-foreign', revision: 1 },
          version: '1',
          excerpt: 'Nguồn ngoại lai',
          privacy: { redacted: false, exportable: true },
        },
      ],
      evidence: [
        {
          id: foreignEviId,
          sourceId: foreignSrcId,
          kind: 'artifact_check',
          claim: 'Khẳng định chạy thật',
          locator: { stepId: 's1' },
          result: 'passed',
          verifiedAt: t0,
          verifiedBy: { kind: 'user', id: 'auditor' },
          method: 'manual',
        },
      ],
      events: [],
      migration: null,
    };

    const importFile = path.join(dir, 'foreign-data.json');
    fs.writeFileSync(importFile, JSON.stringify(foreignRegistry, null, 2), 'utf8');

    // Thực hiện RPC import qua đường dẫn tệp
    const importRes = (await req(r, 'learning.import', {
      path: importFile,
      now: t0,
    })) as any;
    expect(importRes.ok).toBe(true);
    expect(importRes.imported.lessons).toBe(1);
    expect(importRes.imported.rules).toBe(1);
    expect(importRes.imported.sources).toBe(1);
    expect(importRes.imported.evidence).toBe(1);

    // Kiểm tra dữ liệu trong kho: BẮT BUỘC ĐÃ BỊ KHỬ TRÙNG
    const regAfter = (await req(r, 'learning.read')) as any;
    const importedLesson = regAfter.lessons.find((l: any) => l.id === foreignLessonId);
    const importedRule = regAfter.rules.find((rl: any) => rl.id === foreignRuleId);

    expect(importedLesson).toBeDefined();
    expect(importedRule).toBeDefined();

    // 1. Trạng thái bắt buộc bị chuyển về 'proposed'
    expect(importedLesson.review.status).toBe('proposed');
    expect(importedRule.review.status).toBe('proposed');

    // 2. Toàn bộ approval và activation ngoại lai bị xóa sạch
    expect(importedLesson.review.approval).toBeNull();
    expect(importedLesson.review.activation).toBeNull();
    expect(importedLesson.reviewDueAt).toBeNull();

    expect(importedRule.review.approval).toBeNull();
    expect(importedRule.review.activation).toBeNull();
    expect(importedRule.reviewDueAt).toBeNull();

    // 3. Có gắn nhãn sanitized trong extensions
    expect(importedLesson.extensions['pvta.import'].sanitized).toBe(true);
    expect(importedRule.extensions['pvta.import'].sanitized).toBe(true);

    // 4. Tuyệt đối không được kích hoạt khi select
    const selectRes = (await req(r, 'select', {
      now: t0,
      groupIds: ['workflow'],
    })) as {
      selected: { ref: ResourceRef; content: string }[];
      denied: { ref: ResourceRef; reason: string }[];
    };
    expect(selectRes.selected.some((s) => s.ref.id === foreignRuleId)).toBe(false);
    const deniedEntry = selectRes.denied.find((d) => d.ref.id === foreignRuleId);
    expect(deniedEntry).toBeDefined();
    expect(['NOT_ACTIVE', 'REVIEW_DUE', 'DEPENDENCY']).toContain(deniedEntry?.reason);

    // 5. Thử import dữ liệu sai schema / hỏng -> phải báo lỗi
    await expect(req(r, 'import', { content: '{ invalid json' })).rejects.toThrow();
    await expect(req(r, 'import', { content: { schemaVersion: 99 } })).rejects.toThrow();
  });
});
