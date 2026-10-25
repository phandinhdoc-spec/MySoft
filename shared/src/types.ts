/** Kiểu dữ liệu RPC cho hệ thống tự học (learning). */

export type LearningRpcMethod =
  | 'learning.seedBaseline'
  | 'learning.select'
  | 'learning.review'
  | 'learning.restore'
  | 'learning.exportRecovery'
  | 'learning.import'
  | 'learning.read'
  | 'seedBaseline'
  | 'select'
  | 'review'
  | 'restore'
  | 'exportRecovery'
  | 'import';

export interface LearningRefLike {
  kind: 'lesson' | 'rule' | 'skill';
  id: string;
  revision: number;
}

export interface LearningReviewRpcParams {
  ref?: LearningRefLike;
  kind?: 'lesson' | 'rule' | 'skill';
  id?: string;
  revision?: number;
  action: 'approve' | 'activate' | 'suspend' | 'reject' | 'archive';
  reason?: string;
  expectedGeneration?: number;
  actor?: { kind: 'user' | 'system' | 'model'; id: string };
  now?: string;
}

export interface LearningRestoreRpcParams {
  current?: LearningRefLike;
  ref?: LearningRefLike;
  kind?: 'lesson' | 'rule' | 'skill';
  id?: string;
  revision?: number;
  targetRevision?: number;
  restoreRevision?: number;
  previousRevision?: number;
  expectedGeneration?: number;
  actor?: { kind: 'user' | 'system' | 'model'; id: string };
  now?: string;
}

export interface LearningSelectRpcParams {
  now?: string;
  groupIds?: string[];
  groups?: unknown[];
  researchSubtype?: 'legal' | 'news' | 'professional';
  projectId?: string | null;
  chatId?: string;
  workflowId?: string;
  planId?: string;
  verifiedSourceIds?: string[];
  blockedRefs?: string[];
  explicit?: LearningRefLike;
}

export interface LearningSeedBaselineRpcParams {
  now?: string;
  actor?: { kind: 'user' | 'system' | 'model'; id: string };
  defs?: unknown[];
}

export interface LearningImportRpcParams {
  path?: string;
  content?: string | object;
  data?: unknown;
  registry?: unknown;
  expectedGeneration?: number;
  actor?: { kind: 'user' | 'system' | 'model'; id: string };
  now?: string;
}

export interface LearningExportRecoveryRpcParams {
  destination?: string;
  path?: string;
}
