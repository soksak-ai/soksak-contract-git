// The consumer-side rule, mechanized (SPEC §1).
//
// A contract is only worth the coupling it removes. A consumer that resolves the implementer by
// contract and then *also* hard-codes its id has removed nothing — the discovery call is decoration,
// and the day a second implementer arrives the consumer still calls the first one by name.
//
// So: a plugin that names this contract must not name any implementer of it. That is a fact about
// its source, and this file reads it.
import fs from "node:fs";
import path from "node:path";
import { CONTRACT_ID, implementers, registrarDir } from "./discover.js";

// Every plugin that speaks this contract's name in its code — the consumers, plus the implementers
// (who also declare it in their manifest). Implementers are excluded: an implementer *is* the
// surface, so a self-call is not a name-pin.
export function consumers(dir = registrarDir(), contract = CONTRACT_ID) {
  const providers = new Set(implementers(dir, contract).map((i) => i.id));
  const out = [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of names) {
    const manifestPath = path.join(dir, name, "plugin.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const id = String(manifest.id ?? name);
    if (providers.has(id)) continue;
    const entry = path.join(dir, name, String(manifest.entry ?? "main.js"));
    let source;
    try {
      source = fs.readFileSync(entry, "utf8");
    } catch {
      continue;
    }
    if (!source.includes(contract)) continue; // does not speak this contract at all
    out.push({ id, dir: path.join(dir, name), entry, source, manifest });
  }
  return out;
}

// A call to a specific plugin's command: `plugin.<id>.<cmd>` (the app's command grammar).
const CALL_RE = /plugin\.(soksak-plugin-[a-z0-9-]+)\./g;

// The violations of one consumer. Empty = it consumes the contract without knowing who serves it.
export function violations(consumer, providerIds) {
  const found = [];

  // 1. It must ask who implements the contract. A consumer that never calls plugin.implementers is
  //    not discovering anything — it is quoting the contract id in a comment.
  if (!consumer.source.includes("plugin.implementers")) {
    found.push(`${consumer.id}: names the contract but never resolves an implementer (plugin.implementers)`);
  }

  // 2. It must not call an implementer by name. Its own commands are its own business.
  for (const m of consumer.source.matchAll(CALL_RE)) {
    const target = m[1];
    if (target === consumer.id) continue;
    if (providerIds.includes(target)) {
      found.push(`${consumer.id}: calls the implementer by name — plugin.${target}.… (contract-pin, not name-pin)`);
    }
  }
  return [...new Set(found)];
}

// The whole registrar's consumer verdict.
export function auditConsumers(dir = registrarDir(), contract = CONTRACT_ID) {
  const providerIds = implementers(dir, contract).map((i) => i.id);
  return consumers(dir, contract).map((c) => ({
    id: c.id,
    failures: violations(c, providerIds),
  }));
}
