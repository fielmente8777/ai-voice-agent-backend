// ============================================================
// PHONE NUMBER HELPERS
// Meta wants digits only with country code, e.g. 919876543210.
// ============================================================

import config from "../config/env.js";

// "+91 98765-43210" / "09876543210" / "9876543210" -> "919876543210"
export function toWhatsAppNumber(raw) {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, "");
  const cc = config.whatsapp.defaultCountryCode;

  if (digits.startsWith("00")) digits = digits.slice(2); // 0091...
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1); // 098...

  if (digits.length === 10) digits = cc + digits;

  // E.164 allows 8–15 digits including country code.
  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

// For the prompt: "ending in 3210" — the agent can confirm without reading it all out.
export function lastDigits(number, count = 4) {
  return number ? number.slice(-count) : "";
}
