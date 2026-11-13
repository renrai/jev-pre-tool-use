import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { decide, riskLabel } from "../src/policy.ts";
import { answers } from "./fixtures.ts";

const cfg = DEFAULT_CONFIG;

describe("decide", () => {
  it("lets low-risk commands with no flags pass", () => {
    const v = decide(answers(), cfg);
    assert.equal(v.decision, "pass");
    assert.deepEqual(v.reasons, []);
  });

  it("asks for confirmation when risk reaches askAtRisk", () => {
    const v = decide(answers({ risk: { score: 1.8 } }), cfg);
    assert.equal(v.decision, "ask");
    assert.match(v.summary, /risk 1\.8\/3 \(high\)/);
  });

  it("asks for confirmation when a flag crosses the threshold, even at low risk", () => {
    const v = decide(answers({ touches_secrets: { noul: 0.93 } }), cfg);
    assert.equal(v.decision, "ask");
    assert.deepEqual(v.reasons, ["touches credentials (93%)"]);
  });

  it("ignores flags below the threshold", () => {
    const v = decide(answers({ deletes_data: { noul: 0.79 } }), cfg);
    assert.equal(v.decision, "pass");
  });

  it("never blocks when denyEnabled = false", () => {
    const v = decide(answers({ risk: { score: 3 }, runs_remote_code: { noul: 1 } }), cfg);
    assert.equal(v.decision, "ask");
  });

  it("blocks critical risk when denyEnabled = true", () => {
    const v = decide(answers({ risk: { score: 2.7 } }), { ...cfg, denyEnabled: true });
    assert.equal(v.decision, "deny");
  });

  it("blocks remote code when denyEnabled = true, even with a moderate score", () => {
    const v = decide(answers({ risk: { score: 1.6 }, runs_remote_code: { noul: 0.9 } }), { ...cfg, denyEnabled: true });
    assert.equal(v.decision, "deny");
  });
});

describe("riskLabel", () => {
  it("rounds the score to the nearest level and clamps to 0..3", () => {
    assert.equal(riskLabel(-1), "harmless");
    assert.equal(riskLabel(0.4), "harmless");
    assert.equal(riskLabel(1.5), "high");
    assert.equal(riskLabel(9), "critical");
  });
});
