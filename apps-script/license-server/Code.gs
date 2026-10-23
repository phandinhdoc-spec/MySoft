/**
 * PVTA – máy chủ giấy phép và phản hồi (Google Apps Script, gắn với một Google Sheet của chủ phần mềm).
 *
 * - Mỗi email được cấp MỘT mã kích hoạt (menu PVTA ▸ Cấp mã cho email). Sheet chỉ lưu bản băm của mã.
 * - Một email dùng tối đa MAX_DEVICES thiết bị. Máy chủ ký giấy phép bằng RSA (khóa bí mật nằm trong
 *   Script Properties, không bao giờ vào kho mã); ứng dụng kiểm chữ ký bằng khóa công khai nên dùng offline được.
 * - Phản hồi của người dùng được lưu thành tệp .md vào thư mục Drive (thư mục đã đồng bộ với laptop) và ghi một dòng vào sheet «Phản hồi».
 *
 * Script Properties cần có:  PRIVATE_KEY (PEM PKCS#8 do scripts/license-keygen.mjs tạo)  ·  FEEDBACK_FOLDER_ID (đặt bằng menu).
 */

var MAX_DEVICES = 3;
var MAX_FAILS = 5;
var LIC_SHEET = 'Giấy phép';
var FB_SHEET = 'Phản hồi';
var LIC_HEAD = ['Email', 'Mã băm', 'Trạng thái', 'Số lần sai', 'Thiết bị (JSON)', 'Cấp lúc', 'Ghi chú'];
var FB_HEAD = ['Thời gian', 'Email', 'Loại', 'Phiên bản', 'Hệ điều hành', 'Nội dung', 'Tệp'];
var KINDS = ['loi', 'y-kien', 'khen'];
var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ------------------------------------------------------------------ tiện ích

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function sha256_(s) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}
function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
  }
  return sh;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function newCode_() {
  var u = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var out = '';
  for (var i = 0; i < 10; i++) out += ALPHABET.charAt(parseInt(u.substr(i * 2, 2), 16) % ALPHABET.length);
  return out.substr(0, 5) + '-' + out.substr(5);
}
function findRow_(sh, email) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).toLowerCase() === email) return { row: i + 1, v: vals[i] };
  }
  return null;
}
function signToken_(payload) {
  var pk = PropertiesService.getScriptProperties().getProperty('PRIVATE_KEY');
  if (!pk) throw new Error('Chưa đặt PRIVATE_KEY trong Script Properties.');
  var head = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(payload)).getBytes()).replace(/=+$/, '');
  var sig = Utilities.computeRsaSha256Signature(head, pk);
  return head + '.' + Utilities.base64Encode(sig);
}
function devices_(rec) {
  try { return JSON.parse(rec.v[4] || '{}') || {}; } catch (e) { return {}; }
}

// ------------------------------------------------------------------ web app

function doGet() {
  return json_({ ok: true, name: 'PVTA license server' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var b = JSON.parse(e.postData.contents);
    var email = String(b.email || '').trim().toLowerCase();
    var sh = sheet_(LIC_SHEET, LIC_HEAD);
    var rec = findRow_(sh, email);
    if (!rec) return json_({ ok: false, error: 'khong-co-email' });
    var status = String(rec.v[2]);
    if (status === 'thu-hoi') return json_({ ok: false, error: 'da-thu-hoi' });
    var devs = devices_(rec);
    var dev = String(b.device || '').slice(0, 64);

    if (b.action === 'activate') {
      if (status === 'khoa') return json_({ ok: false, error: 'bi-khoa' });
      if (sha256_(email + '|' + String(b.code || '').trim().toUpperCase()) !== String(rec.v[1])) {
        var fails = Number(rec.v[3] || 0) + 1;
        sh.getRange(rec.row, 4).setValue(fails);
        if (fails >= MAX_FAILS) sh.getRange(rec.row, 3).setValue('khoa');
        return json_({ ok: false, error: 'sai-ma' });
      }
      if (!dev || !/^[a-f0-9]{64}$/.test(String(b.keyHash || ''))) return json_({ ok: false, error: 'khong-hop-le' });
      if (!devs[dev] && Object.keys(devs).length >= MAX_DEVICES) return json_({ ok: false, error: 'het-thiet-bi' });
      devs[dev] = { keyHash: b.keyHash, name: String(b.name || '').slice(0, 40), platform: String(b.platform || '').slice(0, 12), at: new Date().toISOString() };
      sh.getRange(rec.row, 4).setValue(0);
      sh.getRange(rec.row, 5).setValue(JSON.stringify(devs));
      // Admin allowlist is set by the publisher in Script Properties, never accepted from a client.
      var admins = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
      var token = signToken_({ v: 1, email: email, device: dev, iat: Math.floor(Date.now() / 1000), max: MAX_DEVICES, role: admins.indexOf(email.toLowerCase()) >= 0 ? 'admin' : 'user' });
      return json_({ ok: true, token: token, used: Object.keys(devs).length, max: MAX_DEVICES });
    }

    // Các thao tác còn lại cần khóa riêng của thiết bị đã kích hoạt.
    var d = devs[dev];
    if (!d || d.keyHash !== sha256_(String(b.key || ''))) return json_({ ok: false, error: 'khong-hop-le' });

    if (b.action === 'check') return json_({ ok: true });
    if (b.action === 'deactivate') {
      delete devs[dev];
      sh.getRange(rec.row, 5).setValue(JSON.stringify(devs));
      return json_({ ok: true });
    }
    if (b.action === 'feedback') return json_(saveFeedback_(email, b));
    return json_({ ok: false, error: 'khong-hop-le' });
  } catch (err) {
    return json_({ ok: false, error: 'khong-hop-le' });
  } finally {
    lock.releaseLock();
  }
}

function saveFeedback_(email, b) {
  var kind = String(b.kind || '');
  var text = String(b.text || '').replace(/\r/g, '').trim();
  if (KINDS.indexOf(kind) < 0 || text.length < 5 || text.length > 2000) return { ok: false, error: 'khong-hop-le' };
  var version = String(b.version || '').slice(0, 20);
  var platform = String(b.platform || '').slice(0, 12);
  var now = new Date();
  var stamp = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd_HHmmss');
  var safe = email.replace(/[^a-z0-9@.]+/g, '_').slice(0, 60);
  var name = stamp + '_' + kind + '_' + safe + '.md';
  var body = '# Phản hồi PVTA\n\n- Thời gian: ' + stamp + '\n- Email: ' + email + '\n- Loại: ' + kind + '\n- Phiên bản: ' + version + '\n- Hệ điều hành: ' + platform + '\n\n' + text + '\n';
  var folderId = PropertiesService.getScriptProperties().getProperty('FEEDBACK_FOLDER_ID');
  var fileName = '';
  if (folderId) {
    DriveApp.getFolderById(folderId).createFile(name, body, MimeType.PLAIN_TEXT);
    fileName = name;
  }
  // Chặn chèn công thức vào ô sheet.
  var cell = /^[=+\-@]/.test(text) ? "'" + text : text;
  sheet_(FB_SHEET, FB_HEAD).appendRow([now, email, kind, version, platform, cell, fileName]);
  return { ok: true };
}

// ------------------------------------------------------------------ menu cho chủ phần mềm

function onOpen() {
  sheet_(LIC_SHEET, LIC_HEAD);
  sheet_(FB_SHEET, FB_HEAD);
  SpreadsheetApp.getUi().createMenu('PVTA')
    .addItem('Cấp mã cho email…', 'issueCode')
    .addItem('Đặt lại thiết bị của dòng đang chọn', 'resetDevices')
    .addItem('Mở khóa dòng đang chọn', 'unlockRow')
    .addItem('Thu hồi quyền của dòng đang chọn', 'revokeRow')
    .addSeparator()
    .addItem('Chọn thư mục Drive nhận phản hồi…', 'setFeedbackFolder')
    .addToUi();
}

function ask_(title, msg) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
  return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : '';
}

/** Cấp mã mới cho một email (nếu đã có thì tạo mã mới, thay mã cũ). Mã chỉ hiện MỘT lần ở đây. */
function issueCode() {
  var email = ask_('Cấp mã', 'Email của người dùng:').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  var sh = sheet_(LIC_SHEET, LIC_HEAD);
  var code = newCode_();
  var hash = sha256_(email + '|' + code);
  var rec = findRow_(sh, email);
  if (rec) {
    sh.getRange(rec.row, 2, 1, 3).setValues([[hash, 'dung', 0]]);
  } else {
    sh.appendRow([email, hash, 'dung', 0, '{}', new Date(), '']);
  }
  SpreadsheetApp.getUi().alert('Mã kích hoạt cho ' + email + '\n\n' + code + '\n\nChỉ hiện một lần. Gửi riêng cho người đó (không đăng công khai). Mã dùng được cho tối đa ' + MAX_DEVICES + ' thiết bị.');
}

function selectedRec_() {
  var sh = sheet_(LIC_SHEET, LIC_HEAD);
  if (SpreadsheetApp.getActiveSheet().getName() !== LIC_SHEET) { SpreadsheetApp.getUi().alert('Hãy chọn một dòng trong sheet «' + LIC_SHEET + '».'); return null; }
  var row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('Hãy chọn một dòng dữ liệu.'); return null; }
  return { sh: sh, row: row };
}
function resetDevices() { var s = selectedRec_(); if (s) s.sh.getRange(s.row, 5).setValue('{}'); }
function unlockRow() { var s = selectedRec_(); if (s) { s.sh.getRange(s.row, 3).setValue('dung'); s.sh.getRange(s.row, 4).setValue(0); } }
function revokeRow() { var s = selectedRec_(); if (s) s.sh.getRange(s.row, 3).setValue('thu-hoi'); }

/** Dán ID thư mục Drive (phần cuối của link thư mục) – thư mục này đã đồng bộ về laptop. */
function setFeedbackFolder() {
  var id = ask_('Thư mục phản hồi', 'Dán ID thư mục Drive (đoạn cuối link https://drive.google.com/drive/folders/<ID>):');
  if (!id) return;
  var f = DriveApp.getFolderById(id);
  PropertiesService.getScriptProperties().setProperty('FEEDBACK_FOLDER_ID', id);
  SpreadsheetApp.getUi().alert('Đã đặt thư mục: ' + f.getName());
}
