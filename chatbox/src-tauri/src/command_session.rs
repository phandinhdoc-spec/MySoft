use std::{
    io::{Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    time::Duration,
};

pub enum Output { Data(Vec<u8>, &'static str), Exit(Option<i32>) }

pub struct CommandSession {
    child: Arc<Mutex<Child>>,
    stdin: Mutex<ChildStdin>,
    stopped: Arc<AtomicBool>,
}

fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    // Each shell owns a process group; closing the panel also stops its jobs.
    unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL); }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill.exe").args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x08000000).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

impl CommandSession {
    pub fn spawn(cwd: Option<&str>, output: impl Fn(Output) + Send + Sync + 'static) -> Result<Self, String> {
        let shell = if cfg!(windows) { "powershell.exe".into() } else {
            std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into())
        };
        let mut command = Command::new(shell);
        if cfg!(windows) {
            command.args(["-NoLogo", "-NoProfile", "-Command", "-"]);
        } else { command.arg("-l"); }
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        command.env("TERM", "dumb").env("NO_COLOR", "1");
        if !cfg!(windows) {
            let locale = if cfg!(target_os = "macos") { "en_US.UTF-8" } else { "C.UTF-8" };
            command.env("LANG", locale).env("LC_ALL", locale);
        }
        let directory = cwd.filter(|d| !d.is_empty()).map(String::from)
            .or_else(|| std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).ok());
        if let Some(directory) = directory {
            if !std::path::Path::new(&directory).is_dir() { return Err("Thư mục terminal không tồn tại.".into()); }
            command.current_dir(directory);
        }
        #[cfg(unix)]
        { use std::os::unix::process::CommandExt; command.process_group(0); }
        #[cfg(windows)]
        { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let stdin = child.stdin.take().ok_or("Không mở được đầu vào shell")?;
        let stdout = child.stdout.take().ok_or("Không mở được đầu ra shell")?;
        let stderr = child.stderr.take().ok_or("Không mở được kênh lỗi shell")?;
        let child = Arc::new(Mutex::new(child));
        let stopped = Arc::new(AtomicBool::new(false));
        let output = Arc::new(output);
        let read = |mut reader: Box<dyn Read + Send>, stream: &'static str| {
            let output = output.clone();
            std::thread::spawn(move || {
                let mut buffer = [0; 8192];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(n) => output(Output::Data(buffer[..n].to_vec(), stream)),
                        Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(_) => break,
                    }
                }
            })
        };
        let out = read(Box::new(stdout), "stdout");
        let err = read(Box::new(stderr), "stderr");
        let watched = child.clone();
        let done = stopped.clone();
        std::thread::spawn(move || {
            let code = loop {
                if done.load(Ordering::Acquire) { return; }
                let mut child = match watched.lock() { Ok(child) => child, Err(_) => return };
                match child.try_wait() {
                    Ok(Some(status)) => {
                        // Release pipes held by background jobs before joining readers.
                        if !done.swap(true, Ordering::AcqRel) { kill_tree(&mut child); }
                        break status.code();
                    }
                    Err(_) => {
                        if !done.swap(true, Ordering::AcqRel) { kill_tree(&mut child); }
                        break None;
                    }
                    Ok(None) => {}
                }
                drop(child);
                std::thread::sleep(Duration::from_millis(20));
            };
            let _ = out.join();
            let _ = err.join();
            output(Output::Exit(code));
        });
        let session = Self { child, stdin: Mutex::new(stdin), stopped };
        if cfg!(windows) {
            session.write("[Console]::InputEncoding=[Console]::OutputEncoding=$OutputEncoding=[System.Text.UTF8Encoding]::new($false)\n")?;
        }
        Ok(session)
    }

    pub fn write(&self, text: &str) -> Result<(), String> {
        if self.stopped.load(Ordering::Acquire) { return Err("Phiên terminal đã kết thúc.".into()); }
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        stdin.write_all(text.as_bytes()).and_then(|_| stdin.flush()).map_err(|e| e.to_string())
    }

    pub fn stop(&self) {
        if !self.stopped.swap(true, Ordering::AcqRel) {
            if let Ok(mut child) = self.child.lock() { kill_tree(&mut child); }
        }
    }
}

impl Drop for CommandSession {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{sync::mpsc, time::Instant};

    fn receive_until(rx: &mpsc::Receiver<Output>, needle: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut bytes = Vec::new();
        loop {
            match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())).expect("shell output timeout") {
                Output::Data(data, _) => bytes.extend(data),
                Output::Exit(code) => panic!("shell exited early: {code:?}"),
            }
            let text = String::from_utf8_lossy(&bytes);
            if text.contains(needle) { return text.into_owned(); }
        }
    }

    #[test]
    fn sends_exact_unicode_and_multiline_text_without_a_tty() {
        let (tx, rx) = mpsc::channel();
        let session = CommandSession::spawn(None, move |event| { let _ = tx.send(event); }).unwrap();
        session.write("if test -t 0; then echo HAS_TTY; else echo PIPE_READY; fi\n").unwrap();
        assert!(receive_until(&rx, "PIPE_READY").contains("PIPE_READY"));
        let text = "  tiếng Việt đẹp — vie\u{0323}\u{0302}t 😀 'quote' \"double\" $literal `literal` ";
        session.write(&format!("cat <<'PVTA_END'\n{text}\ndòng thứ hai\nPVTA_END\nprintf 'DONE\\n'\n")).unwrap();
        let output = receive_until(&rx, "DONE");
        assert!(output.contains(&format!("{text}\ndòng thứ hai\n")), "{output:?}");
    }

    #[test]
    fn retains_directory_variables_and_accepts_stdin_replies() {
        let directory = std::env::temp_dir().join(format!("pvta tiếng Việt {}", std::process::id()));
        std::fs::create_dir_all(directory.join("con")).unwrap();
        let (tx, rx) = mpsc::channel();
        let session = CommandSession::spawn(directory.to_str(), move |event| { let _ = tx.send(event); }).unwrap();
        session.write("cd con\nexport PVTA_TEST='giữ nguyên dấu'\nprintf 'READY\\n'\n").unwrap();
        receive_until(&rx, "READY");
        session.write("pwd\nprintf '%s\\n' \"$PVTA_TEST\"\nprintf 'WAIT_REPLY\\n'; IFS= read -r reply; printf 'REPLY:%s\\n' \"$reply\"\n").unwrap();
        let output = receive_until(&rx, "WAIT_REPLY");
        assert!(output.contains("/con\n"), "{output:?}");
        assert!(output.contains("giữ nguyên dấu"));
        session.write("Trả lời tiếng Việt\n").unwrap();
        assert!(receive_until(&rx, "REPLY:").contains("REPLY:Trả lời tiếng Việt"));
        drop(session);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn streams_stderr_and_reports_exit_after_output() {
        let (tx, rx) = mpsc::channel();
        let session = CommandSession::spawn(None, move |event| { let _ = tx.send(event); }).unwrap();
        session.write("printf 'lỗi tiếng Việt' >&2\nexit 7\n").unwrap();
        let mut stderr = Vec::new();
        loop {
            match rx.recv_timeout(Duration::from_secs(10)).unwrap() {
                Output::Data(bytes, "stderr") => stderr.extend(bytes),
                Output::Data(_, _) => {},
                Output::Exit(code) => { assert_eq!(code, Some(7)); break; }
            }
        }
        assert!(String::from_utf8(stderr).unwrap().contains("lỗi tiếng Việt"));
        assert!(session.write("echo after exit\n").is_err());
    }

    #[test]
    fn closing_stops_a_running_shell_and_missing_directory_is_rejected() {
        assert!(CommandSession::spawn(Some("/pvta-nonexistent-test-directory"), |_| {}).is_err());
        let (tx, rx) = mpsc::channel();
        let session = CommandSession::spawn(None, move |event| { let _ = tx.send(event); }).unwrap();
        session.write("printf 'RUNNING\\n'; sleep 30\n").unwrap();
        receive_until(&rx, "RUNNING");
        let child = session.child.clone();
        let start = Instant::now();
        drop(session);
        assert!(start.elapsed() < Duration::from_secs(3));
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
    }

    #[test]
    fn stop_unblocks_a_large_write_when_the_child_is_not_reading() {
        let (tx, rx) = mpsc::channel();
        let session = Arc::new(CommandSession::spawn(None, move |event| { let _ = tx.send(event); }).unwrap());
        session.write("printf 'BLOCKED\\n'; sleep 30\n").unwrap();
        receive_until(&rx, "BLOCKED");
        let writer = session.clone();
        let (finished, result) = mpsc::channel();
        std::thread::spawn(move || { let _ = finished.send(writer.write(&"x".repeat(1_000_000))); });
        std::thread::sleep(Duration::from_millis(50));
        session.stop();
        assert!(result.recv_timeout(Duration::from_secs(3)).unwrap().is_err());
    }
}
