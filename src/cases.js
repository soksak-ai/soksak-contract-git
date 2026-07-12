// The acceptance cases — the contract's surface, stated as expectations against the fixture (SPEC §8).
// Every value here is DECLARED: it is what soksak-git-spec requires, derived from the fixture's
// known shape (src/fixture.js), never from what an implementation happened to print.
//
// A case is a sequence of steps so that a lifecycle (add a worktree, see it, remove it) is scored as
// the lifecycle it is — a surface that can create but not reclaim has not implemented this contract.
import path from "node:path";
import { BASE_BRANCH, FEAT_BRANCH, FEAT_SUBJECT, MAIN_SUBJECT } from "./fixture.js";
import { contains, count, lacks, sha, setBy } from "./expect.js";

const ok = (data) => ({ ok: true, data });
const refuses = (code) => ({ ok: false, code });

export const cases = [
  // ── §5 discovery ────────────────────────────────────────────────────────────
  {
    id: "root.repo",
    section: "root",
    steps: [
      { cmd: "root", params: (fx) => ({ path: fx.repo }), expect: (fx) => ok({ state: "repo", root: fx.repo }) },
    ],
  },
  {
    id: "root.notRepo",
    section: "root",
    steps: [{ cmd: "root", params: (fx) => ({ path: fx.plain }), expect: () => ok({ state: "not-repo" }) }],
  },
  {
    // The tri-state's whole point: a repository git cannot read is NOT a non-repository.
    id: "root.error",
    section: "root",
    steps: [{ cmd: "root", params: (fx) => ({ path: fx.broken }), expect: () => ok({ state: "error" }) }],
  },
  {
    id: "root.noPath",
    section: "root",
    steps: [{ cmd: "root", params: () => ({}), expect: () => refuses("NO_PATH") }],
  },

  // ── §6 status ───────────────────────────────────────────────────────────────
  {
    id: "status.entries",
    section: "status",
    steps: [
      {
        cmd: "status",
        params: (fx) => ({ path: fx.repo }),
        expect: () =>
          ok({
            branch: { head: BASE_BRANCH, oid: sha() },
            truncated: false,
            entries: setBy("path", [
              { path: "a.txt", status: "modified" },
              { path: "c.txt", status: "added" },
              { path: "u.txt", status: "untracked" },
            ]),
          }),
      },
    ],
  },

  // ── §6 change events ────────────────────────────────────────────────────────
  {
    id: "watch.lifecycle",
    section: "watch",
    steps: [
      {
        cmd: "watch.start",
        params: (fx) => ({ path: fx.repo }),
        expect: (fx) => ok({ root: fx.repo, watching: [`${fx.repo}/.git`, `${fx.repo}/.git/refs/heads`] }),
      },
      { cmd: "watch.list", params: () => ({}), expect: (fx) => ok({ watches: [{ root: fx.repo }] }) },
      // The event itself: touch the repository's own metadata and the implementer must say so — on a
      // filesystem notification, not on a timer (SPEC §6).
      { touch: (fx) => path.join(fx.repo, ".git", "conformance-probe"), awaitEvent: { topic: "git.changed", kind: "meta" } },
      { cmd: "watch.stop", params: (fx) => ({ path: fx.repo }), expect: () => ok({ stopped: true }) },
      { cmd: "watch.list", params: () => ({}), expect: () => ok({ watches: count(0) }) },
    ],
  },

  // ── §7.1 history ────────────────────────────────────────────────────────────
  {
    id: "log.commits",
    section: "log",
    steps: [
      {
        cmd: "log",
        params: (fx) => ({ path: fx.repo, limit: 5 }),
        expect: () => ok({ commits: [{ hash: sha(), short: contains(""), subject: MAIN_SUBJECT, author: "Fixture" }] }),
      },
    ],
  },
  {
    id: "show.commit",
    section: "show",
    steps: [
      {
        cmd: "show",
        params: (fx) => ({ path: fx.repo, commit: "HEAD" }),
        expect: () =>
          ok({
            meta: { subject: MAIN_SUBJECT, hash: sha() },
            files: setBy("path", [
              { path: "a.txt", status: "A" },
              { path: "b.txt", status: "A" },
              { path: "docs/keep.md", status: "A" },
            ]),
            patch: contains("+++ b/a.txt"),
          }),
      },
    ],
  },
  {
    id: "show.rejectsOption",
    section: "show",
    steps: [{ cmd: "show", params: (fx) => ({ path: fx.repo, commit: "--help" }), expect: () => refuses("INVALID_REF") }],
  },

  // ── §7.2 two-point diff ─────────────────────────────────────────────────────
  {
    id: "diff.working",
    section: "diff",
    steps: [
      {
        cmd: "diff",
        params: (fx) => ({ path: fx.repo }),
        expect: () => ok({ diff: contains("+dirty") }),
      },
    ],
  },
  {
    id: "diff.staged",
    section: "diff",
    steps: [
      {
        cmd: "diff",
        params: (fx) => ({ path: fx.repo, staged: true }),
        expect: () => ok({ diff: contains("+++ b/c.txt") }),
      },
    ],
  },

  // ── §7.3 three-point diff (base...target) ───────────────────────────────────
  {
    id: "diff.files.threePoint",
    section: "diff.files",
    steps: [
      {
        cmd: "diff.files",
        params: (fx) => ({ path: fx.repo, base: BASE_BRANCH, target: FEAT_BRANCH }),
        expect: () =>
          ok({
            files: setBy("path", [
              { path: "a.txt", status: "modified", added: 1, deleted: 0, binary: false },
              { path: "new.txt", status: "added", added: 2, deleted: 0, binary: false },
              { path: "b.txt", status: "deleted", added: 0, deleted: 1, binary: false },
            ]),
          }),
      },
    ],
  },
  {
    id: "diff.range.threePoint",
    section: "diff.range",
    steps: [
      {
        cmd: "diff.range",
        params: (fx) => ({ path: fx.repo, base: BASE_BRANCH, target: FEAT_BRANCH, file: "new.txt" }),
        expect: () => ok({ diff: contains("+++ b/new.txt") }),
      },
      {
        // The file boundary is a boundary: narrowing to new.txt must not leak a.txt's hunks.
        cmd: "diff.range",
        params: (fx) => ({ path: fx.repo, base: BASE_BRANCH, target: FEAT_BRANCH, file: "new.txt" }),
        expect: () => ok({ diff: lacks("a.txt") }),
      },
    ],
  },
  {
    id: "diff.range.rejectsOption",
    section: "diff.range",
    steps: [
      {
        cmd: "diff.range",
        params: (fx) => ({ path: fx.repo, base: BASE_BRANCH, target: "--upload-pack=touch" }),
        expect: () => refuses("INVALID_REF"),
      },
    ],
  },
  {
    id: "diff.files.rejectsRange",
    section: "diff.files",
    steps: [
      {
        // ".." is range syntax; a target carrying it is a consumer asking for something else.
        cmd: "diff.files",
        params: (fx) => ({ path: fx.repo, base: BASE_BRANCH, target: "main..feat/x" }),
        expect: () => refuses("INVALID_REF"),
      },
    ],
  },

  // ── §7.4 HEAD ───────────────────────────────────────────────────────────────
  {
    id: "head.branch",
    section: "head",
    steps: [
      {
        cmd: "head",
        params: (fx) => ({ path: fx.repo }),
        expect: () => ok({ branch: BASE_BRANCH, oid: sha(), detached: false }),
      },
    ],
  },

  // ── §7.5 branches and worktrees ─────────────────────────────────────────────
  {
    id: "branch.exists",
    section: "branch.exists",
    steps: [
      { cmd: "branch.exists", params: (fx) => ({ path: fx.repo, branch: FEAT_BRANCH }), expect: () => ok({ exists: true }) },
      { cmd: "branch.exists", params: (fx) => ({ path: fx.repo, branch: "no/such" }), expect: () => ok({ exists: false }) },
      {
        cmd: "branch.exists",
        params: (fx) => ({ path: fx.repo, branch: "../../etc" }),
        expect: () => refuses("INVALID_BRANCH"),
      },
    ],
  },
  {
    id: "worktree.create",
    section: "worktree",
    steps: [
      {
        cmd: "worktree.add",
        params: (fx) => ({ path: fx.repo, branch: "wt/new", base: BASE_BRANCH, dir: path.join(fx.root, "wt-new") }),
        expect: (fx) =>
          ok({ dir: path.join(fx.root, "wt-new"), branch: "wt/new", base: BASE_BRANCH, attached: false }),
      },
      {
        cmd: "worktree.list",
        params: (fx) => ({ path: fx.repo }),
        expect: (fx) =>
          ok({
            worktrees: setBy("path", [
              { path: fx.repo, branch: BASE_BRANCH },
              { path: path.join(fx.root, "wt-new"), branch: "wt/new" },
            ]),
          }),
      },
      {
        cmd: "worktree.remove",
        params: (fx) => ({ path: fx.repo, dir: path.join(fx.root, "wt-new") }),
        expect: (fx) => ok({ removed: path.join(fx.root, "wt-new") }),
      },
      {
        cmd: "worktree.list",
        params: (fx) => ({ path: fx.repo }),
        expect: (fx) => ok({ worktrees: setBy("path", [{ path: fx.repo, branch: BASE_BRANCH }]) }),
      },
    ],
  },
  {
    // Reopening a closed workspace: the branch survived, so the worktree must ATTACH to it. An
    // implementer that can only create would force the consumer to delete the branch — the work.
    id: "worktree.attach",
    section: "worktree",
    steps: [
      {
        cmd: "worktree.add",
        params: (fx) => ({ path: fx.repo, branch: FEAT_BRANCH, dir: path.join(fx.root, "wt-feat"), attach: true }),
        expect: (fx) => ok({ dir: path.join(fx.root, "wt-feat"), branch: FEAT_BRANCH, base: null, attached: true }),
      },
      {
        // The attached worktree is a repository in its own right, checked out on the branch.
        cmd: "head",
        params: (fx) => ({ path: path.join(fx.root, "wt-feat") }),
        expect: () => ok({ branch: FEAT_BRANCH, detached: false }),
      },
      {
        cmd: "worktree.remove",
        params: (fx) => ({ path: fx.repo, dir: path.join(fx.root, "wt-feat") }),
        expect: (fx) => ok({ removed: path.join(fx.root, "wt-feat") }),
      },
      {
        // The checkout is gone; the branch is not. That asymmetry IS the contract (SPEC §7.5).
        cmd: "branch.exists",
        params: (fx) => ({ path: fx.repo, branch: FEAT_BRANCH }),
        expect: () => ok({ exists: true }),
      },
    ],
  },
  {
    id: "worktree.rejectsOptionBranch",
    section: "worktree",
    steps: [
      { cmd: "worktree.add", params: (fx) => ({ path: fx.repo, branch: "-x" }), expect: () => refuses("INVALID_BRANCH") },
    ],
  },

  // ── §7.6 merge ──────────────────────────────────────────────────────────────
  {
    id: "merge.rejectsOption",
    section: "merge",
    steps: [
      {
        cmd: "merge",
        params: (fx) => ({ path: fx.mergeRepo, target: "--upload-pack=touch" }),
        expect: () => refuses("INVALID_REF"),
      },
    ],
  },
  {
    id: "merge.branch",
    section: "merge",
    steps: [
      { cmd: "merge", params: (fx) => ({ path: fx.mergeRepo, target: FEAT_BRANCH }), expect: () => ok({ oid: sha() }) },
      {
        // Merged means merged: the three-point diff of the branch against its base is now empty.
        cmd: "diff.files",
        params: (fx) => ({ path: fx.mergeRepo, base: BASE_BRANCH, target: FEAT_BRANCH }),
        expect: () => ok({ files: count(0) }),
      },
      {
        cmd: "log",
        params: (fx) => ({ path: fx.mergeRepo, limit: 3 }),
        expect: () => ok({ commits: count(3) }), // the merge, the branch commit, the root commit
      },
    ],
  },
  {
    id: "merge.subjectSurvives",
    section: "merge",
    steps: [
      {
        cmd: "show",
        params: (fx) => ({ path: fx.mergeRepo, commit: "HEAD^2" }),
        expect: () => ok({ meta: { subject: FEAT_SUBJECT } }),
      },
    ],
  },
];

// ── the execution convention (SPEC §3) ────────────────────────────────────────
// Scored over every invocation the implementer made through the process capability it was handed.
// An implementer that never spawns anything (a library-backed one) satisfies these vacuously — the
// convention constrains invocations, and it made none.

const READ_VERBS = new Set(["rev-parse", "status", "log", "show", "diff", "show-ref", "worktree list", "ls-files"]);

const verbOf = (s) => (s.args[0] === "worktree" ? `worktree ${s.args[1] ?? ""}`.trim() : String(s.args[0] ?? ""));

export const conventionAudits = [
  {
    id: "convention.localeFixed",
    check: (log) =>
      log
        .filter((s) => s.env.LC_ALL !== "C" || s.env.LANG !== "C")
        .map((s) => `git ${s.args.join(" ")}: LC_ALL=${s.env.LC_ALL} LANG=${s.env.LANG} (both must be C)`),
  },
  {
    id: "convention.readTakesNoLock",
    check: (log) =>
      log
        .filter((s) => READ_VERBS.has(verbOf(s)) && s.env.GIT_OPTIONAL_LOCKS !== "0")
        .map((s) => `git ${s.args.join(" ")}: a read must run with GIT_OPTIONAL_LOCKS=0`),
  },
  {
    id: "convention.machineOutput",
    check: (log) => {
      const out = [];
      for (const s of log) {
        const v = verbOf(s);
        if (v === "status" && !(s.args.includes("-z") && s.args.some((a) => a.startsWith("--porcelain")))) {
          out.push(`git ${s.args.join(" ")}: status must be parsed from porcelain -z`);
        }
        if (v === "worktree list" && !(s.args.includes("-z") && s.args.includes("--porcelain"))) {
          out.push(`git ${s.args.join(" ")}: worktree list must be parsed from porcelain -z`);
        }
      }
      return out;
    },
  },
  {
    id: "convention.pathBoundary",
    check: (log) =>
      log
        .filter((s) => {
          const i = s.args.indexOf("new.txt");
          if (i < 0) return false;
          const sep = s.args.indexOf("--");
          return sep < 0 || sep > i;
        })
        .map((s) => `git ${s.args.join(" ")}: a path must be passed behind the -- boundary`),
  },
  {
    id: "convention.noOptionAsSubcommand",
    check: (log) =>
      log
        .filter((s) => String(s.args[0] ?? "").startsWith("-"))
        .map((s) => `git ${s.args.join(" ")}: a rejected input reached the invocation`),
  },
];
