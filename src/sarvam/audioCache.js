// ============================================================
// AUDIO CACHE (ready-made speech)
// The welcome line is the same for every call to a hotel, so we keep its
// audio in memory. A cached welcome starts the instant the call connects
// instead of waiting ~1s for TTS on every call.
//
// Key = the exact text (voice settings are fixed per server process).
// ============================================================

import { synthesizeToChunks } from "./ttsClient.js";
import createLogger from "../utils/logger.js";

const log = createLogger("audio-cache");

const MAX_ENTRIES = 200;

const cache = new Map(); // text -> [base64 audio chunks]
const inFlight = new Map(); // text -> promise

export function getCachedAudio(text) {
  return cache.get(text) || null;
}

export function storeAudio(text, chunks) {
  if (!text || !chunks?.length) return;

  // Oldest out first.
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(text, chunks);
}

// Make the audio now (in the background) so it's ready for a later call.
export function prefetchAudio(text) {
  if (!text || cache.has(text)) return Promise.resolve();
  if (inFlight.has(text)) return inFlight.get(text);

  const promise = synthesizeToChunks(text, log)
    .then((chunks) => storeAudio(text, chunks))
    .catch((err) => log.warn("prefetch failed:", err.message))
    .finally(() => inFlight.delete(text));

  inFlight.set(text, promise);
  return promise;
}
