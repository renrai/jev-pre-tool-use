import type { Classifier } from "./classify.ts";
import type { GuardConfig } from "./config.ts";
import type { Logger } from "./log.ts";
import { decide } from "./policy.ts";

/** The JSON Claude Code sends on stdin to a PreToolUse hook (only the fields we use). */
export interface HookInput {
  hook_event_name?: string;
  tool_name: string;
  tool_input?: { command?: string; description?: string };
  cwd?: string;
}

/** The JSON the hook writes to stdout to ask for confirmation or block. */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "ask" | "deny";
    permissionDecisionReason: string;
  };
}

export interface GuardDeps {
  classify: Classifier;
  log: Logger;
  config: GuardConfig;
  now?: () => number;
}

/**
 * The hook's core, free of process I/O (testable with a fake classifier).
 * Returns null when the hook should stay silent: tool not in the list, no command,
 * low risk, or an API error. In other words, if Jev fails, nothing breaks (fail-open).
 */
export async function runGuard(input: HookInput, deps: GuardDeps): Promise<HookOutput | null> {
  const now = deps.now ?? Date.now;
  const command = input.tool_input?.command?.trim();
  if (!deps.config.tools.includes(input.tool_name) || !command) return null;

  const base = { ts: new Date(now()).toISOString(), tool: input.tool_name, command, cwd: input.cwd };
  const started = now();

  try {
    const result = await deps.classify({
      tool: input.tool_name,
      command,
      description: input.tool_input?.description,
      cwd: input.cwd,
    });
    const verdict = decide(result.answers, deps.config);

    deps.log({
      ...base,
      decision: verdict.decision,
      summary: verdict.summary,
      model: result.model,
      latencyMs: now() - started,
      inputTokens: result.usage.input_tokens,
      answers: result.answers,
    });

    if (verdict.decision === "pass") return null;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.summary,
      },
    };
  } catch (err) {
    deps.log({ ...base, decision: "error", latencyMs: now() - started, error: describeError(err) });
    return null;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    return `${err.name}${status ? ` ${status}` : ""}: ${err.message}`;
  }
  return String(err);
}
