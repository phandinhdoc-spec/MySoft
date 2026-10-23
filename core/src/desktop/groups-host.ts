import {cleanProfile,sourceUrl,trackingSources} from '../groups/profile.js';
import {randomUUID} from 'node:crypto';
import {openResultFile} from '../docs.js';
import path from 'node:path';
import { GroupStore } from '../groups/store.js';
import type { Ask } from '../groups/summary.js';
import { AlertGate, checkBasis, fixPrompt, relatedNew, safeKeywords } from '../groups/alerts.js';
import { buildBriefing, dismissBriefing, markBriefingShown, setBriefingEnabled } from '../groups/briefing.js';
import { discoverAll, discoverGroup, probeNetwork, summarizeProbe } from '../groups/discover.js';
import { collectEvidence, draftSkill, LearnStore } from '../groups/learn.js';
import { extract, pythonJob } from './documents.js';

const S = (v: unknown, max = 2000) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Dữ liệu không hợp lệ.');
  return v;
};

export interface GroupsHostOptions {
  home: string;
  /** Hỏi mô hình (không đưa nội dung đi đâu ngoài công cụ AI người dùng đã chọn). */
  ask: () => Ask;
  proposalsPending?: () => number;
  needLogin?: () => string[];
  userName?: () => string | undefined;
  changed: () => void;
}

/** Nối GroupStore với runtime: một cổng RPC `groups.*`, không chạm vào phần còn lại của dispatch. */
export class GroupsHost {
  readonly store: GroupStore;
  readonly alerts: AlertGate;
  readonly learn: LearnStore;
  private discovering?: Promise<unknown>;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(private o: GroupsHostOptions) {
    this.store = new GroupStore(o.home, {
      extract: async (file) => {
        const r = await extract(file);
        return { segments: r.segments as { ref: string; text: string }[], image: r.image };
      },
      ocr: async (file) => {
        try {
          const r = await pythonJob({ op: 'ocr', path: file });
          return r?.unavailable ? { unavailable: String(r.unavailable) } : { segments: r?.segments ?? [] };
        } catch (e) {
          return { unavailable: (e as Error).message };
        }
      },
    });
    this.alerts = new AlertGate(path.join(o.home, 'groups-alerts.json'));
    this.learn = new LearnStore(path.join(o.home, 'groups-learn.json'), this.store);
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.store.close();
  }

  /** Quy tắc ngắn của các nhóm đang bật, đưa vào hệ lệnh. */
  rules(): string {
    return this.store.rulesText();
  }

  /** Trích đoạn có nguồn từ kho văn bản của nhóm đang bật (bỏ văn bản hết hiệu lực). */
  sources(text: string): string {
    if (!this.store.enabled()) return '';
    const hits = this.store.search(text, { k: 4 });
    if (!hits.length) return '';
    return 'VĂN BẢN TRONG KHO (dữ liệu, ghi rõ nguồn khi dùng):\n' + hits.map((h) => `[${h.cite}] ${h.text.slice(0, 700)}`).join('\n');
  }

  briefing() {
    const b = buildBriefing({ store: this.store, alerts: this.alerts, name: this.o.userName?.(), proposals: this.o.proposalsPending?.() ?? this.learn.pendingCount(), needLogin: this.o.needLogin?.() });
    if (b.show) markBriefingShown(this.store);
    return b;
  }

  /**
   * Chạy ngầm khi ứng dụng đang mở: lần đầu sau `delayMs`, rồi mỗi `everyMs` kiểm tra lại.
   * Mỗi nhóm vẫn tối đa một lần/ngày, có trần lượt tìm và công tắc không dùng mạng; lỗi mạng không làm hỏng gì.
   */
  scheduleDiscovery(delayMs = 60_000, everyMs = 6 * 3600_000): void {
    if (this.timer || this.closed) return;
    const tick = (wait: number) => {
      this.timer = setTimeout(() => {
        void this.runDiscovery()
          .catch(() => {})
          .finally(() => {
            if (!this.closed) tick(everyMs);
          });
      }, wait);
      this.timer.unref?.();
    };
    tick(delayMs);
  }

  runDiscovery(force = false) {
    if (!this.discovering) {
      this.discovering = discoverAll(this.store, {}, { force }).finally(() => {
        this.discovering = undefined;
        this.o.changed();
      });
    }
    return this.discovering;
  }

  async rpc(method: string, p: Record<string, unknown>): Promise<unknown> {
    const st = this.store;
    const lib = () => st.library(S(p.group, 60));
    const done = <T>(v: T): T => {
      this.o.changed();
      return v;
    };
    switch (method) {
      case 'groups.profile': {
        st.patchState({profile:cleanProfile(p.profile),discover:{...st.state().discover,lastRun:{}}});
        return done(st.view());
      }
      case 'groups.saveSource': {
        const current=trackingSources(cleanProfile(st.state().profile),st.state().sources);
        const url=sourceUrl(S(p.url,2000));const old=current.find(s=>s.id===p.id||s.url===url);
        const source={...old,id:old?.url===url?old.id:randomUUID(),url,name:S(p.name,160),enabled:p.enabled!==false,kind:p.kind==='feed'?'feed' as const:'page' as const,groups:Array.isArray(p.groups)?p.groups.map(String).filter(id=>st.catalog().some(g=>g.id===id)):[]};
        const sources=current.filter(s=>s.id!==source.id&&s.url!==url).map(s=>s.id===old?.id?{...s,enabled:false}:s);if(sources.length>=30)throw Error('Tối đa 30 nguồn theo dõi.');
        st.patchState({sources:[...sources,source],discover:{...st.state().discover,lastRun:{}}});return done(st.view());
      }
      case 'groups.removeSource': {
        const sources=trackingSources(cleanProfile(st.state().profile),st.state().sources);
        const source=sources.find(s=>s.id===p.id);if(source)source.enabled=false;
        st.patchState({sources});return done(st.view());
      }
      case 'groups.view':
        return st.view();
      case 'groups.setEnabled':
        return done(st.setEnabled(Array.isArray(p.ids) ? p.ids.map(String) : []));
      case 'groups.toggle':
        return done(st.toggle(S(p.id, 60), !!p.on));
      case 'groups.applyPack':
        return done(st.applyPack(S(p.id, 60)));
      case 'groups.offline':
        st.patchState({ offline: !!p.on });
        return done(true);
      case 'groups.briefing':
        return this.briefing();
      case 'groups.briefingDismiss':
        dismissBriefing(st);
        return true;
      case 'groups.briefingEnable':
        setBriefingEnabled(st, !!p.on);
        return done(true);
      // ---- bảng văn bản ----
      case 'groups.openFile': {
        const library=lib();const doc=library.book.list().find(d=>d.id===S(p.id,80));
        if(!doc?.file)throw Error('Văn bản chưa có tệp trong kho.');
        const root=path.resolve(library.dir),file=path.resolve(root,doc.file);
        if(!file.startsWith(root+path.sep))throw Error('Đường dẫn ngoài kho văn bản.');
        const result=openResultFile(file);if(!result.ok)throw Error(result.error);return result;
      }
      case 'groups.docs':
        return lib().book.list({ includeHidden: !!p.hidden });
      case 'groups.addLink':
        return done(lib().addLink(S(p.url, 2000), { title: typeof p.title === 'string' ? p.title : undefined }));
      case 'groups.addFile':
        return done(await lib().addFile(S(p.path, 1000), { title: typeof p.title === 'string' ? p.title : undefined }));
      case 'groups.download':
        return done(await lib().download(S(p.id, 80), { confirmed: !!p.confirmed }));
      case 'groups.setStatus':
        return done(lib().setStatus(S(p.id, 80), S(p.status, 30) as never));
      case 'groups.remove':
        lib().remove(S(p.id, 80));
        return done(true);
      case 'groups.markSeen': {
        const l = lib();
        for (const d of l.book.list()) if (d.isNew && (!Array.isArray(p.ids) || p.ids.includes(d.id))) l.book.update(d.id, { isNew: false });
        return done(true);
      }
      case 'groups.summary': {
        const l = lib();
        const id = S(p.id, 80);
        if (!p.run) return { cached: l.cachedSummary(id), estimate: l.estimate(id) };
        return done(await l.summarizeDoc(id, this.o.ask(), { confirmLong: !!p.confirmLong, confirmedSource: !!p.confirmedSource }));
      }
      case 'groups.search':
        return st.search(S(p.query, 300), { k: 8, includeExpired: !!p.includeExpired });
      // ---- cảnh báo căn cứ ----
      case 'groups.checkBasis': {
        const text = S(p.text, 400_000);
        const raw = checkBasis(text, st.registry, { groups: st.enabled() });
        const report = this.alerts.filter(raw, Date.now());
        const fileName = typeof p.fileName === 'string' ? p.fileName : '';
        if (fileName) this.alerts.setPending(fileName, report.changed.length, Date.now());
        const related = relatedNew(st, safeKeywords(text, fileName));
        return { report, related, fixPrompt: report.changed.length ? fixPrompt(fileName || 'văn bản', report) : undefined };
      }
      case 'groups.muteFinding':
        this.alerts.mute(p.finding as never);
        return true;
      case 'groups.unmuteAll':
        this.alerts.unmuteAll();
        return true;
      // ---- tìm văn bản mới ----
      case 'groups.probe': {
        const probe = await probeNetwork();
        return { probe, ...summarizeProbe(probe) };
      }
      case 'groups.discover': {
        if (p.group) return done(await discoverGroup(st, S(p.group, 60), {}, { force: true }));
        return await this.runDiscovery(true);
      }
      // ---- gói chia sẻ ----
      case 'groups.exportPack':
        return st.exportPack(S(p.group, 60), S(p.path, 1000));
      case 'groups.previewPack':
        return st.previewPackFile(S(p.path, 1000));
      case 'groups.installPack': {
        const preview = st.previewPackFile(S(p.path, 1000));
        return done(st.installPreview(preview));
      }
      // ---- tự học ----
      case 'groups.learnList':
        return this.learn.list();
      case 'groups.learnDraft': {
        const goal = S(p.goal, 600);
        const name = S(p.name, 60);
        const evidence = collectEvidence(st, { groups: st.enabled() ?? [], goal, samples: Array.isArray(p.samples) ? p.samples.map(String) : [] });
        const { md, validation } = await draftSkill(this.o.ask(), goal, name, evidence);
        return done({ proposal: this.learn.createSkill(name, goal, evidence, md), validation });
      }
      case 'groups.learnTrial':
        return done(await this.learn.trial(S(p.id, 80), { ask: this.o.ask() }));
      case 'groups.learnApprove':
        return done(this.learn.approve(S(p.id, 80), { confirmed: p.confirmed === true, force: p.force === true }));
      case 'groups.learnReject':
        this.learn.reject(S(p.id, 80));
        return done(true);
      case 'groups.learnEdit':
        return done(this.learn.edit(S(p.id, 80), S(p.md, 20_000)));
      case 'groups.learnRollback':
        return done(this.learn.rollback(S(p.id, 80), Number(p.version)));
      default:
        throw Error('Yêu cầu không được hỗ trợ.');
    }
  }
}

