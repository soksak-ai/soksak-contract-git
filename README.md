# soksak-contract-git

The git domain's contract: **`soksak-git-spec`**.

- **[SPEC.md](SPEC.md)** — the contract. English is canonical.
- **`tests/conformance.test.mjs`** — the acceptance suite that decides whether an implementer conforms.

**This repository ships nothing.** No `dist`, no registry entry, no installed artifact — it holds a
contract's text and the suite that scores it, and it is consumed only as a dev-dependency by the
plugins the contract governs (NAMING §4a, kind `contract`). The repository is named after the domain
it standardizes; the contract id it defines (`soksak-git-spec`) is an identifier string, not a
repository name, and the two differ on purpose.

## Running the suite

```
npm test          # or: bash scripts/gate.sh
```

The suite **discovers its subject**: it scans `$SOKSAK_HOME/plugins` (default `~/.soksak-dev/plugins`)
for a manifest declaring `implements: ["soksak-git-spec"]` and drives whatever it finds. It never
names a plugin — a suite that imported a known implementer would be scoring that implementer, not
the contract.

It builds a real fixture repository (`~/.soksak-e2e/contract-git`, rebuilt and reclaimed each run),
activates the implementer against a host whose process capability spawns real binaries, and compares
every answer to a **declared expectation** (`src/cases.js`) — never to whatever git happened to
print.

Every invocation the implementer makes is recorded, so the execution convention (SPEC §3 — locale
fixation, read-lock suppression, machine-readable output, the `--` path boundary) is scored as a fact
about those invocations rather than taken on trust.

The first thing the suite does is score a **stub** that declares the contract and implements none of
it. If the stub passes anything, the suite is measuring nothing, and that is a failure of the suite.

## Consuming the contract

An implementer declares it:

```json
{ "implements": ["soksak-git-spec"] }
```

A consumer never names the implementer. It resolves one by contract id:

```
sok plugin.implementers '{"contract":"soksak-git-spec"}'
```

and addresses it as `plugin.<discovered id>.<command>`. Finding none is a loud refusal — not a
fallback, and not a private git spawn.
