use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{io::{Read, Write}, sync::Mutex};
use tauri::ipc::Channel;

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalEvent { Data { bytes: Vec<u8> }, Exit }

struct Session {
    id: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}
impl Drop for Session {
    fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); }
}
#[derive(Default)]
pub struct TerminalState(Mutex<Option<Session>>);
impl TerminalState {
    pub fn close(&self) { if let Ok(mut slot) = self.0.lock() { slot.take(); } }
}
fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { cols: cols.clamp(2, 500), rows: rows.clamp(2, 200), pixel_width: 0, pixel_height: 0 }
}

#[tauri::command]
pub fn terminal_open(id: String, cwd: Option<String>, cols: u16, rows: u16, output: Channel<TerminalEvent>, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if slot.is_some() { return Err("Hãy đóng phiên terminal trước khi mở phiên mới.".into()); }
    let (session, mut reader) = spawn_session(id, cwd, cols, rows)?;
    *slot = Some(session);
    std::thread::spawn(move || {
        let mut bytes = [0u8; 8192];
        loop {
            match reader.read(&mut bytes) {
                Ok(0) => break,
                Ok(n) => if output.send(TerminalEvent::Data { bytes: bytes[..n].to_vec() }).is_err() { break; },
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        let _ = output.send(TerminalEvent::Exit);
    });
    Ok(())
}

fn spawn_session(id: String, cwd: Option<String>, cols: u16, rows: u16) -> Result<(Session, Box<dyn Read + Send>), String> {
    let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| e.to_string())?;
    let shell = if cfg!(windows) { "powershell.exe".to_owned() } else {
        std::env::var("SHELL").unwrap_or_else(|_| if cfg!(target_os = "macos") { "/bin/zsh" } else { "/bin/bash" }.into())
    };
    let mut cmd = CommandBuilder::new(shell);
    if cfg!(windows) { cmd.arg("-NoLogo"); } else { cmd.arg("-l"); }
    cmd.env("TERM", "xterm-256color");
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        if !std::path::Path::new(&dir).is_dir() { return Err("Thư mục terminal không tồn tại.".into()); }
        cmd.cwd(dir);
    } else if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) { cmd.cwd(home); }
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    Ok((Session { id, master: pair.master, writer, child }, reader))
}

#[tauri::command]
pub fn terminal_write(id: String, data: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    if data.len() > 1_000_000 { return Err("Dữ liệu nhập quá dài.".into()); }
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    let session = slot.as_mut().filter(|s| s.id == id).ok_or("Phiên terminal đã đóng.")?;
    session.writer.write_all(data.as_bytes()).and_then(|_| session.writer.flush()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(id: String, cols: u16, rows: u16, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    let session = slot.as_ref().filter(|s| s.id == id).ok_or("Phiên terminal đã đóng.")?;
    session.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_close(id: String, state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if slot.as_ref().is_some_and(|s| s.id == id) { slot.take(); }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::{Duration, Instant}};

    #[test]
    fn interactive_shell_directory_resize_interrupt_and_exit() {
        let cwd = std::env::temp_dir().join(format!("pvta terminal tiếng Việt {}", std::process::id()));
        std::fs::create_dir_all(&cwd).unwrap();
        let (mut session, mut reader) = spawn_session("test".into(), Some(cwd.to_string_lossy().into()), 80, 24).unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut buf = [0; 4096];
            while let Ok(n) = reader.read(&mut buf) { if n == 0 { break; } if tx.send(buf[..n].to_vec()).is_err() { break; } }
        });
        let mut output = String::new();
        let wait_for = |needle: &str, output: &mut String| {
            let deadline = Instant::now() + Duration::from_secs(10);
            while !output.contains(needle) {
                let bytes = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())).unwrap_or_else(|_| panic!("terminal timeout waiting for {needle:?}: {output:?}"));
                output.push_str(&String::from_utf8_lossy(&bytes));
            }
        };
        session.writer.write_all(b"printf 'PVTA''_READY\\n'; pwd\r").unwrap();
        wait_for("PVTA_READY", &mut output);
        wait_for(&format!("pvta terminal tiếng Việt {}", std::process::id()), &mut output);
        session.master.resize(size(100, 35)).unwrap();
        session.writer.write_all(b"stty size\r").unwrap();
        wait_for("35 100", &mut output);
        session.writer.write_all(b"printf 'PVTA''_SLEEP\\n'; sleep 30\r").unwrap();
        wait_for("PVTA_SLEEP", &mut output);
        // Allow the foreground sleep to acquire the tty before simulating Ctrl+C.
        std::thread::sleep(Duration::from_millis(250));
        session.writer.write_all(b"\x03").unwrap();
        std::thread::sleep(Duration::from_millis(250));
        session.writer.write_all(b"printf 'PVTA''_INTERRUPTED\\n'\r").unwrap();
        wait_for("PVTA_INTERRUPTED", &mut output);
        session.writer.write_all(b"exit\r").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while session.child.try_wait().unwrap().is_none() {
            assert!(Instant::now() < deadline, "shell did not exit");
            std::thread::sleep(Duration::from_millis(10));
        }
        drop(session);
        std::fs::remove_dir(cwd).unwrap();
    }

    #[test]
    fn rejects_missing_working_directory() {
        assert!(spawn_session("test".into(), Some("/pvta-missing-directory-test".into()), 80, 24).is_err());
    }
}
