# Bundled document tools

`node scripts/runtime/build.mjs` runs automatically before a **release** Tauri build,
including the one-command macOS source installer. Run on the target OS/architecture;
cross-compiling this runtime is not supported. Development builds retain the existing
on-demand fallback when no bundled runtime is configured.

The builder downloads verified upstream release archives for uv (build-time only),
Typst and Tinymist, installs standalone CPython 3.12.12 and the pinned Python document
packages, then probes all tools after relocation into a path containing spaces.
Python dependencies must be binary wheels. The final native installer contains the
runtime under its resources, so end users need neither Python nor pip nor a separate
Typst installation. Package metadata/licenses and upstream archive notices are retained.
`manifest.json` records the platform and upstream binary archive checksums.

`tools.lock.json` pins direct release URLs and SHA-256 checksums for each native
platform. Builds do not query the GitHub releases API or require an API token.
When upgrading uv, Typst or Tinymist, update the lock entries from the corresponding
upstream release asset digests. A checksum mismatch fails the build.

Windows extraction calls `%SystemRoot%\System32\tar.exe` explicitly, so Git Bash's
GNU tar cannot mistake a drive letter for a remote host or mishandle ZIP archives.
Linux CI builds with `--no-bundle`, then runs `tauri bundle` with the private runtime
library directories in `LD_LIBRARY_PATH` (printed by `bundle-env.mjs`). This lets
linuxdeploy resolve Python/Tcl and wheel libraries while scanning its copied AppDir.
The existing runtime and its Tcl/Tk libraries are retained.

Build-helper regression tests: `node --test scripts/test/version.test.mjs scripts/test/runtime.test.mjs`.
The Windows ZIP test runs on Windows; the private-library loader test runs on Linux.

Included functionality: Word (python-docx), Excel (openpyxl), PowerPoint (python-pptx),
PDF reading (pypdf), PDF typesetting (typst), and their dependencies including Pillow.
Exact decimal calculations use Python's standard-library Decimal; a large data-science
stack is not installed merely for basic accounting.

Runtime files are read-only application resources. Python uses bundled packages,
ignores user-site packages/PYTHONHOME, and does not write bytecode into the app.
A malformed or incompatible installed bundle fails with a reinstall message, without
silently downloading a replacement. Each document subprocess exits after its job.
Tinymist is packaged but is not automatically started: editor/LSP integration is a
separate feature. This change does not claim to implement Tinymist editor features.

CI must build and smoke-test native macOS ARM64/x64, Windows x64 and Linux x64 installers
before publishing. Size and native installer behavior must be measured from those
artifacts. The source installer downloads build inputs during installation; it is not
an offline installer. The existing Windows Studio bootstrap may still download the
Chat installer, whose payload now includes these tools.

## Reusing local build inputs

The macOS source installer keeps a build checkout at
`~/Library/Application Support/PVTA/build/repo`. Each run synchronizes the current
source snapshot (including uncommitted edits and source deletions), while retaining
npm dependencies, generated runtime and build outputs. The installer lock prevents
simultaneous installs from modifying this checkout.

`npm ci` runs on the first build, when the lockfile, workspace manifests, project
npm configuration, Node/npm version or platform changes, or when `npm ls` detects
missing/invalid dependencies. A successful install records its fingerprint inside
`node_modules`; failed installs cannot leave a valid completion marker.

The runtime builder reuses its output only when all build inputs match and every
payload file still matches the recorded SHA-256 and mode. Changing the requirements,
tool lock, builder or smoke test invalidates it. The first build after this upgrade
prepares the cache; subsequent code-only edits reuse it without downloading runtime
tools. Application code is still compiled on every install.

Set `PVTA_REBUILD_DEPS=1` or `PVTA_REBUILD_RUNTIME=1` when running the usual installer
to force the respective preparation step. Cache regression tests (no runtime downloads
or app installation): `node --test scripts/test/build-cache.test.mjs`.
