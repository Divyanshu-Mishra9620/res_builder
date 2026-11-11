import { useElapsed } from "../api.js";

const tone = (v) => (v == null ? "none" : v >= 75 ? "good" : v >= 50 ? "mid" : "low");

/** A circular percentage, e.g. the match score. */
export function Ring({ value, label, size = 128 }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ${tone(value)}`} viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${label}: ${value ?? "n/a"}%`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle cx="60" cy="60" r={r} className="ring-value" strokeDasharray={`${((value ?? 0) / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="62" className="ring-num">{value ?? "–"}</text>
      <text x="60" y="82" className="ring-label">{label}</text>
    </svg>
  );
}

/** A labelled horizontal bar. */
export function Meter({ label, value, hint }) {
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><b>{value == null ? "n/a" : `${value}%`}</b></div>
      <div className={`meter-track ${tone(value)}`}><span style={{ width: `${value ?? 0}%` }} /></div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

/** "Working… 12s", with a note that free tiers sometimes pause. */
export function Working({ label }) {
  const seconds = useElapsed(true);
  return (
    <p className="working" role="status">
      <span className="dots" aria-hidden><i /><i /><i /></span>
      {label}… {seconds > 0 && <span className="muted">{seconds}s</span>}
      {seconds >= 15 && <span className="muted"> · the free tier may be pausing for its rate limit</span>}
    </p>
  );
}

const LEVEL = { mastered: "Mastered", learning: "Learning", review: "Needs review" };
export function LevelBadge({ progress }) {
  if (!progress) return <span className="badge">Not started</span>;
  return <span className={`badge level-${progress.level}`}>{LEVEL[progress.level]} · {progress.best}%</span>;
}
