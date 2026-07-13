// The consumer-side gate for soksak-spec-plugin-git (SPEC §1).
//
// The acceptance suite scores the implementer. This scores everyone else: a plugin that speaks the
// contract's name must not also speak an implementer's. Without this, the convergence is a habit
// rather than a rule — the next edit re-pins the name and nothing objects.
//
// It runs twice, on purpose:
//   1. against a fixture registrar holding the two defects — a consumer that discovers and then
//      calls the implementer by name anyway, and a consumer that quotes the contract and resolves
//      nothing. Both MUST be caught, or the audit is scoring nothing.
//   2. against the real registrar — the actual verdict.
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { auditConsumers } from "../src/consumers.js";
import { CONTRACT_ID, registrarDir } from "../src/discover.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PINNED_REGISTRAR = path.join(here, "pinned-registrar");

describe(`${CONTRACT_ID} — the consumer audit itself`, () => {
  it("catches a consumer that resolves the contract and calls the implementer by name anyway", () => {
    const verdict = auditConsumers(PINNED_REGISTRAR);
    const pinned = verdict.find((v) => v.id === "soksak-plugin-namepin-git");
    assert.ok(pinned, "the audit did not even see the name-pinning consumer");
    assert.ok(
      pinned.failures.some((f) => f.includes("calls the implementer by name")),
      `a name-pin went unreported: ${JSON.stringify(pinned.failures)}`,
    );
  });

  it("catches a consumer that quotes the contract and resolves nothing", () => {
    const verdict = auditConsumers(PINNED_REGISTRAR);
    const blind = verdict.find((v) => v.id === "soksak-plugin-blind-git");
    assert.ok(blind, "the audit did not even see the contract-quoting consumer");
    assert.ok(
      blind.failures.some((f) => f.includes("never resolves an implementer")),
      `decoration went unreported: ${JSON.stringify(blind.failures)}`,
    );
  });
});

describe(`${CONTRACT_ID} — the consumers`, () => {
  it("resolve the implementer by contract and never name it", () => {
    const verdict = auditConsumers();
    assert.ok(verdict.length > 0, `no plugin in ${registrarDir()} consumes ${CONTRACT_ID}`);
    const failures = verdict.flatMap((v) => v.failures);
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });
});
