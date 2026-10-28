use crate::command_session::{CommandSession, Output};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalEvent {
    Data { bytes: Vec<u8>, stream: &'static str },
    Exit { code: Option<i32> },
}

struct Session { id: String, process: Arc<CommandSession> }
#[derive(Default)]
pub struct TerminalState(Mutex<Option<Session>>);
impl TerminalState {
    pub fn close(&self) {
        let session = self.0.lock().ok().and_then(|mut slot| slot.take());
        if let Some(session) = session { session.process.stop(); }
    }
}

// Complete UTF-8 text over a pipe, without a PTY or per-keystroke translation.
#[tauri::command]
pub fn terminal_open(id: String, cwd: Option<String>, output: Channel<TerminalEvent>, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if slot.is_some() { return Err("Hãy đóng phiên terminal trước khi mở phiên mới.".into()); }
    let process = CommandSession::spawn(cwd.as_deref(), move |event| {
        let event = match event {
            Output::Data(bytes, stream) => TerminalEvent::Data { bytes, stream },
            Output::Exit(code) => TerminalEvent::Exit { code },
        };
        let _ = output.send(event);
    })?;
    *slot = Some(Session { id, process: Arc::new(process) });
    Ok(())
}

#[tauri::command]
pub fn terminal_write(id: String, data: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    if data.len() > 1_000_000 { return Err("Dữ liệu nhập quá dài.".into()); }
    let process = {
        let slot = state.0.lock().map_err(|e| e.to_string())?;
        slot.as_ref().filter(|s| s.id == id).ok_or("Phiên terminal đã đóng.")?.process.clone()
    };
    // Do not hold the session registry while a child is slow to consume stdin:
    // close must still be able to terminate it and unblock a large write.
    process.write(&data)
}

#[tauri::command]
pub fn terminal_close(id: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    let session = if slot.as_ref().is_some_and(|s| s.id == id) { slot.take() } else { None };
    drop(slot);
    if let Some(session) = session { session.process.stop(); }
    Ok(())
}
