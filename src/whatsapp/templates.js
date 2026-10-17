// ============================================================
// TEMPLATES (for callers OUTSIDE the 24-hour window)
//
// Someone who has never messaged the hotel on WhatsApp — most callers —
// can only receive an APPROVED TEMPLATE. A template may carry media in
// its header, so the brochure PDF and a room photo still get delivered:
//
//   voice_call_brochure   header: DOCUMENT   -> the brochure PDF itself
//   voice_call_photos     header: IMAGE      -> one room photo
//   voice_call_followup   no header          -> "reply here and we'll share the details"
//
// Body variables (all optional):  {{1}} = hotel name,  {{2}} = what is attached.
// Create them once per hotel:  npm run create:templates -- <ndid>
// (or by hand in WhatsApp Manager / the Eazotel dashboard, using the same names).
//
// When the guest replies or taps a button, the 24h window opens and the
// rest (carousel, video, buttons) can be sent normally.
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";
import { metaGet } from "./metaClient.js";

const { templates: names, templateCollection } = config.whatsapp;

const cache = new Map(); // ndid -> { templates, expires }

const countVars = (text) => new Set((text || "").match(/\{\{\s*\d+\s*\}\}/g) || []).size;

function simplify(t) {
  const components = t.components || [];
  const part = (type) => components.find((c) => String(c.type).toUpperCase() === type);
  const header = part("HEADER");

  return {
    name: t.name,
    language: t.language,
    header: String(header?.format || t.headerType || "NONE").toUpperCase(),
    bodyVars: countVars(part("BODY")?.text ?? t.body),
  };
}

// name -> template, for this hotel's APPROVED templates. Meta is the source
// of truth; the dashboard's synced copy in Mongo is the fallback.
async function loadApproved(account, log) {
  let list = null;

  if (account.wabaId) {
    const path = `${account.wabaId}/message_templates?fields=name,status,language,components&limit=250`;
    let res = await metaGet({ path, accessToken: account.accessToken });
    if (!res.ok && account.fallbackToken) res = await metaGet({ path, accessToken: account.fallbackToken });

    if (res.ok) list = res.data.data || [];
    else log?.warn(`could not list templates from Meta: [${res.code}] ${res.error}`);
  }

  if (!list) {
    list = await getDB().collection(templateCollection).find({ ndid: account.ndid }).toArray().catch(() => []);
  }

  const approved = new Map();

  for (const t of list) {
    if (String(t.status).toUpperCase() !== "APPROVED") continue;
    // Same name in several languages -> keep the configured language.
    if (approved.has(t.name) && t.language !== names.language) continue;
    approved.set(t.name, simplify(t));
  }

  return approved;
}

export async function getCallTemplates(account, log) {
  const cached = cache.get(account.ndid);
  if (cached && cached.expires > Date.now()) return cached.templates;

  const approved = await loadApproved(account, log);

  const templates = {
    document: approved.get(names.document) || null,
    image: approved.get(names.image) || null,
    text: approved.get(names.text) || null,
  };

  // Wrong header type = Meta rejects the send. Better to not use it.
  if (templates.document?.header !== "DOCUMENT") templates.document = null;
  if (templates.image?.header !== "IMAGE") templates.image = null;
  if (templates.text && templates.text.header !== "NONE" && templates.text.header !== "TEXT") templates.text = null;

  cache.set(account.ndid, { templates, expires: Date.now() + names.cacheTtlMs });
  return templates;
}

// Template variables can't contain new lines, tabs or long runs of spaces.
const clean = (s, max = 60) => String(s ?? "").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function build(template, { header, label, hotelName }) {
  const components = [];

  if (header) components.push({ type: "header", parameters: [header] });

  if (template.bodyVars) {
    const values = [clean(hotelName), clean(label) || "the details you asked for"];
    components.push({
      type: "body",
      parameters: Array.from({ length: template.bodyVars }, (_, i) => ({ type: "text", text: values[i] || values[0] })),
    });
  }

  return {
    type: "template",
    template: { name: template.name, language: { code: template.language }, components },
  };
}

// One photo per room from whatever the AI wanted to send.
function photosIn(messages) {
  const photos = [];

  for (const m of messages) {
    if (m.type === "image") {
      photos.push({ link: m.image.link, label: (m.image.caption || "").split("\n")[0] });
    }

    if (m.type === "interactive" && m.interactive?.type === "carousel") {
      for (const card of m.interactive.action.cards) {
        photos.push({ link: card.header?.image?.link, label: (card.body?.text || "").split("\n")[0] });
      }
    }
  }

  const seen = new Set();
  const perRoom = photos.filter((p) => p.link && !seen.has(clean(p.label)) && seen.add(clean(p.label)));

  // All cards were the same room -> its first two photos.
  return (perRoom.length > 1 ? perRoom : photos.filter((p) => p.link)).slice(0, perRoom.length > 1 ? 3 : 2);
}

// Free-form messages (from messageBuilder) -> the template sends that can
// stand in for them. Returns what each template delivers and what must wait.
export function toTemplateMessages({ templates, messages, hotelName }) {
  const out = [];
  const waiting = new Set();

  const documents = messages.filter((m) => m.type === "document").slice(0, 2);
  const photos = photosIn(messages);

  for (const m of documents) {
    const name = String(m.document.filename || "Brochure").replace(/\.pdf$/i, "");

    if (!templates.document) {
      waiting.add("brochure");
      continue;
    }

    out.push({
      delivers: `brochure PDF (${name})`,
      message: build(templates.document, {
        header: { type: "document", document: { link: m.document.link, filename: m.document.filename || `${name}.pdf` } },
        label: name,
        hotelName,
      }),
    });
  }

  for (const photo of photos) {
    if (!templates.image) {
      waiting.add("photos");
      continue;
    }

    out.push({
      delivers: `photo${photo.label ? ` of ${clean(photo.label)}` : ""}`,
      message: build(templates.image, { header: { type: "image", image: { link: photo.link } }, label: photo.label, hotelName }),
    });
  }

  // A carousel had more photos than a template can carry.
  if (photos.length && messages.some((m) => m.interactive?.type === "carousel")) waiting.add("more photos");
  if (messages.some((m) => m.type === "video")) waiting.add("video");
  if (messages.some((m) => m.type === "text" || (m.type === "interactive" && m.interactive?.type !== "carousel"))) waiting.add("links and options");

  // Nothing could go with media -> at least open the chat with a plain intro.
  if (!out.length && templates.text) {
    out.push({ delivers: "a short intro message", message: build(templates.text, { hotelName }) });
  }

  return { templateMessages: out, waiting: [...waiting] };
}
