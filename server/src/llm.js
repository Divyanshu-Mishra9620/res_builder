/**
 * The model, behind the OpenAI-compatible chat API: Groq's free tier or xAI Grok,
 * picked by whichever key is in server/.env. Every call asks for JSON, which code
 * validates; an answer with the wrong shape gets one repair turn.
 */
import OpenAI from "openai";

const PROVIDERS = {
  // Free tier: an 8K tokens-per-minute cap that counts max_tokens up front, so requests stay small.
  groq: { baseURL: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", model: "openai/gpt-oss-120b", effort: "low" },
  xai: { baseURL: "https://api.x.ai/v1", keyVar: "XAI_API_KEY", model: "grok-4.3" },
};
const env = process.env;
const presetName = PROVIDERS[env.LLM_PROVIDER] ? env.LLM_PROVIDER
  : !env.GROQ_API_KEY && env.XAI_API_KEY ? "xai" : "groq";
const preset = PROVIDERS[presetName];

export const PROVIDER = env.LLM_BASE_URL ? "custom" : presetName;
export const MODEL = env.LLM_MODEL || preset.model;
const BASE_URL = env.LLM_BASE_URL || preset.baseURL;
const API_KEY = env.LLM_API_KEY || env[preset.keyVar];
const EFFORT = env.LLM_EFFORT || preset.effort; // reasoning_effort, for models that take it

export const hasApiKey = () => Boolean(API_KEY);

/** A problem the user can fix (bad upload, missing key...). Its message is shown as-is. */
export class UserError extends Error {}

let shared = null;
export function defaultClient() {
  if (!API_KEY) throw new UserError("No API key. Put GROQ_API_KEY (free) or XAI_API_KEY (Grok) in server/.env and restart.");
  shared ??= new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL, maxRetries: 2, timeout: 120_000 });
  return shared;
}

/**
 * Ask for a JSON object and validate it with `check` (see shape.js).
 * Returns { value, usage }. Throws if the model can't produce a valid answer in two tries.
 */
export async function askJSON({ system, prompt, check, maxTokens = 3000, client = defaultClient() }) {
  const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];
  const usage = { input: 0, output: 0 };
  for (let attempt = 1; ; attempt += 1) {
    const res = await complete(client, {
      model: MODEL, messages, max_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(EFFORT ? { reasoning_effort: EFFORT } : {}),
    });
    usage.input += res.usage?.prompt_tokens ?? 0;
    usage.output += res.usage?.completion_tokens ?? 0;
    const choice = res.choices?.[0];
    const text = choice?.message?.content ?? "";

    let problem;
    if (choice?.finish_reason === "length") {
      problem = "Your answer was cut off by the length limit. Return a shorter JSON object.";
    } else {
      const data = parseJSON(text);
      if (data === undefined) {
        problem = "That wasn't valid JSON. Return only the JSON object.";
      } else {
        const result = check(data);
        if (!result.error) return { value: result.value, usage };
        problem = `The JSON doesn't match the required shape: ${result.error}. Return the corrected JSON object.`;
      }
    }
    if (attempt >= 2) throw new Error(`The model's answer was unusable twice (${problem})`);
    messages.push({ role: "assistant", content: text || "(empty)" }, { role: "user", content: problem });
  }
}

function parseJSON(text) {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try { return JSON.parse(body); } catch { return undefined; }
}

/**
 * One model call, made patient for free tiers: waits out per-minute rate limits, and retries
 * a turn that Groq rejected because the model's JSON didn't parse on its side.
 */
async function complete(client, params) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      const garbled = err instanceof OpenAI.BadRequestError && ["json_validate_failed", "tool_use_failed"].includes(err.code);
      if (garbled && attempt < 3) continue;
      const wait = err instanceof OpenAI.RateLimitError && attempt < 8 ? rateLimitWait(err, attempt) : null;
      if (wait == null) throw err;
      console.log(`[llm] rate limited; waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Milliseconds to wait out a 429, or null when it isn't worth waiting (a daily cap). */
function rateLimitWait(err, attempt) {
  const hinted = Number(err.headers?.get?.("retry-after")) || 0;
  if (hinted > 60) return null;
  return Math.min(Math.max(hinted, 2 ** attempt), 60) * 1000;
}

/** Turns SDK errors into a sentence a person can act on. Most specific first. */
export function describeError(err) {
  if (err instanceof UserError) return err.message;
  if (err instanceof OpenAI.AuthenticationError) return `Invalid API key for ${PROVIDER}. Check server/.env and restart.`;
  if (err instanceof OpenAI.NotFoundError) return `Model "${MODEL}" not found. Check LLM_MODEL.`;
  if (err instanceof OpenAI.RateLimitError) return `Rate limited by ${PROVIDER} (free tiers have per-minute and per-day caps): ${err.message}`;
  if (err instanceof OpenAI.APIConnectionError) return `Can't reach ${BASE_URL}. Check your internet connection.`;
  if (err instanceof OpenAI.APIError && err.status === 413) return "That request is too large for this tier. Try a shorter resume or job description.";
  if (err instanceof OpenAI.APIError) return `Model API error ${err.status}: ${err.message}`;
  return err.message;
}
