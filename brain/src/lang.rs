//! Trích ký hiệu (tên, loại, dòng bắt đầu–kết thúc, phạm vi cha) và import từ mã nguồn,
//! không cần công cụ ngoài. Thuật toán: một lượt lexer đếm ngoặc (bỏ qua chuỗi, chú thích,
//! regex JS) cho ngôn ngữ dùng ngoặc nhọn; thụt lề cho Python/Ruby/Lua; cấp tiêu đề cho Markdown/Typst.
//! Đây là trích xuất theo mẫu, không phải trình phân tích cú pháp đầy đủ.

use regex::Regex;
use std::sync::OnceLock;

#[derive(Clone, Debug, PartialEq)]
pub struct Sym {
    pub name: String,
    pub kind: String,
    pub line: u32,
    pub end: u32,
    pub scope: String,
    pub exported: bool,
    pub sig: String,
}

pub struct Parsed {
    pub lines: u32,
    pub syms: Vec<Sym>,
    pub imports: Vec<String>,
}

/// Ngôn ngữ theo phần mở rộng/tên tệp. None = không lập chỉ mục.
pub fn lang_of(path: &str) -> Option<&'static str> {
    let name = path.rsplit('/').next().unwrap_or(path);
    let lower = name.to_ascii_lowercase();
    if [
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock", "composer.lock",
        "gemfile.lock", "bun.lockb",
    ]
    .contains(&lower.as_str())
        || lower.ends_with(".min.js")
        || lower.ends_with(".min.css")
        || lower.ends_with(".map")
        || lower.ends_with(".d.ts.map")
    {
        return None;
    }
    match lower.as_str() {
        "makefile" | "gnumakefile" | "justfile" => return Some("make"),
        "dockerfile" | "containerfile" => return Some("docker"),
        _ => {}
    }
    let ext = lower.rsplit_once('.').map(|x| x.1)?;
    Some(match ext {
        "ts" | "tsx" | "mts" | "cts" => "ts",
        "js" | "jsx" | "mjs" | "cjs" | "vue" | "svelte" => "js",
        "rs" => "rust",
        "py" | "pyi" => "python",
        "go" => "go",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "cs" => "csharp",
        "swift" => "swift",
        "dart" => "dart",
        "scala" => "scala",
        "c" | "h" => "c",
        "cc" | "cpp" | "cxx" | "hpp" | "hh" | "hxx" | "m" | "mm" => "cpp",
        "rb" => "ruby",
        "php" => "php",
        "lua" => "lua",
        "css" | "scss" | "sass" | "less" => "css",
        "sh" | "bash" | "zsh" | "command" => "shell",
        "ps1" | "psm1" => "powershell",
        "sql" => "sql",
        "md" | "markdown" | "mdx" => "markdown",
        "typ" => "typst",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "json" | "jsonc" => "json",
        "html" | "htm" | "xml" | "svg" => "markup",
        "txt" | "csv" | "tsv" | "ini" | "cfg" | "conf" | "gs" | "tex" | "rst" | "adoc" => {
            if ext == "gs" {
                "js"
            } else {
                "text"
            }
        }
        _ => return None,
    })
}

fn brace_lang(lang: &str) -> bool {
    matches!(
        lang,
        "ts" | "js" | "rust" | "go" | "java" | "kotlin" | "csharp" | "swift" | "dart" | "scala" | "c" | "cpp"
            | "php" | "css" | "shell" | "powershell" | "typst"
    )
}

/// Kết quả lexer: độ sâu ngoặc ở đầu mỗi dòng và các cặp ngoặc (dòng mở, ký tự, độ sâu trước khi mở, dòng đóng).
struct Lex {
    depth: Vec<u32>,
    pairs: Vec<(u32, u8, u32, u32)>,
}

fn lex(text: &str, lang: &str) -> Lex {
    let b = text.as_bytes();
    let slash = !matches!(lang, "shell" | "powershell");
    let hash = matches!(lang, "shell" | "powershell" | "php");
    let backtick = matches!(lang, "ts" | "js" | "go");
    let template = matches!(lang, "ts" | "js");
    let multiline_dq = matches!(lang, "rust" | "shell" | "typst" | "php" | "powershell");
    let js_regex = matches!(lang, "ts" | "js");
    let rust = lang == "rust";
    let css = lang == "css";
    let mut depth_at = vec![0u32];
    let mut stack: Vec<(u32, u8, u32, usize)> = Vec::new(); // (dòng, ký tự, độ sâu, chỉ số trong pairs)
    let mut pairs: Vec<(u32, u8, u32, u32)> = Vec::new();
    // Ngăn template literal: mỗi phần tử là độ sâu stack khi vào `${`.
    let mut tmpl: Vec<usize> = Vec::new();
    let mut line = 0u32;
    let mut i = 0usize;
    let mut last_sig: u8 = b'\n'; // ký tự có nghĩa gần nhất, để đoán regex JS
    macro_rules! newline {
        () => {{
            line += 1;
            depth_at.push(stack.len() as u32);
        }};
    }
    'outer: while i < b.len() {
        let c = b[i];
        if c == b'\n' {
            newline!();
            i += 1;
            continue;
        }
        // chú thích
        if slash && c == b'/' && b.get(i + 1) == Some(&b'/') && !(css && i > 0 && b[i - 1] == b':') {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if slash && c == b'/' && b.get(i + 1) == Some(&b'*') {
            i += 2;
            while i < b.len() && !(b[i] == b'*' && b.get(i + 1) == Some(&b'/')) {
                if b[i] == b'\n' {
                    newline!();
                }
                i += 1;
            }
            i += 2;
            continue;
        }
        if hash && c == b'#' && (i == 0 || b[i - 1].is_ascii_whitespace()) && b.get(i + 1) != Some(&b'{') {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        // regex JS: `/` sau toán tử hoặc đầu biểu thức
        if js_regex && c == b'/' && (b"(,=:[!&|?{};+-*%~^\n".contains(&last_sig) || (last_sig == b'a' && after_keyword(b, i))) {
            let mut j = i + 1;
            let mut class = false;
            while j < b.len() && b[j] != b'\n' {
                match b[j] {
                    b'\\' => j += 1,
                    b'[' => class = true,
                    b']' => class = false,
                    b'/' if !class => {
                        i = j + 1;
                        last_sig = b'a';
                        continue 'outer;
                    }
                    _ => {}
                }
                j += 1;
            }
            // không đóng trên cùng dòng: coi là phép chia
        }
        // chuỗi
        let quote = c == b'"'
            || (c == b'\'' && !rust)
            || (c == b'`' && backtick)
            || (rust && c == b'\'' && (b.get(i + 1) == Some(&b'\\') || b.get(i + 2) == Some(&b'\'')));
        if quote {
            let q = c;
            i += 1;
            while i < b.len() {
                match b[i] {
                    b'\\' => i += 2,
                    x if x == q => {
                        i += 1;
                        break;
                    }
                    b'$' if q == b'`' && template && b.get(i + 1) == Some(&b'{') => {
                        // vào biểu thức trong template; quay lại chế độ mã
                        tmpl.push(stack.len());
                        stack.push((line, b'{', stack.len() as u32, usize::MAX));
                        i += 2;
                        last_sig = b'{';
                        continue 'outer;
                    }
                    b'\n' => {
                        if !(q == b'`' || (q == b'"' && multiline_dq)) {
                            break; // chuỗi một dòng không đóng: để vòng ngoài xử lý xuống dòng
                        }
                        newline!();
                        i += 1;
                    }
                    _ => i += 1,
                }
            }
            last_sig = b'a';
            continue;
        }
        match c {
            b'{' | b'[' | b'(' => {
                let d = stack.len() as u32;
                pairs.push((line, c, d, u32::MAX));
                stack.push((line, c, d, pairs.len() - 1));
            }
            b'}' | b']' | b')' => {
                if c == b'}' && tmpl.last() == Some(&(stack.len().saturating_sub(1))) && stack.last().is_some_and(|s| s.3 == usize::MAX) {
                    // đóng `${ ... }`: tiếp tục chuỗi template
                    tmpl.pop();
                    stack.pop();
                    i += 1;
                    while i < b.len() {
                        match b[i] {
                            b'\\' => i += 2,
                            b'`' => {
                                i += 1;
                                break;
                            }
                            b'$' if b.get(i + 1) == Some(&b'{') => {
                                tmpl.push(stack.len());
                                stack.push((line, b'{', stack.len() as u32, usize::MAX));
                                i += 2;
                                break;
                            }
                            b'\n' => {
                                newline!();
                                i += 1;
                            }
                            _ => i += 1,
                        }
                    }
                    last_sig = b'a';
                    continue;
                }
                let want = match c {
                    b'}' => b'{',
                    b']' => b'[',
                    _ => b'(',
                };
                // Phục hồi khi ngoặc lệch: tìm ngoặc mở tương ứng gần nhất.
                if let Some(pos) = stack.iter().rposition(|s| s.1 == want) {
                    while stack.len() > pos + 1 {
                        let s = stack.pop().unwrap();
                        if s.3 != usize::MAX {
                            pairs[s.3].3 = line;
                        }
                    }
                    let s = stack.pop().unwrap();
                    if s.3 != usize::MAX {
                        pairs[s.3].3 = line;
                    }
                }
            }
            _ => {}
        }
        if !c.is_ascii_whitespace() {
            last_sig = if c.is_ascii_alphanumeric() || c == b'_' || c == b'$' || c == b')' || c == b']' || c == b'}' { b'a' } else { c };
        }
        i += 1;
    }
    let last = line;
    for p in pairs.iter_mut() {
        if p.3 == u32::MAX {
            p.3 = last;
        }
    }
    Lex { depth: depth_at, pairs }
}

/// `/` đứng sau từ khóa (`return /x/`) là regex, không phải phép chia.
fn after_keyword(b: &[u8], i: usize) -> bool {
    let mut j = i;
    while j > 0 && (b[j - 1] == b' ' || b[j - 1] == b'\t') {
        j -= 1;
    }
    let end = j;
    while j > 0 && (b[j - 1].is_ascii_alphanumeric() || b[j - 1] == b'_' || b[j - 1] == b'$') {
        j -= 1;
    }
    matches!(&b[j..end], b"return" | b"typeof" | b"case" | b"in" | b"of" | b"delete" | b"void" | b"throw" | b"new" | b"yield" | b"await" | b"else" | b"do")
}

struct Pat {
    re: Regex,
    kind: &'static str,
    /// Chỉ khớp khi dòng nằm trực tiếp trong thân một lớp/struct/impl.
    member: bool,
    /// Chỉ khớp ở độ sâu 0.
    top: bool,
}

fn pat(re: &str, kind: &'static str) -> Pat {
    Pat { re: Regex::new(re).expect("regex"), kind, member: false, top: false }
}
fn member(re: &str, kind: &'static str) -> Pat {
    Pat { member: true, ..pat(re, kind) }
}
fn top(re: &str, kind: &'static str) -> Pat {
    Pat { top: true, ..pat(re, kind) }
}

const ID: &str = r"[A-Za-z_$][\w$]*";

fn patterns(lang: &str) -> &'static [Pat] {
    macro_rules! cached {
        ($name:ident, $build:expr) => {{
            static $name: OnceLock<Vec<Pat>> = OnceLock::new();
            $name.get_or_init(|| $build).as_slice()
        }};
    }
    match lang {
        "ts" | "js" => cached!(TS, {
            let m = r"(?:(?:public|private|protected|static|readonly|async|override|abstract|declare|accessor|get|set)\s+)*";
            vec![
                pat(&format!(r"^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*({ID})"), "function"),
                pat(&format!(r"^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+({ID})"), "class"),
                pat(&format!(r"^(?:export\s+)?(?:declare\s+)?interface\s+({ID})"), "interface"),
                pat(&format!(r"^(?:export\s+)?(?:declare\s+)?type\s+({ID})\s*(?:<[^=]*>)?\s*="), "type"),
                pat(&format!(r"^(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+({ID})"), "enum"),
                pat(&format!(r"^(?:export\s+)?(?:declare\s+)?namespace\s+({ID})"), "module"),
                pat(&format!(r"^(?:export\s+)?(?:const|let|var)\s+({ID})\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]+)?=>|{ID}\s*=>)"), "function"),
                pat(&format!(r"^(?:export\s+)?(?:const|let|var)\s+({ID})\s*(?::[^=]+)?=\s*(?:React\.)?(?:memo|forwardRef|lazy)\s*\("), "function"),
                top(&format!(r"^(?:export\s+)?(?:const|let|var)\s+({ID})"), "const"),
                pat(r#"^(?:describe|it|test)(?:\.\w+)?\s*\(\s*['"`]([^'"`]{1,120})"#, "test"),
                member(&format!(r"^{m}(#?{ID})\s*[?!]?\s*(?::[^=;(]+)?=\s*(?:async\s+)?(?:\([^)]*\)|{ID})\s*(?::[^=]+)?=>"), "method"),
                member(&format!(r"^{m}(#?{ID})\s*[?!]?\s*(?:<[^>]*>)?\s*\([^;]*$|^{m}(#?{ID})\s*[?!]?\s*(?:<[^>]*>)?\s*\(.*\)\s*(?::[^{{;]+)?\{{"), "method"),
                member(&format!(r"^{m}(#?{ID})\s*[?!]?\s*(?::|=|;)"), "property"),
            ]
        }),
        "rust" => cached!(RS, {
            let v = r"(?:pub(?:\([^)]*\))?\s+)?";
            vec![
                pat(&format!(r#"^{v}(?:default\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?(?:extern\s+"[^"]*"\s+)?fn\s+(\w+)"#), "function"),
                pat(&format!(r"^{v}struct\s+(\w+)"), "struct"),
                pat(&format!(r"^{v}enum\s+(\w+)"), "enum"),
                pat(&format!(r"^{v}union\s+(\w+)"), "struct"),
                pat(&format!(r"^{v}(?:unsafe\s+)?trait\s+(\w+)"), "trait"),
                pat(&format!(r"^{v}type\s+(\w+)"), "type"),
                pat(&format!(r"^{v}mod\s+(\w+)"), "module"),
                pat(r"^(?:#\[macro_export\]\s*)?macro_rules!\s*(\w+)", "macro"),
                pat(&format!(r"^{v}(?:const|static)\s+(?:mut\s+)?([A-Z_][A-Z0-9_]*)\s*:"), "const"),
                pat(r"^(?:unsafe\s+)?impl\s*(?:<[^{]*?>)?\s*((?:[\w:]+(?:<[^{]*?>)?\s+for\s+)?[\w:]+)", "impl"),
            ]
        }),
        "python" => cached!(PY, {
            vec![
                pat(r"^(?:async\s+)?def\s+(\w+)", "function"),
                pat(r"^class\s+(\w+)", "class"),
                top(r"^([A-Z][A-Z0-9_]+)\s*(?::[^=]+)?=", "const"),
            ]
        }),
        "go" => cached!(GO, {
            vec![
                pat(r"^func\s+\([^)]*\)\s*(\w+)", "method"),
                pat(r"^func\s+(\w+)", "function"),
                pat(r"^type\s+(\w+)\s+struct\b", "struct"),
                pat(r"^type\s+(\w+)\s+interface\b", "interface"),
                pat(r"^type\s+(\w+)", "type"),
                top(r"^(?:const|var)\s+(\w+)", "const"),
            ]
        }),
        "java" | "kotlin" | "csharp" | "swift" | "dart" | "scala" => cached!(JVM, {
            let m = r"(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|override|virtual|async|data|inline|suspend|partial|readonly|extern|unsafe|new|synchronized|native|fileprivate|mutating|required|convenience|lateinit|private\(set\)|@\w+(?:\([^)]*\))?)\s+)*";
            vec![
                pat(&format!(r"^{m}(?:class|interface|enum|record|struct|object|protocol|extension|trait|actor|mixin)\s+(\w+)"), "class"),
                pat(&format!(r"^{m}(?:fun|func|def)\s+(?:<[^>]*>\s*)?(?:\w+\.)?(\w+)"), "function"),
                member(&format!(r"^{m}(?:[\w<>\[\],.?]+\s+)+(\w+)\s*\([^;]*$|^{m}(\w+)\s*\([^;]*\)\s*\{{|^{m}(init)\s*\("), "method"),
            ]
        }),
        "c" | "cpp" => cached!(C, {
            vec![
                pat(r"^(?:typedef\s+)?(?:struct|union)\s+(\w+)\s*\{?", "struct"),
                pat(r"^(?:typedef\s+)?enum\s+(?:class\s+)?(\w+)", "enum"),
                pat(r"^(?:template\s*<[^>]*>\s*)?class\s+(\w+)", "class"),
                pat(r"^namespace\s+(\w+)", "module"),
                pat(r"^#\s*define\s+(\w+)", "macro"),
                pat(r"^typedef\s+[^;]*?(\w+)\s*;", "type"),
                top(r"^(?:[\w\*&:<>,~]+\s+)+\**(\w[\w:~]*)\s*\([^;]*$", "function"),
                member(r"^(?:(?:virtual|static|inline|explicit|constexpr)\s+)*(?:[\w\*&:<>,~]+\s+)*\**(~?\w+)\s*\([^;]*\)\s*(?:const)?\s*(?:override)?\s*\{", "method"),
            ]
        }),
        "php" => cached!(PHP, {
            vec![
                pat(r"^(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+(\w+)", "class"),
                pat(r"^(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(\w+)", "function"),
            ]
        }),
        "ruby" => cached!(RB, {
            vec![pat(r"^def\s+(?:self\.)?([\w?!=]+)", "function"), pat(r"^class\s+([\w:]+)", "class"), pat(r"^module\s+([\w:]+)", "module")]
        }),
        "lua" => cached!(LUA, { vec![pat(r"^(?:local\s+)?function\s+([\w.:]+)", "function")] }),
        "shell" => cached!(SH, {
            vec![pat(r"^(?:function\s+)?([\w.:-]+)\s*\(\s*\)\s*\{?", "function"), pat(r"^function\s+([\w.:-]+)", "function")]
        }),
        "powershell" => cached!(PS, { vec![pat(r"(?i)^function\s+([\w-]+)", "function"), pat(r"(?i)^class\s+(\w+)", "class")] }),
        "css" => cached!(CSS, {
            vec![
                top(r"^(@(?:media|supports|keyframes|layer|container|font-face)[^{]*?)\s*\{", "selector"),
                top(r"^([^@\s{}][^{};]*?)\s*\{", "selector"),
                pat(r"^(--[\w-]+)\s*:", "variable"),
                pat(r"^\$([\w-]+)\s*:", "variable"),
                pat(r"^@mixin\s+([\w-]+)", "function"),
            ]
        }),
        "sql" => cached!(SQL, {
            vec![pat(r"(?i)^create\s+(?:or\s+replace\s+)?(?:temporary\s+)?(?:unique\s+)?(table|view|function|procedure|index|trigger|type)\s+(?:if\s+not\s+exists\s+)?([\w.\x22`]+)", "sql")]
        }),
        "typst" => cached!(TYP, { vec![pat(r"^#let\s+([\w-]+)\s*\(", "function"), top(r"^#let\s+([\w-]+)", "const")] }),
        "toml" => cached!(TOML, { vec![pat(r"^\[\[?\s*([^\]]+?)\s*\]\]?\s*$", "section")] }),
        "yaml" => cached!(YAML, { vec![pat(r"^([A-Za-z_][\w.-]*)\s*:", "key")] }),
        "make" => cached!(MK, { vec![pat(r"^([\w.-]+)\s*:(?:[^=]|$)", "target")] }),
        _ => &[],
    }
}

const KEYWORDS: &[&str] = &[
    "if", "for", "while", "switch", "catch", "return", "function", "new", "super", "else", "do", "try", "typeof",
    "await", "throw", "case", "delete", "void", "yield", "import", "export", "sizeof", "elif", "with", "match",
    "foreach", "using", "lock", "fixed", "when", "guard", "defer", "repeat", "assert", "print", "println",
];

fn sig_of(line: &str) -> String {
    let t: String = line.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() > 140 {
        t.chars().take(139).collect::<String>() + "…"
    } else {
        t
    }
}

fn exported(lang: &str, line: &str, name: &str, depth: u32) -> bool {
    match lang {
        "ts" | "js" => line.starts_with("export ") || line.starts_with("export\t"),
        "rust" => line.starts_with("pub ") || line.starts_with("pub("),
        "go" => name.chars().next().is_some_and(|c| c.is_uppercase()),
        "python" => depth == 0 && !name.starts_with('_'),
        "java" | "kotlin" | "csharp" | "swift" | "dart" | "scala" | "php" => {
            !line.contains("private ") && !line.contains("fileprivate ")
        }
        _ => depth == 0,
    }
}

/// Dòng kết thúc theo ngoặc cho ký hiệu ở dòng `l` (0-based).
fn brace_end(lx: &Lex, lines: &[&str], l: usize, is_container: bool) -> (u32, Option<(u32, u32)>) {
    let d = lx.depth[l];
    let limit = (l + 12).min(lines.len().saturating_sub(1));
    // dòng kết thúc câu lệnh ở cùng độ sâu (vd. `type X = A | B;`, hàm khai báo không thân)
    let mut stop = None;
    for k in l..=limit {
        let end_depth = lx.depth.get(k + 1).copied().unwrap_or(0);
        let t = lines[k].trim_end();
        if end_depth == d && (t.ends_with(';') || t.ends_with(',') || (k > l && t.is_empty())) {
            stop = Some(k);
            break;
        }
    }
    let upto = stop.unwrap_or(limit) as u32;
    let start = lx.pairs.partition_point(|p| (p.0 as usize) < l);
    let mut fallback = None;
    for p in &lx.pairs[start..] {
        if p.0 > upto {
            break;
        }
        if p.2 != d {
            continue;
        }
        if p.1 == b'{' {
            return (p.3, Some((d + 1, p.3)));
        }
        if fallback.is_none() && !is_container {
            fallback = Some(p.3);
        }
    }
    let end = match (fallback, stop) {
        (Some(f), Some(s)) => f.max(s as u32),
        (Some(f), None) => f,
        (None, Some(s)) => s as u32,
        (None, None) => l as u32,
    };
    (end, None)
}

fn indent_of(s: &str) -> usize {
    s.chars().take_while(|c| *c == ' ' || *c == '\t').map(|c| if c == '\t' { 4 } else { 1 }).sum()
}

fn indent_end(lines: &[&str], l: usize, with_end_kw: bool) -> u32 {
    let base = indent_of(lines[l]);
    let mut last = l;
    let mut open_paren = lines[l].matches('(').count() as i32 - lines[l].matches(')').count() as i32;
    for (k, raw) in lines.iter().enumerate().skip(l + 1) {
        let t = raw.trim();
        if t.is_empty() || t.starts_with('#') && !with_end_kw {
            continue;
        }
        if open_paren > 0 {
            open_paren += raw.matches('(').count() as i32 - raw.matches(')').count() as i32;
            last = k;
            continue;
        }
        if indent_of(raw) <= base {
            if with_end_kw && (t == "end" || t.starts_with("end ") || t.starts_with("end.") || t.starts_with("end)")) {
                return k as u32;
            }
            break;
        }
        last = k;
    }
    last as u32
}

const CONTAINERS: &[&str] = &["class", "interface", "struct", "trait", "impl", "enum", "module"];

/// Phân tích một tệp. `lang` lấy từ `lang_of`.
pub fn parse(lang: &str, text: &str) -> Parsed {
    let lines: Vec<&str> = text.lines().collect();
    let n = lines.len();
    let mut syms: Vec<Sym> = Vec::new();
    let imports = imports(lang, text);
    match lang {
        "markdown" | "typst" => {
            let mut fence = false;
            let mut heads: Vec<(usize, usize, String)> = Vec::new();
            for (l, raw) in lines.iter().enumerate() {
                let t = raw.trim_start();
                if lang == "markdown" && (t.starts_with("```") || t.starts_with("~~~")) {
                    fence = !fence;
                    continue;
                }
                if fence {
                    continue;
                }
                let mark = if lang == "markdown" { '#' } else { '=' };
                if raw.starts_with(mark) {
                    let level = raw.chars().take_while(|c| *c == mark).count();
                    let rest = &raw[level..];
                    if level <= 6 && (rest.starts_with(' ') || rest.starts_with('\t')) {
                        let title = rest.trim().trim_end_matches(mark).trim();
                        if !title.is_empty() {
                            heads.push((l, level, title.to_string()));
                        }
                    }
                }
            }
            for (i, (l, level, title)) in heads.iter().enumerate() {
                let end = heads[i + 1..].iter().find(|h| h.1 <= *level).map(|h| h.0.saturating_sub(1)).unwrap_or(n.saturating_sub(1));
                syms.push(Sym {
                    name: title.chars().take(120).collect(),
                    kind: format!("h{level}"),
                    line: *l as u32 + 1,
                    end: end as u32 + 1,
                    scope: String::new(),
                    exported: true,
                    sig: sig_of(lines[*l]),
                });
            }
            if lang == "markdown" {
                return finish(lines.len(), syms, imports);
            }
        }
        _ => {}
    }
    let pats = patterns(lang);
    if pats.is_empty() {
        return finish(n, syms, imports);
    }
    let lx = if brace_lang(lang) { Some(lex(text, lang)) } else { None };
    // ngăn chứa đang mở: (độ sâu thân, dòng đóng, loại)
    let mut containers: Vec<(u32, u32, String)> = Vec::new();
    let mut py_classes: Vec<(usize, u32)> = Vec::new(); // (thụt lề, dòng cuối) cho Python
    for l in 0..n {
        let raw = lines[l];
        let t = raw.trim_start();
        if t.is_empty() || t.starts_with("//") || t.starts_with("/*") || t.starts_with('*') || (t.starts_with('#') && matches!(lang, "python" | "ruby" | "shell" | "powershell" | "yaml" | "toml" | "make" | "docker" | "php")) {
            continue;
        }
        let depth = lx.as_ref().map(|x| x.depth[l]).unwrap_or_else(|| indent_of(raw) as u32 / 2);
        while containers.last().is_some_and(|c| c.1 < l as u32 || (c.1 == l as u32 && t.starts_with('}'))) {
            containers.pop();
        }
        while py_classes.last().is_some_and(|c| c.1 < l as u32) {
            py_classes.pop();
        }
        let in_member = containers.last().is_some_and(|c| c.0 == depth);
        for p in pats {
            if p.member && !in_member {
                continue;
            }
            if p.top && depth != 0 {
                continue;
            }
            // ở trong thân lớp, chỉ mẫu thành viên và mẫu lớp lồng được dùng
            if in_member && !p.member && !CONTAINERS.contains(&p.kind) && p.kind != "function" && p.kind != "test" {
                continue;
            }
            let Some(cap) = p.re.captures(t) else { continue };
            let Some(m) = cap.iter().skip(1).flatten().last() else { continue };
            let mut name = m.as_str().trim().to_string();
            let mut kind = p.kind.to_string();
            if kind == "sql" {
                name = cap.get(2).map(|x| x.as_str().trim_matches(|c| c == '"' || c == '`').to_string()).unwrap_or_default();
                kind = cap.get(1).map(|x| x.as_str().to_ascii_lowercase()).unwrap_or_default();
            }
            // Mẫu có từ khóa khai báo rõ (`fn`, `def`, `function`…) không cần lọc: `fn new` là hợp lệ.
            // Chỉ mẫu chung (thành viên / cấp đỉnh kiểu C) mới có thể khớp nhầm `if (`, `return (`.
            if name.is_empty() || ((p.member || p.top) && KEYWORDS.contains(&name.as_str())) {
                continue;
            }
            if kind == "selector" {
                name = sig_of(&name);
            }
            if lang == "c" || lang == "cpp" {
                if kind == "function" && (t.ends_with(';') || name == "if" || t.contains('=') && !t.contains("operator")) {
                    continue;
                }
            }
            if (lang == "ts" || lang == "js") && kind == "function" && in_member {
                kind = "method".into();
            }
            if matches!(lang, "rust" | "java" | "kotlin" | "csharp" | "swift" | "dart" | "scala" | "php") && kind == "function" && in_member {
                kind = "method".into();
            }
            if lang == "python" && kind == "function" && py_classes.last().is_some_and(|c| indent_of(raw) > c.0) {
                kind = "method".into();
            }
            if (lang == "ts" || lang == "js") && (kind == "function" || kind == "const") && name.chars().next().is_some_and(|c| c.is_uppercase()) && (t.contains("=>") || kind == "function") && (text.contains("</") || text.contains("/>")) {
                kind = "component".into();
            }
            let is_container = CONTAINERS.contains(&kind.as_str());
            let end = match &lx {
                Some(x) => {
                    let (e, body) = brace_end(x, &lines, l, is_container);
                    if let (true, Some((bd, close))) = (is_container, body) {
                        containers.push((bd, close, kind.clone()));
                    }
                    e
                }
                None => match lang {
                    "python" => {
                        let e = indent_end(&lines, l, false);
                        if kind == "class" {
                            py_classes.push((indent_of(raw), e));
                        }
                        e
                    }
                    "ruby" | "lua" => indent_end(&lines, l, true),
                    "toml" | "yaml" | "make" => {
                        let mut e = l;
                        for (k, r) in lines.iter().enumerate().skip(l + 1) {
                            let tt = r.trim();
                            if lang == "toml" && tt.starts_with('[') || lang != "toml" && !r.starts_with(' ') && !r.starts_with('\t') && !tt.is_empty() && !tt.starts_with('#') {
                                break;
                            }
                            if !tt.is_empty() {
                                e = k;
                            }
                        }
                        e as u32
                    }
                    "sql" => (l..n).find(|k| lines[*k].contains(';')).unwrap_or(l) as u32,
                    _ => l as u32,
                },
            };
            if lang == "yaml" && indent_of(raw) != 0 {
                break;
            }
            syms.push(Sym {
                exported: exported(lang, t, &name, depth),
                name: name.chars().take(160).collect(),
                kind,
                line: l as u32 + 1,
                end: end.max(l as u32) + 1,
                scope: String::new(),
                sig: sig_of(t),
            });
            break;
        }
    }
    finish(n, syms, imports)
}

/// Sắp xếp và gán phạm vi cha theo khoảng dòng lồng nhau.
fn finish(n: usize, mut syms: Vec<Sym>, imports: Vec<String>) -> Parsed {
    syms.sort_by(|a, b| a.line.cmp(&b.line).then(b.end.cmp(&a.end)));
    let mut stack: Vec<(u32, u32, String)> = Vec::new();
    for s in syms.iter_mut() {
        while stack.last().is_some_and(|t| t.1 < s.line) {
            stack.pop();
        }
        // tiêu đề Markdown không lồng nhau theo khoảng (đã tính theo cấp)
        if let Some(t) = stack.last() {
            if t.0 < s.line || (t.0 == s.line && t.1 > s.end) {
                s.scope = t.2.clone();
            }
        }
        if s.end > s.line {
            stack.push((s.line, s.end, s.name.clone()));
        }
    }
    Parsed { lines: n as u32, syms, imports }
}

fn imports(lang: &str, text: &str) -> Vec<String> {
    static JS: OnceLock<Regex> = OnceLock::new();
    static PY: OnceLock<Regex> = OnceLock::new();
    static C: OnceLock<Regex> = OnceLock::new();
    static RS: OnceLock<Regex> = OnceLock::new();
    static CSS: OnceLock<Regex> = OnceLock::new();
    static TYP: OnceLock<Regex> = OnceLock::new();
    let re = match lang {
        "ts" | "js" => JS.get_or_init(|| {
            // `import 'x'` | `import/export … from 'x'` | `} from 'x'` (import nhiều dòng) | `require('x')`/`import('x')`.
            // `from` là bắt buộc với export: `export const a = 'chuỗi'` không phải import.
            Regex::new(r#"(?m)(?:^\s*import\s*|^\s*(?:import|export)\b[^'"\n;]*?\bfrom\s*|^\s*\}\s*from\s*|\b(?:require|import)\s*\(\s*)['"]([^'"\n]+)['"]"#).unwrap()
        }),
        "python" => PY.get_or_init(|| Regex::new(r"(?m)^\s*(?:from\s+(\.+[\w.]*|[\w.]+)\s+import|import\s+([\w.]+))").unwrap()),
        "c" | "cpp" => C.get_or_init(|| Regex::new(r#"(?m)^\s*#\s*(?:include|import)\s*"([^"]+)""#).unwrap()),
        "rust" => RS.get_or_init(|| Regex::new(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;").unwrap()),
        "css" => CSS.get_or_init(|| Regex::new(r#"(?m)^\s*@(?:import|use|forward)\s+(?:url\()?['"]([^'"]+)['"]"#).unwrap()),
        "typst" | "php" => TYP.get_or_init(|| Regex::new(r#"(?m)(?:#import|#include|\brequire_once|\brequire|\binclude_once|\binclude)\s*\(?\s*['"]([^'"]+)['"]"#).unwrap()),
        _ => return Vec::new(),
    };
    let mut out: Vec<String> = Vec::new();
    for cap in re.captures_iter(text) {
        if let Some(m) = cap.iter().skip(1).flatten().next() {
            let s = if lang == "rust" { format!("mod:{}", m.as_str()) } else { m.as_str().to_string() };
            if !out.contains(&s) && out.len() < 200 {
                out.push(s);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn names(p: &Parsed) -> Vec<(String, String, u32, u32, String)> {
        p.syms.iter().map(|s| (s.name.clone(), s.kind.clone(), s.line, s.end, s.scope.clone())).collect()
    }
    #[test]
    fn typescript_ranges_and_scopes() {
        let src = "import {a} from './a.js';\nexport class Runtime {\n private jobs=new Map();\n async ask(c:Chat){\n  const s=`x ${'}'} y`;\n  if(x){return /}/.test(s);}\n }\n}\nexport const brainRoot=(a:string)=>{\n return a;\n};\ntype X = A | B;\nexport function App(){ return <div/>; }\ndescribe('Brain host',()=>{\n it('works',()=>{});\n});\n";
        let p = parse("ts", src);
        let n = names(&p);
        assert!(n.contains(&("Runtime".into(), "class".into(), 2, 8, "".into())), "{n:?}");
        assert!(n.contains(&("jobs".into(), "property".into(), 3, 3, "Runtime".into())), "{n:?}");
        assert!(n.contains(&("ask".into(), "method".into(), 4, 7, "Runtime".into())), "{n:?}");
        assert!(n.contains(&("brainRoot".into(), "function".into(), 9, 11, "".into())), "{n:?}");
        assert!(n.contains(&("X".into(), "type".into(), 12, 12, "".into())), "{n:?}");
        assert!(n.contains(&("App".into(), "component".into(), 13, 13, "".into())), "{n:?}");
        assert!(n.contains(&("Brain host".into(), "test".into(), 14, 16, "".into())), "{n:?}");
        assert_eq!(p.imports, vec!["./a.js"]);
        assert!(p.syms.iter().find(|s| s.name == "Runtime").unwrap().exported);
    }
    #[test]
    fn rust_python_markdown() {
        let p = parse("rust", "mod text;\npub struct A { x: u8 }\nimpl A {\n    pub fn new() -> Self {\n        A { x: 'a' as u8 }\n    }\n}\nfn f<'a>(s: &'a str) {}\n");
        let n = names(&p);
        assert!(n.contains(&("new".into(), "method".into(), 4, 6, "A".into())), "{n:?}");
        assert!(n.contains(&("f".into(), "function".into(), 8, 8, "".into())), "{n:?}");
        assert_eq!(p.imports, vec!["mod:text"]);
        let p = parse("python", "from .x import y\nclass A:\n    def m(self):\n        return 1\n\n    def n(self):\n        pass\ndef top():\n    pass\n");
        let n = names(&p);
        assert!(n.contains(&("A".into(), "class".into(), 2, 7, "".into())), "{n:?}");
        assert!(n.contains(&("m".into(), "method".into(), 3, 4, "A".into())), "{n:?}");
        assert!(n.contains(&("top".into(), "function".into(), 8, 9, "".into())), "{n:?}");
        let p = parse("markdown", "# Tiêu đề\nx\n## Mục 1\n```\n# not\n```\n## Mục 2\n");
        let n = names(&p);
        assert_eq!(n.iter().map(|x| (x.0.as_str(), x.2, x.3)).collect::<Vec<_>>(), vec![("Tiêu đề", 1, 7), ("Mục 1", 3, 6), ("Mục 2", 7, 7)]);
        assert_eq!(n[1].4, "Tiêu đề");
    }
    #[test]
    fn js_imports_strict() {
        let src = "import './side.css';\nimport {\n  a,\n  b,\n} from './multi.js';\nexport { c } from \"./re.js\";\nexport const s = 'không phải import';\nconst m = await import('./lazy.js');\n";
        assert_eq!(parse("ts", src).imports, vec!["./side.css", "./multi.js", "./re.js", "./lazy.js"]);
    }
    /// Mọi mẫu của mọi ngôn ngữ phải biên dịch được (lỗi regex trước đây làm sập cả lần lập chỉ mục).
    #[test]
    fn every_language_parses() {
        let langs = [
            "ts", "js", "rust", "python", "go", "java", "kotlin", "csharp", "swift", "dart", "scala", "c", "cpp", "ruby",
            "php", "lua", "css", "shell", "powershell", "sql", "markdown", "typst", "toml", "yaml", "make", "docker",
            "json", "markup", "text",
        ];
        let sample = "function Foo() {\n  if (x) { return 1; }\n}\nclass Bar {\n}\n# Head\n[section]\nkey: 1\n";
        for l in langs {
            let _ = parse(l, sample);
        }
    }
    #[test]
    fn languages() {
        assert_eq!(lang_of("a/b/App.tsx"), Some("ts"));
        assert_eq!(lang_of("package-lock.json"), None);
        assert_eq!(lang_of("x.min.js"), None);
        assert_eq!(lang_of("Makefile"), Some("make"));
        assert_eq!(lang_of("image.png"), None);
    }
}
