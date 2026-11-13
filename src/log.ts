import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import type { Decision } from "./policy.ts";

export const LOG_FILE = path.join(ROOT, "logs", "decisions.jsonl");

/** One log line: what was asked, what Jev answered, and what the hook did. */
export interface LogEntry {
  ts: string;
  tool: string;
  command: string;
  cwd?: string;
  decision: Decision | "error";
  summary?: string;
  model?: string;
  latencyMs: number;
  inputTokens?: number | null;
  answers?: unknown;
  error?: string;
}

export type Logger = (entry: LogEntry) => void;

export function createFileLogger(file = LOG_FILE): Logger {
  return (entry) => {
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // Logging must never bring the hook down.
    }
  };
}

export function readLog(file = LOG_FILE): LogEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogEntry];
      } catch {
        return [];
      }
    });
}
