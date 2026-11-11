import { useState } from "react";
import { api, gaps, skillKey } from "../api.js";
import { LevelBadge, Meter, Working } from "./ui.jsx";

function Quiz({ ws, setWs, quiz, onNext, busy }) {
  const [answers, setAnswers] = useState(() => quiz.questions.map(() => null));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const result = quiz.result;

  async function submit() {
    setSending(true);
    setError("");
    try { setWs(await api(`/api/workspaces/${ws._id}/quizzes/${quiz.id}`, { method: "POST", body: { answers } })); }
    catch (err) { setError(err.message); }
    finally { setSending(false); }
  }

  return (
    <section className="card quiz">
      <div className="card-head">
        <h3>Quiz</h3>
        {result && <span className={`badge level-${result.level}`}>{result.score}/{result.total} · {result.pct}%</span>}
      </div>
      <ol className="questions">
        {quiz.questions.map((q, i) => {
          const r = result?.results[i];
          return (
            <li key={i} className={r ? (r.correct ? "right" : "wrong") : ""}>
              <p className="q">{q.question}</p>
              <div className="options" role="radiogroup" aria-label={`Question ${i + 1}`}>
                {q.options.map((o, k) => {
                  const state = r ? (k === r.answer ? "answer" : k === r.chosen ? "chosen" : "") : answers[i] === k ? "picked" : "";
                  return (
                    <label key={k} className={`option ${state}`}>
                      <input type="radio" name={`${quiz.id}-${i}`} disabled={Boolean(result)} checked={(r ? r.chosen : answers[i]) === k}
                        onChange={() => setAnswers(answers.map((a, j) => (j === i ? k : a)))} />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
              {r && <p className="explain">{r.correct ? "✓ " : "✗ "}{r.explanation}</p>}
            </li>
          );
        })}
      </ol>
      {error && <p className="banner error">{error}</p>}
      {!result && (sending ? <Working label="Scoring" />
        : <button className="primary" disabled={answers.includes(null)} onClick={submit}>Submit answers</button>)}
      {result && (
        <div className="quiz-result">
          <p>
            {result.level === "mastered" ? "Mastered. This now counts toward your readiness." : result.level === "learning"
              ? "Getting there. 80% counts as mastered." : "Worth another look at the lesson first."}
            {result.missedConcepts.length > 0 && <> Missed: {result.missedConcepts.join(", ")}.</>}
          </p>
          {busy ? <Working label="Writing new questions" /> : (
            <button className="link" onClick={onNext}>{result.missedConcepts.length ? "New quiz on what I missed" : "Another quiz"}</button>
          )}
        </div>
      )}
    </section>
  );
}

function SkillLesson({ ws, setWs, gap }) {
  const { skill } = gap;
  const lesson = ws.lessons?.[skillKey(skill)];
  const quizzes = Object.values(ws.quizzes ?? {}).filter((q) => q.skill === skill).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const quiz = quizzes.at(-1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  async function act(label, fn) {
    setBusy(label);
    setError("");
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(null); }
  }
  const teach = () => act("Writing your lesson", async () => setWs(await api(`/api/workspaces/${ws._id}/lessons`, { method: "POST", body: { skill } })));
  const newQuiz = () => act("Writing questions", async () => setWs((await api(`/api/workspaces/${ws._id}/quizzes`, { method: "POST", body: { skill } })).workspace));

  return (
    <div className="lesson">
      <section className="card">
        <span className="kicker">{gap.kind === "must" ? "Must-have" : "Nice to have"} · missing from your resume</span>
        <h2>{skill}</h2>
        {!lesson && (
          <>
            <p className="muted">A short lesson built on what you already know, with an example, a project to prove it, and the interview questions to expect.</p>
            {busy ? <Working label={busy} /> : <button className="primary" onClick={teach}>Teach me {skill}</button>}
          </>
        )}
        {lesson && (
          <>
            <p className="why">{lesson.why_it_matters}</p>
            <div className="concepts">
              {lesson.concepts.map((c, i) => (
                <div key={c.name} className="concept"><span className="num">{i + 1}</span><div><b>{c.name}</b><p>{c.explanation}</p></div></div>
              ))}
            </div>
            {lesson.example.code && (
              <figure className="example">
                <figcaption>{lesson.example.title || "Example"}</figcaption>
                <pre><code>{lesson.example.code}</code></pre>
                {lesson.example.explanation && <p className="small">{lesson.example.explanation}</p>}
              </figure>
            )}
            {lesson.practice && <div className="practice"><b>Prove it in under an hour</b><p>{lesson.practice}</p></div>}
            {lesson.interview_questions.length > 0 && (
              <details className="interview"><summary>Interview questions to prepare</summary><ul>{lesson.interview_questions.map((q) => <li key={q}>{q}</li>)}</ul></details>
            )}
          </>
        )}
      </section>
      {error && <p className="banner error">{error}</p>}
      {lesson && !quiz && (busy ? <Working label={busy} /> : <button className="primary quiz-start" onClick={newQuiz}>Take a 5-question quiz</button>)}
      {quiz && <Quiz key={quiz.id} ws={ws} setWs={setWs} quiz={quiz} onNext={newQuiz} busy={busy} />}
      {quizzes.length > 1 && <p className="fine">Attempts: {quizzes.filter((q) => q.result).map((q) => `${q.result.pct}%`).join(" → ")}</p>}
    </div>
  );
}

export default function Learn({ ws, setWs, to, skill }) {
  const list = gaps(ws);
  if (!list.length) {
    return <section className="card intro"><h2>Nothing missing</h2><p>Your resume shows every skill this job lists. Tailor it and you're ready to apply.</p></section>;
  }
  const current = list.find((g) => skillKey(g.skill) === skill) ?? list[0];
  return (
    <div className="learn">
      <aside className="card skill-list">
        <Meter label="Ready for the must-haves" value={ws.readiness} hint="On your resume, or proven with 80%+ in a quiz" />
        <ul>
          {list.map((g) => (
            <li key={g.skill}>
              <button className={g.skill === current.skill ? "on" : ""} onClick={() => to("learn", skillKey(g.skill))}>
                <span><b>{g.skill}</b><small>{g.kind === "must" ? "must-have" : "nice to have"}</small></span>
                <LevelBadge progress={ws.progress?.[skillKey(g.skill)]} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <SkillLesson key={current.skill} ws={ws} setWs={setWs} gap={current} />
    </div>
  );
}
