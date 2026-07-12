# soksak-git-spec

The **git domain contract**: the command surface a plugin exposes when it owns git execution for a
soksak project, and the promises that surface carries.

This contract exists so that a plugin needing a repository — a worktree, a diff, a merge, a commit
list — gets it **without naming the plugin that runs git**, and without running git itself. Before
this contract there were three git runners in the plugin family (a library plugin, a workspace
plugin, a review plugin), each re-deriving the same environment fixation, the same timeouts, and
the same input-rejection rules. Three copies of a security rule is one rule and two liabilities.

**This is a command-surface contract, not a git CLI wrapper.** It says what a consumer may ask for
and what the answer means. It never says the implementer must spawn `git` — an implementer built on
a library instead of the CLI conforms exactly as well, and the acceptance suite cannot tell the
difference except where this document makes the execution convention itself normative (§3).

**The repo is not the contract id.** The repository is `soksak-contract-git` (NAMING §4a: kind
`contract`, bare domain). The id is `soksak-git-spec` (NAMING §8: `<scope>-spec@<major>`). This
repository ships nothing: no `dist`, no registry entry, no installed artifact. Implementers and
consumers take it as a dev-dependency, and that is the only way it is consumed.

## 1. Discovery

An implementer declares the contract in its manifest:

```json
{ "implements": ["soksak-git-spec"] }
```

A consumer resolves implementers by contract id alone:

```
sok plugin.implementers '{"contract":"soksak-git-spec"}'
```

and addresses whichever it finds as `plugin.<discovered id>.<command>`. A consumer that hard-codes
an implementer's plugin id has not consumed this contract; it has pinned a name (coupling law C3 —
a name-pin is not a legal new coupling).

**No implementer is a loud state.** A consumer that finds none refuses with its own error naming the
contract, never a silent fallback and never a private git spawn. A consumer that keeps a git runner
"just in case" has kept the duplication this contract exists to end. A silent empty answer is the
worst of the three: "no changed files" and "no git" are different facts, and a consumer that returns
the first when it means the second has lied in the direction a human will not question.

**A second implementer is legal.** Nothing here is single-implementer: `@1` is a surface, and two
plugins may serve it. A consumer that assumes exactly one has assumed a fact the contract does not
promise; it takes the first it is given, or lets the user pick.

**The consumer's code names no implementer.** This is scored (§8): a plugin that speaks this
contract's id and also writes `plugin.<implementer-id>.<command>` has kept the coupling and added a
discovery call for show.

> **A note on the host's cross-plugin gate.** At the time of writing, the core admits a
> plugin→plugin command call only when the *target's plugin id* appears in the caller's manifest
> `dependencies`. A consumer of this contract therefore still carries that one line, and cannot
> reach its provider without it — the discovery above resolves the implementer, and the gate then
> checks the name. That line is the host's requirement, not this contract's: it is the last name-pin
> and it is confined to the manifest, where the audit can see it. It goes when the core accepts a
> contract-pin on the consumer side, and no consumer's *code* changes on that day, because no
> consumer's code ever named an implementer.

## 2. Repository addressing

Every command takes an optional `path`: the directory the command acts on. Omitted, the implementer
resolves the **current project root**. No project and no `path` is `NO_PATH` — never a guess, never
the process's working directory.

`path` names *a directory inside a repository*, not necessarily its root. The implementer resolves
the root itself (§4 `root`). A worktree checkout is a repository: its own `path` resolves to its own
root, which is what makes a worktree reviewable and workable without special-casing.

## 3. The execution convention (normative)

A consumer stops validating refs and stops fixing environments only if the implementer promises to.
It does:

- **Locale is fixed.** Every git invocation runs under `LC_ALL=C` and `LANG=C`. A parser that reads
  git's output must never see a translated string.
- **A read never takes a lock.** Read commands run under `GIT_OPTIONAL_LOCKS=0`, so a query cannot
  make the index churn and cannot pollute the change events of §6.
- **Machine output only.** Anything parsed is a porcelain, NUL-delimited (`-z`) form or an explicit
  control-character format. **Parsing git's `stderr` prose is banned** — its one sanctioned use is
  the `not a git repository` discrimination of `root` (§4), which the fixed locale makes stable.
- **Timeouts are bounded and loud.** A read that exceeds its bound and a write that exceeds its bound
  both fail; neither hangs. A timed-out invocation is killed, not orphaned.
- **Input is rejected, never escaped.** Refs, branch names, and commits pass a whitelist *before* any
  invocation: a leading `-` (option injection), `..` (traversal / range syntax), a trailing `/`,
  `.`, or `.lock` are refused. Paths are passed behind a `--` boundary. A rejection is
  `INVALID_REF` / `INVALID_BRANCH` — never a mangled input that runs anyway.

These are not implementation notes. They are the reason a consumer is allowed to pass a
user-supplied branch name straight through, and the acceptance suite scores them (§8).

## 4. Failure

Every command answers the standard envelope (`docs/MESSAGE-PROTOCOL.md`): `{ok, code, message}`,
plus `data` on success. Declared codes:

| code | Means |
|---|---|
| `NO_PATH` | No `path` and no current project. The command did not run. |
| `INVALID_REF` | A ref/commit failed the whitelist (§3). Nothing was invoked. |
| `INVALID_BRANCH` | A branch name failed the whitelist (§3). Nothing was invoked. |
| `GIT_ERROR` | git itself refused. `message` carries git's own `stderr`, **unparsed**. |

An implementer MAY add codes. A consumer MUST NOT require them, and MUST NOT parse `message` — the
message is for a human, and the code is the machine's fact.

## 5. Discovery of the repository

### `root`

```
root { path? } → { state: "repo", root } | { state: "not-repo" } | { state: "error", error }
```

**Tri-state, and the three states are not two.** `not-repo` means the directory is genuinely outside
any repository. `error` means the question could not be answered — a broken `.git` file, an
unreadable directory, no git. Collapsing `error` into `not-repo` is the classic defect: a consumer
then "helpfully" initializes a repository on top of a broken one. An implementer that returns
`not-repo` for anything but a real non-repository has failed this contract.

`root` is the entry point of every other command: a consumer calls it to learn the root, and passes
that root back as `path`.

## 6. Status and change

### `status`

```
status { path? } → { branch: {oid?, head?, upstream?, ahead?, behind?},
                     entries: [{path, x, y, status, origPath?}],
                     truncated: boolean }
```

`status` ∈ `untracked | ignored | conflicted | deleted | renamed | added | modified`. `x`/`y` are the
index/worktree letters they were derived from — a consumer that wants finer detail reads them
instead of re-deriving. `truncated` reports that the implementer capped a pathological entry count;
a consumer must show that it did rather than pretend the tree is small.

### `watch.start` / `watch.stop` / `watch.list`

```
watch.start { path? } → { root, watching: [dir] }   # idempotent per root
watch.stop  { path? } → { stopped: boolean }        # false = there was no watch
watch.list  {}        → { watches: [{root, dirs, since}] }
```

### event `git.changed`

```
git.changed { root, kind: "meta" | "refs" }
```

Emitted when the repository's own state changes: `meta` (HEAD, index, merge state), `refs` (a branch
tip moved). **Polling is banned** — the implementer subscribes to filesystem change notification and
debounces. A consumer refreshes on this event; a consumer that re-polls `status` on a timer has
reintroduced the polling this event exists to remove.

`watch.list` is the observation surface: a watch that failed to register is visible, never silently
absent. Registration failure is loud (`WATCH_FAILED`), and a partial registration rolls back — a
half-watched repository reports changes it cannot see.

## 7. The command surface

### 7.1 History

```
log  { path?, limit?, skip? } → { commits: [{hash, short, author, date, subject}] }
show { path?, commit }        → { meta: {hash, short, author, date, subject},
                                  files: [{status, path}], patch }
```

`limit` defaults to 50 and is capped by the implementer (the cap is the implementer's; a consumer
paginates with `skip` rather than asking for everything). `commit` passes the whitelist: hex 4–40,
`HEAD`, `HEAD^`, `HEAD~N`. `--help` is not a commit.

### 7.2 Diff — two-point (the working tree)

```
diff { path?, file?, staged?, commit? } → { diff: string }
```

The unified diff of the working tree; `staged: true` diffs the index instead; `commit` yields that
commit's patch. `file` narrows it, behind the `--` boundary. The text is git's own unified diff —
this contract does not re-format it, and a consumer that renders diffs renders this.

### 7.3 Diff — three-point (a branch against its base)

This is what review is: not "what is uncommitted", but "what has this branch done since it left".
The range is `base...target` (three dots — the merge base), never `base..target`: two dots reports
the base's own new commits as if the branch had made them.

```
diff.files { path?, base?, target } → { files: [{path, status, oldPath?, added, deleted, binary}] }
diff.range { path?, base?, target, file? } → { diff: string }
```

`status` ∈ `modified | added | deleted | renamed | copied | typechange | unmerged`. `added`/`deleted`
are line counts, and are `null` for a binary file — which `binary: true` states outright, so a
consumer never infers "0 lines changed" from a file it cannot read. `oldPath` appears on a rename or
copy. `base` defaults to the repository's default branch as the implementer resolves it; a consumer
that needs a specific base passes it.

### 7.4 HEAD

```
head { path? } → { branch, oid, detached }
```

What is checked out here. `branch` is `null` when `detached` is true — a detached HEAD is a fact to
report, not an error and not an empty string.

### 7.5 Branches and worktrees

```
branch.exists { path?, branch } → { exists: boolean }

worktree.add    { path?, branch, base?, dir?, attach? } → { dir, branch, base, attached }
worktree.list   { path? } → { worktrees: [{path, head?, branch?, bare?, detached?, locked?, prunable?}] }
worktree.remove { path?, dir } → { removed: dir }
worktree.remove.force { path?, dir } → { removed: dir }     # destructive
worktree.prune  { path? } → { done: true }
```

`worktree.add` creates a **new** branch at `base` (default `HEAD`) by default. `attach: true` checks
out an **existing** branch instead, and then `base` is meaningless and answers `null`. Both are
required: a workspace closed and reopened must reattach to the branch its work is on, and an
implementer offering only "create" forces the consumer to delete and recreate — which discards the
branch, which is the work.

`attach: true` on a branch that does not exist is `GIT_ERROR` (git's own refusal), not a silent
create. `attach` omitted on a branch that already exists is likewise git's refusal — the consumer
asked to create something that exists, and guessing which it meant is how a branch gets clobbered.
The consumer decides with `branch.exists`.

`worktree.remove` removes the **checkout**; the branch and its commits survive. It refuses a
worktree with uncommitted changes — that refusal is the feature. `worktree.remove.force` discards
them, is declared `destructive`, and is a separate command so that discarding work is never a
parameter someone passed by accident.

**Unwatch before delete.** An implementer that also owns watches (§6) releases every watch under a
directory before removing it. A watch surviving its directory is a leak that reports changes to a
tree nobody has.

### 7.6 Writing

```
init    { path? } → { root, created: boolean }
clone   { url, path?, dir? } → { dir }
stage   { path?, files } → { staged: [file] }              # destructive
unstage { path?, files } → { unstaged: [file] }            # destructive
commit  { path?, message, all? } → { oid, short }          # destructive
discard { path?, files } → { discarded: [file] }           # destructive
merge   { path?, target, noFf? } → { oid }                 # destructive
```

`merge` merges `target` into what is checked out at `path`. `noFf` defaults to true: a review that
approved a branch wants the branch visible in the history, not fast-forwarded out of existence. A
conflict is `GIT_ERROR` carrying git's own conflict text — this contract does not own conflict
resolution, and an implementer must not auto-resolve, auto-abort, or auto-commit its way out. The
repository is left exactly as git left it, and the consumer tells the human.

`discard` destroys uncommitted work and is the one command whose file paths are proven to be inside
the root before anything is removed.

## 8. Conformance

An implementer is judged by the acceptance suite in this repository, not by inspection.

The suite **discovers** its subject: it scans the registrar for a manifest declaring
`implements: ["soksak-git-spec"]`, loads that plugin's entry, and drives it through the commands
it registers. The suite never names an implementer — it cannot, and neither may a consumer.

It scores against **declared expectations**, not against git's live answer: the fixture repository is
built to a known shape by the suite, and every case states the value the contract requires. A suite
that asserted "whatever git printed" would pass any implementation of anything.

It scores the execution convention (§3) directly, by recording every invocation the implementer makes
through the process capability it is handed: locale fixation, read-lock suppression, machine-output
flags, and the `--` path boundary are all facts about those invocations, and all are checked.

**The suite must fail on an empty implementer.** A stub that declares the contract and registers
nothing scores zero, loudly. A conformance suite that a stub can pass is scoring nothing, and that
check is itself part of the suite.

### The consumer audit

Conformance runs in both directions. The **consumer audit** (`tests/consumers.test.mjs`) reads every
plugin in the registrar that speaks this contract's id and refuses two things:

- a consumer that resolves an implementer and then calls one **by name** anyway — the discovery was
  decoration, and a second implementer would still be ignored;
- a consumer that quotes the contract id and **never resolves** anything — the id was a comment.

It, too, is scored against its own defects: fixture consumers carrying exactly those two faults must
fail it, or the audit is measuring nothing.
