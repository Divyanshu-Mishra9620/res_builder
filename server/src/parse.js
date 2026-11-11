/**
 * Uploaded file → plain text, and contact details → kept local.
 * The model only ever sees the resume with email, phone and links redacted.
 */
import { UserError } from "./llm.js";

export const MAX_RESUME_CHARS = 9000; // about 2 pages; keeps requests inside free-tier limits

export async function fileToText(buffer, filename = "") {
  const ext = filename.toLowerCase().split(".").pop();
  let text;
  if (ext === "pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    ({ text } = await extractText(pdf, { mergePages: true }));
  } else if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    ({ value: text } = await mammoth.extractRawText({ buffer }));
  } else if (ext === "txt" || ext === "md") {
    text = buffer.toString("utf8");
  } else {
    throw new UserError("Upload a PDF, DOCX or TXT file, or paste the text.");
  }
  text = cleanText(text);
  if (text.length < 150) throw new UserError("Couldn't read much text from that file. If it's a scanned PDF, paste the text instead.");
  return text;
}

export const cleanText = (t) =>
  String(t).replace(/\r/g, "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com)\/\S+/gi;
const PHONE = /\+?\d[\d ().-]{8,}\d/g;

/** Pulls contact details out of the text and replaces them with placeholders. */
export function redactContacts(text) {
  const contact = { emails: [], phones: [], links: [] };
  let out = text.replace(EMAIL, (m) => { contact.emails.push(m); return "[email]"; });
  out = out.replace(LINK, (m) => { contact.links.push(m.replace(/[.,;)]+$/, "")); return "[link]"; });
  out = out.replace(PHONE, (m) => {
    if (m.replace(/\D/g, "").length < 10) return m; // date ranges like "2019 - 2023" aren't phones
    contact.phones.push(m.trim());
    return "[phone]";
  });
  return { text: out, contact };
}
