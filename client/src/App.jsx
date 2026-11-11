import { useEffect, useState } from "react";
import { api } from "./api.js";
import Start from "./components/Start.jsx";
import Workspace from "./components/Workspace.jsx";
import History from "./components/History.jsx";

// Hash routes: #/  ·  #/history  ·  #/w/:id/:tab[/:skillKey]
function parse(hash) {
  const [, view, id, tab = "match", skill] = hash.replace(/^#/, "").split("/");
  if (view === "history") return { view: "history" };
  if (view === "w" && id) return { view: "workspace", id, tab, skill };
  return { view: "start" };
}

export default function App() {
  const [route, setRoute] = useState(() => parse(location.hash));
  const [health, setHealth] = useState(null);
  const go = (hash) => { location.hash = hash; };

  useEffect(() => {
    const onHash = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    api("/api/health").then(setHealth).catch(() => setHealth({ ok: false }));
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar no-print">
        <button className="brand" onClick={() => go("#/")}>
          <span className="brand-mark" aria-hidden />
          SkillBridge
          <span className="brand-tag">tailor your resume honestly, learn what's missing</span>
        </button>
        <nav>
          {health?.model && <span className="status" title="Model and storage the server is using">{health.model} · {health.storage}</span>}
          <button className={route.view === "history" ? "link active" : "link"} onClick={() => go("#/history")}>History</button>
          {route.view !== "start" && <button className="link" onClick={() => go("#/")}>New</button>}
        </nav>
      </header>

      {health && !health.ok && <p className="banner error no-print">Can't reach the API. Is the server running (npm run dev)?</p>}
      {health?.ok && !health.apiKey && (
        <p className="banner no-print">No model API key on the server. Add <code>GROQ_API_KEY</code> (free) or <code>XAI_API_KEY</code> (Grok) to <code>server/.env</code> and restart.</p>
      )}

      {route.view === "start" && <Start onCreated={(ws) => go(`#/w/${ws._id}/match`)} />}
      {route.view === "workspace" && <Workspace key={route.id} {...route} go={go} />}
      {route.view === "history" && <History onOpen={(id) => go(`#/w/${id}/match`)} />}
    </div>
  );
}
