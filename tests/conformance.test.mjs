// The acceptance suite for soksak-git-spec.
//
// It runs twice, on purpose:
//   1. against a stub that declares the contract and implements nothing — every command case MUST
//      fail. A suite a stub can pass is scoring nothing, and this test is the proof it does not.
//   2. against whatever the registrar says implements the contract — the real verdict. The suite
//      never names that plugin; it discovers it (SPEC §1, §8).
import assert from "node:assert/strict";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CONTRACT_ID, requireImplementer } from "../src/discover.js";
import { build, remove } from "../src/fixture.js";
import { activate } from "../src/host.js";
import { report, score } from "../src/score.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUB_REGISTRAR = path.join(here, "stub-registrar");

// Each run gets a fresh fixture — a case that mutates (merge, worktree) must not decide the next
// run's verdict, and a crashed run must not leave one behind that decides the next one's.
after(() => remove());

describe(`${CONTRACT_ID} — the suite itself`, () => {
  it("scores an empty implementer zero on every command case", async () => {
    const fx = build();
    const stub = requireImplementer(STUB_REGISTRAR);
    const host = await activate(stub, { projectRoot: null });
    try {
      const verdict = await score(host, fx, { eventTimeoutMs: 500 });
      const commandCases = verdict.results.filter((r) => r.section !== "convention");
      const passed = commandCases.filter((r) => r.ok).map((r) => r.id);
      assert.deepEqual(passed, [], `a stub passed cases it cannot implement: ${passed.join(", ")}`);
      assert.ok(commandCases.length >= 15, "the suite must score a surface, not a handful of cases");
    } finally {
      host.dispose();
    }
  });
});

describe(`${CONTRACT_ID} — the implementer`, () => {
  it("conforms", async () => {
    const fx = build();
    const impl = requireImplementer();
    const host = await activate(impl, { projectRoot: null });
    try {
      const verdict = await score(host, fx);
      assert.equal(verdict.failed.length, 0, `\n${report(verdict)}\n`);
    } finally {
      host.dispose();
    }
  });
});
