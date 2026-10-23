import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sharedLibraryPath} from './native-tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
console.log(await sharedLibraryPath(path.join(root,'chatbox/src-tauri/runtime'),process.env.LD_LIBRARY_PATH));
