/**
 * Ponto de entrada do hook PreToolUse do Claude Code.
 *
 *   stdin  -> JSON com tool_name, tool_input.command, cwd...
 *   stdout -> JSON com permissionDecision "ask"/"deny", ou nada (segue o fluxo normal)
 *
 * Sempre sai com código 0: qualquer falha resulta em "não opinar", nunca em travar o Claude.
 */
import { createClassifier, createClient } from "./classify.ts";
import { loadConfig } from "./config.ts";
import { runGuard, type HookInput } from "./guard.ts";
import { createFileLogger } from "./log.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<string> {
  const input = JSON.parse(await readStdin()) as HookInput;
  const config = loadConfig();
  const log = createFileLogger();

  let classify;
  try {
    classify = createClassifier(createClient(config));
  } catch (err) {
    // Ex.: TYPESAFE_API_KEY ausente. Registra e deixa passar.
    log({
      ts: new Date().toISOString(),
      tool: input.tool_name,
      command: input.tool_input?.command ?? "",
      decision: "error",
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }

  const output = await runGuard(input, { classify, log, config });
  return output ? JSON.stringify(output) : "";
}

// Espera o stdout esvaziar antes de sair (num pipe, write é assíncrono).
main()
  .catch(() => "")
  .then((out) => process.stdout.write(out, () => process.exit(0)));
