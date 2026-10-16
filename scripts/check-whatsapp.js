// ============================================================
// WHATSAPP SETUP CHECK
//   npm run check:whatsapp -- <ndid>               -> is everything set up for this hotel?
//   npm run check:whatsapp -- <ndid> 9876543210    -> also SEND the brochure + photos to that number
//   npm run check:whatsapp -- <ndid> --wa=<ndid2>  -> KB from <ndid>, WhatsApp account of <ndid2>
//
// Uses the exact same code path as a live call, so if this delivers,
// the voice agent delivers. It tells you:
//   1. which WhatsApp account is used, and whether Meta still accepts its token
//   2. what the KB has to send (rooms, brochures)
//   3. whether the first-contact templates exist and are approved
//   4. (with a number) if that number is inside the 24h window, and the send result
// ============================================================

import config from "../src/config/env.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import kbService from "../src/knowledgeBase/kbService.js";
import whatsappAccountService from "../src/whatsapp/whatsappAccountService.js";
import whatsappService from "../src/whatsapp/whatsappService.js";
import { metaGet } from "../src/whatsapp/metaClient.js";
import { getCallTemplates } from "../src/whatsapp/templates.js";
import { isWindowOpen } from "../src/whatsapp/whatsappWindow.js";
import { buildCatalog } from "../src/whatsapp/kbCatalog.js";
import { buildMessages } from "../src/whatsapp/messageBuilder.js";
import { toWhatsAppNumber } from "../src/utils/phone.js";

const [ndid, testNumber] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const waFlag = process.argv.find((a) => a.startsWith("--wa="))?.split("=")[1];

if (!ndid) {
  console.log("Usage: npm run check:whatsapp -- <ndid> [mobile-number-to-send-a-test-to]");
  process.exit(1);
}

const log = { info: (...a) => console.log("   ", ...a), warn: (...a) => console.log("   ⚠", ...a), error: (...a) => console.log("   ✖", ...a), debug() {} };
const names = config.whatsapp.templates;

await connectDB();

// Whose WhatsApp number sends: --wa flag > WHATSAPP_NDID_MAP > same hotel as the KB.
const waNdid = waFlag || config.whatsapp.ndidMap[ndid] || ndid;

// ---- 1. Knowledge base ----
const kb = await kbService.fetchKnowledgeBase(ndid);
const hotelName = kbService.getHotelName(kb);
const catalog = buildCatalog(kb, hotelName);

console.log(`\n1. Knowledge base: ${kb ? `"${hotelName}"` : "❌ NOT FOUND for this ndid"}`);
if (kb) console.log(`   ${catalog.rooms.length} rooms with photos, ${catalog.brochures.length} brochure PDFs`);

// ---- 2. Account + token ----
const account = await whatsappAccountService.getWhatsappAccount(waNdid, hotelName);
console.log(`\n2. WhatsApp account${waNdid !== ndid ? ` of ndid ${waNdid}` : ""} (collection "${config.whatsapp.accountCollection}"):${account ? "found" : "❌ NOT FOUND — the agent cannot send anything"}`);

if (!account) {
  await disconnectDB();
  process.exit(1);
}

console.log(`   number: ${account.displayNumber || "-"}   phone number id: ${account.phoneNumberId}`);

let tokenOk = false;
for (const [label, token] of [[config.whatsapp.accessToken ? "WHATSAPP_ACCESS_TOKEN (.env)" : "token saved on the account", account.accessToken], ["token saved on the account", account.fallbackToken]]) {
  if (!token) continue;
  const res = await metaGet({ path: `${account.phoneNumberId}?fields=verified_name,quality_rating`, accessToken: token });
  console.log(`   ${label}: ${res.ok ? `✅ valid (${res.data.verified_name})` : `❌ [${res.code}] ${res.error}`}`);
  tokenOk ||= res.ok;
}

if (!tokenOk) {
  console.log("   -> Meta rejects the token, so NOTHING can be sent. Fix: reconnect WhatsApp for this hotel in the");
  console.log("      dashboard, or put the platform's system-user token in .env as WHATSAPP_ACCESS_TOKEN.");
}

// ---- 3. Templates ----
const templates = await getCallTemplates(account, log);
console.log("\n3. First-contact templates (needed for callers who never messaged the hotel on WhatsApp):");
for (const [kind, name] of [["document", names.document], ["image", names.image], ["text", names.text]]) {
  console.log(`   ${templates[kind] ? "✅" : "❌"} ${name}${templates[kind] ? ` (${templates[kind].language})` : " — missing or not approved"}`);
}
if (!templates.document || !templates.image) {
  console.log(`   -> create them:  npm run create:templates -- ${ndid}`);
}

// ---- 4. Test send ----
if (testNumber) {
  const to = toWhatsAppNumber(testNumber);
  const open = await isWindowOpen({ ndid: waNdid, to, phoneNumberId: account.phoneNumberId, log });
  console.log(`\n4. Sending to ${to}  (24h window: ${open === null ? "unknown" : open ? "OPEN — everything can be sent" : "CLOSED — templates only"})`);

  const room = catalog.rooms.find((r) => r.brochure) || catalog.rooms[0];
  const actions = [{ send: "brochure", rooms: room ? [room.id] : [] }, { send: "photos", rooms: room ? [room.id] : [] }];
  const { messages, problems } = buildMessages(actions, catalog);
  problems.forEach((p) => console.log("   ⚠", p));

  const result = await whatsappService.sendMessages({ ndid: waNdid, to, messages, hotelName, log });
  console.log("\n   RESULT:", JSON.stringify(result));

  if (result.status === "sent") console.log("   ✅ Check the phone — brochure and photos should be there.");
  if (result.status === "template_sent") console.log("   ✅ Check the phone — the template message(s) should be there. Reply to it and run this again to get the rest.");
  if (result.status === "unconfirmed") console.log(`   ❌ Meta accepted it but it will NOT arrive: this number is outside the 24h window and the templates are missing.\n      Either send "Hi" from that phone to ${account.displayNumber || "the hotel's WhatsApp"} and run this again, or create the templates.`);
  if (result.status === "failed") console.log("   ❌ Nothing was sent:", result.reason);
} else {
  console.log(`\n4. To send a real test:  npm run check:whatsapp -- ${ndid} <your-mobile-number>`);
}

await disconnectDB();
