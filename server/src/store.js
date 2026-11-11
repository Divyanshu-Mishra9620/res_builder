/**
 * Workspaces (one resume + one job, and everything learned since). MongoDB when MONGODB_URI is
 * set and reachable; otherwise an in-memory map, so a demo never dies because the database is down.
 * Updates set individual fields, so a lesson and a quiz generated at the same time don't clobber each other.
 */
import mongoose from "mongoose";

const Mixed = mongoose.Schema.Types.Mixed;
const workspaceSchema = new mongoose.Schema({
  _id: String,
  createdAt: { type: Date, default: Date.now },
  resume: Mixed,     // { text (contacts redacted), contact, truncated, filename }
  jdText: String,
  profile: Mixed,    // extracted by the model, annotated by code
  job: Mixed,        // requirements extracted by the model
  match: Mixed,      // computed by code
  tailor: Mixed,     // rewrites + truth-gate verdicts
  choices: Mixed,    // which rewrites the user kept
  lessons: Mixed,    // by skill key
  quizzes: Mixed,    // by quiz id, answer keys included (never sent to the browser)
  progress: Mixed,   // by skill key: best score, attempts
  usage: Mixed,      // tokens spent
}, { minimize: false, versionKey: false });

let Workspace = null;
const memory = new Map();
export let backend = "memory";

export async function connect(uri) {
  if (!uri) {
    console.warn("[store] MONGODB_URI not set: keeping workspaces in memory.");
    return backend;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    Workspace = mongoose.models.Workspace ?? mongoose.model("Workspace", workspaceSchema);
    backend = "mongodb";
    console.log("[store] connected to MongoDB.");
  } catch (err) {
    console.warn(`[store] MongoDB unreachable (${err.message}): keeping workspaces in memory.`);
  }
  return backend;
}

export async function create(doc) {
  const full = { createdAt: new Date(), choices: {}, lessons: {}, quizzes: {}, progress: {}, tailor: null, ...doc };
  if (Workspace) await Workspace.create(full);
  else memory.set(full._id, structuredClone(full));
  return full;
}

export async function get(id) {
  return Workspace ? Workspace.findById(id).lean() : structuredClone(memory.get(id) ?? null);
}

/** Sets fields by dotted path, e.g. { "lessons.docker": {...}, "usage.output": 900 }. Keys must not contain dots. */
export async function patch(id, sets) {
  if (Workspace) return Workspace.findByIdAndUpdate(id, { $set: sets }, { returnDocument: "after" }).lean();
  const doc = memory.get(id);
  if (!doc) return null;
  for (const [path, value] of Object.entries(sets)) {
    const keys = path.split(".");
    const last = keys.pop();
    let node = doc;
    for (const k of keys) node = node[k] ??= {};
    node[last] = structuredClone(value);
  }
  return structuredClone(doc);
}

export async function list(limit = 30) {
  const pick = (w) => ({
    _id: w._id, createdAt: w.createdAt, name: w.profile?.name, headline: w.profile?.headline,
    job: w.job?.title, company: w.job?.company, score: w.match?.score,
  });
  const docs = Workspace
    ? await Workspace.find({}, { profile: 1, job: 1, match: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(limit).lean()
    : [...memory.values()].reverse().slice(0, limit);
  return docs.map(pick);
}

export async function disconnect() {
  if (Workspace) await mongoose.disconnect();
}
