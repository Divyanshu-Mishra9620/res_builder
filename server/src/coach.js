/**
 * The workflow. The model reads, writes and teaches; code checks everything it can:
 *
 *   resume + job ─► extract profile & requirements (model) ─► match with quoted evidence (code)
 *        ─► tailor bullets (model) ─► truth gate (code) ─► repair what was blocked (model) ─► gate again
 *        ─► for each missing skill: lesson (model) ─► quiz (model, answer key kept server-side) ─► score (code)
 */
import crypto from "node:crypto";
import { askJSON } from "./llm.js";
import { arr, checker, int, num, obj, oneOf, str, strs } from "./shape.js";
import { findEvidence, matchResume, skillKey, termsFor } from "./skills.js";
import { checkRewrite } from "./truth.js";
import { MAX_RESUME_CHARS, redactContacts } from "./parse.js";

const addUsage = (...us) => us.reduce((t, u) => ({ input: t.input + (u?.input ?? 0), output: t.output + (u?.output ?? 0) }), { input: 0, output: 0 });
const quote = (s) => `"""\n${s}\n"""`;

// ── 1. read the resume and the job ──────────────────────────────────────────

const PROFILE = obj({
  name: str({ max: 120 }), headline: str({ max: 200 }), location: str({ max: 120 }), summary: str({ max: 1200 }),
  skills: strs({ max: 60 }),
  experience: arr(obj({ title: str({ max: 160 }), company: str({ max: 160 }), dates: str({ max: 80 }), bullets: strs({ max: 12 }) }), { max: 12 }),
  projects: arr(obj({ name: str({ max: 160 }), tech: strs({ max: 15 }), bullets: strs({ max: 8 }) }), { max: 8 }),
  education: arr(obj({ degree: str({ max: 200 }), school: str({ max: 200 }), dates: str({ max: 80 }), details: str({ max: 300 }) }), { max: 6 }),
  certifications: strs({ max: 12 }),
  background: obj({
    years_experience: num(),
    seniority: oneOf(["student", "junior", "mid", "senior", "lead"], "junior"),
    domains: strs({ max: 6 }),
  }),
});

const JOB = obj({
  title: str({ max: 160 }), company: str({ max: 160 }), seniority: str({ max: 60 }),
  must_have: arr(obj({ skill: str({ max: 60, required: true }), aliases: strs({ max: 6 }) }), { max: 10, min: 1 }),
  nice_to_have: arr(obj({ skill: str({ max: 60, required: true }), aliases: strs({ max: 6 }) }), { max: 8 }),
  responsibilities: strs({ max: 8 }),
  keywords: strs({ max: 15 }),
});

const READER = "You turn documents into structured JSON. Copy text exactly as written. Never add, guess or embellish; use \"\" or [] when something is missing. Return only a JSON object.";

function extractProfile(text, client) {
  return askJSON({
    client, system: READER, maxTokens: 4000, check: checker(PROFILE),
    prompt: `Return the resume below as a JSON object of this shape:
{"name":"","headline":"","location":"","summary":"","skills":[""],
 "experience":[{"title":"","company":"","dates":"","bullets":[""]}],
 "projects":[{"name":"","tech":[""],"bullets":[""]}],
 "education":[{"degree":"","school":"","dates":"","details":""}],
 "certifications":[""],
 "background":{"years_experience":0,"seniority":"student|junior|mid|senior|lead","domains":[""]}}
- bullets: copied verbatim from the resume, one achievement each.
- skills: every technology, tool, language and method named anywhere in the resume.
- years_experience: professional years estimated from the dates (null if unclear). domains: industries or problem areas.

RESUME
${quote(text)}`,
  });
}

function extractJob(text, client) {
  return askJSON({
    client, system: READER, maxTokens: 2500, check: checker(JOB),
    prompt: `Return the job posting below as a JSON object of this shape:
{"title":"","company":"","seniority":"","must_have":[{"skill":"","aliases":[""]}],"nice_to_have":[{"skill":"","aliases":[""]}],"responsibilities":[""],"keywords":[""]}
- must_have: skills, technologies and qualifications the posting requires (at most 10). nice_to_have: preferred or bonus ones (at most 8).
- skill: a short canonical name, like "PostgreSQL". aliases: other names for exactly the same thing (abbreviations, spellings), never related skills.
- responsibilities: the main duties, short (at most 8).
- keywords: up to 12 other words or phrases a recruiter would want to see in a candidate's resume: practices, methods and
  domain experience (like "code reviews", "automated testing", "logistics"). Not the location, work mode, company, team or
  product names, and not repeating the skills above.

JOB POSTING
${quote(text)}`,
  });
}

/** Gives bullets stable ids, checks they were copied verbatim, and finds evidence for each skill. */
function annotate(profile, text) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const haystack = norm(text);
  let verbatim = 0;
  let total = 0;
  const tag = (prefix) => (bullet, j) => {
    total += 1;
    const ok = haystack.includes(norm(bullet).slice(0, 80));
    if (ok) verbatim += 1;
    return { id: `${prefix}-${j}`, text: bullet, verbatim: ok };
  };
  return {
    ...profile,
    skills: profile.skills.map((name) => ({ name, evidence: findEvidence(text, termsFor(name))?.line ?? null })),
    experience: profile.experience.map((e, i) => ({ ...e, bullets: e.bullets.map(tag(`e${i}`)) })),
    projects: profile.projects.map((p, i) => ({ ...p, bullets: p.bullets.map(tag(`p${i}`)) })),
    faithfulness: { verbatim, total },
  };
}

export async function analyze({ resumeText, jdText, client }) {
  const truncated = resumeText.length > MAX_RESUME_CHARS;
  const { text, contact } = redactContacts(resumeText.slice(0, MAX_RESUME_CHARS));
  const [p, j] = await Promise.all([extractProfile(text, client), extractJob(jdText.slice(0, 6000), client)]);
  const profile = annotate(p.value, text);
  // Keywords that just repeat a required skill would count it twice; drop them.
  const skillNames = new Set([...j.value.must_have, ...j.value.nice_to_have].flatMap((r) => [r.skill, ...r.aliases]).map((s) => s.toLowerCase()));
  const job = { ...j.value, keywords: j.value.keywords.filter((k) => !skillNames.has(k.toLowerCase())) };
  return {
    resume: { text, contact, truncated },
    jdText,
    profile,
    job,
    match: matchResume(text, job, { usedText: usedText(profile) }),
    usage: addUsage(p.usage, j.usage),
  };
}

/** The lines that show a skill being used: experience and project bullets, project names and tech. */
const usedText = (profile) => [
  ...profile.experience.flatMap((e) => e.bullets.map((b) => b.text)),
  ...profile.projects.flatMap((p) => [`${p.name} (${p.tech.join(", ")})`, ...p.bullets.map((b) => b.text)]),
].join("\n");

// ── 2. tailor, behind the truth gate ────────────────────────────────────────

const REWRITE = obj({ id: str({ required: true }), text: str({ max: 400 }), why: str({ max: 160 }) });
const REWRITES = obj({ summary: str({ max: 900 }), bullets: arr(REWRITE, { max: 80 }), highlight_skills: strs({ max: 10 }) });
const REPAIRS = obj({ bullets: arr(REWRITE, { max: 40 }) });

const TAILOR_RULES = `Hard rules. A checker enforces them, and anything that breaks them is thrown out:
- Never add a number, metric, tool or skill that isn't in the original line.
- Never mention a skill the candidate doesn't have.
- Never add qualities or outcomes the original doesn't state ("scalable", "responsive", "ensuring data integrity").
  Make each line sharper, not bigger. Every word you add is shown to the candidate highlighted.
- If a line can't be improved honestly, return it unchanged.`;

const allBullets = (profile) => [...profile.experience, ...profile.projects].flatMap((x) => x.bullets);

/** Text the match is scored on: the profile, with optional replacements for the summary and bullets. */
function profileText(profile, replace = {}) {
  const line = (b) => replace[b.id] ?? b.text;
  return [
    profile.headline, replace.summary ?? profile.summary, profile.skills.map((s) => s.name).join(", "),
    ...profile.experience.flatMap((e) => [`${e.title} ${e.company}`, ...e.bullets.map(line)]),
    ...profile.projects.flatMap((p) => [p.name, p.tech.join(", "), ...p.bullets.map(line)]),
    ...profile.education.map((e) => `${e.degree} ${e.school} ${e.details}`), ...profile.certifications,
  ].join("\n");
}

export async function tailor({ ws, client }) {
  const { profile, job, match, resume } = ws;
  const bullets = allBullets(profile);
  const missing = [...match.must, ...match.nice].filter((r) => !r.matched).map((r) => r.skill);
  const proven = profile.skills.filter((s) => s.evidence).map((s) => s.name);
  const absentKeywords = match.keywords.filter((k) => !k.found).map((k) => k.keyword);

  const first = await askJSON({
    client, maxTokens: 4000, check: checker(REWRITES),
    system: "You are an expert technical recruiter who rewrites resumes so they fit a job, without ever making anything up. Return only a JSON object.",
    prompt: `Tailor this resume to the job. Rewrite the summary and each line so it leads with impact, starts with a strong verb, uses the job's wording for skills the candidate really has, and stays under 30 words.

${TAILOR_RULES}
- The candidate does NOT have: ${missing.join(", ") || "(nothing missing)"}.

JOB: ${job.title} at ${job.company || "the company"}
Must have: ${job.must_have.map((r) => r.skill).join(", ")}
Nice to have: ${job.nice_to_have.map((r) => r.skill).join(", ") || "-"}
Keywords: ${job.keywords.join(", ") || "-"}

JOB PHRASES THE RESUME DOESN'T USE YET: ${absentKeywords.join(", ") || "-"}
Where a line genuinely describes one of these (e.g. a speed-up is "performance optimization"), use the job's exact phrase.
Never use one the line doesn't support: manual testing is not "automated testing".

CANDIDATE'S PROVEN SKILLS: ${proven.join(", ")}
SUMMARY: ${profile.summary || "(none: write one, 2 sentences, using only facts from the lines below)"}
LINES:
${bullets.map((b) => `${b.id}: ${b.text}`).join("\n")}

Return {"summary":"","bullets":[{"id":"","text":"","why":""}],"highlight_skills":[""]}
- bullets: one entry per line id above. why: which job requirement the rewrite targets (under 12 words).
- highlight_skills: up to 8 of the candidate's proven skills, most relevant to this job first.`,
  });

  const items = [
    { id: "summary", original: profile.summary, source: resume.text },
    ...bullets.map((b) => ({ id: b.id, original: b.text, source: b.text })),
  ];
  const proposed = new Map(first.value.bullets.map((b) => [b.id, b]));
  proposed.set("summary", { id: "summary", text: first.value.summary, why: "Summary aimed at this role" });

  const sources = new Map(items.map((i) => [i.id, i.source]));
  const gate = ({ id, original }, p) => {
    const text = p?.text || original;
    return { id, original, text, why: p?.why ?? "", ...checkRewrite({ original, rewrite: text, source: sources.get(id), job, match }) };
  };
  let changes = items.map((item) => gate(item, proposed.get(item.id)));

  // One repair round for whatever the gate blocked, with the reasons.
  const blocked = changes.filter((c) => c.status === "blocked");
  let repair = null;
  if (blocked.length) {
    repair = await askJSON({
      client, maxTokens: 2500, check: checker(REPAIRS),
      system: "You fix resume rewrites that broke the rules. Return only a JSON object.",
      prompt: `These rewrites were rejected by a fact checker. Rewrite each one again from its original, fixing the problem.

${TAILOR_RULES}
- The candidate does NOT have: ${missing.join(", ") || "(nothing missing)"}.

${blocked.map((c) => `${c.id}\n  original: ${c.original}\n  rejected: ${c.text}\n  problem: ${c.issues.map((i) => i.text).join(" ")}`).join("\n")}

Return {"bullets":[{"id":"","text":"","why":""}]} with one entry per id above.`,
    });
    const fixed = new Map(repair.value.bullets.map((b) => [b.id, b]));
    changes = changes.map((c) => {
      if (c.status !== "blocked") return c;
      const again = gate(c, fixed.get(c.id) ?? { text: c.original, why: c.why });
      // Still untrue after the repair: keep the original line and show what was rejected.
      return again.status === "blocked"
        ? { ...c, rejected: again.text, text: c.original, issues: again.issues, added: [] }
        : { ...again, repaired: true };
    });
  }

  const replace = Object.fromEntries(changes.filter((c) => c.status !== "blocked").map((c) => [c.id, c.text]));
  const skillNames = new Set(proven.map((s) => s.toLowerCase()));
  return {
    changes,
    highlightSkills: first.value.highlight_skills.filter((s) => skillNames.has(s.toLowerCase())),
    scoreBefore: matchResume(profileText(profile), job).score,
    scoreAfter: matchResume(profileText(profile, replace), job).score,
    usage: addUsage(first.usage, repair?.usage),
  };
}

// ── 3. teach the missing skills ─────────────────────────────────────────────

const LESSON = obj({
  why_it_matters: str({ max: 600 }),
  concepts: arr(obj({ name: str({ max: 80, required: true }), explanation: str({ max: 900, required: true }) }), { min: 2, max: 6 }),
  example: obj({ title: str({ max: 120 }), code: str({ max: 2500 }), explanation: str({ max: 700 }) }),
  practice: str({ max: 700 }),
  interview_questions: strs({ max: 4 }),
});

const TEACHER = "You are a patient senior engineer teaching a job seeker one skill, fast and concretely. Return only a JSON object.";

function learnerContext(ws) {
  const { profile, job } = ws;
  return `Learner: ${profile.background.seniority}, knows ${profile.skills.slice(0, 12).map((s) => s.name).join(", ")}.
Target job: ${job.title}${job.company ? ` at ${job.company}` : ""}. Duties: ${job.responsibilities.slice(0, 4).join("; ") || "-"}.`;
}

export async function lesson({ ws, skill, client }) {
  const { value, usage } = await askJSON({
    client, maxTokens: 3500, check: checker(LESSON), system: TEACHER,
    prompt: `Teach "${skill}".
${learnerContext(ws)}

Return {"why_it_matters":"","concepts":[{"name":"","explanation":""}],"example":{"title":"","code":"","explanation":""},"practice":"","interview_questions":[""]}
- why_it_matters: 2 sentences on why this job needs it.
- concepts: the 4 ideas that matter most, 2-4 sentences each, connecting to what the learner already knows.
- example: a short, realistic code example (under 25 lines) if the skill is technical, else a worked scenario.
- practice: one hands-on task they can finish in under an hour and show on GitHub.
- interview_questions: 3 questions an interviewer for this job might ask about it.`,
  });
  return { skill, ...value, usage };
}

// ── 4. quiz, scored in code ─────────────────────────────────────────────────

const QUIZ = obj({
  questions: arr(obj({
    question: str({ max: 500, required: true }),
    options: arr(str({ max: 220, required: true }), { min: 4, max: 4 }),
    answer: int(0, 3),
    explanation: str({ max: 500 }),
    concept: str({ max: 80 }),
  }), { min: 3, max: 6 }),
});

// Options are shuffled, so one that points at others ("Both A and C", "All of the above") would be nonsense.
export const refersToOthers = (option) =>
  /\b(?:all|none|both|neither) of (?:the )?(?:above|these|them|options|answers)\b|\b(?:options?|answers?)\s+[A-D1-4]\b/i.test(option) ||
  /^\s*(?:[Bb]oth\s+|[Oo]nly\s+)?[A-D](?:\s*(?:,|and|&)\s*[A-D])+\s*\.?\s*$/.test(option); // the whole option is just letters
const quizCheck = (data) => {
  const result = checker(QUIZ)(data);
  if (result.error) return result;
  const i = result.value.questions.findIndex((q) => q.options.some(refersToOthers));
  return i < 0 ? result : { error: `questions[${i}] has an option that refers to other options; options get shuffled, so each must stand alone` };
};

function shuffled(q) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((k) => q.options[k]), answer: order.indexOf(q.answer) };
}

export async function makeQuiz({ ws, skill, lessonDoc, previous = [], client }) {
  const missed = previous.flatMap((r) => r.missedConcepts ?? []);
  const asked = previous.flatMap((r) => r.questions ?? []);
  const { value, usage } = await askJSON({
    client, maxTokens: 3000, system: TEACHER,
    check: quizCheck,
    prompt: `Write a 5-question multiple-choice quiz on "${skill}".
${learnerContext(ws)}
Concepts taught: ${lessonDoc?.concepts.map((c) => c.name).join(", ") || "the essentials"}.
${missed.length ? `Focus on what the learner got wrong last time: ${[...new Set(missed)].join(", ")}.` : ""}
${asked.length ? `Don't repeat these questions: ${asked.slice(-10).join(" | ")}` : ""}
- Test understanding and judgment, not trivia. 4 options each, exactly one correct, plausible distractors.
- Options are shuffled, so each must stand alone: no "all of the above", "both A and C" or "none of these".
- explanation: why the right answer is right (1-2 sentences). concept: which concept the question tests.

Return {"questions":[{"question":"","options":["","","",""],"answer":0,"explanation":"","concept":""}]}`,
  });
  const questions = value.questions.filter((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4).map(shuffled);
  if (questions.length < 3) throw new Error("The generated quiz had duplicate options. Try again.");
  return { id: crypto.randomUUID(), skill, questions, createdAt: new Date().toISOString(), usage };
}

export function grade(quiz, answers) {
  const results = quiz.questions.map((q, i) => ({
    chosen: Number.isInteger(answers[i]) ? answers[i] : null,
    answer: q.answer, correct: answers[i] === q.answer, explanation: q.explanation, concept: q.concept,
  }));
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((100 * score) / results.length);
  return {
    score, total: results.length, pct,
    level: pct >= 80 ? "mastered" : pct >= 50 ? "learning" : "review",
    results,
    missedConcepts: [...new Set(results.filter((r) => !r.correct).map((r) => r.concept).filter(Boolean))],
    questions: quiz.questions.map((q) => q.question),
    at: new Date().toISOString(),
  };
}

export { skillKey };
