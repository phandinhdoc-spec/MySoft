/** Serialize updates so a late native call cannot restore an older theme. */
let pending=Promise.resolve();
export function syncNativeTheme(mode:'light'|'dark'|null):Promise<void>{
 if(!('__TAURI_INTERNALS__' in window))return Promise.resolve();
 pending=pending.catch(()=>{}).then(async()=>{
  const {getCurrentWindow}=await import('@tauri-apps/api/window');
  await getCurrentWindow().setTheme(mode);
 });
 return pending;
}
