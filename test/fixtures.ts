import type { PolicyInput } from "../src/policy.ts";

/** Respostas do Jev para um comando inofensivo; sobrescreva o que o teste precisar. */
export function answers(overrides: Partial<{ [K in keyof PolicyInput]: Partial<PolicyInput[K]> }> = {}): PolicyInput {
  const base: PolicyInput = {
    category: { choice: "read_only", confidence: 0.95 },
    risk: { score: 0.1 },
    deletes_data: { noul: 0.01 },
    sends_data_out: { noul: 0.01 },
    touches_secrets: { noul: 0.01 },
    runs_remote_code: { noul: 0.01 },
  };
  for (const [k, v] of Object.entries(overrides)) {
    Object.assign(base[k as keyof PolicyInput], v);
  }
  return base;
}

/** Corpo de resposta da API no formato documentado de POST /v1/systemone. */
export function apiResponse(a: PolicyInput) {
  const categories = ["read_only", "build_test", "git", "package_install", "file_change", "network", "system"];
  return {
    model: "jev-1.14.0",
    answers: {
      category: {
        type: "choice",
        choice: a.category.choice,
        confidence: a.category.confidence,
        probabilities: Object.fromEntries(
          categories.map((c) => [c, c === a.category.choice ? a.category.confidence : (1 - a.category.confidence) / 6]),
        ),
      },
      risk: {
        type: "score",
        score: a.risk.score,
        confidence: 0.8,
        legend: { "0": "Harmless", "1": "Low", "2": "High", "3": "Critical" },
        probabilities: { "0": 0.7, "1": 0.2, "2": 0.1, "3": 0 },
      },
      deletes_data: { type: "noul", noul: a.deletes_data.noul },
      sends_data_out: { type: "noul", noul: a.sends_data_out.noul },
      touches_secrets: { type: "noul", noul: a.touches_secrets.noul },
      runs_remote_code: { type: "noul", noul: a.runs_remote_code.noul },
    },
    usage: { input_tokens: 512, output_tokens: 40 },
  };
}
