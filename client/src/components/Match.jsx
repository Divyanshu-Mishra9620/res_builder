import { skillKey } from "../api.js";
import { Meter, Ring } from "./ui.jsx";

function Requirement({ r, onLearn }) {
  return (
    <li className={`req ${r.matched ? r.strength : "missing"}`}>
      <span className="req-mark" aria-hidden>{r.matched ? "✓" : "✗"}</span>
      <div>
        <b>{r.skill}</b>
        {r.via && <span className="muted"> (as “{r.via}”)</span>}
        {r.strength === "used" && <q>{r.evidence}</q>}
        {r.strength === "listed" && <span className="muted"> listed in your skills, but no line shows you using it. <q>{r.evidence}</q></span>}
        {!r.matched && <span className="muted"> not on your resume</span>}
      </div>
      {!r.matched && <button className="link small" onClick={onLearn}>Learn it →</button>}
    </li>
  );
}

export default function Match({ ws, to }) {
  const { match, profile, job, resume } = ws;
  const listedOnly = [...match.must, ...match.nice].filter((r) => r.strength === "listed");
  const contact = resume.contact;
  const kept = [contact.emails.length && "email", contact.phones.length && "phone", contact.links.length && `${contact.links.length} link(s)`].filter(Boolean);

  return (
    <div className="match">
      <section className="card score-card">
        <Ring value={match.score} label="match" />
        <div className="meters">
          <Meter label="Must-have skills" value={match.breakdown.must} hint="60% of the score" />
          <Meter label="Nice-to-have skills" value={match.breakdown.nice} hint="20%" />
          <Meter label="Recruiter keywords" value={match.breakdown.keywords} hint="20%" />
        </div>
        <p className="fine">
          Scored by code, not by the model: a skill counts only when a line of your resume names it, and the quote is shown
          below. "Used" (it appears in your experience or projects) is stronger proof than "listed".
        </p>
      </section>

      <section className="card">
        <div className="card-head"><h2>Must-haves</h2><span className="muted small">{match.must.filter((r) => r.matched).length}/{match.must.length} on your resume</span></div>
        <ul className="reqs">{match.must.map((r) => <Requirement key={r.skill} r={r} onLearn={() => to("learn", skillKey(r.skill))} />)}</ul>
        {match.nice.length > 0 && <>
          <div className="card-head sub"><h2>Nice to have</h2><span className="muted small">{match.nice.filter((r) => r.matched).length}/{match.nice.length}</span></div>
          <ul className="reqs">{match.nice.map((r) => <Requirement key={r.skill} r={r} onLearn={() => to("learn", skillKey(r.skill))} />)}</ul>
        </>}
        {match.keywords.length > 0 && <>
          <div className="card-head sub"><h2>Recruiter keywords</h2><span className="muted small">{match.keywords.filter((k) => k.found).length}/{match.keywords.length} found</span></div>
          <p className="chips">{match.keywords.map((k) => <span key={k.keyword} className={`chip ${k.found ? "found" : ""}`}>{k.found ? "✓ " : ""}{k.keyword}</span>)}</p>
        </>}
      </section>

      <aside className="side">
        <section className="card">
          <span className="kicker">Background, as read from your resume</span>
          <h3>{profile.name || "Unnamed"}</h3>
          <p className="muted">{profile.headline}</p>
          <dl className="facts">
            <dt>Level</dt><dd><span className="cap">{profile.background.seniority}</span>{profile.background.years_experience != null && `, about ${profile.background.years_experience} yrs`}</dd>
            {profile.background.domains.length > 0 && <><dt>Domains</dt><dd>{profile.background.domains.join(", ")}</dd></>}
            <dt>Skills found</dt><dd>{profile.skills.length}</dd>
            <dt>Read faithfully</dt><dd>{profile.faithfulness.verbatim}/{profile.faithfulness.total} lines copied word for word</dd>
            {kept.length > 0 && <><dt>Kept private</dt><dd>your {kept.join(", ")} never reached the model</dd></>}
          </dl>
          {resume.truncated && <p className="fine">Your resume was long, so only the first two pages were read.</p>}
        </section>
        <section className="card next">
          <h3>Next</h3>
          {listedOnly.length > 0 && <p className="small">Tip: {listedOnly.map((r) => r.skill).join(", ")} {listedOnly.length === 1 ? "is" : "are"} only listed. A line showing what you built with {listedOnly.length === 1 ? "it" : "them"} is stronger proof.</p>}
          <button className="primary" onClick={() => to("tailor")}>Tailor my resume →</button>
          {match.must.some((r) => !r.matched) && <button className="link" onClick={() => to("learn")}>Learn the missing skills</button>}
        </section>
        <section className="card">
          <span className="kicker">The job asks for</span>
          <ul className="duties">{job.responsibilities.map((d) => <li key={d}>{d}</li>)}</ul>
        </section>
      </aside>
    </div>
  );
}
