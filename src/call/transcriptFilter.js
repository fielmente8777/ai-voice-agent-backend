// ============================================================
// TRANSCRIPT FILTER
// Decides if a caller transcript is worth responding to.
// ============================================================

import config from "../config/env.js";

const FILLERS = new Set(config.call.fillerWords);
const BACKCHANNEL = new Set(config.call.backchannelWords);

// Returns null if OK, otherwise a short reason why it was ignored.
export function getIgnoreReason(text, { isSpeaking, expectingAnswer = false }) {
  const cleaned = (text || "").trim().toLowerCase();

  if (cleaned.length < 2) {
    return "too short";
  }

  // Ignore "hmm"/"uh" while the AI is talking so it doesn't cut itself off.
  if (isSpeaking && FILLERS.has(cleaned)) {
    return "filler word while AI speaking";
  }

  // "okay" / "haan ji" while the agent talks = caller is listening, not interrupting.
  const plain = cleaned.replace(/[.,!?।]/g, "").trim();
  if (isSpeaking && !expectingAnswer && BACKCHANNEL.has(plain)) {
    return "backchannel while AI speaking";
  }

  return null;
}
