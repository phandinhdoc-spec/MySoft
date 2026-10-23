import { Fragment, useEffect, useState, type ReactNode } from "react";
import { splitMath } from "@pvta/shared";
import { parseCitation } from "./office/goto";

/** Thư viện vẽ công thức chỉ tải khi trong tin nhắn có công thức (panel mở nhanh hơn). */
let mathLib: typeof import("./mathRender") | undefined;
let mathLoading: Promise<void> | undefined;

/** Công thức: MathML do temml sinh từ LaTeX đã được thoát ký tự (không phải chữ của model đưa thẳng vào HTML). */
function MathView({ latex, display }: { latex: string; display: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (mathLib) return;
    mathLoading ??= import("./mathRender").then((m) => {
      mathLib = m;
    });
    let live = true;
    void mathLoading.then(() => live && tick((n) => n + 1)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const html = mathLib?.mathToHtml(latex, display);
  if (!html) return <code className="md-math-raw">{display ? `$$${latex}$$` : `$${latex}$`}</code>;
  const Tag = display ? "div" : "span";
  return <Tag className={display ? "md-math md-math-block" : "md-math"} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Hiển thị Markdown cơ bản (đề mục, danh sách, khối mã, đậm/nghiêng/mã) bằng phần tử React,
 * không dùng innerHTML: chữ từ model không bao giờ được chạy như HTML.
 */
export function Markdown({ text, onCite }: { text: string; onCite?: (ref: string) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/\n{3,}/g, "\n\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push(<pre key={key++} className="md-code">{body.join("\n")}</pre>);
      continue;
    }
    // Công thức nhiều dòng giữa hai dấu $$.
    if (/^\s*\$\$\s*$/.test(line)) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*\$\$\s*$/.test(lines[j]!)) body.push(lines[j++]!);
      if (j < lines.length) {
        blocks.push(<MathView key={key++} latex={body.join("\n").trim()} display />);
        i = j + 1;
        continue;
      }
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<p key={key++} className={`md-h md-h${h[1]!.length}`}>{inline(h[2]!)}</p>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) {
        items.push(<li key={items.length}>{inline(lines[i]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={key++}>
        {para.map((l, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(l, onCite)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="md">{blocks}</div>;
}

function inline(s: string, onCite?: (ref: string) => void): ReactNode[] {
  // Công thức trước (trong công thức có thể có * hay _), phần chữ còn lại mới xử lý đậm/nghiêng/mã.
  if (s.includes("$") || s.includes("\\(") || s.includes("\\[") || s.includes("\\")) {
    const segs = splitMath(s);
    if (segs.some((g) => g.kind === "math")) {
      return segs.flatMap<ReactNode>((g, i) => (g.kind === "math" ? [<MathView key={`m${i}`} latex={g.latex} display={g.display} />] : inlineText(g.text, onCite)));
    }
  }
  return inlineText(s, onCite);
}

function inlineText(s: string, onCite?: (ref: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|\[[^\[\]`]{2,80}\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("[")) {
      // Nguồn trích từ tài liệu ([Đoạn 12], [Slide 3], [Sheet1!A5:F20]): bấm để tới đúng chỗ.
      const refs = onCite ? parseCitation(t.slice(1, -1)) : undefined;
      if (refs) {
        out.push(
          <span key={k++} className="cite-group">
            [
            {refs.map((r, i) => (
              <Fragment key={i}>
                {i > 0 && "; "}
                <button type="button" className="cite" title={r} onClick={() => onCite!(r)}>
                  {r}
                </button>
              </Fragment>
            ))}
            ]
          </span>,
        );
      } else out.push(t);
    } else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Bỏ ký hiệu Markdown để chèn chữ thuần vào văn bản. */
export function plainText(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/^```\w*\s*$/gm, "")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
