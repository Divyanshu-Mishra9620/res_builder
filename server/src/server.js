import { createApp } from "./app.js";
import { MODEL, PROVIDER, hasApiKey } from "./llm.js";
import * as store from "./store.js";

const PORT = Number(process.env.PORT) || 5070; // not 5060/5061: browsers block those (SIP)

await store.connect(process.env.MONGODB_URI);
createApp().listen(PORT, () => {
  console.log(`SkillBridge API on http://localhost:${PORT}  (${PROVIDER}: ${MODEL}, storage: ${store.backend})`);
  if (!hasApiKey()) console.warn("No API key found. Add GROQ_API_KEY (free) or XAI_API_KEY (Grok) to server/.env.");
});
