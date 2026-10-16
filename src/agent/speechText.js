// ============================================================
// SPEECH TEXT CLEANER
// Last pass before TTS so nothing "written" gets read aloud:
// no markdown, emojis, links; symbols turned into words.
// ============================================================

export function toSpeakableText(text) {
  return (
    (text || "")
      // links are for WhatsApp, never for the ear
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\bwww\.\S+/g, "")
      // markdown
      .replace(/\*\*|__|`|#+\s?/g, "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      // emojis & pictographs
      .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
      // money & symbols
      .replace(/₹\s?([\d,]+)/g, "$1 rupees")
      .replace(/\bRs\.?\s?([\d,]+)/gi, "$1 rupees")
      .replace(/(\d),(\d)/g, "$1$2") // 2,000 -> 2000 (TTS reads it naturally)
      // 5+ digits in a row (phone numbers) -> "9 8 7 6 5" so TTS reads digits, not "98 lakh..."
      .replace(/\d{5,}/g, (run) => run.split("").join(" "))
      .replace(/\s&\s/g, " and ")
      .replace(/\s*[—–]\s*/g, ", ") // em/en dash -> short natural pause
      .replace(/\.{2,}|…/g, ".")
      .replace(/\b24\/7\b/g, "twenty four seven")
      .replace(/(\d)\s?km\b/gi, "$1 kilometres")
      .replace(/(\d)\s?sq\.?\s?ft\b/gi, "$1 square feet")
      .replace(/\s+/g, " ")
      .trim()
  );
}
