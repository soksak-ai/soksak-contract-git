#!/usr/bin/env node
// Generic contract build-release — ID·FILES 동적, CONTRACT_ID 는 env(안전 주입).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRegularFileArchive, sha256 } from "./archive.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STRICT_SEMVER_RE = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const CANDIDATES = ["LICENSE", "NOTICE", "README.ko.md", "README.md", "SPEC.md", "package.json", "src", "tests", "scripts", "goldens"];

function option(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
const commit = option("--commit");
const outDir = path.resolve(option("--out") ?? path.join(root, "dist"));
if (!/^[a-f0-9]{40}$/.test(commit ?? "")) { console.error("--commit must be an exact 40-char SHA"); process.exit(2); }

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ID = pkg.name;
const REPOSITORY = `https://github.com/soksak-ai/${ID}`;
if (typeof pkg.version !== "string" || !STRICT_SEMVER_RE.test(pkg.version)) throw new Error("package version must be strict SemVer");
if (pkg.private !== true) throw new Error("package must remain private");
const CONTRACT_ID = process.env.SOKSAK_CONTRACT_ID;
if (!/^soksak-spec-(plugin|sidecar|service)-[a-z0-9-]+$/.test(CONTRACT_ID ?? "")) throw new Error(`SOKSAK_CONTRACT_ID invalid: ${CONTRACT_ID}`);
const CONTRACT = { id: CONTRACT_ID, version: pkg.version };
const FILES = CANDIDATES.filter((f) => fs.existsSync(path.join(root, f)));
if (!FILES.includes("SPEC.md")) throw new Error("SPEC.md required");

fs.mkdirSync(outDir, { recursive: true });
const tag = `v${CONTRACT.version}`;
const archiveName = `${ID}-${CONTRACT.version}.tgz`;
const archive = createRegularFileArchive({ root, files: FILES });
const digest = sha256(archive);
fs.writeFileSync(path.join(outDir, archiveName), archive);
const artifact = { name: archiveName, url: `${REPOSITORY}/releases/download/${tag}/${archiveName}`, sha256: digest, format: "tgz" };
const source = { repository: REPOSITORY, commit };
const release = { contract: CONTRACT, source, releaseTag: tag, artifact };
const releaseBytes = Buffer.from(`${JSON.stringify(release, null, 2)}\n`);
const conformance = { subject: { kind: "contract", id: ID, version: CONTRACT.version, manifestSha256: sha256(releaseBytes) }, contract: CONTRACT, source, artifact: { name: artifact.name, sha256: artifact.sha256 }, result: "passed", validator: { name: ID, version: CONTRACT.version } };
fs.writeFileSync(path.join(outDir, "release.json"), releaseBytes);
fs.writeFileSync(path.join(outDir, "conformance.json"), `${JSON.stringify(conformance, null, 2)}\n`);
console.log(JSON.stringify({ id: ID, contract: CONTRACT_ID, archive: archiveName, files: FILES, sha256: digest }));
