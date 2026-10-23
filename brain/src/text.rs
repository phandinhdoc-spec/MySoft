//! Chuẩn hóa chữ và tách từ dùng chung cho chỉ mục và truy vấn.
//! - Gấp dấu tiếng Việt và chữ hoa: "Đăng nhập" -> "dang nhap".
//! - Tách định danh: "brainProjectRoot" -> brain, project, root (+ cả từ "brainprojectroot").

const GROUPS: &[(&str, char)] = &[
    ("àáảãạăằắẳẵặâầấẩẫậ", 'a'),
    ("èéẻẽẹêềếểễệ", 'e'),
    ("ìíỉĩị", 'i'),
    ("òóỏõọôồốổỗộơờớởỡợ", 'o'),
    ("ùúủũụưừứửữự", 'u'),
    ("ỳýỷỹỵ", 'y'),
    ("đ", 'd'),
];

fn fold_char(c: char) -> char {
    if c.is_ascii() {
        return c.to_ascii_lowercase();
    }
    let lower = c.to_lowercase().next().unwrap_or(c);
    for (set, base) in GROUPS {
        if set.contains(lower) {
            return *base;
        }
    }
    lower
}

/// Gấp dấu + chữ thường cho cả chuỗi.
pub fn fold(s: &str) -> String {
    s.chars().map(fold_char).collect()
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

/// Gọi `f` với từng từ thô (chữ, số, `_`, `$`) trong chuỗi.
pub fn words<'a>(s: &'a str, mut f: impl FnMut(&'a str)) {
    let mut start = None;
    for (i, c) in s.char_indices() {
        if is_word(c) {
            if start.is_none() {
                start = Some(i);
            }
        } else if let Some(st) = start.take() {
            f(&s[st..i]);
        }
    }
    if let Some(st) = start {
        f(&s[st..]);
    }
}

/// Tách một định danh thành các mảnh (chưa gấp dấu): camelCase, PascalCase, ACRONYMWord, snake_case.
pub fn split_ident(w: &str) -> Vec<&str> {
    let mut out = Vec::new();
    for part in w.split(|c| c == '_' || c == '$') {
        if part.is_empty() {
            continue;
        }
        let chars: Vec<(usize, char)> = part.char_indices().collect();
        let mut start = 0usize;
        for k in 1..chars.len() {
            let (i, c) = chars[k];
            let prev = chars[k - 1].1;
            let next = chars.get(k + 1).map(|x| x.1);
            let boundary = (c.is_uppercase() && prev.is_lowercase())
                || (c.is_uppercase() && prev.is_uppercase() && next.is_some_and(|n| n.is_lowercase()));
            if boundary {
                out.push(&part[start..i]);
                start = i;
            }
        }
        out.push(&part[start..]);
    }
    out
}

const STOP: &[&str] = &[
    // Từ khóa mã quá phổ biến (giảm kích thước chỉ mục, không mang nghĩa tìm kiếm).
    "const", "let", "var", "return", "function", "import", "export", "from", "if", "else", "for", "while",
    "true", "false", "null", "undefined", "this", "self", "new", "void", "int", "string", "number", "boolean",
    "async", "await", "pub", "fn", "mut", "use", "def", "end", "then", "do", "in", "of", "to", "is", "the",
    "and", "or", "an", "be", "it", "as", "at", "by", "on", "with", "not", "default", "case", "break",
];

/// Từ hỏi tiếng Việt/Anh không mang nghĩa vị trí mã ("tìm chỗ xử lí ... ở đâu").
const QUERY_STOP: &[&str] = &[
    "tim", "cho", "noi", "dau", "o", "sua", "ham", "ma", "file", "tep", "nao", "gi", "lam", "the", "sao", "cua",
    "va", "la", "cac", "nhung", "mot", "trong", "duoc", "khong", "co", "nay", "de", "voi", "can", "where", "find",
    "code", "function", "file", "which", "what", "how", "is", "the", "a", "an", "of", "in", "to", "for", "and",
];

pub fn is_stop(t: &str) -> bool {
    STOP.contains(&t)
}

fn useful(t: &str) -> bool {
    t.chars().count() >= 2 && !t.chars().all(|c| c.is_ascii_digit())
}

/// Token của nội dung tệp: từ đầy đủ đã gấp + các mảnh của định danh.
pub fn content_tokens(text: &str, mut f: impl FnMut(String)) {
    words(text, |w| {
        if w.len() > 64 {
            return;
        }
        let full = fold(w);
        let parts = split_ident(w);
        if parts.len() > 1 {
            for p in parts {
                let p = fold(p);
                if useful(&p) && !is_stop(&p) {
                    f(p);
                }
            }
        }
        if useful(&full) && !is_stop(&full) {
            f(full);
        }
    });
}

/// Token của tên ký hiệu/đường dẫn (không lọc từ khóa: tên `use` hay `end` vẫn tìm được).
pub fn name_tokens(name: &str) -> Vec<String> {
    let mut out = Vec::new();
    words(name, |w| {
        for p in split_ident(w) {
            let p = fold(p);
            if !p.is_empty() && !out.contains(&p) {
                out.push(p);
            }
        }
    });
    out
}

/// Token của truy vấn: tách định danh, gấp dấu, bỏ từ hỏi; nếu bỏ hết thì giữ nguyên.
pub fn query_tokens(q: &str) -> Vec<String> {
    let mut all = Vec::new();
    words(q, |w| {
        let parts = split_ident(w);
        for p in &parts {
            let p = fold(p);
            if !p.is_empty() && !all.contains(&p) {
                all.push(p);
            }
        }
        let full = fold(w);
        if parts.len() > 1 && !all.contains(&full) {
            all.push(full);
        }
    });
    let kept: Vec<String> = all.iter().filter(|t| !QUERY_STOP.contains(&t.as_str())).cloned().collect();
    if kept.is_empty() {
        all
    } else {
        kept
    }
}

/// Khoảng cách Damerau (OSA) có ngưỡng: trả true khi <= 1.
pub fn within_one_edit(a: &str, b: &str) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (n, m) = (a.len(), b.len());
    if n.abs_diff(m) > 1 {
        return false;
    }
    let mut i = 0;
    while i < n && i < m && a[i] == b[i] {
        i += 1;
    }
    if i == n && i == m {
        return true;
    }
    if n == m {
        // thay 1 ký tự, hoặc đổi chỗ 2 ký tự kề nhau
        (a[i + 1..] == b[i + 1..]) || (i + 1 < n && a[i] == b[i + 1] && a[i + 1] == b[i] && a[i + 2..] == b[i + 2..])
    } else if n > m {
        a[i + 1..] == b[i..]
    } else {
        a[i..] == b[i + 1..]
    }
}

/// Điểm khớp mờ kiểu fzf (chuỗi con theo thứ tự). 0 = không khớp.
pub fn fuzzy_score(query: &str, name: &str) -> f64 {
    let q: Vec<char> = query.chars().collect();
    let n: Vec<char> = name.chars().collect();
    if q.is_empty() || q.len() > n.len() {
        return 0.0;
    }
    let lower: Vec<char> = n.iter().map(|c| fold_char(*c)).collect();
    let mut qi = 0;
    let mut score = 0.0;
    let mut prev_match: Option<usize> = None;
    for (i, c) in lower.iter().enumerate() {
        if qi < q.len() && *c == q[qi] {
            let boundary = i == 0
                || !n[i - 1].is_alphanumeric()
                || (n[i].is_uppercase() && n[i - 1].is_lowercase());
            score += 1.0;
            if boundary {
                score += 2.0;
            }
            if prev_match.is_some_and(|p| p + 1 == i) {
                score += 1.5;
            }
            prev_match = Some(i);
            qi += 1;
        }
    }
    if qi < q.len() {
        return 0.0;
    }
    // chuẩn hóa: tối đa 4.5 điểm mỗi ký tự; phạt tên dài
    score / (4.5 * q.len() as f64) * (q.len() as f64 / n.len() as f64).sqrt()
}

/// Khớp viết tắt theo mảnh định danh (kiểu IDE): `query` (đã gấp, không khoảng trắng) được tiêu thụ
/// lần lượt bằng tiền tố (≥ 1 ký tự) của các mảnh theo thứ tự, được phép bỏ qua mảnh.
/// `bproot`, `bpr`, `bPRoot` → `brainProjectRoot`. Trả số mảnh đã dùng (0 = không khớp).
pub fn hump_match(query: &str, name: &str) -> usize {
    if name.contains(char::is_whitespace) {
        return 0;
    }
    let pieces: Vec<Vec<char>> = split_ident(name).iter().map(|p| fold(p).chars().collect()).collect();
    let q: Vec<char> = query.chars().collect();
    if q.is_empty() || q.len() > 64 || pieces.len() < 2 {
        return 0;
    }
    fn go(q: &[char], pieces: &[Vec<char>], pi: usize, used: usize, budget: &mut u32) -> usize {
        if q.is_empty() {
            return used;
        }
        if pi >= pieces.len() || *budget == 0 {
            return 0;
        }
        *budget -= 1;
        let p = &pieces[pi];
        let mut k = 0;
        while k < p.len() && k < q.len() && p[k] == q[k] {
            k += 1;
        }
        for take in (1..=k).rev() {
            let r = go(&q[take..], pieces, pi + 1, used + 1, budget);
            if r > 0 {
                return r;
            }
        }
        go(q, pieces, pi + 1, used, budget)
    }
    let mut budget = 4000;
    go(&q, &pieces, 0, 0, &mut budget)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn humps() {
        assert_eq!(hump_match("bproot", "brainProjectRoot"), 3);
        assert_eq!(hump_match("bpr", "brainProjectRoot"), 2); // b(rain) + pr(oject): tiền tố dài nhất trước
        assert_eq!(hump_match("bpror", "brainProjectRoot"), 3); // b + pro + r
        assert_eq!(hump_match("bpjr", "brainProjectRoot"), 0); // `j` không là tiền tố mảnh nào
        assert_eq!(hump_match("projroot", "brainProjectRoot"), 2);
        assert_eq!(hump_match("bx", "brainProjectRoot"), 0);
        assert_eq!(hump_match("p", "p"), 0);
        assert_eq!(hump_match("ab", "Tiêu đề mục"), 0);
    }
    #[test]
    fn folding_and_splitting() {
        assert_eq!(fold("Đăng NHẬP"), "dang nhap");
        assert_eq!(split_ident("brainProjectRoot"), vec!["brain", "Project", "Root"]);
        assert_eq!(split_ident("HTTPServer_v2"), vec!["HTTP", "Server", "v2"]);
        assert_eq!(name_tokens("WorkflowGraph"), vec!["workflow", "graph"]);
        assert_eq!(query_tokens("tìm hàm xử lý đăng nhập"), vec!["xu", "ly", "dang", "nhap"]);
        assert!(within_one_edit("workflow", "workflwo"));
        assert!(within_one_edit("graph", "grap"));
        assert!(!within_one_edit("graph", "grp"));
        assert!(fuzzy_score("wfg", "WorkflowGraph") > fuzzy_score("wfg", "awfulgadget"));
        assert_eq!(fuzzy_score("xyz", "WorkflowGraph"), 0.0);
    }
}
