// ============================================================
// WHATSAPP ACCOUNT SERVICE
// ndid -> { phoneNumberId, accessToken, wabaId } for the hotel's WhatsApp number.
// Reads the collection directly (same way as kbService). Token is NEVER logged.
//
// Token: WHATSAPP_ACCESS_TOKEN in .env (the platform's system-user token) is
// tried first when set; the token stored on the hotel's document is the
// other option. If Meta says the first one is invalid (error 190),
// whatsappService switches to the other automatically.
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";
import createLogger from "../utils/logger.js";

const log = createLogger("wa-account");
const { accountCollection, accountCacheTtlMs, accessToken: platformToken } = config.whatsapp;

const cache = new Map(); // "ndid|hotel name" -> { account, expires }

const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

function pickPhoneNumberId(doc) {
  return (
    doc?.phoneNumberInfo?.id ||
    doc?.phoneNumberInfo?.phoneNumberId ||
    doc?.phoneNumberInfo?.phone_number_id ||
    doc?.phoneNumberId ||
    doc?.phone_number_id ||
    null
  );
}

const isUsable = (doc) => Boolean(pickPhoneNumberId(doc) && (doc.accessToken || platformToken));

// hotelName: only used to choose when one ndid has several numbers connected.
export async function getWhatsappAccount(ndid, hotelName = "") {
  if (!ndid) return null;

  const cacheKey = `${ndid}|${hotelName}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.account;

  // A hotel can have more than one number connected -> newest first.
  const docs = await getDB()
    .collection(accountCollection)
    .find(
      { ndid },
      { projection: { _id: 0, ndid: 1, accessToken: 1, phoneNumberInfo: 1, phoneNumberId: 1, phone_number_id: 1, wabaInfo: 1, updatedAt: 1 } },
    )
    .sort({ updatedAt: -1 })
    .limit(5)
    .toArray();

  if (!docs.length) {
    log.warn(`no WhatsApp account for ndid: ${ndid} (collection "${accountCollection}")`);
    return null;
  }

  // Prefer the number whose WhatsApp name matches the hotel, then any complete LIVE account.
  const hotelWords = words(hotelName);
  const doc =
    docs.find((d) => isUsable(d) && words(d.phoneNumberInfo?.verifiedName).some((w) => hotelWords.includes(w))) ||
    docs.find((d) => isUsable(d) && d.phoneNumberInfo?.accountMode === "LIVE") ||
    docs.find(isUsable) ||
    docs[0];

  if (docs.length > 1) {
    log.warn(`${docs.length} WhatsApp accounts for ndid ${ndid} — using "${doc.phoneNumberInfo?.verifiedName || pickPhoneNumberId(doc)}"`);
  }

  const account = {
    ndid,
    phoneNumberId: pickPhoneNumberId(doc),
    accessToken: platformToken || doc.accessToken || null,
    // Used once if Meta rejects the first token as invalid/expired.
    fallbackToken: platformToken && doc.accessToken && doc.accessToken !== platformToken ? doc.accessToken : null,
    wabaId: doc.wabaInfo?.id || null,
    displayNumber: doc.phoneNumberInfo?.displayPhoneNumber || doc.phoneNumberInfo?.display_phone_number || null,
  };

  if (!account.phoneNumberId || !account.accessToken) {
    log.error(
      "WhatsApp account incomplete for ndid:", ndid,
      "phoneNumberId:", account.phoneNumberId ? "ok" : "MISSING",
      "accessToken:", account.accessToken ? "ok" : "MISSING",
      "phoneNumberInfo keys:", Object.keys(doc.phoneNumberInfo || {}).join(","),
    );
    return null;
  }

  log.info("loaded for ndid:", ndid, "phoneNumberId:", account.phoneNumberId);
  cache.set(cacheKey, { account, expires: Date.now() + accountCacheTtlMs });
  return account;
}

const whatsappAccountService = { getWhatsappAccount };
export default whatsappAccountService;
