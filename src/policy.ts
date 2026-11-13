import type { GuardConfig } from "./config.ts";
import { FLAG_LABELS, RISK_LABELS, type FlagName } from "./questions.ts";

/**
 * - "pass": the hook stays silent and Claude Code follows its normal permission flow.
 *   The guard NEVER approves on its own: it only adds friction, never removes it.
 * - "ask":  forces Claude Code to ask for your confirmation.
 * - "deny": blocks the command (only with denyEnabled = true).
 */
export type Decision = "pass" | "ask" | "deny";

/** The subset of Jev's answers the policy uses (GuardAnswers fits here). */
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
  /** Human-readable reasons, e.g. "deletes/overwrites data (97%)". */
  reasons: string[];
  /** One line shown to the user in the confirmation prompt. */
  summary: string;
}

type PolicyConfig = Pick<GuardConfig, "askAtRisk" | "denyAtRisk" | "flagThreshold" | "denyEnabled">;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function riskLabel(score: number): string {
  const i = Math.min(RISK_LABELS.length - 1, Math.max(0, Math.round(score)));
  return RISK_LABELS[i] ?? "?";
}

/**
 * Turns probabilities into a decision. This is where Jev "becomes" behavior:
 * it only answers the questions; your code decides what to do with the answers.
 */
export function decide(a: PolicyInput, cfg: PolicyConfig): Verdict {
  const flags = (Object.keys(FLAG_LABELS) as FlagName[]).filter((f) => a[f].noul >= cfg.flagThreshold);
  const reasons = flags.map((f) => `${FLAG_LABELS[f]} (${pct(a[f].noul)})`);

  const risk = a.risk.score;
  const riskText = `risk ${risk.toFixed(1)}/3 (${riskLabel(risk)})`;
  if (risk >= cfg.askAtRisk) reasons.unshift(riskText);

  const critical = risk >= cfg.denyAtRisk || flags.includes("runs_remote_code");

  let decision: Decision = "pass";
  if (cfg.denyEnabled && critical) decision = "deny";
  else if (reasons.length > 0) decision = "ask";

  const head = decision === "pass" ? riskText : reasons.join(" · ");
  const summary = `Jev: ${head} · category ${a.category.choice} (${pct(a.category.confidence)})`;
  return { decision, reasons, summary };
}
