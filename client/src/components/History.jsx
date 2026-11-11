import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Working } from "./ui.jsx";

export default function History({ onOpen }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/api/workspaces").then(setItems).catch((err) => setError(err.message)); }, []);

  if (error) return <p className="banner error">{error}</p>;
  if (!items) return <Working label="Loading" />;
  return (
    <main className="history">
      <h1>History</h1>
      {!items.length && <p className="muted">Nothing yet. Analyze a resume against a job to start.</p>}
      <ul>
        {items.map((w) => (
          <li key={w._id}>
            <button onClick={() => onOpen(w._id)}>
              <span className="when">{new Date(w.createdAt).toLocaleString()}</span>
              <span><b>{w.job || "Job"}</b>{w.company && <span className="muted"> at {w.company}</span>}</span>
              <span className="muted">{w.name}</span>
              <span className="score">{w.score}%</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
