// ============================================================
// 24-HOUR WINDOW CHECK
// WhatsApp only delivers free-form messages (PDF, photos, carousel...)
// to someone who messaged the hotel in the last 24 hours. Meta does NOT
// reject the others — it accepts them and silently fails them later —
// so we have to know BEFORE sending.
//
// The Eazotel inbox already stores every incoming WhatsApp message, so:
//   caller's conversation(s) with this hotel -> newest inbound message -> < 24h old?
//
// Returns true (inside), false (outside / never messaged), null (couldn't check).
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";

const { conversationCollection, messageCollection, windowMs } = config.whatsapp;

// Leave a little margin so a message isn't sent at 23h59m and lost.
const SAFETY_MS = 2 * 60 * 1000;

export async function isWindowOpen({ ndid, to, phoneNumberId, log }) {
  try {
    const db = getDB();

    // The inbox stores numbers as "+919876543210"; we use "919876543210".
    const conversations = await db
      .collection(conversationCollection)
      .find({ ndid, phone: { $in: [`+${to}`, to] } }, { projection: { _id: 1, phoneNumberId: 1 } })
      .toArray();

    // Same guest may have chatted with another number of the same hotel.
    const mine = conversations.filter((c) => !c.phoneNumberId || !phoneNumberId || c.phoneNumberId === phoneNumberId);
    if (!mine.length) return false;

    const lastInbound = await db
      .collection(messageCollection)
      .find({ conversationId: { $in: mine.map((c) => c._id) }, direction: "inbound" }, { projection: { createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    if (!lastInbound?.createdAt) return false;

    return Date.now() - new Date(lastInbound.createdAt).getTime() < windowMs - SAFETY_MS;
  } catch (err) {
    log?.warn("24h window check failed:", err.message);
    return null;
  }
}
