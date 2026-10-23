import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,[path.join(root,'scripts/version.mjs'),'--check'],{cwd:root,stdio:'inherit'});
const triple=process.env.PVTA_TARGET??execFileSync('rustc',['-vV'],{encoding:'utf8'}).match(/^host: (.+)$/m)?.[1];
if(!triple)throw Error('Không xác định được target Rust.');
const platforms={'aarch64-apple-darwin':'node22-macos-arm64','x86_64-apple-darwin':'node22-macos-x64','x86_64-pc-windows-msvc':'node22-win-x64','aarch64-pc-windows-msvc':'node22-win-arm64','x86_64-unknown-linux-gnu':'node22-linux-x64','aarch64-unknown-linux-gnu':'node22-linux-arm64'};
if(!platforms[triple])throw Error(`Chưa hỗ trợ target ${triple}`);
fs.mkdirSync(path.join(root,'core/dist'),{recursive:true});fs.mkdirSync(path.join(root,'chatbox/src-tauri/binaries'),{recursive:true});
const entry=path.join(root,'core/dist/pvta-core.cjs');
await build({entryPoints:[path.join(root,'core/src/desktop/sidecar.ts')],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:entry,external:['bufferutil','utf-8-validate'],define:{'import.meta.url':JSON.stringify('file:///pvta-core.cjs')}});
const pkg=path.join(root,'node_modules/@yao-pkg/pkg/lib-es5/bin.js');
execFileSync(process.execPath,[pkg,entry,'--target',platforms[triple],'--output',path.join(root,`chatbox/src-tauri/binaries/pvta-core-${triple}${process.platform==='win32'?'.exe':''}`)],{stdio:'inherit',env:{...process.env,PKG_CACHE_PATH:process.env.PKG_CACHE_PATH??path.join(root,'node_modules/.cache/pkg')}});

fs.mkdirSync(path.join(root,'addin/dist'),{recursive:true});
fs.copyFileSync(path.join(root,'addin/manifest.xml'),path.join(root,'addin/dist/manifest.xml'));

// Ship the one-shot Brain executable beside the core sidecar.
execFileSync('cargo',['build','--release','--manifest-path',path.join(root,'brain/Cargo.toml'),'--target',triple],{stdio:'inherit'});
const brainTarget=process.env.CARGO_TARGET_DIR?path.resolve(process.env.CARGO_TARGET_DIR):path.join(root,'brain/target');
fs.copyFileSync(path.join(brainTarget,`${triple}/release/pvta-brain${triple.includes('windows')?'.exe':''}`),path.join(root,`chatbox/src-tauri/binaries/pvta-brain-${triple}${triple.includes('windows')?'.exe':''}`));
