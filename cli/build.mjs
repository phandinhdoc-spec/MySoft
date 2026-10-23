import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(root,'src/main.ts')],outfile:path.join(root,'dist/pvta.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',external:['bufferutil','utf-8-validate'],banner:{js:'#!/usr/bin/env node'},define:{'import.meta.url':JSON.stringify(import.meta.url)}});
await build({stdin:{contents:"import('./src/viewer.ts')",resolveDir:root},outfile:path.join(root,'dist/viewer.js'),bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true});
