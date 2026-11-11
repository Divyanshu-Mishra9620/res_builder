import { useEffect, useState } from "react";
import { api } from "../api.js";
import Match from "./Match.jsx";
import Tailor from "./Tailor.jsx";
import Learn from "./Learn.jsx";
import ResumeDoc from "./ResumeDoc.jsx";
import { Working } from "./ui.jsx";

const TABS = [["match", "1 · Match"], ["tailor", "2 · Tailor"], ["learn", "3 · Learn"], ["resume", "4 · Resume"]];

export default function Workspace({ id, tab, skill, go }) {
  const [ws, setWs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/workspaces/${id}`).then(setWs).catch((err) => setError(err.message));
  }, [id]);

  if (!ws) return error ? <p className="banner error">{error}</p> : <Working label="Loading" />;
  const to = (t, s) => go(`#/w/${id}/${t}${s ? `/${s}` : ""}`);
  const props = { ws, setWs, to };
  return (
    <main className="workspace">
      <header className="ws-head no-print">
        <div>
          <span className="kicker">{ws.profile.name || "Your resume"} → </span>
          <h1>{ws.job.title || "The job"}{ws.job.company && <span className="muted"> at {ws.job.company}</span>}</h1>
        </div>
        <div className="ws-scores">
          <div><b>{ws.match.score}%</b><span>match</span></div>
          <div title="Must-haves shown on your resume or proven by quiz"><b>{ws.readiness ?? "–"}%</b><span>ready</span></div>
        </div>
      </header>
      <nav className="tabs no-print" aria-label="Steps">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => to(key)}>{label}</button>
        ))}
      </nav>
      {tab === "match" && <Match {...props} />}
      {tab === "tailor" && <Tailor {...props} />}
      {tab === "learn" && <Learn {...props} skill={skill} />}
      {tab === "resume" && <ResumeDoc {...props} />}
    </main>
  );
}
