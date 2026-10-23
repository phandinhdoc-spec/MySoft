mod terminal;
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use serde_json::Value;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};
use tokio::sync::oneshot;

/// Each in-flight request remembers the window that sent it, so its own events
/// (e.g. streamed text) reach only that window. Events without an id are shared state.
struct Waiting { sender: oneshot::Sender<Result<Value, String>>, window: String }
type Pending = Arc<Mutex<HashMap<String, Waiting>>>;
struct CoreState { child: Arc<Mutex<Option<CommandChild>>>, pending: Pending, error: Arc<Mutex<Option<String>>> }

#[tauri::command]
async fn rpc(request: Value, window: tauri::WebviewWindow, state: tauri::State<'_, CoreState>) -> Result<Value, String> {
    let id = request.get("id").and_then(Value::as_str).filter(|s| s.len() <= 100).ok_or("Thiếu mã yêu cầu")?.to_owned();
    if let Some(err) = state.error.lock().map_err(|_| "Lỗi khóa")?.as_ref() { return Err(err.clone()); }
    let payload = serde_json::to_vec(&request).map_err(|_| "Yêu cầu không hợp lệ")?;
    if payload.len() > 2_000_000 { return Err("Yêu cầu quá dài".into()); }
    let (sender, receiver) = oneshot::channel();
    { let mut pending = state.pending.lock().map_err(|_| "Lỗi khóa")?;
      if pending.contains_key(&id) { return Err("Mã yêu cầu bị trùng".into()); }
      pending.insert(id.clone(), Waiting { sender, window: window.label().to_owned() });
    }
    let write_result = {
        let mut child = state.child.lock().map_err(|_| "Lỗi khóa")?;
        match child.as_mut() {
            Some(child) => { let mut line = payload; line.push(b'\n'); child.write(&line).map_err(|_| "Lõi PVTA đã ngắt kết nối".to_string()) },
            None => Err("Lõi PVTA đang khởi động. Thử kết nối lại sau một lát.".to_string()),
        }
    };
    if let Err(e) = write_result { state.pending.lock().map_err(|_| "Lỗi khóa")?.remove(&id); return Err(e); }
    // A running Plan may wait for the teacher to approve file operations.
    let result = tokio::time::timeout(Duration::from_secs(86_400), receiver).await;
    state.pending.lock().map_err(|_| "Lỗi khóa")?.remove(&id);
    match result { Ok(Ok(result)) => result, Ok(Err(_)) => Err("Lõi PVTA đã dừng".into()), Err(_) => Err("Yêu cầu hết thời gian chờ".into()) }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Mở lại hoặc thoát ứng dụng sau khi lõi PVTA đã cài bản mới (xem core/src/desktop/selfupdate.ts).
        .plugin(tauri_plugin_process::init())
        .manage(CoreState {child:Arc::new(Mutex::new(None)),pending:Arc::new(Mutex::new(HashMap::new())),error:Arc::new(Mutex::new(None))})
        .manage(terminal::TerminalState::default())
        .invoke_handler(tauri::generate_handler![rpc, terminal::terminal_open, terminal::terminal_write, terminal::terminal_resize, terminal::terminal_close])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<CoreState>();
            let child_ref = state.child.clone(); let pending = state.pending.clone(); let error_ref = state.error.clone();
            // The window is created immediately; spawning and listening happen in the background.
            tauri::async_runtime::spawn(async move {
                let resource = match handle.path().resource_dir() { Ok(p) => p, Err(_) => return };
                let script = resource.join("documents.py");
                let command = match handle.shell().sidecar("pvta-core") {
                    Ok(c) => c.env("PVTA_PYTHON_SCRIPT", script.to_string_lossy().to_string())
                        .env("PVTA_DESKTOP_SKILLS", resource.join("desktop-skills").to_string_lossy().to_string())
                        .env("PVTA_OFFICE_ADDIN", resource.join("office-addin").to_string_lossy().to_string()),
                    Err(_) => { *error_ref.lock().unwrap() = Some("Không tìm thấy lõi PVTA trong gói cài đặt.".into()); return; }
                };
                let command = if !cfg!(debug_assertions) || resource.join("runtime/manifest.json").exists() {
                    command.env("PVTA_BUNDLED_RUNTIME", resource.join("runtime").to_string_lossy().to_string())
                } else { command };
                let (mut events, child) = match command.spawn() {
                    Ok(value) => value,
                    Err(_) => { *error_ref.lock().unwrap() = Some("Không khởi động được lõi PVTA.".into()); return; }
                };
                *child_ref.lock().unwrap() = Some(child);
                let mut buffer = Vec::<u8>::new();
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            buffer.extend(bytes);
                            // Shell's line mode may omit the delimiter. Each IPC record is JSON.
                            if let Ok(record) = serde_json::from_slice::<Value>(&buffer) {
                                deliver(&handle, &pending, record); buffer.clear();
                            } else {
                                while let Some(pos) = buffer.iter().position(|b| *b == b'\n') {
                                    let line:Vec<u8> = buffer.drain(..=pos).collect();
                                    if let Ok(record) = serde_json::from_slice::<Value>(&line) { deliver(&handle, &pending, record); }
                                }
                            }
                            if buffer.len()>32_000_000 { buffer.clear(); }
                        },
                        CommandEvent::Terminated(_) | CommandEvent::Error(_) => {
                            *error_ref.lock().unwrap() = Some("Lõi PVTA đã dừng. Đóng rồi mở lại ứng dụng.".into());
                            for (_,waiting) in pending.lock().unwrap().drain() { let _=waiting.sender.send(Err("Lõi PVTA đã dừng".into())); }
                            break;
                        },
                        // Never forward provider stderr: it may contain private data.
                        _ => {}
                    }
                }
            });
            Ok(())
        }).build(tauri::generate_context!()).expect("Không tạo được cửa sổ PVTA");
    app.run(|handle,event| {if matches!(event,tauri::RunEvent::Exit) {handle.state::<terminal::TerminalState>().close();let state=handle.state::<CoreState>();if let Some(child)=state.child.lock().unwrap().take(){let _=child.kill();};}});
}
fn deliver(handle:&tauri::AppHandle,pending:&Pending,record:Value){
    if record.get("event").is_some() {
        // Event tied to a request goes to the window that made it; shared events go to all windows.
        let owner = record.get("id").and_then(Value::as_str).filter(|s| !s.is_empty())
            .and_then(|id| pending.lock().unwrap().get(id).map(|w| w.window.clone()));
        match owner {
            Some(label) => { let _=handle.emit_to(label.as_str(),"pvta:event",record); },
            None if record.get("id").and_then(Value::as_str).unwrap_or("").is_empty() => { let _=handle.emit("pvta:event",record); },
            None => {}, // A completed request must not leak events into another window.
        }
        return;
    }
    if let Some(id)=record.get("id").and_then(Value::as_str) {
        if let Some(waiting)=pending.lock().unwrap().remove(id) {
            let response=if let Some(error)=record.get("error").and_then(Value::as_str){Err(error.to_owned())}else{Ok(record.get("result").cloned().unwrap_or(Value::Null))};
            let _=waiting.sender.send(response);
        }
    }
}
