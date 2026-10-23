//! Hai tầng hiểu:
//! - Tầng 1 `overview`: toàn dự án — ngôn ngữ, vùng mã, ký hiệu chính, điểm vào, tệp trung tâm (đồ thị import).
//! - Tầng 2 `outline`: toàn một tệp — cây ký hiệu có dòng đầu–cuối, import đã phân giải, tệp phụ thuộc vào nó.
//! Ở chế độ tệp lẻ, overview chính là outline của từng tệp được cấp.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fmt::Write, fs};

use crate::{
    scope::Scope,
    store::{self, FileRec, Index, Stats},
};

fn area_of(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').collect();
    let dirs = &parts[..parts.len() - 1];
    match dirs.len() {
        0 => ".".into(),
        1 => dirs[0].into(),
        _ => dirs[..2].join("/"),
    }
}

const ENTRY_NAMES: &[&str] = &[
    "package.json", "cargo.toml", "pyproject.toml", "setup.py", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts",
    "makefile", "dockerfile", "readme.md", "agents.md", "claude.md", "tsconfig.json", "tauri.conf.json", "composer.json",
];
const ENTRY_STEMS: &[&str] = &["main", "index", "app", "lib", "server", "cli", "mod", "__main__"];

fn is_main_kind(k: &str) -> bool {
    matches!(k, "class" | "interface" | "struct" | "trait" | "component" | "enum" | "function" | "type" | "module" | "macro")
}

fn dependents(deps: &[Vec<usize>], n: usize) -> Vec<Vec<usize>> {
    let mut inv = vec![Vec::new(); n];
    for (i, d) in deps.iter().enumerate() {
        for &t in d {
            inv[t].push(i);
        }
    }
    inv
}

fn thousands(n: usize) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push('.');
        }
        out.push(c);
    }
    out
}

pub fn overview(ix: &Index, scope: &Scope, st: &Stats) -> Value {
    if scope.only.is_some() {
        let deps = store::deps(ix);
        let files: Vec<Value> = ix.files.iter().map(|f| outline_value(ix, scope, &deps, f, 200)).collect();
        return json!({"scope": "files", "files": files, "changed": st.changed, "ms": st.ms});
    }
    let deps = store::deps(ix);
    let inv = dependents(&deps, ix.files.len());
    let mut langs: HashMap<&str, (usize, usize)> = HashMap::new();
    struct Area<'a> {
        files: usize,
        lines: usize,
        symbols: usize,
        tests: usize,
        langs: HashMap<&'a str, usize>,
        top: Vec<(f64, &'a str)>,
    }
    let mut areas: HashMap<String, Area> = HashMap::new();
    let (mut nsym, mut nlines) = (0usize, 0usize);
    for (i, f) in ix.files.iter().enumerate() {
        let e = langs.entry(f.lang.as_str()).or_insert((0, 0));
        e.0 += 1;
        e.1 += f.lines as usize;
        nsym += f.syms.len();
        nlines += f.lines as usize;
        let a = areas.entry(area_of(&f.path)).or_insert_with(|| Area { files: 0, lines: 0, symbols: 0, tests: 0, langs: HashMap::new(), top: Vec::new() });
        a.files += 1;
        a.lines += f.lines as usize;
        a.symbols += f.syms.len();
        *a.langs.entry(f.lang.as_str()).or_insert(0) += 1;
        let test = f.path.contains("test") || f.path.contains("spec");
        if test {
            a.tests += 1;
        }
        for s in &f.syms {
            if is_main_kind(&s.kind) && s.scope.is_empty() && (s.exported || f.lang == "rust" || f.lang == "python") {
                let w = (1.0 + inv[i].len() as f64).ln() + 1.0 + if s.exported { 0.3 } else { 0.0 } + if matches!(s.kind.as_str(), "class" | "component" | "struct" | "trait" | "interface") { 0.4 } else { 0.0 }
                    + ((s.end.saturating_sub(s.line)) as f64 + 1.0).ln() * 0.15
                    - if test { 1.0 } else { 0.0 };
                a.top.push((w, s.name.as_str()));
            }
        }
    }
    let mut lang_list: Vec<(&str, (usize, usize))> = langs.into_iter().collect();
    lang_list.sort_by(|a, b| b.1 .0.cmp(&a.1 .0));
    let mut area_list: Vec<(String, Area)> = areas.into_iter().collect();
    area_list.sort_by(|a, b| b.1.symbols.cmp(&a.1.symbols).then(b.1.files.cmp(&a.1.files)));
    let areas_json: Vec<Value> = area_list
        .iter_mut()
        .take(30)
        .map(|(p, a)| {
            a.top.sort_by(|x, y| y.0.partial_cmp(&x.0).unwrap_or(std::cmp::Ordering::Equal));
            let mut names: Vec<&str> = Vec::new();
            for (_, n) in &a.top {
                if !names.contains(n) {
                    names.push(n);
                }
                if names.len() == 8 {
                    break;
                }
            }
            let mut l: Vec<(&&str, &usize)> = a.langs.iter().collect();
            l.sort_by(|x, y| y.1.cmp(x.1));
            json!({"path": p, "files": a.files, "lines": a.lines, "symbols": a.symbols, "tests": a.tests,
                   "langs": l.iter().take(3).map(|x| *x.0).collect::<Vec<_>>(), "top": names})
        })
        .collect();
    let mut entry: Vec<&FileRec> = ix
        .files
        .iter()
        .filter(|f| {
            let depth = f.path.matches('/').count();
            let base = f.path.rsplit('/').next().unwrap_or("").to_ascii_lowercase();
            let stem = base.split('.').next().unwrap_or("");
            (depth <= 2 && ENTRY_NAMES.contains(&base.as_str()))
                || (depth <= 3 && ENTRY_STEMS.contains(&stem) && !matches!(f.lang.as_str(), "json" | "markdown" | "text" | "css"))
        })
        .collect();
    entry.sort_by(|a, b| a.path.matches('/').count().cmp(&b.path.matches('/').count()).then(a.path.cmp(&b.path)));
    let mut hubs: Vec<(usize, &str)> = inv.iter().enumerate().filter(|(_, d)| d.len() >= 2).map(|(i, d)| (d.len(), ix.files[i].path.as_str())).collect();
    hubs.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(b.1)));
    json!({
        "scope": "project",
        "files": ix.files.len(), "symbols": nsym, "lines": nlines, "truncated": ix.truncated,
        "changed": st.changed, "removed": st.removed, "ms": st.ms,
        "languages": lang_list.iter().map(|(l, (f, n))| json!({"lang": l, "files": f, "lines": n})).collect::<Vec<_>>(),
        "areas": areas_json,
        "entry": entry.iter().take(16).map(|f| f.path.as_str()).collect::<Vec<_>>(),
        "hubs": hubs.iter().take(10).map(|(n, p)| json!({"path": p, "dependents": n})).collect::<Vec<_>>(),
    })
}

pub fn overview_text(v: &Value, budget: usize) -> String {
    let mut s = String::new();
    if v["scope"] == "files" {
        let files = v["files"].as_array().cloned().unwrap_or_default();
        let each = budget / files.len().max(1);
        let _ = writeln!(s, "BRAIN · PHẠM VI TỆP ({} tệp được cấp; Brain không đọc tệp khác):", files.len());
        for f in &files {
            s.push_str(&outline_text(f, each.max(600)));
        }
        return s;
    }
    let _ = writeln!(
        s,
        "TẦNG 1 · TOÀN DỰ ÁN: {} tệp, {} ký hiệu, {} dòng{} (chỉ mục tăng dần: {} tệp đổi, {} ms).",
        thousands(v["files"].as_u64().unwrap_or(0) as usize),
        thousands(v["symbols"].as_u64().unwrap_or(0) as usize),
        thousands(v["lines"].as_u64().unwrap_or(0) as usize),
        if v["truncated"] == true { ", ĐÃ CẮT do vượt giới hạn tệp" } else { "" },
        v["changed"],
        v["ms"]
    );
    let langs: Vec<String> = v["languages"].as_array().into_iter().flatten().take(8).map(|l| format!("{} {}", l["lang"].as_str().unwrap_or(""), l["files"])).collect();
    let _ = writeln!(s, "Ngôn ngữ (tệp): {}", langs.join(" · "));
    s.push_str("Vùng mã (thư mục: tệp/ký hiệu — ký hiệu chính):\n");
    for a in v["areas"].as_array().into_iter().flatten() {
        let top: Vec<&str> = a["top"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).collect();
        let line = format!("- {}: {}/{}{} — {}\n", a["path"].as_str().unwrap_or(""), a["files"], a["symbols"], if a["tests"].as_u64().unwrap_or(0) > 0 { format!(", {} tệp test", a["tests"]) } else { String::new() }, top.join(", "));
        if s.len() + line.len() > budget.saturating_sub(500) {
            s.push_str("- … (dùng brain_overview để xem đủ)\n");
            break;
        }
        s.push_str(&line);
    }
    let entry: Vec<&str> = v["entry"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).collect();
    if !entry.is_empty() {
        let _ = writeln!(s, "Điểm vào/cấu hình: {}", entry.join(", "));
    }
    let hubs: Vec<String> = v["hubs"].as_array().into_iter().flatten().map(|h| format!("{} ←{}", h["path"].as_str().unwrap_or(""), h["dependents"])).collect();
    if !hubs.is_empty() {
        let _ = writeln!(s, "Tệp trung tâm (số tệp import tới): {}", hubs.join(", "));
    }
    s
}

fn outline_value(ix: &Index, scope: &Scope, deps: &[Vec<usize>], f: &FileRec, max_syms: usize) -> Value {
    let i = ix.files.iter().position(|x| std::ptr::eq(x, f)).unwrap_or(0);
    let by: Vec<&str> = ix.files.iter().map(|x| x.path.as_str()).collect();
    let resolved: Vec<&str> = deps.get(i).map(|d| d.iter().map(|&t| by[t]).collect()).unwrap_or_default();
    let used_by: Vec<&str> = deps.iter().enumerate().filter(|(_, d)| d.contains(&i)).map(|(k, _)| by[k]).collect();
    let hash = fs::read(scope.root.join(&f.path)).map(|b| format!("{:x}", Sha256::digest(&b))).unwrap_or_default();
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for s in &f.syms {
        *counts.entry(s.kind.as_str()).or_insert(0) += 1;
    }
    // độ lồng theo khoảng dòng
    let mut stack: Vec<u32> = Vec::new();
    let syms: Vec<Value> = f
        .syms
        .iter()
        .take(max_syms)
        .map(|s| {
            while stack.last().is_some_and(|e| *e < s.line) {
                stack.pop();
            }
            let depth = stack.len();
            if s.end > s.line {
                stack.push(s.end);
            }
            json!({"name": s.name, "kind": s.kind, "line": s.line, "end": s.end, "scope": s.scope, "exported": s.exported, "depth": depth, "sig": s.sig})
        })
        .collect();
    json!({
        "path": f.path, "lang": f.lang, "lines": f.lines, "bytes": f.size, "hash": hash,
        "imports": f.imports, "resolvedImports": resolved, "usedBy": used_by,
        "counts": counts, "symbols": syms, "truncated": f.syms.len() > max_syms,
    })
}

pub fn outline(ix: &Index, scope: &Scope, rel: &str) -> Option<Value> {
    let f = ix.files.iter().find(|f| f.path == rel)?;
    let deps = store::deps(ix);
    Some(outline_value(ix, scope, &deps, f, 1000))
}

pub fn outline_text(v: &Value, budget: usize) -> String {
    let mut s = String::new();
    let _ = writeln!(s, "TẦNG 2 · TỆP {} ({}, {} dòng):", v["path"].as_str().unwrap_or(""), v["lang"].as_str().unwrap_or(""), v["lines"]);
    let imports: Vec<&str> = v["imports"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).take(20).collect();
    if !imports.is_empty() {
        let _ = writeln!(s, "  import: {}", imports.join(", "));
    }
    let used: Vec<&str> = v["usedBy"].as_array().into_iter().flatten().filter_map(|x| x.as_str()).take(12).collect();
    if !used.is_empty() {
        let _ = writeln!(s, "  được import bởi: {}", used.join(", "));
    }
    let syms = v["symbols"].as_array().cloned().unwrap_or_default();
    if syms.is_empty() {
        s.push_str("  (không có ký hiệu/tiêu đề; dùng brain_find để tìm theo nội dung)\n");
    }
    let many = syms.len() > 80;
    let mut shown = 0;
    for y in &syms {
        let kind = y["kind"].as_str().unwrap_or("");
        if many && matches!(kind, "property" | "variable" | "key" | "test") && y["depth"].as_u64().unwrap_or(0) > 0 {
            continue;
        }
        let line = format!(
            "  {}{} {} [{}-{}]\n",
            "  ".repeat(y["depth"].as_u64().unwrap_or(0).min(6) as usize),
            kind,
            y["name"].as_str().unwrap_or(""),
            y["line"],
            y["end"]
        );
        if s.len() + line.len() > budget {
            let _ = writeln!(s, "  … còn {} ký hiệu (brain_outline để xem đủ)", syms.len() - shown);
            break;
        }
        s.push_str(&line);
        shown += 1;
    }
    s
}
