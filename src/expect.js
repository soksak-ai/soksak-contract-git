// The matcher the acceptance cases are declared in. An expectation is a subset of the answer: the
// keys it names must match, and keys it does not name are the implementer's own business (SPEC §7).
// It is deliberately not a snapshot — a snapshot would freeze one implementation's extra fields into
// the contract and fail the next implementer for adding a field this contract never forbade.

export const pred = (name, fn) => ({ __pred: name, fn });

export const sha = () => pred("sha40", (v) => typeof v === "string" && /^[0-9a-f]{40}$/.test(v));
export const nonEmpty = () => pred("nonEmpty", (v) => typeof v === "string" && v.length > 0);
export const contains = (s) => pred(`contains ${JSON.stringify(s)}`, (v) => typeof v === "string" && v.includes(s));
export const lacks = (s) => pred(`lacks ${JSON.stringify(s)}`, (v) => typeof v === "string" && !v.includes(s));
export const count = (n) => pred(`length ${n}`, (v) => Array.isArray(v) && v.length === n);

// An unordered comparison keyed by a field. Order is not in the contract, so an expectation must not
// smuggle one in: `files` is a set of facts about paths, and an implementer that returns them in
// another order has broken nothing.
export const setBy = (key, items) => ({ __setBy: key, items });

function fail(out, at, detail) {
  out.push(`${at}: ${detail}`);
}

export function match(actual, expected, at = "", out = []) {
  if (expected && typeof expected === "object" && "__pred" in expected) {
    if (!expected.fn(actual)) fail(out, at || "value", `expected ${expected.__pred}, got ${JSON.stringify(actual)}`);
    return out;
  }
  if (expected && typeof expected === "object" && "__setBy" in expected) {
    const key = expected.__setBy;
    if (!Array.isArray(actual)) {
      fail(out, at, `expected an array, got ${typeof actual}`);
      return out;
    }
    if (actual.length !== expected.items.length) {
      fail(out, at, `expected ${expected.items.length} item(s), got ${actual.length}: ${JSON.stringify(actual)}`);
    }
    for (const want of expected.items) {
      const got = actual.find((a) => a && a[key] === want[key]);
      if (!got) {
        fail(out, at, `no item with ${key}=${JSON.stringify(want[key])} in ${JSON.stringify(actual)}`);
        continue;
      }
      match(got, want, `${at}[${key}=${want[key]}]`, out);
    }
    return out;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      fail(out, at, `expected an array, got ${typeof actual}`);
      return out;
    }
    if (actual.length !== expected.length) {
      fail(out, at, `expected ${expected.length} item(s), got ${actual.length}`);
    }
    expected.forEach((e, i) => match(actual[i], e, `${at}[${i}]`, out));
    return out;
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") {
      fail(out, at, `expected an object, got ${JSON.stringify(actual)}`);
      return out;
    }
    for (const [k, v] of Object.entries(expected)) {
      match(actual[k], v, at ? `${at}.${k}` : k, out);
    }
    return out;
  }
  if (actual !== expected) {
    fail(out, at || "value", `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return out;
}
