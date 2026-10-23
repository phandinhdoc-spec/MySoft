/** Đích mở khi bấm gợi ý của AI nền. Mã không có ở đây thì chỉ hiện cách dùng, không điều hướng. */
export type SelfTipTarget='notebook'|'workflows'|'skills'|'activity'|'projects'|'github'|'terminal'|'help'|'settings'|'learned';
const TARGETS:Record<string,SelfTipTarget>={
 notebook:'notebook',workflow:'workflows',skills:'skills',resume:'activity',history:'activity','plan-recovery':'activity',
 'learning-folder':'projects',workspace:'projects',github:'github',terminal:'terminal',help:'help',appearance:'settings',refine:'settings',feedback:'learned',
};
export const selfTipTarget=(capabilityId:string):SelfTipTarget|undefined=>TARGETS[capabilityId];
