// ============================================================
// CREATE THE FIRST-CONTACT TEMPLATES FOR A HOTEL
//
//   npm run create:templates -- <ndid>             -> shows what would be created (changes nothing)
//   npm run create:templates -- <ndid> --create    -> submits them to Meta for approval
//
// A caller who has never messaged the hotel on WhatsApp can only receive an
// approved template. These three let the voice agent deliver the brochure
// PDF and a room photo to exactly those callers:
//
//   voice_call_brochure   (PDF in the header)
//   voice_call_photos     (photo in the header)
//   voice_call_followup   (text only)
//
// Meta usually approves utility templates within minutes, sometimes hours.
// Check the status with:  npm run check:whatsapp -- <ndid>
// You can also create them by hand in WhatsApp Manager — keep the same
// names and header types; the wording is yours to change.
// ============================================================

import config from "../src/config/env.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import kbService from "../src/knowledgeBase/kbService.js";
import whatsappAccountService from "../src/whatsapp/whatsappAccountService.js";
import { metaGet } from "../src/whatsapp/metaClient.js";
import { buildCatalog } from "../src/whatsapp/kbCatalog.js";

const args = process.argv.slice(2);
const ndid = args.find((a) => !a.startsWith("--"));
const reallyCreate = args.includes("--create");

if (!ndid) {
  console.log("Usage: npm run create:templates -- <ndid> [--create]");
  process.exit(1);
}

const { graphUrl, apiVersion, templates: names } = config.whatsapp;
const api = (path) => `${graphUrl}/${apiVersion}/${path}`;

await connectDB();

const kb = await kbService.fetchKnowledgeBase(ndid);
const hotelName = kbService.getHotelName(kb);
const catalog = buildCatalog(kb, hotelName);
// Add --wa=<ndid2> if the hotel's WhatsApp account lives under another ndid.
const waNdid = args.find((a) => a.startsWith("--wa="))?.split("=")[1] || config.whatsapp.ndidMap[ndid] || ndid;
const account = await whatsappAccountService.getWhatsappAccount(waNdid, hotelName);

await disconnectDB();

if (!account?.wabaId) {
  console.log("❌ No WhatsApp account (with a WhatsApp Business Account id) found for this ndid.");
  process.exit(1);
}

const token = account.accessToken;
const auth = { Authorization: `Bearer ${token}` };

// Meta wants a sample file for media headers; use the hotel's own brochure and photo.
const samplePdf = catalog.brochures[0]?.url;
const sampleImage = catalog.rooms[0]?.images[0];
const sampleRoom = catalog.rooms[0]?.name || "our Deluxe Room";

const quickReplies = (...texts) => ({ type: "BUTTONS", buttons: texts.map((text) => ({ type: "QUICK_REPLY", text })) });

const wanted = [
  samplePdf && {
    name: names.document,
    sample: { url: samplePdf, type: "application/pdf" },
    format: "DOCUMENT",
    body: "Hi! Thank you for calling {{1}}. As requested on our call, here is the {{2}}. Reply to this message if you would like photos, rates or help with your booking.",
    example: [hotelName, "property brochure"],
    buttons: quickReplies("Send photos", "Check availability"),
  },
  sampleImage && {
    name: names.image,
    sample: { url: sampleImage, type: /\.png(\?|$)/i.test(sampleImage) ? "image/png" : "image/jpeg" },
    format: "IMAGE",
    body: "Hi! Thank you for calling {{1}}. As requested on our call, here is a photo of {{2}}. Reply to this message and we will share more photos and details.",
    example: [hotelName, sampleRoom],
    buttons: quickReplies("More photos", "Check availability"),
  },
  {
    name: names.text,
    body: "Hi! Thank you for calling {{1}}. Reply to this message and we will share the details you asked for on our call right here.",
    example: [hotelName],
    buttons: quickReplies("Send details"),
  },
].filter(Boolean);

if (!samplePdf) console.log(`⚠ The KB has no brochure PDF, so "${names.document}" is skipped.`);
if (!sampleImage) console.log(`⚠ The KB has no room photos, so "${names.image}" is skipped.`);

// What already exists?
const existing = await metaGet({ path: `${account.wabaId}/message_templates?fields=name,status,language&limit=250`, accessToken: token });
if (!existing.ok) {
  console.log(`❌ Meta rejected the request: [${existing.code}] ${existing.error}`);
  if (existing.code === 190) console.log("   The access token is expired. Reconnect WhatsApp in the dashboard or set WHATSAPP_ACCESS_TOKEN in .env.");
  process.exit(1);
}
const statusOf = (name) => existing.data.data.find((t) => t.name === name)?.status;

// Upload a sample file -> the "header_handle" Meta asks for when creating a media template.
async function uploadSample(appId, { url, type }) {
  const file = Buffer.from(await (await fetch(url)).arrayBuffer());

  const session = await (await fetch(api(`${appId}/uploads?file_name=sample&file_length=${file.length}&file_type=${encodeURIComponent(type)}`), { method: "POST", headers: auth })).json();
  if (!session.id) throw new Error(`upload session failed: ${JSON.stringify(session.error || session)}`);

  const done = await (await fetch(api(session.id), { method: "POST", headers: { Authorization: `OAuth ${token}`, file_offset: "0" }, body: file })).json();
  if (!done.h) throw new Error(`upload failed: ${JSON.stringify(done.error || done)}`);

  return done.h;
}

console.log(`\nHotel: "${hotelName}"   WhatsApp Business Account: ${account.wabaId}\n`);

let appId = null;

for (const t of wanted) {
  const status = statusOf(t.name);

  if (status) {
    console.log(`• ${t.name}: already exists (${status}) — skipped`);
    continue;
  }

  console.log(`• ${t.name}${t.format ? `  [${t.format} header]` : ""}\n    "${t.body}"`);

  if (!reallyCreate) continue;

  try {
    const components = [];

    if (t.format) {
      if (!appId) {
        const debug = await (await fetch(api(`debug_token?input_token=${encodeURIComponent(token)}`), { headers: auth })).json();
        appId = debug.data?.app_id;
        if (!appId) throw new Error(`could not read the app id from the token: ${JSON.stringify(debug.error || debug)}`);
      }

      components.push({ type: "HEADER", format: t.format, example: { header_handle: [await uploadSample(appId, t.sample)] } });
    }

    components.push({ type: "BODY", text: t.body, example: { body_text: [t.example] } });
    components.push(t.buttons);

    const res = await (
      await fetch(api(`${account.wabaId}/message_templates`), {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: t.name, language: names.language, category: "UTILITY", components }),
      })
    ).json();

    if (res.error) console.log(`    ❌ ${res.error.error_user_msg || res.error.message}`);
    else console.log(`    ✅ submitted — status: ${res.status}${res.category && res.category !== "UTILITY" ? ` (Meta filed it under ${res.category})` : ""}`);
  } catch (err) {
    console.log(`    ❌ ${err.message}`);
  }
}

console.log(
  reallyCreate
    ? `\nDone. Check approval with:  npm run check:whatsapp -- ${ndid}`
    : `\nNothing was changed. To submit these to Meta, run:  npm run create:templates -- ${ndid} --create`,
);
