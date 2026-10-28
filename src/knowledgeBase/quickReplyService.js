// ============================================================
// QUICK REPLIES SERVICE
// The hotel's saved quick replies (collection "quickreplies") are an extra
// knowledge source for the agent, same as in the WhatsApp agent.
// Loaded by ndid, turned into plain text lines, cached like the KB.
//
//   - <title / keyword / name>: <text> / <text> ...
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";
import createLogger from "../utils/logger.js";

const log = createLogger("quick-replies");
const { collection, cacheTtlMs } = config.quickReplies;

const cache = new Map(); // ndid -> { text, fetchedAt }

// Every "text" field, at any depth (messages, buttons, sections...).
function flattenQuickReplyText(value) {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenQuickReplyText(item));
  }

  if (typeof value === "object") {
    const texts = [];
    if (typeof value.text === "string" && value.text.trim()) {
      texts.push(value.text.trim());
    }
    for (const key of Object.keys(value)) {
      if (key === "text") continue; // already captured above
      texts.push(...flattenQuickReplyText(value[key]));
    }
    return texts;
  }

  return [];
}

function toText(quickReplies) {
  return quickReplies
    .map((q) => {
      const label = q.title || q.keyword || q.name || "Quick reply";
      const texts = flattenQuickReplyText(q).filter(Boolean);
      return texts.length ? `- ${label}: ${texts.join(" / ")}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

// -> text for the prompt ("" when the hotel has none)
export async function fetchQuickRepliesText(ndid) {
  if (!ndid) return "";

  const cached = cache.get(ndid);
  if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) return cached.text;

  const quickReplies = await getDB().collection(collection).find({ ndid }).toArray();
  const text = toText(quickReplies);

  log.info(`${quickReplies.length} quick replies for ndid ${ndid}`);
  cache.set(ndid, { text, fetchedAt: Date.now() });
  return text;
}

const quickReplyService = { fetchQuickRepliesText };
export default quickReplyService;
