import type { OfficeHost, ToolCall } from "@pvta/shared";
import { excelTool } from "./excel";
import { powerpointTool } from "./powerpoint";
import { wordTool } from "./word";
import { applyFromCatalog } from "./themeapply";

export function hostFromOffice(host: Office.HostType | undefined): OfficeHost {
  if (host === Office.HostType.Excel) return "excel";
  if (host === Office.HostType.PowerPoint) return "powerpoint";
  return "word";
}

/** Chạy một công cụ bằng Office.js. Công cụ của host khác bị từ chối rõ ràng. */
export async function executeTool(host: OfficeHost, call: ToolCall): Promise<unknown> {
  const prefix = host === "word" ? "office_word_" : host === "excel" ? "office_excel_" : "office_ppt_";
  if (!call.tool.startsWith(prefix)) throw new Error(`Công cụ '${call.tool}' không dùng được trong ${host}.`);
  // Chủ đề có sẵn: {theme, colors?, fonts?} theo tên hoặc mã trong danh mục của Office.
  if (/_apply_theme$/.test(call.tool) && call.args.primary === undefined && (call.args.theme !== undefined || call.args.fonts !== undefined || call.args.colors !== undefined)) {
    return applyFromCatalog(host, call.args);
  }
  if (host === "word") return wordTool(call.tool, call.args);
  if (host === "excel") return excelTool(call.tool, call.args);
  return powerpointTool(call.tool, call.args);
}
