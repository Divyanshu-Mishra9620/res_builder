/**
 * Skill evidence and job match, in plain code.
 *
 * The model proposes (a job's required skills and their aliases); code verifies,
 * by finding the exact resume line that proves each one. No quote, no match.
 */

// Common alternative names. Short ones keep their casing: they are matched case-sensitively.
const ALIAS_GROUPS = [
  ["JavaScript", "JS", "ECMAScript"], ["TypeScript", "TS"], ["Node.js", "Node", "NodeJS"],
  ["React", "React.js", "ReactJS"], ["Next.js", "NextJS"], ["Vue", "Vue.js", "VueJS"], ["Express", "Express.js"],
  ["PostgreSQL", "Postgres"], ["MongoDB", "Mongo"], ["Kubernetes", "K8s"], ["AWS", "Amazon Web Services"],
  ["GCP", "Google Cloud", "Google Cloud Platform"], ["Azure", "Microsoft Azure"], ["Machine learning", "ML"],
  ["CI/CD", "continuous integration", "continuous delivery"], ["REST APIs", "REST", "RESTful", "REST API"],
  ["Golang", "Go"], ["C#", "C Sharp"], [".NET", "dotnet"], ["Git", "GitHub", "GitLab"],
];
const groupOf = new Map();
for (const group of ALIAS_GROUPS) for (const term of group) groupOf.set(term.toLowerCase(), group);

/** Every way a resume might name this skill. */
export function termsFor(skill, aliases = []) {
  const terms = new Set([skill, ...aliases].map((t) => String(t).trim()).filter(Boolean));
  for (const t of [...terms]) for (const g of groupOf.get(t.toLowerCase()) ?? []) terms.add(g);
  return [...terms];
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map();
function termRegex(term, loose) {
  const key = `${loose ? "~" : "="}${term}`;
  if (!cache.has(key)) {
    // Short terms and acronyms ("Go", "R", "REST", "AWS") must match case exactly,
    // or "let's go" and "the rest of the team" would count as skills.
    const exact = term.length <= 2 || (/[A-Z]/.test(term) && term === term.toUpperCase());
    // Loose also accepts word forms ("Dockerized", "containers"), for catching claims.
    const suffix = loose && term.length > 2 ? "(?:s|es|ed|ing|ized|ised|ization)?" : "";
    cache.set(key, new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}${suffix}(?![\\p{L}\\p{N}])`, exact ? "u" : "iu"));
  }
  return cache.get(key);
}

/** The first line of `text` that names any of `terms`, clipped around the match; or null. */
export function findEvidence(text, terms, { loose = false } = {}) {
  const lines = text.split("\n");
  for (const term of terms) {
    const re = termRegex(term, loose);
    for (const line of lines) {
      const m = re.exec(line);
      if (!m) continue;
      const start = Math.max(0, m.index - 70);
      const clip = line.slice(start, start + 170).trim();
      return { term, line: (start > 0 ? "…" : "") + clip + (start + 170 < line.length ? "…" : "") };
    }
  }
  return null;
}

// ── words, for phrase matching and for spotting what a rewrite added ──
export const STOP = new Set(("a an and the of for to in on with by via at from as into onto using use used across within over " +
  "under than that this these their its our your my per both each all while through").split(" "));
export const words = (s) => s.split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);
/** A rough stem, so "optimized", "optimization" and "optimize" compare equal. */
export const stem = (w) => w.toLowerCase()
  .replace(/(?<=.{3})(?:ies|es|s)$/, "")
  .replace(/(?<=.{4})(?:ization|isation|ation|ized|ised|ize|ise|ing|ed)$/, "");

/**
 * Whether `text` mentions a keyword phrase: verbatim, or with all its words (in any form) on one line,
 * so "Optimized page performance" counts for "performance optimization".
 */
export function mentions(text, phrase) {
  if (findEvidence(text, termsFor(phrase))) return true;
  const need = words(phrase).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase())).map(stem);
  if (!need.length) return false;
  return text.split("\n").some((line) => {
    const have = new Set(words(line).map(stem));
    return need.every((w) => have.has(w));
  });
}

const share = (xs, ok) => (xs.length ? Math.round((100 * xs.filter(ok).length) / xs.length) : null);

/**
 * Scores a resume against a job: 60% must-haves, 20% nice-to-haves, 20% keywords (re-weighted if a part is empty).
 * With `usedText` (the experience and project lines), each matched skill is "used" when a real line shows it,
 * or only "listed" (e.g. just in the Skills section), which is weaker proof.
 */
export function matchResume(text, job, { usedText } = {}) {
  const check = (req) => {
    const terms = termsFor(req.skill, req.aliases);
    const used = usedText ? findEvidence(usedText, terms) : null;
    const ev = used ?? findEvidence(text, terms);
    const via = ev && ev.term.toLowerCase() !== req.skill.toLowerCase() ? ev.term : null; // matched an alias ("e-commerce" for "Logistics or e-commerce")
    return { skill: req.skill, matched: Boolean(ev), evidence: ev?.line ?? null, via, strength: used ? "used" : ev ? "listed" : null };
  };
  const must = job.must_have.map(check);
  const nice = job.nice_to_have.map(check);
  const keywords = job.keywords.map((k) => ({ keyword: k, found: mentions(text, k) }));

  const breakdown = { must: share(must, (r) => r.matched), nice: share(nice, (r) => r.matched), keywords: share(keywords, (k) => k.found) };
  const parts = [[breakdown.must, 0.6], [breakdown.nice, 0.2], [breakdown.keywords, 0.2]].filter(([p]) => p !== null);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const score = weight ? Math.round(parts.reduce((s, [p, w]) => s + p * w, 0) / weight) : 0;
  return { score, breakdown, must, nice, keywords };
}

/** Must-haves the resume shows, plus those proven by passing the quiz, out of all must-haves. */
export function readiness(match, progress = {}) {
  if (!match.must.length) return null;
  const ready = match.must.filter((r) => r.matched || progress[skillKey(r.skill)]?.level === "mastered").length;
  return Math.round((100 * ready) / match.must.length);
}

/** A storage-safe key for a skill name ("Node.js" → "node-js"). */
export const skillKey = (skill) => String(skill).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "skill";
