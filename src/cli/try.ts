/**
 * Testa um comando na mão e mostra TUDO que o Jev respondeu.
 *
 *   npm run try -- "git push --force origin main"
 *   npm run try -- --tool PowerShell "Remove-Item -Recurse C:\temp"
 */
import { createClassifier, createClient } from "../classify.ts";
import { loadConfig } from "../config.ts";
import { decide, riskLabel } from "../policy.ts";

const args = process.argv.slice(2);
let tool = "Bash";
const toolIdx = args.indexOf("--tool");
if (toolIdx >= 0) {
  tool = args[toolIdx + 1] ?? tool;
  args.splice(toolIdx, 2);
}
const command = args.join(" ").trim();
if (!command) {
  console.error('Uso: npm run try -- [--tool Bash|PowerShell] "<comando>"');
  process.exit(1);
}

const config = loadConfig();
const classify = createClassifier(createClient(config));

const started = performance.now();
const { model, answers: a, usage } = await classify({ tool, command, cwd: process.cwd() });
const ms = Math.round(performance.now() - started);
const v = decide(a, config);

const pct = (p: number) => `${(p * 100).toFixed(1).padStart(5)}%`;
const bar = (p: number) => "█".repeat(Math.round(p * 20)).padEnd(20, "·");

console.log(`\n$ ${command}   (${tool})`);
console.log(`modelo ${model} · ${ms} ms · ${usage.input_tokens ?? "?"} tokens de entrada\n`);

console.log(`category (choice) -> ${a.category.choice}  confiança ${pct(a.category.confidence)}`);
for (const [label, p] of Object.entries(a.category.probabilities).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${label.padEnd(16)} ${bar(p)} ${pct(p)}`);
}

console.log(`\nrisk (score) -> ${a.risk.score.toFixed(2)} (${riskLabel(a.risk.score)})  confiança ${pct(a.risk.confidence)}`);
for (const [level, p] of Object.entries(a.risk.probabilities)) {
  console.log(`  ${level} ${riskLabel(Number(level)).padEnd(11)} ${bar(p)} ${pct(p)}`);
}

console.log("\nflags (noul):");
for (const flag of ["deletes_data", "sends_data_out", "touches_secrets", "runs_remote_code"] as const) {
  const p = a[flag].noul;
  const mark = p >= config.flagThreshold ? " <- conta como SIM" : "";
  console.log(`  ${flag.padEnd(17)} ${bar(p)} ${pct(p)}${mark}`);
}

console.log(`\ndecisão do hook: ${v.decision.toUpperCase()}`);
console.log(v.summary + "\n");
