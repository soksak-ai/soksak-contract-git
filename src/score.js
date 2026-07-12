// The scorer — drive an activated implementer through the declared cases and report the verdict.
// It reports; it does not decide. A case fails with the detail that made it fail, so a red run says
// what the contract wanted and what it got, never "conformance failed".
import fs from "node:fs";
import { cases, conventionAudits } from "./cases.js";
import { match } from "./expect.js";

// Wait for a bus event by subscription — the change pipeline is event-driven, and a scorer that
// polled for the event would score a claim it had itself relaxed.
function eventWaiter(host, topic) {
  const seen = [];
  const waiters = [];
  host.app.bus.on(topic, (payload) => {
    seen.push(payload);
    for (const w of [...waiters]) {
      if (w.pred(payload)) {
        waiters.splice(waiters.indexOf(w), 1);
        clearTimeout(w.timer);
        w.resolve(payload);
      }
    }
  });
  return (pred, timeoutMs) =>
    new Promise((resolve, reject) => {
      const hit = seen.find(pred);
      if (hit) return resolve(hit);
      const w = { pred, resolve };
      w.timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(w), 1);
        reject(new Error(`no ${topic} event within ${timeoutMs}ms (saw ${JSON.stringify(seen)})`));
      }, timeoutMs);
      waiters.push(w);
    });
}

async function runCase(c, host, fx, waitFor, eventTimeoutMs) {
  const failures = [];
  for (const [i, step] of c.steps.entries()) {
    const at = `step ${i + 1}`;
    if (step.touch) {
      fs.writeFileSync(step.touch(fx), `${Date.now()}\n`);
      if (step.awaitEvent) {
        try {
          await waitFor((p) => p?.kind === step.awaitEvent.kind, eventTimeoutMs);
        } catch (e) {
          failures.push(`${at}: ${e.message}`);
          break;
        }
      }
      continue;
    }
    const params = typeof step.params === "function" ? step.params(fx) : (step.params ?? {});
    const res = await host.execute(step.cmd, params);
    const expected = typeof step.expect === "function" ? step.expect(fx) : step.expect;
    const bad = match(res, expected, `${at} ${step.cmd}`);
    if (bad.length > 0) {
      failures.push(...bad.map((b) => `${b} — answered ${JSON.stringify(res)}`));
      break; // a lifecycle whose first step failed cannot score its later steps honestly
    }
  }
  return { id: c.id, section: c.section, ok: failures.length === 0, failures };
}

export async function score(host, fx, { eventTimeoutMs = 5000 } = {}) {
  const waitFor = eventWaiter(host, "git.changed");
  const results = [];
  for (const c of cases) results.push(await runCase(c, host, fx, waitFor, eventTimeoutMs));
  for (const a of conventionAudits) {
    const failures = a.check(host.spawnLog);
    results.push({ id: a.id, section: "convention", ok: failures.length === 0, failures });
  }
  const failed = results.filter((r) => !r.ok);
  return { results, passed: results.length - failed.length, total: results.length, failed };
}

export function report(verdict) {
  const lines = [];
  for (const r of verdict.results) {
    lines.push(`${r.ok ? "PASS" : "FAIL"}  ${r.id}`);
    for (const f of r.failures) lines.push(`        ${f}`);
  }
  lines.push(`\n${verdict.passed}/${verdict.total} cases pass`);
  return lines.join("\n");
}
