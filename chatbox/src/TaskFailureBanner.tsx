import {t as uiText} from './i18n';
import React from 'react';
import type {FailedTask} from '@pvta/core/desktop/task-failure';
export function TaskFailureBanner({task,onView,onDismiss}:{task:FailedTask;onView:(task:FailedTask)=>void;onDismiss?:(task:FailedTask)=>void}){
 const label=uiText("{0} bị gián đoạn: {1}",[task.title,task.reason]);
 return <div role="status" className="task-failure-banner"><span title={label}>{label}</span><button onClick={()=>onView(task)}>Xem</button>{onDismiss&&<button aria-label={uiText("Ẩn thông báo")} title={uiText("Ẩn thông báo")} onClick={()=>onDismiss(task)}>{uiText("×")}</button>}</div>;
}
