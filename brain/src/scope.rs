//! Phạm vi Brain: cả dự án (duyệt thư mục, tôn trọng .gitignore) hoặc chỉ các tệp được chỉ định
//! (`PVTA_BRAIN_ONLY` / `--file`). Ở chế độ tệp, Brain không duyệt, không đọc tệp lân cận.

use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::Result;

pub const MAX_FILE: u64 = 1024 * 1024;
pub const MAX_FILES: usize = 30_000;

pub struct Scope {
    pub root: PathBuf,
    /// Some = chế độ tệp: chỉ các đường dẫn tương đối này (dấu `/`).
    pub only: Option<Vec<String>>,
}

pub struct Entry {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
}

impl Scope {
    pub fn kind(&self) -> &'static str {
        if self.only.is_some() {
            "files"
        } else {
            "project"
        }
    }
    pub fn allows(&self, rel: &str) -> bool {
        self.only.as_ref().map_or(true, |o| o.iter().any(|x| x == rel))
    }
}

/// Chuẩn hóa đường dẫn tương đối người dùng nhập; từ chối tuyệt đối, `..`, symlink.
pub fn normalize(p: &str) -> Result<String> {
    let rel = Path::new(p);
    if p.is_empty() || rel.is_absolute() {
        return Err("Use a relative path within project".into());
    }
    let mut parts = Vec::new();
    for c in rel.components() {
        match c {
            Component::Normal(x) => parts.push(x.to_str().ok_or("Path must be UTF-8")?.to_string()),
            Component::CurDir => {}
            _ => return Err("Use a relative path within project".into()),
        }
    }
    if parts.is_empty() {
        return Err("Use a relative path within project".into());
    }
    Ok(parts.join("/"))
}

/// Đường dẫn tuyệt đối an toàn cho một tệp trong phạm vi.
pub fn target(scope: &Scope, p: &str) -> Result<(String, PathBuf)> {
    let rel = normalize(p)?;
    if !scope.allows(&rel) {
        return Err("File is outside the Brain scope of this session".into());
    }
    let mut path = scope.root.clone();
    for part in rel.split('/') {
        path.push(part);
        if fs::symlink_metadata(&path)?.file_type().is_symlink() {
            return Err("Symlinks are not supported".into());
        }
    }
    if !path.is_file() {
        return Err("Not a regular file".into());
    }
    Ok((rel, path))
}

fn stamp(m: &fs::Metadata) -> u64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_nanos() as u64).unwrap_or(0)
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", "dist", "build", "out", "coverage", "__pycache__", "venv", "site-packages",
    "bower_components", "Pods", "DerivedData",
];

/// Một luật gitignore đã biên dịch.
struct Rule {
    base: String,
    glob: Vec<u8>,
    neg: bool,
    dir_only: bool,
}

fn parse_ignore(base: &str, text: &str) -> Vec<Rule> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let mut l = raw.trim_end();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        let neg = l.starts_with('!');
        if neg {
            l = &l[1..];
        }
        let dir_only = l.ends_with('/');
        let l = l.trim_end_matches('/');
        if l.is_empty() {
            continue;
        }
        // có `/` ở đầu hoặc giữa = neo theo thư mục chứa .gitignore; không có = khớp ở mọi cấp
        let anchored = l.trim_start_matches('/').contains('/') || l.starts_with('/');
        let body = l.trim_start_matches('/');
        let glob = if anchored { body.to_string() } else { format!("**/{body}") };
        out.push(Rule { base: base.to_string(), glob: glob.into_bytes(), neg, dir_only });
    }
    out
}

/// Glob kiểu gitignore: `*` không qua `/`, `**` qua mọi cấp, `?`, `[...]`.
fn glob(p: &[u8], s: &[u8]) -> bool {
    if p.is_empty() {
        return s.is_empty();
    }
    if p.starts_with(b"**") {
        let rest = p[2..].strip_prefix(b"/").unwrap_or(&p[2..]);
        if glob(rest, s) {
            return true;
        }
        return (0..s.len()).any(|i| s[i] == b'/' && glob(rest, &s[i + 1..]))
            || (rest.is_empty() && !s.is_empty());
    }
    match p[0] {
        b'*' => (0..=s.len()).take_while(|&i| i == 0 || s[i - 1] != b'/').any(|i| glob(&p[1..], &s[i..])),
        b'?' => !s.is_empty() && s[0] != b'/' && glob(&p[1..], &s[1..]),
        b'[' => {
            let Some(close) = p.iter().skip(1).position(|&c| c == b']').map(|x| x + 1) else {
                return !s.is_empty() && s[0] == b'[' && glob(&p[1..], &s[1..]);
            };
            if s.is_empty() || s[0] == b'/' {
                return false;
            }
            let (neg, set) = match p[1] {
                b'!' | b'^' => (true, &p[2..close]),
                _ => (false, &p[1..close]),
            };
            let mut hit = false;
            let mut k = 0;
            while k < set.len() {
                if k + 2 < set.len() && set[k + 1] == b'-' {
                    hit |= set[k] <= s[0] && s[0] <= set[k + 2];
                    k += 3;
                } else {
                    hit |= set[k] == s[0];
                    k += 1;
                }
            }
            hit != neg && glob(&p[close + 1..], &s[1..])
        }
        b'\\' if p.len() > 1 => !s.is_empty() && s[0] == p[1] && glob(&p[2..], &s[1..]),
        c => !s.is_empty() && s[0] == c && glob(&p[1..], &s[1..]),
    }
}

fn ignored(rules: &[Rule], rel: &str, is_dir: bool) -> bool {
    let mut out = false;
    for r in rules {
        if r.dir_only && !is_dir {
            continue;
        }
        let sub = if r.base.is_empty() {
            rel
        } else if let Some(x) = rel.strip_prefix(&r.base).and_then(|x| x.strip_prefix('/')) {
            x
        } else {
            continue;
        };
        if glob(&r.glob, sub.as_bytes()) {
            out = !r.neg;
        }
    }
    out
}

/// Liệt kê tệp nguồn trong phạm vi. Trả (danh sách, bị cắt do vượt giới hạn).
pub fn list(scope: &Scope) -> Result<(Vec<Entry>, bool)> {
    let mut out = Vec::new();
    if let Some(only) = &scope.only {
        for rel in only {
            let (_, abs) = target(scope, rel)?;
            let m = fs::metadata(&abs)?;
            out.push(Entry { path: rel.clone(), mtime: stamp(&m), size: m.len() });
        }
        return Ok((out, false));
    }
    let mut rules: Vec<Rule> = Vec::new();
    let mut stack: Vec<String> = vec![String::new()];
    let mut truncated = false;
    while let Some(dir) = stack.pop() {
        let abs = if dir.is_empty() { scope.root.clone() } else { scope.root.join(&dir) };
        if let Ok(text) = fs::read_to_string(abs.join(".gitignore")) {
            rules.extend(parse_ignore(&dir, &text));
        }
        let Ok(rd) = fs::read_dir(&abs) else { continue };
        let mut names: Vec<(String, fs::FileType)> = rd
            .filter_map(|e| e.ok())
            .filter_map(|e| Some((e.file_name().into_string().ok()?, e.file_type().ok()?)))
            .collect();
        names.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, ft) in names {
            if name.starts_with('.') || name.contains(['\t', '\n', '\r']) || ft.is_symlink() {
                continue;
            }
            let rel = if dir.is_empty() { name.clone() } else { format!("{dir}/{name}") };
            if ft.is_dir() {
                if SKIP_DIRS.contains(&name.as_str())
                    || ignored(&rules, &rel, true)
                    || abs.join(&name).join("pyvenv.cfg").exists()
                {
                    continue;
                }
                stack.push(rel);
            } else if ft.is_file() {
                if crate::lang::lang_of(&rel).is_none() || ignored(&rules, &rel, false) {
                    continue;
                }
                let Ok(m) = fs::metadata(abs.join(&name)) else { continue };
                if m.len() > MAX_FILE {
                    continue;
                }
                if out.len() >= MAX_FILES {
                    truncated = true;
                    break;
                }
                out.push(Entry { path: rel, mtime: stamp(&m), size: m.len() });
            }
        }
        if truncated {
            break;
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok((out, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gitignore_globs() {
        let r = parse_ignore("", "node_modules/\n**/target/\nchatbox/src-tauri/runtime/\n*.pem\n!keep.pem\n/top.txt\n");
        assert!(ignored(&r, "chatbox/src-tauri/runtime", true));
        assert!(!ignored(&r, "chatbox/src-tauri/runtime", false));
        assert!(ignored(&r, "a/b/target", true));
        assert!(ignored(&r, "x/key.pem", false));
        assert!(!ignored(&r, "x/keep.pem", false));
        assert!(ignored(&r, "top.txt", false));
        assert!(!ignored(&r, "a/top.txt", false));
        let r = parse_ignore("sub", "gen/\n*.log\n");
        assert!(ignored(&r, "sub/gen", true));
        assert!(ignored(&r, "sub/x/y.log", false));
        assert!(!ignored(&r, "other/y.log", false));
        assert!(glob(b"a[0-9].ts", b"a5.ts") && !glob(b"a[!0-9].ts", b"a5.ts"));
    }
    #[test]
    fn rejects_escape() {
        assert!(normalize("../x").is_err());
        assert!(normalize("/etc/passwd").is_err());
        assert_eq!(normalize("./a/b.ts").unwrap(), "a/b.ts");
    }
}
