// ============================================================
// SIMPLE INTENT CHECKS (no AI needed)
// Used so "Shall I send it?" -> "yes" ALWAYS sends, even if the AI
// forgets to write the WhatsApp payload on the next turn, and so the
// agent only hangs up when the caller really is leaving.
//
// Works on English, Hinglish (English letters) and Hindi (Devanagari).
// Note: \b does not work around Devanagari letters, so those patterns have none.
// ============================================================

// Agent's reply asks permission to send something on WhatsApp.
export function isSendOffer(speech) {
  const s = (speech || "").toLowerCase().trim();
  if (!/whatsapp|send|share|bhej|व्हाट्स|भेज|शेयर/.test(s)) return false;
  return (
    /\b(shall|should|can|may) i (send|share|whatsapp)\b/.test(s) ||
    /\b(want|like) me to (send|share)\b/.test(s) ||
    /\bbhej (doon|du|dun|dein|de|sakti|sakta)\b/.test(s) ||
    /भेज\s?(दूँ|दूं|दू|दें|सकती|सकता)/.test(s) ||
    (/\bsend\b|\bshare\b|भेज|शेयर/.test(s) && /[?？]$/.test(s))
  );
}

// Caller's answer is a yes.
export function isYes(text) {
  const t = (text || "").toLowerCase();
  if (isNo(t)) return false;
  return (
    /\b(yes|yeah|yep|yup|haan|han|ha|ji|sure|ok|okay|please|send|bhej|bhejo|kar do|go ahead|of course|why not|definitely|same number|this number|isi number)\b/.test(t) ||
    /हाँ|हां|जी|ठीक है|भेज|कर दो|कर दीजिए|बिल्कुल|ज़रूर|जरूर|ओके|इसी|यही|सेम/.test(t) ||
    /\b(same|isi|yahi|issi)\b/.test(t)
  );
}

// Caller wants it on another WhatsApp number, not the one they're calling from.
export function wantsDifferentNumber(text) {
  const t = (text || "").toLowerCase();
  return (
    /\b(different|another|other|alag|dusra|dusre|doosra|doosre|koi aur|kisi aur|not this|not (the )?same|wife'?s?|husband'?s?)\b.{0,25}\b(number|no|whatsapp|phone|pe|par)\b/.test(t) ||
    /\b(different|another|alag|dusre|doosre|kisi aur|second number|2nd number|new number|someone else|some other)\b/.test(t) ||
    /दूसरा|दूसरे|दूसरी|अलग|किसी और|कोई और|डिफरेंट/.test(t)
  );
}

// Caller is asking for something to be sent on WhatsApp.
export function isSendRequest(text) {
  const t = (text || "").toLowerCase();
  return (
    /\b(send|share|whatsapp|forward|bhej|bhejo|bhejiye|bhej do|mail)\b/.test(t) && /\b(brochure|photo|photos|pic|pics|picture|pictures|image|images|video|detail|details|location|map|link|pdf|rate|rates|whatsapp|it|them|me|mujhe|kar do)\b/.test(t)
  ) || /भेज|व्हाट्सएप कर|व्हाट्सऐप कर|शेयर कर/.test(t);
}

// Caller's answer is a no.
export function isNo(text) {
  const t = (text || "").toLowerCase();
  return /\b(no|nope|nahi|nahin|mat|don'?t|not now|later|baad mein)\b/.test(t) || /नहीं|मत|बाद में|अभी नहीं/.test(t);
}

// Agent's reply claims it is sending something right now.
export function claimsToBeSending(speech) {
  const s = speech || "";
  return (
    /\b(sending|i'?ve sent|i have sent|just sent|bhej (rahi|raha|rahe|di|diya|deti|deta)|share kar (rahi|raha|diya|di))\b/i.test(s) ||
    /भेज\s?(रही|रहा|रहे|दी|दिया|देती|देता)|शेयर कर (रही|रहा|दिया|दी)/.test(s)
  );
}

// Caller is wrapping up the call.
export function isGoodbye(text) {
  const t = (text || "").toLowerCase();
  return (
    /\b(bye|goodbye|good night|see you|take care|that'?s all|that is all|nothing else|no thanks?|no thank you|thanks?,? that'?s it|i'?ll call (you )?(back|later)|will call (back|later)|talk later|hang up|cut the call|rakhta h(oo|u)n|rakhti h(oo|u)n|phone rakh|chalo theek hai|bas itna hi|aur kuch nahi|alvida|shukriya)\b/.test(t) ||
    /बाय|अलविदा|रखता हूँ|रखती हूँ|रखता हूं|रखती हूं|फोन रख|बस इतना ही|और कुछ नहीं|शुक्रिया|धन्यवाद/.test(t)
  );
}
