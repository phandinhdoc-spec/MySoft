import {it,expect,vi,afterEach} from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('keeps the Studio Office updater on the same release repository',async()=>{
 vi.stubEnv('PVTA_RELEASE_REPO','phandinhdoc-spec/MySoft');vi.resetModules();
 const u=await import('../src/updater');expect(u.LATEST_URL).toBe('https://github.com/phandinhdoc-spec/MySoft/releases/latest/download/office-latest.json');expect(u.TARBALL_URL).toContain('/pvta-office.tar.gz');expect(u.installerCommand('darwin')?.display).toContain('/installers/studio.sh');
});
it('does not accept an arbitrary repository from the environment',async()=>{
 vi.stubEnv('PVTA_RELEASE_REPO','untrusted/repo');vi.resetModules();const u=await import('../src/updater');expect(u.REPO).toBe('phandinhdoc-spec/MySoft');
});
