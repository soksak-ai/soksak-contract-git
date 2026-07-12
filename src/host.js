// The host an implementer is activated against — the same shape the app gives a plugin, reduced to
// what this contract's surface touches: a command registry, a process capability, an event bus, a
// filesystem watch, and the current project.
//
// Two things make this a scoring instrument rather than a mock:
//   - the process capability spawns the real binary (a real repository answers, not a fake stdout);
//   - every spawn is recorded, so the execution convention (SPEC §3) is a fact about the log, not a
//     claim in a comment.
import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";

// Envelope normalization — the app's registry owns this (docs/MESSAGE-PROTOCOL). A handler returns
// its data bare or refuses with { ok:false, code, message }; the boundary makes both an envelope.
// The suite scores what a consumer would receive, so it must normalize exactly here.
function normalize(result) {
  const raw = result && typeof result === "object" ? result : {};
  if (raw.ok === false) {
    const { ok: _ok, code, message, error, data, ...rest } = raw;
    const out = {
      ok: false,
      code: typeof code === "string" ? code : typeof error === "string" ? error : "INTERNAL",
      message: typeof message === "string" ? message : typeof error === "string" ? error : "error",
    };
    const d = data ?? (Object.keys(rest).length ? rest : undefined);
    if (d) out.data = d;
    return out;
  }
  const { ok: _ok, code, message: _m, data, media: _media, ...rest } = raw;
  const out = { ok: true, code: typeof code === "string" ? code : "OK" };
  const d = data ?? (Object.keys(rest).length ? rest : undefined);
  if (d) out.data = d;
  return out;
}

export function createHost({ projectRoot = null, locale = "en" } = {}) {
  const commands = new Map();
  const spawnLog = [];
  const events = [];
  const busSubs = new Map();
  const watchers = new Map(); // dir → { watcher, listeners:Set }
  const granted = new Set(); // dirs registered through the fs.watch command

  // ── the process capability: real spawn, recorded ──────────────────────────────
  // The app's capability merges the requested env over the inherited one (it never clears the
  // parent env — git needs PATH). Mirror that, or an implementer's env fixation would look wrong.
  const processApi = {
    spawn(cmd, args, opts = {}) {
      spawnLog.push({ cmd, args: [...args], cwd: opts.cwd ?? null, env: { ...(opts.env ?? {}) } });
      const child = nodeSpawn(cmd, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
      });
      return Promise.resolve(child);
    },
    onData(handle, cb) {
      const f = (b) => cb(b);
      handle.stdout.on("data", f);
      return { dispose: () => handle.stdout.off("data", f) };
    },
    onStderr(handle, cb) {
      const f = (b) => cb(b);
      handle.stderr.on("data", f);
      return { dispose: () => handle.stderr.off("data", f) };
    },
    onExit(handle, cb) {
      const f = (code) => cb(code ?? 0);
      handle.on("close", f);
      return { dispose: () => handle.off("close", f) };
    },
    kill(handle) {
      handle.kill("SIGKILL");
      return Promise.resolve(true);
    },
  };

  // ── the core commands an implementer may consume ──────────────────────────────
  // fs.watch / fs.unwatch are the core's, not the contract's. An implementer registering watches
  // goes through them (that is where a registration failure becomes visible), so the host answers.
  const core = new Map([
    ["fs.watch", { handler: (p) => (granted.add(String(p.path)), { path: p.path }) }],
    ["fs.unwatch", { handler: (p) => (granted.delete(String(p.path)), { path: p.path }) }],
  ]);

  async function execute(name, params = {}) {
    const spec = commands.get(name) ?? core.get(name);
    if (!spec) return { ok: false, code: "UNKNOWN_COMMAND", message: `unknown command: ${name}` };
    const missing = Object.entries(spec.params ?? {})
      .filter(([k, v]) => v?.required && (params?.[k] === undefined || params?.[k] === null))
      .map(([k]) => k);
    if (missing.length > 0) {
      return { ok: false, code: "INVALID_PARAMS", message: `missing: ${missing.join(", ")}` };
    }
    try {
      return normalize(await spec.handler(params ?? {}));
    } catch (e) {
      return { ok: false, code: "INTERNAL", message: String(e?.message ?? e) };
    }
  }

  const app = {
    locale: () => locale,
    process: processApi,
    commands: {
      register(name, spec) {
        commands.set(name, spec);
        return { dispose: () => commands.delete(name) };
      },
      execute,
    },
    // Long-running commands stream progress through the host (the core's events surface). The suite
    // records it rather than swallowing it — a progress line is where a clone's URL would surface.
    events: {
      progress(kind, payload) {
        events.push({ topic: `progress:${kind}`, payload });
      },
      on() {
        return { dispose: () => {} };
      },
    },
    bus: {
      emit(topic, payload) {
        events.push({ topic, payload });
        for (const fn of busSubs.get(topic) ?? []) fn(payload);
      },
      on(topic, fn) {
        const set = busSubs.get(topic) ?? new Set();
        set.add(fn);
        busSubs.set(topic, set);
        return { dispose: () => set.delete(fn) };
      },
    },
    fs: {
      // The core delivers the changed entry's parent directory, not the filename. Reproduce that —
      // an implementer that expected a filename would pass against a richer fake and fail live.
      watch(dir, cb) {
        const entry = watchers.get(dir) ?? { watcher: null, listeners: new Set() };
        entry.listeners.add(cb);
        if (!entry.watcher) {
          entry.watcher = fs.watch(dir, () => {
            for (const fn of entry.listeners) fn(dir);
          });
        }
        watchers.set(dir, entry);
        return {
          dispose: () => {
            entry.listeners.delete(cb);
            if (entry.listeners.size === 0) {
              entry.watcher?.close();
              watchers.delete(dir);
            }
          },
        };
      },
    },
    project: {
      current: () => (projectRoot ? { root: projectRoot } : null),
    },
  };

  const ctx = { app, subscriptions: [] };

  return {
    app,
    ctx,
    execute,
    spawnLog,
    events,
    grantedWatches: granted,
    registered: () => [...commands.keys()],
    dispose() {
      for (const s of ctx.subscriptions) {
        try {
          s?.dispose?.();
        } catch {
          /* a disposer that throws must not strand the rest */
        }
      }
      for (const { watcher } of watchers.values()) watcher?.close();
      watchers.clear();
    },
  };
}

// Load an implementer's entry and activate it against a fresh host.
export async function activate(implementer, opts = {}) {
  const host = createHost(opts);
  const mod = await import(`${implementer.entry}?t=${Date.now()}`);
  const plugin = mod.default ?? mod;
  if (typeof plugin.activate !== "function") {
    throw new Error(`${implementer.id}: entry exports no activate()`);
  }
  await plugin.activate(host.ctx);
  return host;
}
