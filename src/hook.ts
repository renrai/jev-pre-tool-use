/**
 * Entry point for the Claude Code PreToolUse hook.
 *
 *   stdin  -> JSON with tool_name, tool_input.command, cwd...
 *   stdout -> JSON with permissionDecision "ask"/"deny", or nothing (normal flow continues)
 *
 * Always exits with code 0: any failure means "stay silent", never blocking Claude.
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
    // E.g. TYPESAFE_API_KEY is missing. Log it and let the command through.
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

// Wait for stdout to drain before exiting (writes to a pipe are asynchronous).
main()
  .catch(() => "")
  .then((out) => process.stdout.write(out, () => process.exit(0)));
