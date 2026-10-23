//! Tìm kiếm lai trên chỉ mục trong bộ nhớ (không quét lại đĩa, trừ khi lấy dòng bằng chứng):
//! 1) Ký hiệu: khớp chính xác / tiền tố / chuỗi con của tên, khớp từng mảnh định danh có trọng số IDF,
//!    chịu lỗi gõ 1 ký tự (Damerau), khớp mờ kiểu fzf; nhân theo loại ký hiệu và độ phủ truy vấn.
//! 2) Tệp: BM25 trên nội dung đã gấp dấu (hỏi tiếng Việt khớp chú thích tiếng Việt) + điểm đường dẫn,
//!    trả dòng khớp nhiều từ nhất làm bằng chứng.
//! Bộ lọc trong truy vấn: `in:<đường dẫn>`, `kind:<loại>`, `lang:<ngôn ngữ>`.

use serde_json::{json, Value};
use std::{collections::HashMap, fs};

use crate::{
    scope::Scope,
    store::{FileRec, Index},
    text,
};

pub struct Query {
    raw: String,
    tokens: Vec<String>,
    /// Truy vấn là một từ duy nhất (có thể là viết tắt định danh).
    single: bool,
    kind: Option<String>,
    inpath: Option<String>,
    lang: Option<String>,
}

pub fn parse_query(q: &str) -> Query {
    let mut rest = Vec::new();
    let (mut kind, mut inpath, mut lang) = (None, None, None);
    for w in q.split_whitespace() {
        if let Some(x) = w.strip_prefix("kind:") {
            kind = Some(x.to_ascii_lowercase());
        } else if let Some(x) = w.strip_prefix("in:") {
            inpath = Some(x.trim_start_matches("./").trim_end_matches('/').to_string());
        } else if let Some(x) = w.strip_prefix("lang:") {
            lang = Some(x.to_ascii_lowercase());
        } else {
            rest.push(w);
        }
    }
    let joined = rest.join(" ");
    Query {
        raw: text::fold(&joined).chars().filter(|c| !c.is_whitespace()).collect(),
        tokens: text::query_tokens(&joined),
        single: rest.len() == 1,
        kind,
        inpath,
        lang,
    }
}

fn kind_weight(k: &str) -> f64 {
    match k {
        "class" | "interface" | "struct" | "trait" | "component" | "enum" => 1.25,
        "function" | "method" => 1.2,
        "type" | "module" | "impl" | "macro" | "sql" | "table" | "view" | "procedure" => 1.1,
        k if k.starts_with('h') && k.len() == 2 => 1.0,
        "test" => 0.9,
        _ => 0.85,
    }
}

fn is_test_path(p: &str) -> bool {
    let l = p.to_ascii_lowercase();
    l.contains("/test/") || l.contains("/tests/") || l.starts_with("test/") || l.starts_with("tests/") || l.contains(".test.") || l.contains(".spec.") || l.contains("_test.")
}

fn file_ok(q: &Query, f: &FileRec) -> bool {
    q.inpath.as_ref().map_or(true, |p| f.path.starts_with(p.as_str()) || f.path.contains(p.as_str()))
        && q.lang.as_ref().map_or(true, |l| &f.lang == l)
}

fn round(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// Dòng bằng chứng: các dòng chứa nhiều từ truy vấn nhất.
fn evidence(scope: &Scope, f: &FileRec, tokens: &[String], max: usize) -> Vec<Value> {
    let Ok(bytes) = fs::read(scope.root.join(&f.path)) else { return Vec::new() };
    let text = String::from_utf8_lossy(&bytes);
    let mut best: Vec<(usize, usize, String)> = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if line.len() > 2000 {
            continue;
        }
        let mut seen: Vec<String> = Vec::new();
        text::content_tokens(line, |t| seen.push(t));
        text::words(line, |w| seen.push(text::fold(w)));
        let hits = tokens.iter().filter(|q| seen.iter().any(|t| t == *q || (q.len() >= 3 && t.starts_with(q.as_str())))).count();
        if hits > 0 {
            best.push((hits, i + 1, line.trim().chars().take(160).collect()));
        }
    }
    best.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    best.into_iter().take(max).map(|(_, l, t)| json!({"line": l, "text": t})).collect()
}

pub fn find(ix: &Index, scope: &Scope, query: &str, limit: usize) -> Value {
    let q = parse_query(query);
    let wants_test = q.tokens.iter().any(|t| t == "test" || t == "spec" || t == "tests");
    // Chỉ có bộ lọc (vd. `kind:struct in:brain`): liệt kê ký hiệu thỏa bộ lọc.
    let filter_only = q.raw.is_empty() && q.tokens.is_empty() && (q.kind.is_some() || q.inpath.is_some() || q.lang.is_some());
    // Mảnh một chữ cái trong truy vấn nhiều từ không được tự khớp (tránh `p`, `b` lấn át).
    let multi = q.tokens.len() > 1;
    // ---- ký hiệu
    let mut sym_tokens: Vec<Vec<Vec<String>>> = Vec::with_capacity(ix.files.len());
    let mut df: HashMap<&str, u32> = HashMap::new();
    let mut nsym = 0u32;
    for f in &ix.files {
        let v: Vec<Vec<String>> = f.syms.iter().map(|s| text::name_tokens(&s.name)).collect();
        nsym += v.len() as u32;
        sym_tokens.push(v);
    }
    for v in &sym_tokens {
        for toks in v {
            for t in toks {
                if q.tokens.contains(t) {
                    *df.entry(q.tokens.iter().find(|x| *x == t).unwrap().as_str()).or_insert(0) += 1;
                }
            }
        }
    }
    let n = nsym.max(1) as f64;
    let idf = |t: &str| (1.0 + n / (1.0 + *df.get(t).unwrap_or(&0) as f64)).ln();
    let mut hits: Vec<(f64, usize, usize)> = Vec::new();
    for (fi, f) in ix.files.iter().enumerate() {
        if !file_ok(&q, f) {
            continue;
        }
        let path_toks = text::name_tokens(&f.path);
        let test_file = is_test_path(&f.path);
        for (si, s) in f.syms.iter().enumerate() {
            if let Some(k) = &q.kind {
                if !(s.kind == *k || (k == "heading" && s.kind.starts_with('h') && s.kind.len() == 2)) {
                    continue;
                }
            }
            let name = text::fold(&s.name);
            let stoks = &sym_tokens[fi][si];
            let mut score = 0.0;
            let mut name_hit = false;
            if !q.raw.is_empty() {
                let compact: String = name.chars().filter(|c| !c.is_whitespace()).collect();
                if compact == q.raw {
                    score += 12.0;
                    name_hit = true;
                } else if compact.starts_with(&q.raw) {
                    score += 7.0;
                    name_hit = true;
                } else if q.raw.len() >= 3 && compact.contains(&q.raw) {
                    score += 4.0;
                    name_hit = true;
                }
            }
            if !q.tokens.is_empty() {
                let mut matched = 0.0;
                let mut tok_score = 0.0;
                let scope_toks = if s.scope.is_empty() { Vec::new() } else { text::name_tokens(&s.scope) };
                for qt in &q.tokens {
                    let w = idf(qt);
                    if multi && qt.chars().count() < 2 {
                        continue;
                    }
                    if stoks.contains(qt) {
                        tok_score += 2.0 * w;
                        matched += 1.0;
                        name_hit = true;
                    } else if qt.len() >= 2 && stoks.iter().any(|t| t.starts_with(qt.as_str())) {
                        tok_score += 1.3 * w;
                        matched += 1.0;
                        name_hit = true;
                    } else if qt.len() >= 4 && stoks.iter().any(|t| t.len() >= 4 && text::within_one_edit(t, qt)) {
                        tok_score += 0.9 * w;
                        matched += 0.8;
                        name_hit = true;
                    } else if scope_toks.contains(qt) || path_toks.iter().any(|t| t == qt || (qt.len() >= 3 && t.starts_with(qt.as_str()))) {
                        tok_score += 0.6 * w;
                        matched += 0.5;
                    }
                }
                let coverage = matched / q.tokens.len() as f64;
                score += tok_score * (0.4 + 0.6 * coverage * coverage);
            }
            // Viết tắt định danh: `bproot` → brainProjectRoot. Mạnh hơn khớp mảnh lẻ, yếu hơn khớp nguyên tên.
            if q.single && q.raw.len() >= 2 && score < 7.0 {
                let used = text::hump_match(&q.raw, &s.name);
                if used >= 2 {
                    score = score.max(6.0 + used as f64 * 0.5);
                    name_hit = true;
                }
            }
            if !name_hit && q.raw.len() >= 3 {
                let f = text::fuzzy_score(&q.raw, &s.name);
                if f > 0.45 {
                    score = f * 5.0;
                    name_hit = true;
                }
            }
            if filter_only {
                score = 1.0;
                name_hit = true;
            }
            if !name_hit || score <= 0.0 {
                continue;
            }
            score *= kind_weight(&s.kind);
            if s.exported {
                score *= 1.08;
            }
            if test_file && !wants_test {
                score *= 0.85;
            }
            hits.push((score, fi, si));
        }
    }
    hits.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let total_syms = hits.len();
    let symbols: Vec<Value> = hits
        .iter()
        .take(limit)
        .map(|&(sc, fi, si)| {
            let f = &ix.files[fi];
            let s = &f.syms[si];
            json!({"name": s.name, "kind": s.kind, "path": f.path, "line": s.line, "end": s.end, "scope": s.scope, "sig": s.sig, "score": round(sc)})
        })
        .collect();
    // ---- tệp (BM25)
    let docs: Vec<&FileRec> = ix.files.iter().filter(|f| f.len > 0 && file_ok(&q, f)).collect();
    let nd = docs.len().max(1) as f64;
    let avgdl = (docs.iter().map(|f| f.len as f64).sum::<f64>() / nd).max(1.0);
    let (k1, b) = (1.2, 0.75);
    let fdf: Vec<f64> = q
        .tokens
        .iter()
        .map(|t| docs.iter().filter(|f| f.tf(t) > 0 || (t.len() >= 3 && f.prefix_tf(t) > 0)).count() as f64)
        .collect();
    let mut fhits: Vec<(f64, &FileRec)> = Vec::new();
    for f in &docs {
        let path_toks = text::name_tokens(&f.path);
        let mut score = 0.0;
        let mut matched = 0.0;
        for (qi, qt) in q.tokens.iter().enumerate() {
            let idf = (1.0 + (nd - fdf[qi] + 0.5) / (fdf[qi] + 0.5)).ln();
            let mut tf = f.tf(qt) as f64;
            if qt.len() >= 3 {
                tf += 0.35 * f.prefix_tf(qt) as f64;
            }
            let mut hit = false;
            if tf > 0.0 {
                score += idf * tf * (k1 + 1.0) / (tf + k1 * (1.0 - b + b * f.len as f64 / avgdl));
                hit = true;
            }
            if path_toks.iter().any(|t| t == qt || (qt.len() >= 3 && t.starts_with(qt.as_str()))) {
                score += idf * 1.5;
                hit = true;
            }
            if hit {
                matched += 1.0;
            }
        }
        if matched == 0.0 {
            continue;
        }
        let cov = matched / q.tokens.len().max(1) as f64;
        score *= cov.powf(1.5);
        if is_test_path(&f.path) && !wants_test {
            score *= 0.85;
        }
        fhits.push((score, f));
    }
    fhits.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let total_files = fhits.len();
    let files: Vec<Value> = fhits
        .iter()
        .take(limit.min(8))
        .map(|(sc, f)| json!({"path": f.path, "lang": f.lang, "lines": f.lines, "score": round(*sc), "matches": evidence(scope, f, &q.tokens, 3)}))
        .collect();
    let mut out = json!({
        "query": query, "tokens": q.tokens, "scope": scope.kind(),
        "symbols": symbols, "files": files,
        "total": {"symbols": total_syms, "files": total_files},
    });
    if symbols_empty(&out) {
        // gợi ý tên gần đúng để thử lại
        let mut near: Vec<(f64, &str)> = Vec::new();
        let probe = q.tokens.first().cloned().unwrap_or_else(|| q.raw.clone());
        for f in &ix.files {
            for s in &f.syms {
                let sc = text::fuzzy_score(&probe, &s.name).max(if text::name_tokens(&s.name).iter().any(|t| t.len() >= 3 && text::within_one_edit(t, &probe)) { 0.6 } else { 0.0 });
                if sc > 0.25 && !near.iter().any(|x| x.1 == s.name) {
                    near.push((sc, &s.name));
                }
            }
        }
        near.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let names: Vec<&str> = near.iter().take(6).map(|x| x.1).collect();
        out["hint"] = json!(format!(
            "Không thấy ký hiệu khớp. {}Thử tên khác, bớt từ, hoặc dùng outline/overview để xem cấu trúc.",
            if names.is_empty() { String::new() } else { format!("Tên gần giống: {}. ", names.join(", ")) }
        ));
    }
    out
}

fn symbols_empty(v: &Value) -> bool {
    v["symbols"].as_array().is_some_and(|a| a.is_empty())
}

fn ident_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'$'
}

/// Ứng viên tham chiếu theo từ: dùng chỉ mục token để chỉ mở các tệp có chứa tên.
pub fn refs(ix: &Index, scope: &Scope, name: &str) -> Value {
    let key = text::fold(name);
    let indexed = key.chars().count() >= 2 && !text::is_stop(&key);
    let mut definitions = Vec::new();
    for f in &ix.files {
        for s in f.syms.iter().filter(|s| s.name == name) {
            definitions.push(json!({"path": f.path, "line": s.line, "end": s.end, "kind": s.kind, "scope": s.scope}));
        }
    }
    let mut refs = Vec::new();
    let mut files = 0;
    let mut truncated = false;
    let nb = name.as_bytes();
    'files: for f in &ix.files {
        if indexed && f.tf(&key) == 0 {
            continue;
        }
        let Ok(bytes) = fs::read(scope.root.join(&f.path)) else { continue };
        if bytes.contains(&0) {
            continue;
        }
        let text = String::from_utf8_lossy(&bytes);
        let mut any = false;
        for (i, line) in text.lines().enumerate() {
            let lb = line.as_bytes();
            let mut pos = 0;
            let mut found = false;
            while let Some(k) = line[pos..].find(name) {
                let at = pos + k;
                let before = at == 0 || !ident_char(lb[at - 1]);
                let after = at + nb.len() >= lb.len() || !ident_char(lb[at + nb.len()]);
                if before && after {
                    found = true;
                    break;
                }
                pos = at + nb.len().max(1);
                if pos >= line.len() {
                    break;
                }
            }
            if !found {
                continue;
            }
            any = true;
            let t = line.trim_start();
            let kind = if f.syms.iter().any(|s| s.name == name && s.line as usize == i + 1) {
                "definition"
            } else if t.starts_with("import ") || t.starts_with("use ") || t.starts_with("from ") || t.starts_with("#include") || t.contains("require(") || (t.starts_with("export ") && t.contains(" from ")) {
                "import"
            } else if t.starts_with("//") || t.starts_with('#') || t.starts_with("/*") || t.starts_with('*') || t.starts_with("--") {
                "comment"
            } else {
                "use"
            };
            if refs.len() >= 300 {
                truncated = true;
                break 'files;
            }
            refs.push(json!({"path": f.path, "line": i + 1, "kind": kind, "text": t.chars().take(200).collect::<String>()}));
        }
        if any {
            files += 1;
        }
    }
    json!({
        "name": name, "scope": scope.kind(),
        "note": "Ứng viên theo từ (lexical): có thể gồm chú thích/chuỗi và bỏ sót lời gọi động; đọc nguồn trước khi khẳng định.",
        "definitions": definitions, "refs": refs, "files": files, "truncated": truncated,
    })
}
