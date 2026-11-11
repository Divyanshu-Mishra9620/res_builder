import { useState } from "react";
import { api, gaps, keeps } from "../api.js";
import { Working } from "./ui.jsx";

const STATUS = {
  ok: ["Improved", "ok"],
  check: ["Check this", "warn"],
  blocked: ["Blocked by the truth gate", "bad"],
  unchanged: ["Unchanged", "none"],
};

/** The rewrite, with every word it added (that the original didn't have) highlighted. */
function Highlighted({ text, added }) {
  if (!added?.length) return text;
  const set = new Set(added.map((w) => w.toLowerCase()));
  return text.split(/([^\p{L}\p{N}+#]+)/u).map((part, i) => (set.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : part));
}

function Change({ c, ws, onKeep }) {
  const [label, tone] = STATUS[c.status];
  const kept = keeps(ws, c);
  return (
    <li className={`change ${tone}`}>
      <div className="change-head">
        <span className={`badge ${tone}`}>{label}{c.repaired && " · fixed on 2nd try"}</span>
        {c.why && <span className="muted small">{c.why}</span>}
        {c.status !== "blocked" && c.status !== "unchanged" && (
          <label className="keep"><input type="checkbox" checked={kept} onChange={(e) => onKeep(c.id, e.target.checked)} /> Use it</label>
        )}
      </div>
      {c.status !== "unchanged" && <p className="was">{c.original || <i>(no summary)</i>}</p>}
      <p className={`now ${kept || c.status === "unchanged" ? "" : "dim"}`}><Highlighted text={c.text} added={c.status === "blocked" ? [] : c.added} /></p>
      {c.rejected && <p className="rejected"><s>{c.rejected}</s></p>}
      {c.issues.length > 0 && <ul className="issues">{c.issues.map((i) => <li key={i.text} className={i.level}>{i.text}</li>)}</ul>}
    </li>
  );
}

export default function Tailor({ ws, setWs, to }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = ws.tailor;

  async function run() {
    setBusy(true);
    setError("");
    try { setWs(await api(`/api/workspaces/${ws._id}/tailor`, { method: "POST" })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function onKeep(id, keep) {
    setWs({ ...ws, choices: { ...ws.choices, [id]: keep } }); // optimistic
    try { setWs(await api(`/api/workspaces/${ws._id}/choices`, { method: "POST", body: { [id]: keep } })); }
    catch (err) { setError(err.message); }
  }

  const missing = gaps(ws).map((g) => g.skill);
  if (!t) {
    return (
      <section className="card intro">
        <h2>Rewrite your lines for this job</h2>
        <p>The model rewrites your summary and every bullet in the job's language. Then a truth gate, written in plain code, checks each one:</p>
        <ul className="rules">
          <li><b>Blocks</b> any number or metric your original line didn't have.</li>
          <li><b>Blocks</b> any skill your resume doesn't show{missing.length ? ` (here: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""})` : ""}.</li>
          <li><b>Flags</b> a skill you have but this line didn't mention, so you confirm you used it there.</li>
          <li><b>Highlights</b> every word it added, so nothing slips in unseen.</li>
        </ul>
        {error && <p className="banner error">{error}</p>}
        {busy ? <Working label="Rewriting and fact-checking" /> : <button className="primary" onClick={run}>Tailor my resume</button>}
      </section>
    );
  }

  const count = (s) => t.changes.filter((c) => c.status === s).length;
  return (
    <div className="tailor">
      <section className="card tailor-head">
        <div className="delta">
          <span className="kicker">Match after rewriting</span>
          <b>{t.scoreBefore}% → {t.scoreAfter}%</b>
        </div>
        <p className="counts">
          <span className="badge ok">{count("ok")} improved</span>
          <span className="badge warn">{count("check")} to check</span>
          <span className="badge bad">{count("blocked")} blocked</span>
          <span className="badge">{count("unchanged")} unchanged</span>
        </p>
        <p className="fine">
          Rewording can't add skills you don't have{missing.length ? `: ${missing.join(", ")} stay missing` : ""}.{" "}
          {missing.length > 0 && <button className="link small" onClick={() => to("learn")}>Learn them →</button>}
        </p>
        <div className="row-actions">
          {busy ? <Working label="Rewriting and fact-checking" /> : <button className="link" onClick={run}>Rewrite again</button>}
          <button className="primary" onClick={() => to("resume")}>See my resume →</button>
        </div>
      </section>
      {error && <p className="banner error">{error}</p>}
      <ul className="changes">{t.changes.map((c) => <Change key={c.id} c={c} ws={ws} onKeep={onKeep} />)}</ul>
    </div>
  );
}
