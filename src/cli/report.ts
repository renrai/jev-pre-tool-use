/**
 * Resume o log do hook (logs/decisions.jsonl).
 *
 *   npm run report          -> resumo geral
 *   npm run report -- 20    -> resumo + últimas 20 decisões
 */
import { readLog } from "../log.ts";

// Preço de entrada divulgado pela TypeSafe (saída é gratuita). Confira o valor atual no console.
const USD_PER_MILLION_INPUT = 0.042;

const entries = readLog();
if (entries.length === 0) {
  console.log("Nenhuma decisão registrada ainda. Use o Claude Code nesta pasta e volte aqui.");
  process.exit(0);
}

const count = <T extends string>(items: T[]) =>
  items.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
const print = (title: string, rec: Record<string, number>) => {
  console.log(`\n${title}`);
  for (const [k, n] of Object.entries(rec).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${String(n).padStart(5)}  ${"█".repeat(Math.ceil((n / entries.length) * 40))}`);
  }
};

const ok = entries.filter((e) => e.decision !== "error");
const latencies = ok.map((e) => e.latencyMs).sort((a, b) => a - b);
const pctl = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
const tokens = ok.reduce((s, e) => s + (e.inputTokens ?? 0), 0);

console.log(`Decisões registradas: ${entries.length} (${entries[0]?.ts} até ${entries.at(-1)?.ts})`);
print("Decisão do hook", count(entries.map((e) => e.decision)));
print(
  "Categoria (segundo o Jev)",
  count(ok.map((e) => (e.answers as { category?: { choice?: string } })?.category?.choice ?? "?")),
);
console.log(`\nLatência: p50 ${pctl(0.5)} ms · p95 ${pctl(0.95)} ms`);
console.log(`Tokens de entrada: ${tokens} (~US$ ${((tokens / 1e6) * USD_PER_MILLION_INPUT).toFixed(5)})`);

const errors = entries.filter((e) => e.decision === "error");
if (errors.length) {
  console.log(`\nErros (${errors.length}), o último: ${errors.at(-1)?.error}`);
}

const flagged = entries.filter((e) => e.decision === "ask" || e.decision === "deny");
if (flagged.length) {
  console.log("\nComandos que pediram confirmação/bloqueio (revise se fazem sentido):");
  for (const e of flagged.slice(-15)) console.log(`  [${e.decision}] ${e.command}\n         ${e.summary}`);
}

const last = Number(process.argv[2]);
if (last > 0) {
  console.log(`\nÚltimas ${last} decisões:`);
  for (const e of entries.slice(-last)) console.log(`  ${e.decision.padEnd(5)} ${e.latencyMs}ms  ${e.command}`);
}
