//! PVTA Brain — CLI native, chạy một lần rồi thoát.
//! Tầng 1: `overview` hiểu toàn dự án. Tầng 2: `outline <tệp>` hiểu toàn một tệp.
//! Tìm: `find` (xếp hạng lai ký hiệu + BM25 nội dung), `refs` (ứng viên tham chiếu), `read` (theo dòng hoặc tên ký hiệu).
//! Phạm vi: thư mục hiện tại (dự án) hoặc chỉ các tệp `--file`/`PVTA_BRAIN_ONLY` (tệp lẻ, không đọc lân cận).

mod lang;
mod scope;
mod search;
mod store;
mod text;
mod view;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use scope::Scope;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
const LIMIT: u64 = 1024 * 1024;

fn fail(s: &str) -> Box<dyn std::error::Error> {
    s.into()
}
fn hash(s: &[u8]) -> String {
    format!("{:x}", Sha256::digest(s))
}
fn read(p: &Path) -> Result<String> {
    let f = fs::File::open(p)?;
    if f.metadata()?.len() > LIMIT {
        return Err(fail("File exceeds 1 MiB safety limit"));
    }
    let mut s = String::new();
    f.take(LIMIT + 1).read_to_string(&mut s)?;
    if s.len() as u64 > LIMIT || s.contains('\0') {
        return Err(fail("Unsupported file"));
    }
    Ok(s)
}
struct Temp(PathBuf);
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn temp(path: &Path) -> Result<(Temp, fs::File)> {
    for n in 0..100 {
        let p = path.with_file_name(format!(".brain-{}-{n}.tmp", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(f) => return Ok((Temp(p), f)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(fail("Cannot create temporary file"))
}
// Deliberately restricted C lexer. Unsupported constructs fail closed.
fn balanced(s: &str) -> Result<()> {
    let b = s.as_bytes();
    let mut i = 0;
    let mut stack = Vec::new();
    while i < b.len() {
        if b[i] == b'\\' || b[i] == b'#' || (b[i] == b'?' && b.get(i + 1) == Some(&b'?')) {
            return Err(fail("Preprocessing/line splicing is not supported by the bracket guard"));
        }
        if b[i] == b'/' && b.get(i + 1) == Some(&b'/') {
            i += 2;
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if b[i] == b'/' && b.get(i + 1) == Some(&b'*') {
            i += 2;
            while i + 1 < b.len() && &b[i..i + 2] != b"*/" {
                i += 1;
            }
            if i + 1 >= b.len() {
                return Err(fail("Unterminated comment"));
            }
            i += 2;
            continue;
        }
        if b[i] == b'"' || b[i] == b'\'' {
            let q = b[i];
            i += 1;
            let mut closed = false;
            while i < b.len() {
                if b[i] == b'\\' {
                    i += 2;
                    continue;
                }
                if b[i] == q {
                    i += 1;
                    closed = true;
                    break;
                }
                if b[i] == b'\n' {
                    return Err(fail("Unterminated string"));
                }
                i += 1;
            }
            if !closed {
                return Err(fail("Unterminated string"));
            }
            continue;
        }
        match b[i] {
            b'(' | b'[' | b'{' => stack.push(b[i]),
            b')' | b']' | b'}' => {
                let expected = match b[i] {
                    b')' => b'(',
                    b']' => b'[',
                    _ => b'{',
                };
                if stack.pop() != Some(expected) {
                    return Err(fail("Unbalanced brackets"));
                }
            }
            _ => {}
        }
        i += 1;
    }
    if !stack.is_empty() {
        return Err(fail("Unbalanced brackets"));
    }
    Ok(())
}
fn patch(scope: &Scope, raw: &str) -> Result<Value> {
    let raw = raw.replace("\r\n", "\n");
    let (header, body) = raw.split_once("\n<<<< SEARCH\n").ok_or("Expected FILE / HASH / SEARCH / REPLACE")?;
    let mut lines = header.lines();
    let name = lines.next().and_then(|x| x.strip_prefix("FILE: ")).ok_or("Missing FILE")?;
    let expected = lines.next().and_then(|x| x.strip_prefix("HASH: ")).ok_or("Missing HASH from brain read")?;
    if lines.next().is_some() {
        return Err(fail("Unexpected header"));
    }
    let body = body.strip_suffix("\n").unwrap_or(body).strip_suffix("\n>>>> REPLACE").ok_or("Missing REPLACE marker")?;
    let (search, replacement) = body.split_once("\n====\n").ok_or("Missing separator")?;
    if search.is_empty() || replacement.contains("\n====\n") {
        return Err(fail("Empty or ambiguous patch"));
    }
    let (_, file) = scope::target(scope, name)?;
    if file.extension().and_then(|x| x.to_str()) != Some("c") {
        return Err(fail("Guarded patch currently supports plain C .c files only; use a language-aware editor for other languages"));
    }
    let old = read(&file)?;
    if hash(old.as_bytes()) != expected {
        return Err(fail("File changed: read again before patching"));
    }
    let crlf = old.contains("\r\n");
    let norm = old.replace("\r\n", "\n");
    // Count overlapping occurrences too.
    let positions: Vec<_> = norm.char_indices().filter_map(|(i, _)| norm[i..].starts_with(search).then_some(i)).take(2).collect();
    if positions.len() != 1 {
        return Err(fail("SEARCH must match exactly once; include more context"));
    }
    balanced(&norm)?;
    let mut new = norm.clone();
    new.replace_range(positions[0]..positions[0] + search.len(), replacement);
    balanced(&new)?;
    if crlf {
        if old.replace("\r\n", "").contains('\n') {
            return Err(fail("Mixed line endings are unsupported"));
        }
        new = new.replace('\n', "\r\n");
    }
    let (tmp, mut out) = temp(&file)?;
    out.set_permissions(fs::metadata(&file)?.permissions())?;
    out.write_all(new.as_bytes())?;
    out.sync_all()?;
    drop(out);
    if read(&file)? != old {
        return Err(fail("Concurrent edit detected; original preserved"));
    }
    fs::rename(&tmp.0, &file)?;
    // Report commit separately: a failed refresh must never look like a failed patch.
    let refresh = store::update(scope, false).err().map(|e| e.to_string());
    Ok(json!({"patched":true,"path":name,"hash":hash(new.as_bytes()),"indexError":refresh}))
}

/// Đọc theo dòng (`start end`) hoặc theo tên ký hiệu (cả thân ký hiệu, tối đa 500 dòng).
fn read_cmd(scope: &Scope, file: &str, a: &str, b: Option<&str>) -> Result<Value> {
    let (rel, p) = scope::target(scope, file)?;
    let s = read(&p)?;
    let lines: Vec<&str> = s.lines().collect();
    let mut symbol = Value::Null;
    let (start, mut end) = match (a.parse::<usize>(), b.map(|x| x.parse::<usize>())) {
        (Ok(x), Some(Ok(y))) => (x, y),
        (Err(_), None) => {
            let (ix, _) = store::update(scope, false)?;
            let f = ix.files.iter().find(|f| f.path == rel).ok_or("File is not indexed by Brain")?;
            let hits: Vec<&lang::Sym> = f.syms.iter().filter(|y| y.name == a).collect();
            let first = hits.first().ok_or_else(|| fail("Symbol not found in file; run outline"))?;
            symbol = json!({"name": first.name, "kind": first.kind, "scope": first.scope,
                "others": hits.iter().skip(1).map(|y| json!({"line": y.line, "kind": y.kind, "scope": y.scope})).collect::<Vec<_>>()});
            (first.line as usize, (first.end as usize).min(first.line as usize + 499))
        }
        _ => return Err(fail("Use: read <file> <start> <end> | read <file> <symbol>")),
    };
    if start == 0 || end < start || end - start >= 500 {
        return Err(fail("Read 1..500 lines"));
    }
    if start > lines.len() {
        return Err(fail("Range outside file; find again"));
    }
    let clamped = end > lines.len();
    end = end.min(lines.len());
    Ok(json!({"path": rel, "hash": hash(s.as_bytes()), "start": start, "end": end, "total": lines.len(), "clamped": clamped, "symbol": symbol, "lines": lines[start - 1..end]}))
}

struct Args {
    pos: Vec<String>,
    files: Vec<String>,
    text: bool,
    rebuild: bool,
    limit: usize,
}

fn parse_args() -> Result<Args> {
    let mut a = Args { pos: Vec::new(), files: Vec::new(), text: false, rebuild: false, limit: 20 };
    let mut it = env::args().skip(1);
    while let Some(x) = it.next() {
        match x.as_str() {
            "--file" => a.files.push(it.next().ok_or("--file needs a path")?),
            "--text" => a.text = true,
            "--json" => a.text = false,
            "--rebuild" => a.rebuild = true,
            "--limit" => a.limit = it.next().and_then(|n| n.parse().ok()).filter(|n| (1..=100).contains(n)).ok_or("--limit 1..100")?,
            _ => a.pos.push(x),
        }
    }
    Ok(a)
}

fn make_scope(a: &Args) -> Result<Scope> {
    let root = env::current_dir()?.canonicalize()?;
    let mut only: Vec<String> = a.files.clone();
    if only.is_empty() {
        if let Ok(v) = env::var("PVTA_BRAIN_ONLY") {
            only = v.split('\n').map(str::trim).filter(|x| !x.is_empty()).map(String::from).collect();
            if only.is_empty() {
                return Err(fail("PVTA_BRAIN_ONLY is set but empty"));
            }
        }
    }
    if only.is_empty() {
        return Ok(Scope { root, only: None });
    }
    let mut norm = Vec::new();
    for f in &only {
        let n = scope::normalize(f)?;
        if !norm.contains(&n) {
            norm.push(n);
        }
    }
    norm.sort();
    Ok(Scope { root, only: Some(norm) })
}

const HELP: &str = "PVTA Brain (chạy tại gốc dự án; --file <tệp> để chỉ làm việc với tệp đó)
  overview [--text]             Tầng 1: hiểu toàn dự án (vùng mã, ký hiệu chính, điểm vào, tệp trung tâm)
  outline <file> [--text]       Tầng 2: hiểu toàn một tệp (cây ký hiệu có dòng đầu–cuối, import, nơi dùng)
  find <truy vấn> [--limit N]   Tìm xếp hạng: ký hiệu + nội dung (BM25); lọc in:<thư mục> kind:<loại> lang:<ngôn ngữ>
  refs <identifier>             Ứng viên tham chiếu theo từ (định nghĩa, import, dùng, chú thích)
  read <file> <start> <end>     Đọc tối đa 500 dòng, kèm SHA-256 toàn tệp
  read <file> <symbol>          Đọc trọn thân một ký hiệu
  index [--rebuild]             Cập nhật chỉ mục tăng dần (find/overview/outline tự gọi)
  symbols                       Xuất JSONL {path,name,kind,line,end}
  patch < stdin                 Sửa có bảo vệ (FILE/HASH/SEARCH/REPLACE), chỉ C thuần
  guide                         Hướng dẫn đầy đủ";

fn run() -> Result<()> {
    let a = parse_args()?;
    let command = a.pos.first().map(String::as_str).unwrap_or("help");
    let arg = |i: usize| a.pos.get(i).map(String::as_str).ok_or_else(|| fail("Missing argument"));
    match command {
        "guide" => println!("{}", include_str!("../../brain.md")),
        "help" | "--help" | "-h" => println!("{HELP}"),
        _ => {
            let scope = make_scope(&a)?;
            match command {
                "index" => {
                    let (ix, st) = store::update(&scope, a.rebuild)?;
                    println!("{}", json!({"indexed": true, "scope": scope.kind(), "files": ix.files.len(), "symbols": ix.files.iter().map(|f| f.syms.len()).sum::<usize>(), "changed": st.changed, "removed": st.removed, "truncated": ix.truncated, "ms": st.ms}));
                }
                "overview" => {
                    let (ix, st) = store::update(&scope, a.rebuild)?;
                    let v = view::overview(&ix, &scope, &st);
                    if a.text {
                        print!("{}", view::overview_text(&v, 4000));
                    } else {
                        println!("{v}");
                    }
                }
                "outline" => {
                    let rel = scope::target(&scope, arg(1)?)?.0;
                    let (ix, _) = store::update(&scope, false)?;
                    let v = view::outline(&ix, &scope, &rel).ok_or("File type is not indexed by Brain; use read")?;
                    if a.text {
                        print!("{}", view::outline_text(&v, 12000));
                    } else {
                        println!("{v}");
                    }
                }
                "find" => {
                    let q = a.pos[1..].join(" ");
                    if q.trim().is_empty() || q.len() > 1000 {
                        return Err(fail("Expected a query (1..1000 chars)"));
                    }
                    let (ix, _) = store::update(&scope, false)?;
                    println!("{}", search::find(&ix, &scope, &q, a.limit));
                }
                "refs" => {
                    let name = arg(1)?;
                    if name.is_empty() || name.len() > 200 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$') {
                        return Err(fail("Expected identifier"));
                    }
                    let (ix, _) = store::update(&scope, false)?;
                    println!("{}", search::refs(&ix, &scope, name));
                }
                "read" => println!("{}", read_cmd(&scope, arg(1)?, arg(2)?, a.pos.get(3).map(String::as_str))?),
                "symbols" => {
                    let (ix, _) = store::update(&scope, false)?;
                    let out = io::stdout();
                    let mut w = io::BufWriter::new(out.lock());
                    for f in &ix.files {
                        for s in &f.syms {
                            writeln!(w, "{}", json!({"path": f.path, "name": s.name, "kind": s.kind, "line": s.line, "end": s.end, "scope": s.scope}))?;
                        }
                    }
                }
                "patch" => {
                    let mut s = String::new();
                    io::stdin().take(LIMIT + 1).read_to_string(&mut s)?;
                    if s.len() as u64 > LIMIT {
                        return Err(fail("Patch too large"));
                    }
                    println!("{}", patch(&scope, &s)?);
                }
                _ => println!("{HELP}"),
            }
        }
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("Brain: {e}");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn guard() {
        assert!(balanced("int f(){ /* } */ return '('; }").is_ok());
        for s in ["([)]", "void f(){", "\"unterminated", "#ifdef X\n{}", "//x\n}"] {
            assert!(balanced(s).is_err(), "{s}");
        }
    }
}
