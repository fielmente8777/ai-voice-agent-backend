// ============================================================
// PHONE NUMBER CAPTURE
// Callers say numbers in pieces with pauses: "98765" ... "43210".
// STT sends each piece as a separate transcript, so the bot used to
// answer after the first half. These helpers spot "number-only"
// transcripts so CallSession can collect the pieces before replying.
// ============================================================

const WORD_DIGITS = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
  // Hindi (romanised, as STT often returns)
  shunya: "0", ek: "1", do: "2", teen: "3", char: "4", chaar: "4", paanch: "5", panch: "5",
  chhe: "6", che: "6", chah: "6", saat: "7", sat: "7", aath: "8", nau: "9",
  // Hindi (Devanagari, when STT auto-detects the language)
  "शून्य": "0", "ज़ीरो": "0", "जीरो": "0", "एक": "1", "दो": "2", "तीन": "3", "चार": "4", "पांच": "5", "पाँच": "5",
  "छह": "6", "छः": "6", "छे": "6", "सात": "7", "आठ": "8", "नौ": "9",
};

const REPEATS = { double: 2, triple: 3, "डबल": 2, "ट्रिपल": 3 };

// Words people say around a number that don't make it "not a number".
const NUMBER_CHATTER = new Set([
  "my", "number", "is", "it's", "its", "the", "whatsapp", "mobile", "phone", "on", "to",
  "send", "it", "this", "mera", "meri", "hai", "pe", "par", "plus", "and", "then", "ok", "okay",
  "haan", "ji", "yes",
  "मेरा", "मेरी", "नंबर", "नम्बर", "है", "पे", "पर", "व्हाट्सएप", "व्हाट्सऐप", "मोबाइल", "हाँ", "हां", "जी",
]);

// ०१२३ -> 0123
const toAsciiDigits = (text) => text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

function tokenize(text) {
  return toAsciiDigits(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

// "double five" -> "55", "triple 2" -> "222", words -> digits, keeps existing digits.
export function extractDigits(text) {
  const tokens = tokenize(text || "");
  let out = "";
  let repeat = 1;

  for (const t of tokens) {
    if (REPEATS[t]) { repeat = REPEATS[t]; continue; }

    const d = /^\d+$/.test(t) ? t : WORD_DIGITS[t];
    if (d) {
      out += d.length === 1 ? d.repeat(repeat) : d;
    }
    repeat = 1;
  }

  return out;
}

// True when the transcript is (almost) only digits — a piece of a phone number.
export function isNumberPiece(text) {
  const tokens = tokenize(text || "");
  const digits = extractDigits(text);
  if (digits.length < 2) return false;

  const other = tokens.filter(
    (t) => !/^\d+$/.test(t) && !WORD_DIGITS[t] && !NUMBER_CHATTER.has(t) && !REPEATS[t],
  );
  return other.length === 0;
}

// Strip country code / trunk zero -> 10-digit Indian mobile if possible.
export function normaliseIndianMobile(digits) {
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
