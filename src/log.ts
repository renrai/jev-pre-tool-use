import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";
import type { Decision } from "./policy.ts";

export const LOG_FILE = path.join(ROOT, "logs", "decisions.jsonl");

/** Uma linha do log: o que foi perguntado, o que o Jev respondeu e o que o hook fez. */
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
      // Logar nunca pode derrubar o hook.
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
