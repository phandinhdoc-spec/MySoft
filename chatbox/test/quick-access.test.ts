// @vitest-environment jsdom
import React from 'react';import {createRoot} from 'react-dom/client';import {act} from 'react';import {it,expect,vi} from 'vitest';
const call=vi.hoisted(()=>vi.fn(async()=>true));vi.mock('../src/ipc',()=>({rpc:call}));
import {QuickAccess} from '../src/QuickAccess';import {t} from '../src/i18n';
it('pins tools through persistent preferences without executing them',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),run=vi.fn();
 await act(async()=>root.render(React.createElement(QuickAccess,{items:[{id:'tool:pdf',label:'PDF',icon:'file',run}],onError:vi.fn()})));
 await act(async()=>host.querySelector('button')!.click());const select=host.querySelector('select')!;
 await act(async()=>{select.value='tool:pdf';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(call).toHaveBeenCalledWith('preferences',{patch:{quickAccess:['tool:pdf']}});expect(run).not.toHaveBeenCalled();await act(async()=>root.unmount());host.remove();
});
it('keeps Chat language separate from the add-in setting',()=>{
 localStorage.setItem('pvta.lang','en');localStorage.removeItem('pvta.chat.language');expect(t('Cài đặt')).toBe('Cài đặt');localStorage.setItem('pvta.chat.language','en');expect(t('Cài đặt')).toBe('Settings');expect(localStorage.getItem('pvta.lang')).toBe('en');localStorage.clear();
});

it('translates dynamic UI labels without changing user values',()=>{
 localStorage.setItem('pvta.chat.language','en');
 expect(t('Hướng dẫn · {0}',['academy-guide'])).toBe('Guide · academy-guide');
 expect(t('my own document')).toBe('my own document');
 localStorage.clear();
});
