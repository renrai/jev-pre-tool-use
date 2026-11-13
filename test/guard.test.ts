import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createClassifier, type GuardResult } from "../src/classify.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { runGuard, type HookInput } from "../src/guard.ts";
import type { LogEntry } from "../src/log.ts";
import { answers, apiResponse } from "./fixtures.ts";

const bash = (command: string): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command, description: "test" },
  cwd: "/repo",
});

/** Real SDK client with a fake fetch: tests the full path without network or key. */
function fakeClient(body: unknown, status = 200) {
  const requests: { url: string; body: any }[] = [];
  const client = new TypeSafeClient({
    apiKey: "test-key",
    compression: false,
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  });
  return { classify: createClassifier(client), requests };
}

function deps(classify: (s: any) => Promise<GuardResult>) {
  const logs: LogEntry[] = [];
  return { logs, deps: { classify, log: (e: LogEntry) => logs.push(e), config: DEFAULT_CONFIG } };
}

describe("runGuard", () => {
  it("sends the state and the 6 questions to /v1/systemone", async () => {
    const { classify, requests } = fakeClient(apiResponse(answers()));
    await runGuard(bash("ls"), deps(classify).deps);

    assert.equal(requests.length, 1);
    assert.match(requests[0]!.url, /\/v1\/systemone$/);
    assert.deepEqual(requests[0]!.body.state, { tool: "Bash", command: "ls", description: "test", cwd: "/repo" });
    assert.deepEqual(Object.keys(requests[0]!.body.questions).sort(), [
      "category",
      "deletes_data",
      "risk",
      "runs_remote_code",
      "sends_data_out",
      "touches_secrets",
    ]);
    assert.equal(requests[0]!.body.questions.category.type, "choice");
    assert.equal(requests[0]!.body.questions.risk.type, "score");
  });

  it("stays silent (null) on a low-risk command but still logs it", async () => {
    const { classify } = fakeClient(apiResponse(answers()));
    const { logs, deps: d } = deps(classify);
    assert.equal(await runGuard(bash("git status"), d), null);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]!.decision, "pass");
    assert.equal(logs[0]!.model, "jev-1.14.0");
    assert.equal(logs[0]!.inputTokens, 512);
  });

  it("returns permissionDecision ask for a destructive command", async () => {
    const risky = answers({ category: { choice: "git" }, risk: { score: 2.2 }, deletes_data: { noul: 0.97 } });
    const { classify } = fakeClient(apiResponse(risky));
    const out = await runGuard(bash("git reset --hard HEAD~5"), deps(classify).deps);

    assert.equal(out?.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(out?.hookSpecificOutput.permissionDecision, "ask");
    assert.match(out!.hookSpecificOutput.permissionDecisionReason, /deletes\/overwrites data \(97%\)/);
  });

  it("fails open: an API error becomes null and is logged", async () => {
    const { classify } = fakeClient({ error: "invalid key" }, 401);
    const { logs, deps: d } = deps(classify);
    assert.equal(await runGuard(bash("rm -rf /"), d), null);
    assert.equal(logs[0]!.decision, "error");
    assert.match(logs[0]!.error!, /401/);
  });

  it("ignores unlisted tools and empty commands without calling the API", async () => {
    const { classify, requests } = fakeClient(apiResponse(answers()));
    const d = deps(classify).deps;
    assert.equal(await runGuard({ tool_name: "Read", tool_input: {} }, d), null);
    assert.equal(await runGuard(bash("   "), d), null);
    assert.equal(requests.length, 0);
  });
});
