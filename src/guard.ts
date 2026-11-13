import type { Classifier } from "./classify.ts";
import type { GuardConfig } from "./config.ts";
import type { Logger } from "./log.ts";
import { decide } from "./policy.ts";

/** O JSON que o Claude Code manda no stdin de um hook PreToolUse (só o que usamos). */
export interface HookInput {
  hook_event_name?: string;
  tool_name: string;
  tool_input?: { command?: string; description?: string };
  cwd?: string;
}

/** O JSON que o hook devolve no stdout para pedir confirmação ou bloquear. */
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
 * Núcleo do hook, sem I/O de processo (testável com um classificador falso).
 * Retorna null quando o hook não deve opinar: ferramenta fora da lista, sem comando,
 * risco baixo ou erro na API. Ou seja, se o Jev falhar, nada quebra (fail-open).
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
