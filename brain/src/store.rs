//! Chỉ mục bền, tăng dần. Mỗi lần gọi chỉ stat các tệp; tệp nào đổi (mtime/kích thước) mới đọc lại,
//! phân tích song song. Lưu bằng định dạng dòng gọn (nhanh hơn JSON), ghi tệp tạm rồi rename.
//! Vị trí: `PVTA_BRAIN_INDEX` (PVTA đặt trong thư mục dữ liệu của ứng dụng) hoặc thư mục cache của hệ điều hành.
//! Không bao giờ ghi vào dự án.

use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    env, fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

use crate::{
    lang::{self, Sym},
    scope::{self, Scope},
    text, Result,
};

/// Tăng khi đổi cách trích xuất: chỉ mục cũ sẽ được lập lại.
const FORMAT: &str = "3";
const MAX_TERMS: usize = 4000;

pub struct FileRec {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    pub lang: String,
    pub lines: u32,
    pub syms: Vec<Sym>,
    pub imports: Vec<String>,
    /// (token đã gấp, số lần) — sắp theo token để tìm nhị phân.
    pub terms: Vec<(String, u32)>,
    pub len: u32,
}

impl FileRec {
    pub fn tf(&self, t: &str) -> u32 {
        self.terms.binary_search_by(|x| x.0.as_str().cmp(t)).map(|i| self.terms[i].1).unwrap_or(0)
    }
    /// Tổng tần suất các token bắt đầu bằng `t` (khác `t`), tối đa 32 token.
    pub fn prefix_tf(&self, t: &str) -> u32 {
        let i = self.terms.partition_point(|x| x.0.as_str() < t);
        self.terms[i..].iter().take_while(|x| x.0.starts_with(t)).filter(|x| x.0 != t).take(32).map(|x| x.1).sum()
    }
}

pub struct Index {
    pub files: Vec<FileRec>,
    pub truncated: bool,
}

pub struct Stats {
    pub changed: usize,
    pub removed: usize,
    pub ms: u128,
}

fn hex(s: &[u8]) -> String {
    format!("{:x}", Sha256::digest(s))
}

fn scope_key(scope: &Scope) -> String {
    let mut k = scope.root.to_string_lossy().to_string();
    if let Some(o) = &scope.only {
        k.push('\0');
        k.push_str(&o.join("\n"));
    }
    k
}

pub fn cache_path(scope: &Scope) -> PathBuf {
    if let Some(p) = env::var_os("PVTA_BRAIN_INDEX") {
        return PathBuf::from(p);
    }
    let base = if cfg!(target_os = "macos") {
        env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Caches"))
    } else if cfg!(windows) {
        env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        env::var_os("XDG_CACHE_HOME").map(PathBuf::from).or_else(|| env::var_os("HOME").map(|h| PathBuf::from(h).join(".cache")))
    }
    .unwrap_or_else(env::temp_dir);
    base.join("pvta-brain").join(format!("{}.idx", &hex(scope_key(scope).as_bytes())[..24]))
}

fn clean(s: &str) -> String {
    s.replace(['\t', '\n', '\r'], " ")
}

/// Dấu vân tay bộ trích xuất: mã nguồn `lang.rs` + `text.rs` nhúng lúc biên dịch.
/// Sửa bộ phân tích là chỉ mục cũ tự bị lập lại, không phụ thuộc việc nhớ tăng FORMAT.
fn extractor_stamp() -> &'static str {
    static S: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    S.get_or_init(|| hex(concat!(include_str!("lang.rs"), include_str!("text.rs")).as_bytes())[..12].to_string())
}

fn header(scope: &Scope) -> String {
    format!("PVTA-BRAIN\t{FORMAT}.{}\t{}", extractor_stamp(), clean(&scope_key(scope).replace('\0', "\u{1f}").replace('\n', "\u{1e}")))
}

fn load(path: &PathBuf, scope: &Scope) -> HashMap<String, FileRec> {
    let mut out = HashMap::new();
    let Ok(raw) = fs::read_to_string(path) else { return out };
    let mut lines = raw.split('\n');
    if lines.next() != Some(header(scope).as_str()) {
        return out;
    }
    let mut cur: Option<FileRec> = None;
    for l in lines {
        let mut f = l.split('\t');
        match f.next() {
            Some("F") => {
                if let Some(r) = cur.take() {
                    out.insert(r.path.clone(), r);
                }
                let v: Vec<&str> = f.collect();
                if v.len() < 5 {
                    return HashMap::new();
                }
                cur = Some(FileRec {
                    path: v[0].into(),
                    mtime: v[1].parse().unwrap_or(0),
                    size: v[2].parse().unwrap_or(0),
                    lang: v[3].into(),
                    lines: v[4].parse().unwrap_or(0),
                    syms: Vec::new(),
                    imports: Vec::new(),
                    terms: Vec::new(),
                    len: 0,
                });
            }
            Some("S") => {
                let v: Vec<&str> = f.collect();
                if let (Some(r), true) = (cur.as_mut(), v.len() >= 7) {
                    r.syms.push(Sym {
                        name: v[0].into(),
                        kind: v[1].into(),
                        line: v[2].parse().unwrap_or(1),
                        end: v[3].parse().unwrap_or(1),
                        exported: v[4] == "1",
                        scope: v[5].into(),
                        sig: v[6].into(),
                    });
                }
            }
            Some("I") => {
                if let (Some(r), Some(s)) = (cur.as_mut(), f.next()) {
                    r.imports.push(s.into());
                }
            }
            Some("T") => {
                if let (Some(r), Some(s)) = (cur.as_mut(), f.next()) {
                    let mut it = s.split(' ');
                    while let (Some(t), Some(n)) = (it.next(), it.next()) {
                        let n: u32 = n.parse().unwrap_or(1);
                        r.len += n;
                        r.terms.push((t.into(), n));
                    }
                }
            }
            _ => {}
        }
    }
    if let Some(r) = cur.take() {
        out.insert(r.path.clone(), r);
    }
    out
}

fn save(path: &PathBuf, scope: &Scope, files: &[FileRec]) -> Result<()> {
    let dir = path.parent().ok_or("Bad index path")?;
    fs::create_dir_all(dir)?;
    let mut s = String::with_capacity(files.len() * 2048);
    s.push_str(&header(scope));
    s.push('\n');
    for r in files {
        s.push_str(&format!("F\t{}\t{}\t{}\t{}\t{}\n", r.path, r.mtime, r.size, r.lang, r.lines));
        for y in &r.syms {
            s.push_str(&format!(
                "S\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
                clean(&y.name),
                y.kind,
                y.line,
                y.end,
                if y.exported { 1 } else { 0 },
                clean(&y.scope),
                clean(&y.sig)
            ));
        }
        for i in &r.imports {
            s.push_str(&format!("I\t{}\n", clean(i)));
        }
        if !r.terms.is_empty() {
            s.push_str("T\t");
            for (k, (t, n)) in r.terms.iter().enumerate() {
                if k > 0 {
                    s.push(' ');
                }
                s.push_str(t);
                s.push(' ');
                s.push_str(&n.to_string());
            }
            s.push('\n');
        }
    }
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    {
        let mut f = fs::File::create(&tmp)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            f.set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        f.write_all(s.as_bytes())?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// Đọc và phân tích một tệp. Nhị phân/rút gọn: giữ bản ghi rỗng để không đọc lại khi chưa đổi.
pub fn analyze(scope: &Scope, e: &scope::Entry) -> FileRec {
    let lang = lang::lang_of(&e.path).unwrap_or("text");
    let mut rec = FileRec {
        path: e.path.clone(),
        mtime: e.mtime,
        size: e.size,
        lang: lang.into(),
        lines: 0,
        syms: Vec::new(),
        imports: Vec::new(),
        terms: Vec::new(),
        len: 0,
    };
    let Ok(bytes) = fs::read(scope.root.join(&e.path)) else { return rec };
    if bytes.len() as u64 > scope::MAX_FILE || bytes[..bytes.len().min(8192)].contains(&0) {
        rec.lang = "binary".into();
        return rec;
    }
    let text = String::from_utf8_lossy(&bytes);
    let n_lines = text.lines().count().max(1);
    if bytes.len() > 20_000 && bytes.len() / n_lines > 400 {
        rec.lang = "minified".into();
        rec.lines = n_lines as u32;
        return rec;
    }
    let p = lang::parse(lang, &text);
    rec.lines = p.lines;
    rec.syms = p.syms;
    rec.imports = p.imports;
    let mut tf: HashMap<String, u32> = HashMap::new();
    text::content_tokens(&text, |t| *tf.entry(t).or_insert(0) += 1);
    let mut terms: Vec<(String, u32)> = tf.into_iter().collect();
    if terms.len() > MAX_TERMS {
        terms.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        terms.truncate(MAX_TERMS);
    }
    terms.sort_by(|a, b| a.0.cmp(&b.0));
    rec.len = terms.iter().map(|x| x.1).sum();
    rec.terms = terms;
    rec
}

/// Cập nhật chỉ mục tăng dần và trả về bản trong bộ nhớ.
pub fn update(scope: &Scope, rebuild: bool) -> Result<(Index, Stats)> {
    let t0 = Instant::now();
    let path = cache_path(scope);
    let mut old = if rebuild { HashMap::new() } else { load(&path, scope) };
    let (entries, truncated) = scope::list(scope)?;
    let mut slots: Vec<Option<FileRec>> = Vec::with_capacity(entries.len());
    let mut todo = Vec::new();
    for (i, e) in entries.iter().enumerate() {
        match old.remove(&e.path) {
            Some(r) if r.mtime == e.mtime && r.size == e.size => slots.push(Some(r)),
            _ => {
                slots.push(None);
                todo.push(i);
            }
        }
    }
    let removed = old.len();
    let changed = todo.len();
    if !todo.is_empty() {
        let next = AtomicUsize::new(0);
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 8).min(todo.len());
        let done: Vec<(usize, FileRec)> = std::thread::scope(|s| {
            let hs: Vec<_> = (0..threads)
                .map(|_| {
                    s.spawn(|| {
                        let mut out = Vec::new();
                        loop {
                            let k = next.fetch_add(1, Ordering::Relaxed);
                            let Some(&i) = todo.get(k) else { break };
                            out.push((i, analyze(scope, &entries[i])));
                        }
                        out
                    })
                })
                .collect();
            hs.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
        });
        for (i, r) in done {
            slots[i] = Some(r);
        }
    }
    let files: Vec<FileRec> = slots.into_iter().flatten().collect();
    if changed > 0 || removed > 0 || !path.exists() {
        save(&path, scope, &files)?;
    }
    Ok((Index { files, truncated }, Stats { changed, removed, ms: t0.elapsed().as_millis() }))
}

/// Đồ thị import: với mỗi tệp, chỉ số các tệp trong dự án mà nó import.
pub fn deps(ix: &Index) -> Vec<Vec<usize>> {
    let by: HashMap<&str, usize> = ix.files.iter().enumerate().map(|(i, f)| (f.path.as_str(), i)).collect();
    ix.files
        .iter()
        .map(|f| {
            let mut out: Vec<usize> = Vec::new();
            for spec in &f.imports {
                if let Some(t) = resolve(&f.path, &f.lang, spec, &by) {
                    if t != by[f.path.as_str()] && !out.contains(&t) {
                        out.push(t);
                    }
                }
            }
            out
        })
        .collect()
}

fn join_norm(dir: &str, rel: &str) -> Option<String> {
    let mut parts: Vec<&str> = if dir.is_empty() { Vec::new() } else { dir.split('/').collect() };
    for p in rel.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            x => parts.push(x),
        }
    }
    Some(parts.join("/"))
}

fn resolve(from: &str, lang: &str, spec: &str, by: &HashMap<&str, usize>) -> Option<usize> {
    let dir = from.rsplit_once('/').map(|x| x.0).unwrap_or("");
    let hit = |p: &str| by.get(p).copied();
    match lang {
        "rust" => {
            let name = spec.strip_prefix("mod:")?;
            let file = from.rsplit('/').next().unwrap_or(from);
            let base = if matches!(file, "main.rs" | "lib.rs" | "mod.rs") {
                dir.to_string()
            } else {
                join_norm(dir, file.trim_end_matches(".rs"))?
            };
            let pre = if base.is_empty() { String::new() } else { format!("{base}/") };
            hit(&format!("{pre}{name}.rs")).or_else(|| hit(&format!("{pre}{name}/mod.rs")))
        }
        "python" => {
            let dots = spec.chars().take_while(|c| *c == '.').count();
            let module = spec[dots..].replace('.', "/");
            let bases: Vec<String> = if dots > 0 {
                let mut d = dir.to_string();
                for _ in 1..dots {
                    d = d.rsplit_once('/').map(|x| x.0.to_string()).unwrap_or_default();
                }
                vec![d]
            } else {
                vec![String::new(), dir.to_string()]
            };
            for b in bases {
                let m = join_norm(&b, &module)?;
                if let Some(i) = hit(&format!("{m}.py")).or_else(|| hit(&format!("{m}/__init__.py"))) {
                    return Some(i);
                }
            }
            None
        }
        _ => {
            if !spec.starts_with('.') && !matches!(lang, "c" | "cpp" | "typst" | "php" | "css") {
                return None;
            }
            let mut bases = vec![dir.to_string()];
            if !spec.starts_with('.') {
                bases.push(String::new());
            }
            for b in bases {
                let p = join_norm(&b, spec)?;
                if let Some(i) = hit(&p) {
                    return Some(i);
                }
                // ESM TypeScript viết import "./x.js" cho tệp x.ts
                for (js, alts) in [(".js", &[".ts", ".tsx"][..]), (".jsx", &[".tsx"][..]), (".mjs", &[".mts"][..]), (".cjs", &[".cts"][..])] {
                    if let Some(stem) = p.strip_suffix(js) {
                        for a in alts {
                            if let Some(i) = hit(&format!("{stem}{a}")) {
                                return Some(i);
                            }
                        }
                    }
                }
                for ext in [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts", ".vue", ".svelte", ".css", ".scss", ".h", ".typ", ".php"] {
                    if let Some(i) = hit(&format!("{p}{ext}")) {
                        return Some(i);
                    }
                }
                for idx in ["index.ts", "index.tsx", "index.js", "index.jsx"] {
                    if let Some(i) = hit(&format!("{p}/{idx}")) {
                        return Some(i);
                    }
                }
            }
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_esm_and_rust_modules() {
        let files = ["core/src/desktop/runtime.ts", "core/src/desktop/brain.ts", "src/main.rs", "src/text.rs", "pkg/__init__.py", "pkg/a.py"];
        let by: HashMap<&str, usize> = files.iter().enumerate().map(|(i, f)| (*f, i)).collect();
        assert_eq!(resolve("core/src/desktop/runtime.ts", "ts", "./brain.js", &by), Some(1));
        assert_eq!(resolve("core/src/desktop/runtime.ts", "ts", "../../x.js", &by), None);
        assert_eq!(resolve("core/src/desktop/runtime.ts", "ts", "react", &by), None);
        assert_eq!(resolve("src/main.rs", "rust", "mod:text", &by), Some(3));
        assert_eq!(resolve("pkg/a.py", "python", ".", &by), Some(4));
        assert_eq!(resolve("x.py", "python", "pkg.a", &by), Some(5));
    }
}
