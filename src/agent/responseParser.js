// ============================================================
// AI RESPONSE PARSER
// The LLM ALWAYS answers with one JSON object:
//
//   {"reply":"Sure, sending them now.",
//    "whatsapp":[{"type":"carousel","body":"..","cards":[{"title","description","imageUrl","url"}]},
//                {"type":"document","documentUrl":"...pdf","filename":"..","caption":".."}]}
//
//   reply    -> spoken to the caller
//   whatsapp -> same schema as the WhatsApp chat agent; converted here to
//               actions, then messageBuilder shapes the Meta payloads
//   end_call -> true when the agent has said goodbye and wants to hang up
//
// If the model ever answers in plain text instead, that text is spoken
// and no actions are taken (the call never breaks).
// ============================================================

import { jsonrepair } from "jsonrepair";

const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi;

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(jsonrepair(text)); // fix a missing comma / brace / quote
  }
}

// Convert one message in the WhatsApp-agent schema into an internal action.
//   {"type":"carousel","body":"..","cards":[{"title","description","imageUrl","url"}]}
//   {"type":"image","imageUrl":"..","caption":".."}
//   {"type":"video","videoUrl":"..","caption":".."}
//   {"type":"document","documentUrl":"..","filename":"..","caption":".."}
//   {"type":"buttons","text":"..","buttons":[{"id","title"}]}  /  {"type":"list",...}  /  {"type":"text","text":".."}
function toAction(m) {
  if (!m || typeof m !== "object") return null;
  if (m.send) return m; // already internal format

  switch (String(m.type || "").toLowerCase()) {
    case "carousel":
      return {
        send: "photos",
        text: m.body || m.text,
        items: (m.cards || []).map((c) => ({
          name: c.title || c.name,
          image: c.imageUrl || c.image,
          details: c.description || c.details,
          url: c.url,
        })),
      };
    case "image":
      return { send: "photos", text: m.caption, items: [{ name: m.caption || m.title, image: m.imageUrl || m.image, details: "" }] };
    case "video":
      return { send: "video", text: m.caption, items: [{ name: m.caption || m.title, url: m.videoUrl || m.url }] };
    case "document":
      return { send: "brochure", text: m.caption, items: [{ name: m.filename || m.caption, url: m.documentUrl || m.url }] };
    case "buttons":
      return { send: "buttons", text: m.body || m.text, buttons: (m.buttons || []).map((b) => b.title || b) };
    case "list":
      return { send: "room_list", text: m.body || m.text };
    case "text":
      return m.body || m.text ? { send: "text", text: m.body || m.text } : null;
    default:
      return null;
  }
}

export function parseAgentResponse(raw) {
  const text = (raw || "")
    .replace(THINK_BLOCK, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const obj = parseJsonLoose(text.slice(start, end + 1));
      const speech = String(obj.reply ?? obj.speech ?? obj.text ?? "").trim();
      // "whatsapp": messages in the WhatsApp-agent schema (preferred); "actions" also accepted.
      const list = [obj.whatsapp, obj.actions, obj.action].flatMap((x) => (Array.isArray(x) ? x : x ? [x] : []));
      const actions = list.map(toAction).filter(Boolean);
      return { speech, actions, endCall: obj.end_call === true || obj.end_call === "true", error: null };
    } catch (err) {
      // fall through to plain text
      return { speech: text.slice(0, start).trim(), actions: [], endCall: false, error: `invalid JSON reply: ${err.message}` };
    }
  }

  // Not JSON -> speak it as-is.
  return { speech: text, actions: [], endCall: false, error: text ? "reply was not JSON" : "empty reply" };
}
