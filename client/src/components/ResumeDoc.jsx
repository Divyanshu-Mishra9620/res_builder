import { useState } from "react";
import { keeps } from "../api.js";

export default function ResumeDoc({ ws, to }) {
  const [version, setVersion] = useState(ws.tailor ? "tailored" : "original");
  const { profile, resume, tailor } = ws;
  const changes = new Map((tailor?.changes ?? []).map((c) => [c.id, c]));
  const use = (id, original) => {
    const c = changes.get(id);
    return version === "tailored" && c && keeps(ws, c) ? c.text : original;
  };
  const kept = [...changes.values()].filter((c) => keeps(ws, c)).length;

  const highlight = version === "tailored" ? tailor?.highlightSkills ?? [] : [];
  const rest = profile.skills.map((s) => s.name).filter((s) => !highlight.some((h) => h.toLowerCase() === s.toLowerCase()));
  const contact = [profile.location, ...resume.contact.emails, ...resume.contact.phones, ...resume.contact.links].filter(Boolean);
  const summary = use("summary", profile.summary);

  return (
    <div className="resume-view">
      <div className="resume-tools no-print">
        <div className="segmented">
          <button className={version === "original" ? "on" : ""} onClick={() => setVersion("original")}>Original</button>
          <button className={version === "tailored" ? "on" : ""} disabled={!tailor} onClick={() => setVersion("tailored")}>Tailored</button>
        </div>
        <span className="muted small">
          {tailor ? `${kept} rewrite(s) in use. Change them in Tailor.` : <>Not tailored yet. <button className="link small" onClick={() => to("tailor")}>Tailor it →</button></>}
        </span>
        <button className="primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>

      <article className="paper">
        <header>
          <h1>{profile.name}</h1>
          {profile.headline && <p className="headline">{profile.headline}</p>}
          {contact.length > 0 && <p className="contact">{contact.join("  ·  ")}</p>}
        </header>
        {summary && <section><h2>Summary</h2><p>{summary}</p></section>}
        {profile.skills.length > 0 && <section><h2>Skills</h2><p>{[...highlight, ...rest].join(" · ")}</p></section>}
        {profile.experience.length > 0 && (
          <section>
            <h2>Experience</h2>
            {profile.experience.map((e) => (
              <div key={`${e.title}${e.company}`} className="entry">
                <div className="entry-head"><b>{e.title}{e.company && `, ${e.company}`}</b><span>{e.dates}</span></div>
                <ul>{e.bullets.map((b) => <li key={b.id}>{use(b.id, b.text)}</li>)}</ul>
              </div>
            ))}
          </section>
        )}
        {profile.projects.length > 0 && (
          <section>
            <h2>Projects</h2>
            {profile.projects.map((p) => (
              <div key={p.name} className="entry">
                <div className="entry-head"><b>{p.name}</b><span>{p.tech.join(", ")}</span></div>
                <ul>{p.bullets.map((b) => <li key={b.id}>{use(b.id, b.text)}</li>)}</ul>
              </div>
            ))}
          </section>
        )}
        {profile.education.length > 0 && (
          <section>
            <h2>Education</h2>
            {profile.education.map((e) => (
              <div key={`${e.degree}${e.school}`} className="entry">
                <div className="entry-head"><b>{e.degree}{e.school && `, ${e.school}`}</b><span>{e.dates}</span></div>
                {e.details && <p>{e.details}</p>}
              </div>
            ))}
          </section>
        )}
        {profile.certifications.length > 0 && <section><h2>Certifications</h2><ul>{profile.certifications.map((c) => <li key={c}>{c}</li>)}</ul></section>}
      </article>
    </div>
  );
}
