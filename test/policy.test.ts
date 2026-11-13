import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { decide, riskLabel } from "../src/policy.ts";
import { answers } from "./fixtures.ts";

const cfg = DEFAULT_CONFIG;

describe("decide", () => {
  it("deixa passar comandos de baixo risco sem flags", () => {
    const v = decide(answers(), cfg);
    assert.equal(v.decision, "pass");
    assert.deepEqual(v.reasons, []);
  });

  it("pede confirmação quando o risco passa de askAtRisk", () => {
    const v = decide(answers({ risk: { score: 1.8 } }), cfg);
    assert.equal(v.decision, "ask");
    assert.match(v.summary, /risco 1\.8\/3 \(alto\)/);
  });

  it("pede confirmação quando uma flag passa do limite, mesmo com risco baixo", () => {
    const v = decide(answers({ touches_secrets: { noul: 0.93 } }), cfg);
    assert.equal(v.decision, "ask");
    assert.deepEqual(v.reasons, ["mexe com credenciais (93%)"]);
  });

  it("ignora flags abaixo do limite", () => {
    const v = decide(answers({ deletes_data: { noul: 0.79 } }), cfg);
    assert.equal(v.decision, "pass");
  });

  it("nunca bloqueia com denyEnabled = false", () => {
    const v = decide(answers({ risk: { score: 3 }, runs_remote_code: { noul: 1 } }), cfg);
    assert.equal(v.decision, "ask");
  });

  it("bloqueia risco crítico com denyEnabled = true", () => {
    const v = decide(answers({ risk: { score: 2.7 } }), { ...cfg, denyEnabled: true });
    assert.equal(v.decision, "deny");
  });

  it("bloqueia código remoto com denyEnabled = true, mesmo com score moderado", () => {
    const v = decide(answers({ risk: { score: 1.6 }, runs_remote_code: { noul: 0.9 } }), { ...cfg, denyEnabled: true });
    assert.equal(v.decision, "deny");
  });
});

describe("riskLabel", () => {
  it("arredonda o score para o nível mais próximo e limita a 0..3", () => {
    assert.equal(riskLabel(-1), "inofensivo");
    assert.equal(riskLabel(0.4), "inofensivo");
    assert.equal(riskLabel(1.5), "alto");
    assert.equal(riskLabel(9), "crítico");
  });
});
