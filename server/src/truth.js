/**
 * The truth gate: a rewrite may make a bullet sharper, but not make it untrue.
 *
 *   block  adds a number or metric the original didn't have
 *   block  claims a job skill the resume never mentions
 *   warn   mentions a skill the resume has elsewhere, but this bullet didn't (did you use it here?)
 *   warn   uses one of the job's keywords the original didn't (is it accurate?)
 *   warn   much longer than the original
 */
import { STOP, findEvidence, mentions, stem, termsFor, words } from "./skills.js";

const numbers = (s) => s.match(/\d+(?:[.,]\d+)*/g) ?? [];

/** Words in the rewrite that the source never used, so the UI can highlight exactly what was added. */
export function addedWords(source, rewrite) {
  const have = new Set(words(source).map(stem));
  return [...new Set(words(rewrite).filter((w) => w.length > 2 && !/^\d/.test(w) && !STOP.has(w.toLowerCase()) && !have.has(stem(w))))];
}
const same = (a, b) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * @param original   the bullet (or summary) as written
 * @param rewrite    the proposed version
 * @param source     what the rewrite may draw on: the bullet itself, or the whole resume for the summary
 * @param job, match the job requirements and which of them the resume proves
 * @returns { status: "ok" | "check" | "blocked" | "unchanged", issues: [{ level, text }] }
 */
export function checkRewrite({ original, rewrite, source = original, job, match }) {
  if (!rewrite.trim()) return { status: "blocked", issues: [{ level: "block", text: "The rewrite is empty." }], added: [] };
  if (same(original, rewrite)) return { status: "unchanged", issues: [], added: [] };

  const issues = [];
  const allowed = new Set(numbers(source));
  for (const n of new Set(numbers(rewrite))) {
    if (!allowed.has(n)) issues.push({ level: "block", text: `Adds the number "${n}", which the original doesn't have.` });
  }

  const reqs = [...job.must_have, ...job.nice_to_have];
  const proven = new Map([...match.must, ...match.nice].map((r) => [r.skill, r.matched]));
  for (const req of reqs) {
    const terms = termsFor(req.skill, req.aliases);
    if (!findEvidence(rewrite, terms, { loose: true })) continue; // "Dockerized" claims Docker too
    if (!proven.get(req.skill)) {
      issues.push({ level: "block", text: `Claims ${req.skill}, which isn't anywhere in your resume.` });
    } else if (!findEvidence(source, terms)) {
      issues.push({ level: "warn", text: `Mentions ${req.skill}. Your resume has it, but this line didn't. Keep it only if you used it here.` });
    }
  }

  // The job's own phrases are welcome, but only if true: "automated testing" for manual testing isn't.
  for (const k of job.keywords) {
    if (mentions(rewrite, k) && !mentions(source, k)) {
      issues.push({ level: "warn", text: `Uses the job's phrase "${k}". Keep it only if it's accurate.` });
    }
  }

  if (rewrite.length > Math.max(260, original.length * 1.8)) {
    issues.push({ level: "warn", text: "Much longer than the original. Recruiters skim." });
  }
  const status = issues.some((i) => i.level === "block") ? "blocked" : issues.length ? "check" : "ok";
  return { status, issues, added: addedWords(source, rewrite) };
}
