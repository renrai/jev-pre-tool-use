import { TypeSafeClient, type SystemOneResult } from "@typesafe-ai/sdk";
import { loadEnv, type GuardConfig } from "./config.ts";
import { questions, type GuardQuestions } from "./questions.ts";

/** What Jev receives as `state`: the command plus a bit of context. */
export interface CommandState {
  tool: string;
  command: string;
  /** The description Claude itself wrote for the command, when available. */
  description?: string;
  cwd?: string;
}

export type GuardResult = SystemOneResult<GuardQuestions>;
export type GuardAnswers = GuardResult["answers"];
export type Classifier = (state: CommandState) => Promise<GuardResult>;

export function createClient(config: GuardConfig): TypeSafeClient {
  loadEnv();
  return new TypeSafeClient({
    timeout: config.timeoutMs,
    // In a hook, waiting too long is worse than being wrong: one extra attempt and done.
    retry: { maxRetries: 1, backoffInitialMs: 200 },
    // The hook's stderr shows up in Claude Code; we handle errors ourselves.
    logLevel: "off",
  });
}

/** Makes ONE call to Jev with all the questions from questions.ts. */
export function createClassifier(client: TypeSafeClient): Classifier {
  return async (state) => {
    // The state is a JSON object: undefined fields are omitted.
    const payload: Record<string, string> = { tool: state.tool, command: state.command };
    if (state.description) payload.description = state.description;
    if (state.cwd) payload.cwd = state.cwd;
    return client.systemOne({ state: payload, questions });
  };
}
