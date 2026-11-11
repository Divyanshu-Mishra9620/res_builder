# SkillBridge

**Tailor your resume to a job without inventing anything, then learn the skills you're missing.**

Most AI resume tools rewrite freely: they add metrics you never achieved and skills you don't have. SkillBridge
uses the model for what it's good at (reading, rewriting, teaching) and plain code for everything that can be
checked:

1. **Match.** The model reads your resume and the job. Code then proves every matching skill with a quote from your
   resume, and marks whether you *used* it (in an experience or project line) or only *listed* it.
2. **Tailor.** The model rewrites your summary and bullets in the job's language. A **truth gate** (code) blocks
   any rewrite that adds a number or claims a skill you don't have, sends blocked lines back once with the
   reasons, and keeps your original if the second try fails too. Every added word is highlighted for review.
3. **Learn.** For each missing skill: a short lesson built on what you already know, a worked example, a
   one-hour project to prove it, and interview questions.
4. **Quiz.** Five questions per attempt. Answer keys stay on the server and scoring is done in code. A retry
   focuses on the concepts you missed. 80% or more counts toward your **readiness** score.
5. **Export.** A clean, print-ready resume with the rewrites you chose (Print, then Save as PDF).

Your email, phone and links are removed before anything is sent to the model, and added back only in the
exported resume.

## How it works

```
resume (PDF/DOCX/TXT) ─► text ─► redact contacts (code)
                                   │
              ┌────────────────────┴───────────────────┐
              ▼                                         ▼
   extract profile (model)                   extract job requirements (model)
   verbatim check of every bullet (code)     skills + aliases, keywords
              └────────────────────┬───────────────────┘
                                   ▼
             match: quote the resume line that proves each skill (code) ─► score
                                   ▼
             tailor (model) ─► truth gate (code) ─► repair blocked lines (model) ─► gate again
                                   ▼
             each missing skill: lesson (model) ─► quiz (model) ─► grade (code) ─► readiness
```

| Check, in code | Why |
|---|---|
| Every model answer is validated against a schema; a bad one gets one repair turn with the exact error | No crashes, and no malformed data in the UI |
| Extracted bullets are compared to the resume text ("9/9 lines copied word for word") | Catches the model paraphrasing during extraction |
| Skill match needs a quoted resume line; case-sensitive for acronyms (REST, AWS, Go) | "the rest of the team" isn't REST experience |
| Truth gate: no new numbers; no skills the resume lacks (including word forms like "Dockerized") | The tailored resume can't lie |
| Truth gate warnings: a skill this line didn't mention, or a job phrase it didn't use | You confirm each one; they aren't kept by default |
| Quiz options are shuffled in code, and options like "Both A and C" are rejected | The answer isn't always B, and every option stands alone |
| Answer keys never reach the browser before you submit | Scores are real |

**Score:** 60% must-have skills, 20% nice-to-have skills, 20% recruiter keywords (re-weighted if a part is empty).
**Readiness:** must-haves shown on your resume, plus those you proved with 80%+ in a quiz.

## Stack

| Layer | Tech | Role |
|---|---|---|
| **M**ongoDB | Mongoose | Workspaces: profile, match, rewrites, lessons, quizzes, progress (falls back to memory) |
| **E**xpress | Node 22, `openai` SDK (Groq or xAI), `unpdf`, `mammoth` | The workflow, the checks, file parsing |
| **R**eact | Vite | Match, Tailor, Learn and Resume views |
| **N**ode | | Single runtime for everything |

```
server/src/
  coach.js     the workflow: analyze, tailor (+ repair), lesson, quiz, grade, with the prompts
  truth.js     the truth gate
  skills.js    evidence, aliases, phrase matching, score, readiness
  parse.js     PDF/DOCX/TXT → text; contact redaction
  shape.js     tiny schema validator for model output
  llm.js       provider config, JSON calls with repair, rate-limit waits
  store.js     MongoDB with in-memory fallback
  app.js       Express API
client/src/
  components/  Start, Workspace, Match, Tailor, Learn (+ Quiz), ResumeDoc, History
  samples.js   a fictional resume and job, for a one-click demo
```

## Run it

Prerequisites: Node 22.9+ and one model API key:

- **Groq (free):** [console.groq.com/keys](https://console.groq.com/keys). Runs `openai/gpt-oss-120b`.
- **Grok (xAI, paid):** [console.x.ai](https://console.x.ai). Runs `grok-4.3`.

```bash
npm run setup                        # installs root, server and client dependencies
cp server/.env.example server/.env   # then set GROQ_API_KEY (or XAI_API_KEY); MONGODB_URI is optional
npm run dev                          # API on :5070, app on http://localhost:5174
```

Click **Try the sample resume and job** to see the whole flow. On Groq's free tier, a full run (analyze, tailor,
one lesson, one quiz) takes about 10 seconds and 6–8K tokens. If the free tier's per-minute limit is hit, the
server waits and retries.

Single-port production build: `npm run build && npm start`, then open http://localhost:5070.

### API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | provider, model, storage, whether a key is set |
| POST | `/api/extract?name=cv.pdf` | raw file body → text |
| POST | `/api/workspaces` | `{ resumeText, jdText }` → profile, job, match |
| GET | `/api/workspaces` · `/api/workspaces/:id` | history · one workspace (no answer keys) |
| POST | `/api/workspaces/:id/tailor` | rewrites with truth-gate verdicts |
| POST | `/api/workspaces/:id/choices` | `{ lineId: true/false }` which rewrites to keep |
| POST | `/api/workspaces/:id/lessons` | `{ skill }` → lesson (cached) |
| POST | `/api/workspaces/:id/quizzes` | `{ skill }` → quiz without answers |
| POST | `/api/workspaces/:id/quizzes/:quizId` | `{ answers: [index…] }` → score |

## Limits

- The truth gate catches invented numbers and skills. It can't judge every adjective, which is why added words
  are highlighted and you choose what to keep.
- Scanned (image-only) PDFs have no text to read. Paste the text instead.
- Only the first ~2 pages of a resume are read, to stay inside free-tier request limits.
