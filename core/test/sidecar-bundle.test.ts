import {build} from 'esbuild';
import {describe,it,expect} from 'vitest';

/**
 * pvta-core được pkg đóng gói rồi chạy trong vm (Module.wrap + Script.runInThisContext)
 * mà không truyền importModuleDynamically; mọi import() trong gói sẽ ném
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING: "A dynamic import callback was not specified."
 * nên công cụ chụp ảnh (screenshotScan) từng hỏng. Gói sidecar không được còn import() nào.
 */
describe('Gói sidecar pvta-core', () => {
 it('không chứa dynamic import() nào sau khi esbuild đóng gói', async () => {
  const r = await build({
   entryPoints: ['core/src/desktop/sidecar.ts'],
   bundle: true,
   platform: 'node',
   format: 'cjs',
   target: 'node22',
   write: false,
   external: ['bufferutil', 'utf-8-validate'],
   define: { 'import.meta.url': JSON.stringify('file:///pvta-core.cjs') },
  });
  const text = r.outputFiles[0]!.text;
  // Bỏ "ObjC.import('AppKit')" trong chuỗi JXA: dấu chấm đứng ngay trước import(.
  const dynamic = [...text.matchAll(/(?<![A-Za-z0-9_$.])import\(\s*['"`]/g)];
  expect(dynamic.map((m) => text.slice(Math.max(0, m.index - 60), m.index + 60))).toEqual([]);
 });
});
