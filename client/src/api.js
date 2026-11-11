import { useEffect, useState } from "react";

/** fetch() for the JSON API. `raw` sends a file body instead of JSON. Throws with the server's message. */
export async function api(path, { method = "GET", body, raw } = {}) {
  const headers = raw ? { "content-type": "application/octet-stream" } : body ? { "content-type": "application/json" } : {};
  const res = await fetch(path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
  return json;
}

/** Seconds since `active` became truthy, for "still working" indicators. */
export function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

/** Same as the server's: "Node.js" → "node-js". */
export const skillKey = (skill) => String(skill).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "skill";

/** Skills the job wants that the resume doesn't show, must-haves first. */
export const gaps = (ws) => [
  ...ws.match.must.filter((r) => !r.matched).map((r) => ({ ...r, kind: "must" })),
  ...ws.match.nice.filter((r) => !r.matched).map((r) => ({ ...r, kind: "nice" })),
];

/** Whether a rewrite goes into the resume: the user's choice, else yes only if the gate passed it cleanly. */
export const keeps = (ws, change) => change.status !== "blocked" && (ws.choices?.[change.id] ?? change.status === "ok");
