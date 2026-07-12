// Discovery — resolve the contract's implementer from the registrar, by contract id alone.
// The suite must never name a plugin: it scans manifests for `implements` and takes what it finds
// (SPEC §1). A suite that imported a known path would be scoring one plugin, not the contract.
import fs from "node:fs";
import path from "node:path";

export const CONTRACT_ID = "soksak-git-spec";

// Default registrar: SOKSAK_HOME/plugins (declare + discover, NAMING §4a). No symlinks, no ../..
export function registrarDir() {
  const home = process.env.SOKSAK_HOME || path.join(process.env.HOME ?? "", ".soksak-dev");
  return path.join(home, "plugins");
}

// scan(dir) → [{ id, dir, entry }] for every manifest declaring CONTRACT_ID.
// A manifest that is unreadable or malformed is skipped — it declares nothing, so it implements
// nothing; a parse crash here would blame the suite for someone else's broken plugin.
export function implementers(dir = registrarDir(), contract = CONTRACT_ID) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names) {
    const manifestPath = path.join(dir, name, "plugin.json");
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const declared = Array.isArray(manifest.implements) ? manifest.implements : [];
    if (!declared.includes(contract)) continue;
    found.push({
      id: String(manifest.id ?? name),
      dir: path.join(dir, name),
      entry: path.join(dir, name, String(manifest.entry ?? "main.js")),
    });
  }
  return found;
}

// The one subject under test. Zero implementers is a loud failure of the run, never a skip — a
// green suite that tested nothing is worse than a red one.
export function requireImplementer(dir = registrarDir(), contract = CONTRACT_ID) {
  const found = implementers(dir, contract);
  if (found.length === 0) {
    throw new Error(`no plugin in ${dir} declares implements: ["${contract}"]`);
  }
  return found[0];
}
