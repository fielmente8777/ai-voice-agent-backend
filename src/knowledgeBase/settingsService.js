// ============================================================
// HOTEL SETTINGS
// Per-hotel switches set in the dashboard, one document per hotel:
//
//   { ndid, hid, voiceEnabled: true, whatsappIntegrationEnabled: true, ... }
//
// whatsappIntegrationEnabled = false -> the agent never offers or sends
// anything on WhatsApp. If a caller asks for a brochure / photos, it says
// the hotel's default message (if one is saved) or "our team will send it
// to you shortly".
//
// Cached for a short time so a dashboard switch takes effect within a minute.
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";
import createLogger from "../utils/logger.js";

const log = createLogger("settings");
const { collection, cacheTtlMs, defaultMessageFields } = config.hotelSettings;

const cache = new Map(); // ndid -> { settings, expires }

// First non-empty text among the fields a default message may be saved under.
function pickDefaultMessage(doc) {
  for (const field of defaultMessageFields) {
    const value = doc?.[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// -> { whatsappEnabled, voiceEnabled, defaultMessage, found }
export async function getHotelSettings(ndid) {
  // Not configured: keep the old behaviour (WhatsApp on whenever the hotel has an account).
  if (!collection) {
    return { whatsappEnabled: true, voiceEnabled: true, defaultMessage: null, found: false };
  }

  const cached = cache.get(ndid);
  if (cached && cached.expires > Date.now()) return cached.settings;

  const doc = ndid
    ? await getDB().collection(collection).findOne({ ndid }, { sort: { updatedAt: -1 } })
    : null;

  if (!doc) log.warn(`no settings document for ndid ${ndid} in "${collection}" — WhatsApp stays OFF for this hotel`);

  const settings = {
    // Only an explicit `true` turns WhatsApp on.
    whatsappEnabled: doc?.whatsappIntegrationEnabled === true,
    voiceEnabled: doc?.voiceEnabled !== false,
    defaultMessage: pickDefaultMessage(doc),
    found: Boolean(doc),
  };

  cache.set(ndid, { settings, expires: Date.now() + cacheTtlMs });
  return settings;
}

const settingsService = { getHotelSettings };
export default settingsService;
