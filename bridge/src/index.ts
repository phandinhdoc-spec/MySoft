import { augmentPath } from "./paths.js";
import { startServer } from "./server.js";

augmentPath();

const server = await startServer();
console.log(`PVTA bridge đang chạy tại ws://127.0.0.1:${server.port}/ws`);

const shutdown = () => {
  void server.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
