/**
 * A tiny validator for model output. Each spec is a function (value, path) => cleaned value
 * that throws ShapeError with a message the model can act on when it's asked to repair.
 */
export class ShapeError extends Error {}

const fail = (path, what) => { throw new ShapeError(`${path || "the root"} ${what}`); };

// Models like typographic dashes and quotes ("Full‑stack" with U+2011); resumes and keyword scanners want plain ones.
const plain = (s) => s.replace(/[‐-―−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ");

export const str = ({ max = 1500, required = false } = {}) => (v, path) => {
  if (v == null || v === "") return required ? fail(path, "is required") : "";
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string") fail(path, "must be a string");
  return plain(v).trim().slice(0, max);
};

export const num = () => (v, path) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : fail(path, "must be a number or null");
};

export const int = (min, max) => (v, path) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fail(path, `must be an integer ${min}..${max}`);
};

export const oneOf = (values, fallback) => (v, path) =>
  values.includes(v) ? v : fallback !== undefined ? fallback : fail(path, `must be one of ${values.join(", ")}`);

export const arr = (item, { max = 40, min = 0 } = {}) => (v, path) => {
  if (v == null) v = [];
  if (!Array.isArray(v)) fail(path, "must be an array");
  const out = v.slice(0, max).map((x, i) => item(x, `${path}[${i}]`));
  return out.length >= min ? out : fail(path, `needs at least ${min} item(s)`);
};

/** A list of non-empty strings. */
export const strs = (opts) => (v, path) => arr(str(), opts)(v, path).filter(Boolean);

export const obj = (fields) => (v, path) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(path, "must be an object");
  return Object.fromEntries(Object.entries(fields).map(([k, spec]) => [k, spec(v[k], path ? `${path}.${k}` : k)]));
};

/** Turns a spec into the checker askJSON() expects: data => { value } | { error }. */
export const checker = (spec) => (data) => {
  try {
    return { value: spec(data, "") };
  } catch (err) {
    if (err instanceof ShapeError) return { error: err.message };
    throw err;
  }
};
