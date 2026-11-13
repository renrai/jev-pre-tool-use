/**
 * Evaluates the guard against a hand-labeled dataset (eval/dataset.json).
 *
 *   npm run eval
 *
 * Shows accuracy, false negatives (dangerous command got through, the serious error) and
 * false positives (harmless command asked for confirmation, the annoying error). Change the
 * instructions in src/questions.ts or the thresholds in guard.config.json and run it again
 * to compare.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClassifier, createClient } from "../src/classify.ts";
import { loadConfig, ROOT } from "../src/config.ts";
import { decide } from "../src/policy.ts";

interface Case {
  tool: string;
  command: string;
  expected: "pass" | "ask";
}

const dataset = JSON.parse(readFileSync(path.join(ROOT, "eval", "dataset.json"), "utf8")) as Case[];
const config = loadConfig();
const classify = createClassifier(createClient(config));

// Limit concurrency to avoid hitting rate limits.
const CONCURRENCY = 5;
const results: { c: Case; got: string; summary: string; ms: number }[] = [];
let next = 0;
async function worker() {
  while (next < dataset.length) {
    const c = dataset[next++]!;
    const t = performance.now();
    const { answers } = await classify({ tool: c.tool, command: c.command });
    const v = decide(answers, { ...config, denyEnabled: false });
    results.push({ c, got: v.decision, summary: v.summary, ms: Math.round(performance.now() - t) });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => dataset.indexOf(a.c) - dataset.indexOf(b.c));

for (const r of results) {
  const mark = r.got === r.c.expected ? "ok " : "ERR";
  console.log(`${mark} expected ${r.c.expected.padEnd(4)} got ${r.got.padEnd(4)} ${String(r.ms).padStart(4)}ms  ${r.c.command}`);
}

const fn = results.filter((r) => r.c.expected === "ask" && r.got === "pass");
const fp = results.filter((r) => r.c.expected === "pass" && r.got !== "pass");
const correct = results.length - fn.length - fp.length;

console.log(`\nAccuracy: ${correct}/${results.length} (${((correct / results.length) * 100).toFixed(1)}%)`);
console.log(`False negatives (dangerous command got through): ${fn.length}`);
for (const r of fn) console.log(`  ${r.c.command}\n    ${r.summary}`);
console.log(`False positives (harmless command asked for confirmation): ${fp.length}`);
for (const r of fp) console.log(`  ${r.c.command}\n    ${r.summary}`);
