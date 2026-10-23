/** Mở liên kết bằng trình duyệt ngoài (Office chặn điều hướng trong khung add-in). */
export function openUrl(url: string): void {
  try {
    const ui = (Office.context as unknown as { ui?: { openBrowserWindow?: (u: string) => void } }).ui;
    if (ui?.openBrowserWindow) return ui.openBrowserWindow(url);
  } catch {
    /* dùng window.open */
  }
  window.open(url, "_blank", "noopener");
}

/** Chép vào bộ nhớ tạm; khung add-in đôi khi chặn Clipboard API nên có cách dự phòng. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Tên tệp đang mở trong cửa sổ Office này (chỉ tên tệp, không gửi đường dẫn đầy đủ). Chưa lưu hoặc không biết thì để trống. */
export function currentDocName(): string | undefined {
  try {
    const url = (globalThis as unknown as { Office?: { context?: { document?: { url?: string } } } }).Office?.context?.document?.url;
    if (!url) return undefined;
    const clean = decodeURIComponent(url.split(/[?#]/)[0] ?? "");
    const name = clean.split(/[\\/]/).filter(Boolean).pop();
    return name || undefined;
  } catch {
    return undefined;
  }
}
