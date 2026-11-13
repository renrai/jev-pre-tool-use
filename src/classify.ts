import { TypeSafeClient, type SystemOneResult } from "@typesafe-ai/sdk";
import { loadEnv, type GuardConfig } from "./config.ts";
import { questions, type GuardQuestions } from "./questions.ts";

/** O que o Jev recebe como `state`: o comando e um pouco de contexto. */
export interface CommandState {
  tool: string;
  command: string;
  /** Descrição que o próprio Claude escreveu para o comando, quando houver. */
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
    // Num hook, esperar muito é pior que errar: uma tentativa extra e pronto.
    retry: { maxRetries: 1, backoffInitialMs: 200 },
    // O stderr do hook aparece no Claude Code; erros são tratados por nós.
    logLevel: "off",
  });
}

/** Faz UMA chamada ao Jev com todas as perguntas de questions.ts. */
export function createClassifier(client: TypeSafeClient): Classifier {
  return async (state) => {
    // O state é um objeto JSON: campos indefinidos são omitidos.
    const payload: Record<string, string> = { tool: state.tool, command: state.command };
    if (state.description) payload.description = state.description;
    if (state.cwd) payload.cwd = state.cwd;
    return client.systemOne({ state: payload, questions });
  };
}
