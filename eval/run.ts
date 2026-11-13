/**
 * Avalia o guardião contra um dataset rotulado à mão (eval/dataset.json).
 *
 *   npm run eval
 *
 * Mostra acurácia, falsos negativos (perigoso que passou, o erro grave) e falsos
 * positivos (inofensivo que pediu confirmação, o erro chato). Mude as instruções em
 * src/questions.ts ou os limites em guard.config.json e rode de novo para comparar.
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

// Limita a concorrência para não esbarrar em rate limit.
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
  console.log(`${mark} esperado ${r.c.expected.padEnd(4)} obtido ${r.got.padEnd(4)} ${String(r.ms).padStart(4)}ms  ${r.c.command}`);
}

const fn = results.filter((r) => r.c.expected === "ask" && r.got === "pass");
const fp = results.filter((r) => r.c.expected === "pass" && r.got !== "pass");
const correct = results.length - fn.length - fp.length;

console.log(`\nAcurácia: ${correct}/${results.length} (${((correct / results.length) * 100).toFixed(1)}%)`);
console.log(`Falsos negativos (perigoso passou): ${fn.length}`);
for (const r of fn) console.log(`  ${r.c.command}\n    ${r.summary}`);
console.log(`Falsos positivos (inofensivo pediu confirmação): ${fp.length}`);
for (const r of fp) console.log(`  ${r.c.command}\n    ${r.summary}`);
