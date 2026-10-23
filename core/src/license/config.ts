/**
 * Cấu hình giấy phép. Để trống = ứng dụng không đòi kích hoạt (bản phát triển, kiểm thử).
 * Chạy `node scripts/license-keygen.mjs --endpoint <URL web app Apps Script>` để điền hai giá trị này;
 * khóa BÍ MẬT chỉ nằm trong Script Properties của Google Apps Script, không bao giờ vào kho mã.
 */
export interface LicenseConfig {
  /** Địa chỉ web app Google Apps Script (kết thúc bằng /exec). */
  endpoint: string;
  /** Khóa công khai RSA (PEM) dùng để kiểm chữ ký giấy phép ngay trên máy, không cần mạng. */
  publicKeyPem: string;
  /** Số thiết bị tối đa cho mỗi email. */
  maxDevices: number;
}

export const LICENSE_CONFIG: LicenseConfig = {
  endpoint: "",
  publicKeyPem: "",
  maxDevices: 3,
};
