import temml from "temml";

/**
 * LaTeX -> MathML để hiển thị công thức trong khung chat (WebView của Word/Mac đều vẽ được MathML).
 * Chỉ nhận kết quả là một phần tử <math> sạch; công thức sai thì trả undefined để giữ nguyên chữ gốc.
 */
export function mathToHtml(latex: string, display: boolean): string | undefined {
  try {
    const html = temml.renderToString(latex.replace(/(^|[^\\A-Za-z])(ce|pu)\{/g, "$1\\$2{"), { displayMode: display, throwOnError: true, trust: false });
    if (!html.startsWith("<math") || /<script|<iframe|<object|<embed|\son[a-z]+\s*=|javascript:/i.test(html)) return undefined;
    return html;
  } catch {
    return undefined;
  }
}
