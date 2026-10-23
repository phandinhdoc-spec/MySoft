import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./studio.css";
import "../../shared/src/interface.css";
import "./native.css";
import { detectEnv } from "./platform";

// Chờ Office sẵn sàng rồi mới dựng giao diện (cần biết đang ở Word/Excel/PowerPoint).
Office.onReady((info) => {
  // Office cho iPad báo platform "iOS"; cần biết trước khi dựng giao diện (nút to hơn, ẩn tính năng chỉ có trên máy tính).
  detectEnv(info.platform ? String(info.platform) : undefined);
  createRoot(document.getElementById("root")!).render(<App host={info.host} />);
});
