import type { GuardConfig } from "./config.ts";
import { FLAG_LABELS, RISK_LABELS, type FlagName } from "./questions.ts";

/**
 * - "pass": o hook não opina e o Claude Code segue o fluxo normal de permissões.
 *   O guardião NUNCA aprova sozinho: ele só adiciona atrito, nunca remove.
 * - "ask":  força o Claude Code a pedir sua confirmação.
 * - "deny": bloqueia o comando (só com denyEnabled = true).
 */
export type Decision = "pass" | "ask" | "deny";

/** O subconjunto das respostas do Jev que a política usa (GuardAnswers encaixa aqui). */
export interface PolicyInput {
  category: { choice: string; confidence: number };
  risk: { score: number };
  deletes_data: { noul: number };
  sends_data_out: { noul: number };
  touches_secrets: { noul: number };
  runs_remote_code: { noul: number };
}

export interface Verdict {
  decision: Decision;
  /** Motivos legíveis, ex.: "apaga/sobrescreve dados (97%)". */
  reasons: string[];
  /** Uma linha para mostrar ao usuário no prompt de confirmação. */
  summary: string;
}

type PolicyConfig = Pick<GuardConfig, "askAtRisk" | "denyAtRisk" | "flagThreshold" | "denyEnabled">;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function riskLabel(score: number): string {
  const i = Math.min(RISK_LABELS.length - 1, Math.max(0, Math.round(score)));
  return RISK_LABELS[i] ?? "?";
}

/**
 * Transforma probabilidades em decisão. É aqui que o Jev "vira" comportamento:
 * ele só responde as perguntas, quem decide o que fazer com as respostas é o seu código.
 */
export function decide(a: PolicyInput, cfg: PolicyConfig): Verdict {
  const flags = (Object.keys(FLAG_LABELS) as FlagName[]).filter((f) => a[f].noul >= cfg.flagThreshold);
  const reasons = flags.map((f) => `${FLAG_LABELS[f]} (${pct(a[f].noul)})`);

  const risk = a.risk.score;
  const riskText = `risco ${risk.toFixed(1)}/3 (${riskLabel(risk)})`;
  if (risk >= cfg.askAtRisk) reasons.unshift(riskText);

  const critical = risk >= cfg.denyAtRisk || flags.includes("runs_remote_code");

  let decision: Decision = "pass";
  if (cfg.denyEnabled && critical) decision = "deny";
  else if (reasons.length > 0) decision = "ask";

  const head = decision === "pass" ? riskText : reasons.join(" · ");
  const summary = `Jev: ${head} · categoria ${a.category.choice} (${pct(a.category.confidence)})`;
  return { decision, reasons, summary };
}
