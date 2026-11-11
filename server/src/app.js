/**
 * Express API.
 *
 *   GET  /api/health                         provider, model, storage, whether a key is set
 *   POST /api/extract?name=cv.pdf            raw file body → plain text (PDF, DOCX, TXT)
 *   POST /api/workspaces                     { resumeText, jdText, filename? } → analysis + match
 *   GET  /api/workspaces                     history
 *   GET  /api/workspaces/:id                 one workspace (quiz answer keys stripped)
 *   POST /api/workspaces/:id/tailor          rewrites, checked by the truth gate
 *   POST /api/workspaces/:id/choices         { id: boolean } which rewrites to keep
 *   POST /api/workspaces/:id/lessons         { skill } → lesson (cached)
 *   POST /api/workspaces/:id/quizzes         { skill } → new quiz (no answers)
 *   POST /api/workspaces/:id/quizzes/:qid    { answers: [index] } → score
 */
import crypto from "node:crypto";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL, PROVIDER, UserError, describeError, hasApiKey } from "./llm.js";
import { analyze, grade, lesson, makeQuiz, tailor } from "./coach.js";
import { fileToText, cleanText } from "./parse.js";
import { readiness, skillKey } from "./skills.js";
import * as store from "./store.js";

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

/** What the browser may see: no answer keys for unanswered quizzes. */
function publicView(ws) {
  const quizzes = Object.fromEntries(Object.entries(ws.quizzes ?? {}).map(([id, q]) => [id, {
    id, skill: q.skill, createdAt: q.createdAt, result: q.result ?? null,
    questions: q.questions.map((x) => (q.result ? x : { question: x.question, options: x.options })),
  }]));
  return { ...ws, quizzes, readiness: readiness(ws.match, ws.progress) };
}

const addUsage = (ws, u) => ({ "usage.input": (ws.usage?.input ?? 0) + (u?.input ?? 0), "usage.output": (ws.usage?.output ?? 0) + (u?.output ?? 0) });

export function createApp({ client } = {}) {
  const app = express();
  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  async function load(req, res) {
    const ws = await store.get(req.params.id);
    if (!ws) res.status(404).json({ error: "No such workspace." });
    return ws;
  }

  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, provider: PROVIDER, model: MODEL, storage: store.backend, apiKey: hasApiKey() }));

  app.post("/api/extract", express.raw({ type: () => true, limit: "6mb" }), wrap(async (req, res) => {
    if (!req.body?.length) throw new UserError("The file is empty.");
    res.json({ text: await fileToText(req.body, String(req.query.name ?? "")) });
  }));

  app.use(express.json({ limit: "300kb" }));

  app.post("/api/workspaces", wrap(async (req, res) => {
    const resumeText = cleanText(req.body?.resumeText ?? "");
    const jdText = cleanText(req.body?.jdText ?? "");
    if (resumeText.length < 150) throw new UserError("Add your resume (upload it or paste at least a few lines).");
    if (jdText.length < 80) throw new UserError("Paste the job description.");
    const result = await analyze({ resumeText, jdText, client });
    const ws = await store.create({ _id: crypto.randomUUID(), ...result, resume: { ...result.resume, filename: req.body.filename ?? null } });
    res.status(201).json(publicView(ws));
  }));

  app.get("/api/workspaces", wrap(async (_req, res) => res.json(await store.list())));

  app.get("/api/workspaces/:id", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (ws) res.json(publicView(ws));
  }));

  app.post("/api/workspaces/:id/tailor", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (!ws) return;
    const result = await tailor({ ws, client });
    const updated = await store.patch(ws._id, { tailor: result, choices: {}, ...addUsage(ws, result.usage) });
    res.json(publicView(updated));
  }));

  app.post("/api/workspaces/:id/choices", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (!ws) return;
    const valid = new Set((ws.tailor?.changes ?? []).map((c) => c.id));
    const sets = Object.fromEntries(Object.entries(req.body ?? {})
      .filter(([id, keep]) => valid.has(id) && typeof keep === "boolean").map(([id, keep]) => [`choices.${id}`, keep]));
    res.json(publicView(await store.patch(ws._id, sets)));
  }));

  const knownSkill = (ws, skill) => [...ws.job.must_have, ...ws.job.nice_to_have].some((r) => r.skill === skill);

  app.post("/api/workspaces/:id/lessons", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (!ws) return;
    const skill = String(req.body?.skill ?? "");
    if (!knownSkill(ws, skill)) throw new UserError("That skill isn't in this job's requirements.");
    const key = skillKey(skill);
    if (!ws.lessons?.[key]) {
      const doc = await lesson({ ws, skill, client });
      ws.lessons = { ...ws.lessons, [key]: doc };
      Object.assign(ws, await store.patch(ws._id, { [`lessons.${key}`]: doc, ...addUsage(ws, doc.usage) }));
    }
    res.json(publicView(ws));
  }));

  app.post("/api/workspaces/:id/quizzes", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (!ws) return;
    const skill = String(req.body?.skill ?? "");
    if (!knownSkill(ws, skill)) throw new UserError("That skill isn't in this job's requirements.");
    const previous = Object.values(ws.quizzes ?? {}).filter((q) => q.skill === skill && q.result).map((q) => q.result);
    const quiz = await makeQuiz({ ws, skill, lessonDoc: ws.lessons?.[skillKey(skill)], previous, client });
    const updated = await store.patch(ws._id, { [`quizzes.${quiz.id}`]: quiz, ...addUsage(ws, quiz.usage) });
    res.status(201).json({ quizId: quiz.id, workspace: publicView(updated) });
  }));

  app.post("/api/workspaces/:id/quizzes/:qid", wrap(async (req, res) => {
    const ws = await load(req, res);
    if (!ws) return;
    const quiz = ws.quizzes?.[req.params.qid];
    if (!quiz) return res.status(404).json({ error: "No such quiz." });
    if (quiz.result) return res.status(409).json({ error: "This quiz was already submitted. Start a new one." });
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length !== quiz.questions.length) throw new UserError("Answer every question.");
    const result = grade(quiz, answers);
    const key = skillKey(quiz.skill);
    const before = ws.progress?.[key] ?? { best: 0, attempts: 0 };
    const best = Math.max(before.best, result.pct);
    const progress = { skill: quiz.skill, best, attempts: before.attempts + 1, level: best >= 80 ? "mastered" : best >= 50 ? "learning" : "review" };
    const updated = await store.patch(ws._id, { [`quizzes.${quiz.id}.result`]: result, [`progress.${key}`]: progress });
    res.json(publicView(updated));
  }));

  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    if (err.expose && err.status < 500) { // Express's own: bad JSON, body too large
      return res.status(err.status).json({ error: err.type === "entity.too.large" ? "That file is too large (6 MB max)." : err.message });
    }
    console.error(err.status ? err.message : err);
    res.status(err.status ? 502 : 500).json({ error: describeError(err) }); // err.status here = the model API's
  });
  return app;
}
