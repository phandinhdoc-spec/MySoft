export interface UsageWindow {updatedAt?:number;usedPercent?:number;resetsAt?:number;status?:'allowed'|'warning'|'rejected'}
/** Provider-reported plan windows; percentages always mean used, timestamps are ms. */
export interface ProviderUsage {unlimited?:boolean;error?:string;checkedAt?:number;fiveHour?:UsageWindow;week?:UsageWindow;updatedAt:number}
