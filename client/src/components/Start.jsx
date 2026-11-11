import { useState } from "react";
import { api } from "../api.js";
import { SAMPLE_JOB, SAMPLE_RESUME } from "../samples.js";
import { Working } from "./ui.jsx";

export default function Start({ onCreated }) {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [filename, setFilename] = useState(null);
  const [busy, setBusy] = useState(null); // "Reading your file" | "Analyzing"
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function readFile(file) {
    if (!file) return;
    setError("");
    setBusy("Reading your file");
    try {
      const { text } = await api(`/api/extract?name=${encodeURIComponent(file.name)}`, { method: "POST", raw: file });
      setResume(text);
      setFilename(file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    setError("");
    setBusy("Reading your resume and the job");
    try {
      onCreated(await api("/api/workspaces", { method: "POST", body: { resumeText: resume, jdText: job, filename } }));
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  const ready = resume.trim().length >= 150 && job.trim().length >= 80;
  return (
    <main className="start">
      <section className="hero">
        <h1>Tailor your resume to the job. <em>Without inventing anything.</em></h1>
        <p>
          SkillBridge reads your resume and the job description, proves every matching skill with a quote from your resume,
          rewrites your lines in the job's language, and blocks any rewrite that adds a number or a skill you don't have.
          For what's missing, it teaches you and quizzes you.
        </p>
        <ol className="steps">
          <li><b>Match</b> skills checked against your own words</li>
          <li><b>Tailor</b> sharper lines, checked by a truth gate</li>
          <li><b>Learn</b> a lesson and a quiz per missing skill</li>
          <li><b>Export</b> a clean resume, ready to print as a PDF</li>
        </ol>
      </section>

      <div className="inputs">
        <section className="card input-card">
          <div className="card-head">
            <h2>Your resume</h2>
            {filename && <span className="muted small">from {filename}</span>}
          </div>
          <label
            className={`drop ${dragging ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files[0]); }}
          >
            <input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => readFile(e.target.files[0])} />
            <b>Upload PDF, DOCX or TXT</b>
            <span>or drop it here, or paste below</span>
          </label>
          <textarea value={resume} onChange={(e) => setResume(e.target.value)} placeholder="…or paste your resume text" rows={12} aria-label="Resume text" />
          <p className="fine">Your email, phone and links are removed before anything is sent to the model.</p>
        </section>

        <section className="card input-card">
          <div className="card-head"><h2>The job</h2></div>
          <textarea value={job} onChange={(e) => setJob(e.target.value)} placeholder="Paste the full job description" rows={17} aria-label="Job description" />
        </section>
      </div>

      {error && <p className="banner error">{error}</p>}
      <div className="start-actions">
        {busy ? <Working label={busy} /> : (
          <>
            <button className="link" onClick={() => { setResume(SAMPLE_RESUME); setJob(SAMPLE_JOB); setFilename(null); }}>Try the sample resume and job</button>
            <button className="primary" disabled={!ready} onClick={analyze}>Analyze match →</button>
          </>
        )}
      </div>
    </main>
  );
}
