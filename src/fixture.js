// The fixture — the repository shape every expectation in cases.js is declared against.
// Built with real git, deterministically (fixed identity, fixed dates, fixed default branch), so
// that a declared expectation is a fact about the contract and not about the machine it ran on.
//
// The root is a fixed, reusable path (never a scattered temp dir) and the build is idempotent:
// it removes and rebuilds, so a crashed run leaves nothing that changes the next run's verdict.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FIXTURE_ROOT = path.join(os.homedir(), ".soksak-e2e", "contract-git");

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@soksak.test",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@soksak.test",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  GIT_CONFIG_GLOBAL: "/dev/null", // a developer's ~/.gitconfig must not decide a conformance verdict
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
};

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" });
}

function write(root, rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// A repository on `main` with one branch `feat/x` that has diverged: one file modified, one added,
// one deleted. The declared subject lines and paths are what cases.js asserts against.
export const MAIN_SUBJECT = "Add the initial tree";
export const FEAT_SUBJECT = "Change a, add new, drop b";
export const FEAT_BRANCH = "feat/x";
export const BASE_BRANCH = "main";

function buildRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, "init", "-q", "-b", BASE_BRANCH);
  write(root, "a.txt", "a1\n");
  write(root, "b.txt", "b1\n");
  write(root, "docs/keep.md", "keep\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", MAIN_SUBJECT);

  git(root, "checkout", "-q", "-b", FEAT_BRANCH);
  write(root, "a.txt", "a1\na2\n"); // +1 line, -0
  write(root, "new.txt", "n1\nn2\n"); // +2 lines
  fs.rmSync(path.join(root, "b.txt")); // -1 line
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", FEAT_SUBJECT);

  git(root, "checkout", "-q", BASE_BRANCH);
  return root;
}

// The dirty working tree `status` is declared against: one tracked file modified but not staged,
// one file staged for addition, one file untracked.
function dirty(root) {
  write(root, "a.txt", "a1\ndirty\n"); // modified, unstaged
  write(root, "c.txt", "c1\n");
  git(root, "add", "c.txt"); // added, staged
  write(root, "u.txt", "u1\n"); // untracked
}

export function build(root = FIXTURE_ROOT) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });

  const repo = buildRepo(path.join(root, "repo"));
  dirty(repo);

  // A second, clean repository of the same shape — `merge` mutates, and a mutated fixture would
  // make every case that runs after it depend on the order the suite happened to run in.
  const mergeRepo = buildRepo(path.join(root, "merge-repo"));

  // Outside any repository.
  const plain = path.join(root, "plain");
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, "readme.txt"), "not a repo\n");

  // A repository git cannot read: `.git` is a file, and not a valid gitfile. This is the case that
  // separates a tri-state `root` from a two-state one — git fails, but the directory is NOT a
  // non-repository, and an implementer that answers `not-repo` here invites a consumer to init over
  // a broken repository.
  const broken = path.join(root, "broken");
  fs.mkdirSync(broken, { recursive: true });
  fs.writeFileSync(path.join(broken, ".git"), "this is not a gitfile\n");

  return { root, repo, mergeRepo, plain, broken };
}

export function remove(root = FIXTURE_ROOT) {
  fs.rmSync(root, { recursive: true, force: true });
}
