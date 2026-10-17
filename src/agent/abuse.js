// ============================================================
// ABUSE DETECTION (no AI needed)
// Spots abusive / obscene language in what the caller said, so the
// call can follow a fixed, fair path no matter what the AI feels like:
//
//   1st time -> stay calm, don't react to it, keep helping
//   2nd time -> one clear, polite warning
//   3rd time -> polite goodbye and the call is ended
//
// An upset guest with a real complaint ("this is ridiculous", "worst
// service") is NOT abuse — those words are deliberately not here. Neither are
// words with an innocent meaning on a hotel call ("kutta" = asking about pets,
// "kutiya" = cottage, "saala" = brother-in-law).
// Add words your callers actually use; keep them lowercase.
// ============================================================

// English letters (English + Hinglish). Matched as whole words.
const WORDS = [
  "fuck", "fucking", "fucker", "motherfucker", "bitch", "bastard", "asshole", "shit head", "dick", "cunt", "slut", "whore",
  "chutiya", "chutiye", "chutia", "bhosdike", "bhosdi", "bhosdiwale", "madarchod", "maderchod", "behenchod", "bhenchod",
  "benchod", "gandu", "gaandu", "harami", "haramzada", "haramzade", "kamina", "kamine",
  "randi", "lund", "lavde", "lawde", "jhant", "bhadwa", "bhadwe",
];

// Devanagari (when STT returns Hindi in its own script). Matched anywhere.
const HINDI = [
  "चूतिया", "चूतिये", "भोसड़ी", "भोसडी", "मादरचोद", "बहनचोद", "भेनचोद", "गांडू", "गाँडू", "हरामी", "हरामज़ादा", "हरामजादा",
  "कमीना", "कमीने", "रंडी", "लंड", "भड़वा", "भड़वे",
];

// STT sometimes masks swearing as f*** or ****.
const MASKED = /\b\w\*{2,}\w*|\*{3,}/;

const WORD_PATTERN = new RegExp(`\\b(${WORDS.join("|")})\\b`, "i");

export function isAbusive(text) {
  const t = text || "";
  return WORD_PATTERN.test(t) || MASKED.test(t) || HINDI.some((w) => t.includes(w));
}
