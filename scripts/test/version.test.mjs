import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jsonFiles = [
  'package.json', 'shared/package.json', 'core/package.json', 'bridge/package.json',
  'addin/package.json', 'chatbox/package.json', 'chatbox/src-tauri/tauri.conf.json',
  'package-lock.json',
];
const cargoFiles = ['chatbox/src-tauri/Cargo.toml', 'chatbox/src-tauri/Cargo.lock'];
const files = [...jsonFiles, ...cargoFiles, 'addin/manifest.xml',
  'core/src/desktop/runtime.ts', 'scripts/windows/studio.iss', 'scripts/windows/pvta.iss'];

function fixture(t, crlf = false) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-version-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  for (const file of files) {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(target, crlf ? text.replace(/\n/g, '\r\n') : text);
  }
  return cwd;
}

function run(cwd, arg = '--check') {
  return spawnSync(process.execPath, [path.join(root, 'scripts/version.mjs'), arg], {
    cwd, encoding: 'utf8',
  });
}

for (const crlf of [false, true]) {
  test(`correct versions pass with ${crlf ? 'CRLF' : 'LF'} and check does not write`, t => {
    const cwd = fixture(t, crlf);
    const before = files.map(file => fs.readFileSync(path.join(cwd, file)));
    const result = run(cwd);
    assert.equal(result.status, 0, result.stderr);
    files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(cwd, file)), before[i]));
  });
}

test('JSON indentation does not cause a version mismatch', t => {
  const cwd = fixture(t);
  for (const file of jsonFiles) {
    const target = path.join(cwd, file);
    fs.writeFileSync(target, JSON.stringify(JSON.parse(fs.readFileSync(target, 'utf8'))));
  }
  assert.equal(run(cwd).status, 0);
});

for (const file of ['shared/package.json', 'chatbox/src-tauri/tauri.conf.json', ...cargoFiles]) {
  test(`rejects a real mismatch in ${file} with CRLF`, t => {
    const cwd = fixture(t, true);
    const target = path.join(cwd, file);
    const old = fs.readFileSync(target, 'utf8');
    const changed = file.endsWith('.json')
      ? old.replace(/"version": "[^"]+"/, '"version": "0.0.0"')
      : old.replace(/(name = "pvta-chatbox"\r\nversion = ")[^"]+/, '$10.0.0');
    assert.notEqual(changed, old);
    fs.writeFileSync(target, changed);
    const result = run(cwd);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(file), result.stderr);
  });
}

test('rejects a workspace package-lock version mismatch', t => {
  const cwd = fixture(t, true);
  const target = path.join(cwd, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(target, 'utf8'));
  lock.packages.chatbox.version = '0.0.0';
  fs.writeFileSync(target, JSON.stringify(lock));
  const result = run(cwd);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('package-lock.json'));
});

test('version:set updates Rust and JSON with CRLF and keeps existing line endings', t => {
  const cwd = fixture(t, true);
  const result = run(cwd, '9.8.7');
  assert.equal(result.status, 0, result.stderr);
  for (const file of files) {
    const content = fs.readFileSync(path.join(cwd, file), 'utf8');
    assert.ok(content.includes('9.8.7'), file);
    assert.equal(/(?<!\r)\n/.test(content), false, file);
  }
  assert.equal(run(cwd).status, 0);
});

test('missing Rust package version fails instead of silently passing', t => {
  const cwd = fixture(t, true);
  const file = path.join(cwd, 'chatbox/src-tauri/Cargo.toml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('name = "pvta-chatbox"', 'name = "missing"'));
  const result = run(cwd);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('Không tìm thấy phiên bản'));
});
