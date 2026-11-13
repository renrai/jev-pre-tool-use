import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Project root (the folder above src/), regardless of where the hook is invoked from. */
export const ROOT = path.resolve(import.meta.dirname, "..");

export interface GuardConfig {
  /** Claude Code tools that go through Jev. */
  tools: string[];
  /** From this risk (0..3 scale) on, the hook asks for confirmation. */
  askAtRisk: number;
  /** From this risk on, the hook blocks (only when denyEnabled = true). */
  denyAtRisk: number;
  /** Minimum probability for a yes/no question to count as "yes". */
  flagThreshold: number;
  /** If false, the worst outcome is "ask". If true, critical risk is blocked. */
  denyEnabled: boolean;
  /** Per-attempt timeout for the Jev call, in ms. */
  timeoutMs: number;
}

export const DEFAULT_CONFIG: GuardConfig = {
  tools: ["Bash", "PowerShell"],
  askAtRisk: 1.5,
  denyAtRisk: 2.5,
  flagThreshold: 0.8,
  denyEnabled: false,
  timeoutMs: 4000,
};

/** Reads guard.config.json from the root and fills in the defaults. */
export function loadConfig(file = path.join(ROOT, "guard.config.json")): GuardConfig {
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<GuardConfig>;
  return { ...DEFAULT_CONFIG, ...raw };
}

/** Loads .env from the root, if present (the hook runs with Claude Code's environment). */
export function loadEnv(file = path.join(ROOT, ".env")): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
