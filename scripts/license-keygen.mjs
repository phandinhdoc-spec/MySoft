#!/usr/bin/env node
// Tạo cặp khóa RSA cho giấy phép PVTA và/hoặc điền địa chỉ máy chủ vào core/src/license/config.ts.
//   node scripts/license-keygen.mjs --endpoint https://script.google.com/macros/s/XXXX/exec
// Lần đầu: tạo khóa, IN khóa bí mật ra màn hình (dán vào Script Properties › PRIVATE_KEY) và ghi khóa công khai vào config.ts.
// Lần sau: chỉ cập nhật địa chỉ. Muốn thay khóa (làm mọi giấy phép đã cấp mất hiệu lực) phải thêm --rotate.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../core/src/license/config.ts");
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const endpoint = arg("--endpoint");
if (endpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
  console.error("Địa chỉ phải có dạng https://script.google.com/macros/s/<ID>/exec");
  process.exit(1);
}
let src = fs.readFileSync(file, "utf8");
const hasKey = /publicKeyPem:\s*"-----BEGIN/.test(src) || /publicKeyPem:\s*`-----BEGIN/.test(src);
const rotate = args.includes("--rotate");

if (!hasKey || rotate) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString().trim();
  const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
  src = src.replace(/publicKeyPem:\s*(?:"[^"]*"|`[^`]*`)/, () => `publicKeyPem: \`${pub}\``);
  console.log("=== KHÓA BÍ MẬT (dán vào Apps Script › Cài đặt dự án › Thuộc tính tập lệnh › PRIVATE_KEY; KHÔNG commit, KHÔNG gửi ai) ===\n");
  console.log(priv + "\n");
  console.log("=== Hết. Đã ghi khóa công khai vào core/src/license/config.ts ===");
} else if (!endpoint) {
  console.log("Đã có khóa công khai. Thêm --endpoint <URL> để cập nhật địa chỉ, hoặc --rotate để đổi khóa.");
}
if (endpoint) {
  src = src.replace(/endpoint:\s*"[^"]*"/, () => `endpoint: "${endpoint}"`);
  console.log("Đã ghi địa chỉ máy chủ.");
}
fs.writeFileSync(file, src);
