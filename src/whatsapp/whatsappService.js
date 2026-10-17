// ============================================================
// WHATSAPP SERVICE
// Sends ready-made message payloads (from messageBuilder) in order,
// through the hotel's own number.
//
//   caller messaged the hotel in the last 24h  -> send everything as-is
//   caller never messaged (most callers)       -> approved templates carrying
//                                                 the brochure PDF / a photo
//
// Result:
//   { status: "sent",          sent }                       all delivered free-form
//   { status: "template_sent", sent, delivered[], waiting[] } templates went out; `waiting` needs the guest to reply first
//   { status: "unconfirmed",   sent, reason }               handed to Meta but will probably not arrive
//   { status: "failed",        sent: 0, reason }
// ============================================================

import config from "../config/env.js";
import whatsappAccountService from "./whatsappAccountService.js";
import { sendWhatsAppMessage, RE_ENGAGEMENT_ERROR, INVALID_TOKEN_ERROR } from "./metaClient.js";
import { isWindowOpen } from "./whatsappWindow.js";
import { getCallTemplates, toTemplateMessages } from "./templates.js";

const NO_TEMPLATE_REASON =
  "the caller has not messaged the hotel's WhatsApp in the last 24 hours, and no approved template is set up for this hotel";

const labelOf = (m) => (m.type === "interactive" ? `interactive/${m.interactive.type}` : m.type === "template" ? `template/${m.template.name}` : m.type);

export async function sendMessages({ ndid, to, messages, hotelName, log }) {
  if (!to) return { status: "failed", sent: 0, reason: "no valid caller number" };
  if (!messages.length) return { status: "failed", sent: 0, reason: "nothing to send" };

  const account = await whatsappAccountService.getWhatsappAccount(ndid, hotelName);
  if (!account) return { status: "failed", sent: 0, reason: "hotel WhatsApp account not configured" };

  const send = async (message) => {
    // Envelope every message exactly as Meta expects.
    const payload = { messaging_product: "whatsapp", recipient_type: "individual", to, ...message };
    log.debug("payload:", JSON.stringify(payload));
    if (config.whatsapp.dryRun) log.info(`[dry run] would send ${labelOf(message)}:`, JSON.stringify(payload));

    let result = await sendWhatsAppMessage({ phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, payload });

    // Token expired / revoked -> switch to the other token we have and retry once.
    if (result.code === INVALID_TOKEN_ERROR && account.fallbackToken) {
      log.warn("access token rejected by Meta (190) — retrying with the other token");
      account.accessToken = account.fallbackToken;
      account.fallbackToken = null;
      result = await sendWhatsAppMessage({ phoneNumberId: account.phoneNumberId, accessToken: account.accessToken, payload });
    }

    if (result.ok) log.info(`sent ${labelOf(message)} -> ${to} (${result.messageId})`);
    else log.error(`send ${labelOf(message)} failed: [${result.code}] ${result.error}`);

    return result;
  };

  // Outside the window only templates get through.
  const sendTemplates = async () => {
    const templates = await getCallTemplates(account, log);
    const { templateMessages, waiting } = toTemplateMessages({ templates, messages, hotelName });

    if (!templateMessages.length) return null;

    const delivered = [];
    let lastError = null;

    for (const t of templateMessages) {
      const result = await send(t.message);
      if (result.ok) delivered.push(t.delivers);
      else lastError = result.error;
    }

    if (!delivered.length) return { status: "failed", sent: 0, reason: lastError };
    return { status: "template_sent", sent: delivered.length, delivered, waiting, hotelWhatsapp: account.displayNumber };
  };

  const windowOpen = await isWindowOpen({ ndid, to, phoneNumberId: account.phoneNumberId, log });
  log.info(`24h window for …${to.slice(-4)}: ${windowOpen === null ? "unknown" : windowOpen ? "open" : "closed"}`);

  if (windowOpen === false) {
    const result = await sendTemplates();
    if (result) return result;

    log.warn(`${NO_TEMPLATE_REASON} — create them with: npm run create:templates -- <ndid>`);
    // Fall through and try anyway (our window check could be wrong), but don't claim delivery.
  }

  let sent = 0;

  for (const message of messages) {
    const result = await send(message);

    if (result.ok) {
      sent++;
      continue;
    }

    // Meta said it straight away: outside the 24h window.
    if (result.code === RE_ENGAGEMENT_ERROR && sent === 0) {
      return (await sendTemplates()) || { status: "failed", sent: 0, reason: NO_TEMPLATE_REASON };
    }

    const reason = result.code === INVALID_TOKEN_ERROR
      ? "the hotel's WhatsApp access token is expired — reconnect WhatsApp in the dashboard or set WHATSAPP_ACCESS_TOKEN"
      : result.error;

    return { status: sent ? "sent" : "failed", sent, reason };
  }

  if (windowOpen === false) return { status: "unconfirmed", sent, reason: NO_TEMPLATE_REASON, hotelWhatsapp: account.displayNumber };

  return { status: "sent", sent };
}

// Has this caller messaged the hotel's number in the last 24h? (true / false / null = unknown)
export async function canSendFreely({ ndid, to, hotelName, log }) {
  const account = await whatsappAccountService.getWhatsappAccount(ndid, hotelName);
  if (!account || !to) return null;

  return isWindowOpen({ ndid, to, phoneNumberId: account.phoneNumberId, log });
}

const whatsappService = { sendMessages, canSendFreely };
export default whatsappService;
