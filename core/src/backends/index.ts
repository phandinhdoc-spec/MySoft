import type { CliBackendId } from "@pvta/shared";
import { agyBackend } from "./agy.js";
import { claudeBackend } from "./claude.js";
import { codexBackend } from "./codex.js";
import { opencodeBackend } from "./opencode.js";
import type { Backend } from "./types.js";

export const BACKENDS: Record<CliBackendId, Backend> = { agy: agyBackend, claude: claudeBackend, codex: codexBackend, opencode: opencodeBackend };
export * from "./types.js";
export { agyBackend, claudeBackend, codexBackend, opencodeBackend };
