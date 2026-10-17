// ============================================================
// META WHATSAPP CLOUD API CLIENT
// sendWhatsAppMessage: POST a message payload -> { ok, messageId } or { ok:false, code, error }.
// metaGet:             GET any Graph path      -> { ok, data }      or { ok:false, code, error }.
// ============================================================

import config from "../config/env.js";

const { graphUrl, apiVersion, dryRun } = config.whatsapp;

// Meta error code: free-form message outside the 24h customer service window.
export const RE_ENGAGEMENT_ERROR = 131047;
// Meta error code: access token expired, revoked or invalid.
export const INVALID_TOKEN_ERROR = 190;

function toError(res, data) {
  const e = data.error || {};
  return {
    ok: false,
    code: e.code ?? res.status,
    error: e.error_data?.details || e.error_user_msg || e.message || `HTTP ${res.status}`,
  };
}

export async function sendWhatsAppMessage({ phoneNumberId, accessToken, payload }) {
  if (dryRun) return { ok: true, messageId: "dry-run" };

  const url = `${graphUrl}/${apiVersion}/${phoneNumberId}/messages`;

  let res;
  let data;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    data = await res.json().catch(() => ({}));
  } catch (err) {
    return { ok: false, code: "NETWORK", error: err.message };
  }

  if (!res.ok || data.error) return toError(res, data);

  // IMPORTANT: "ok" only means Meta ACCEPTED the message. If the caller is
  // outside the 24h window Meta still accepts it, then fails it a second
  // later through the webhook (131047) — nothing reaches the phone. That's
  // why whatsappService checks the window itself BEFORE choosing what to send.
  return { ok: true, messageId: data.messages?.[0]?.id || null };
}

export async function metaGet({ path, accessToken }) {
  try {
    const res = await fetch(`${graphUrl}/${apiVersion}/${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) return toError(res, data);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: "NETWORK", error: err.message };
  }
}
