// ============================================================
// REPLY STREAM HELPERS
// The LLM streams {"reply":"...","whatsapp":[...]} a few characters at a
// time. These helpers pull the spoken part out AS IT ARRIVES, so TTS can
// start on the first sentence instead of waiting for the whole JSON.
// ============================================================

const REPLY_KEY = /"(?:reply|speech)"\s*:\s*"/;
const ESCAPES = { n: "\n", t: " ", r: "", b: "", f: "", '"': '"', "\\": "\\", "/": "/" };

// push(delta) -> the new characters of the "reply" string (decoded), or "".
export function createReplyExtractor() {
  let raw = "";
  let pos = -1; // index in `raw` of the next unread char of the reply string
  let done = false;

  return {
    // true once the closing quote of the reply has arrived
    get done() {
      return done;
    },

    push(delta) {
      if (done || !delta) return "";
      raw += delta;

      if (pos === -1) {
        const match = REPLY_KEY.exec(raw);
        if (!match) return "";
        pos = match.index + match[0].length;
      }

      let out = "";

      while (pos < raw.length) {
        const ch = raw[pos];

        if (ch === '"') {
          done = true;
          break;
        }

        if (ch !== "\\") {
          out += ch;
          pos++;
          continue;
        }

        // Escape sequence — wait for the rest if it hasn't arrived yet.
        const next = raw[pos + 1];
        if (next === undefined) break;

        if (next === "u") {
          const hex = raw.slice(pos + 2, pos + 6);
          if (hex.length < 4) break;
          out += String.fromCharCode(parseInt(hex, 16) || 32);
          pos += 6;
        } else {
          out += ESCAPES[next] ?? next;
          pos += 2;
        }
      }

      return out;
    },
  };
}

// "Rs. 500" / "Dr. Rao" must not be cut in the middle.
const ABBREVIATION = /\b(?:rs|mr|mrs|ms|dr|st|no|approx|vs|e\.g|i\.e)\.$/i;

// Collects streamed text and hands it over in speakable pieces: whole
// sentences, or a clause ("For eight of you, ...") once it's long enough —
// so the voice can start before the sentence is even finished.
export function createSentenceSplitter(onSentence, { minChars = 20, minClauseChars = 40 } = {}) {
  let buffer = "";

  return {
    push(text) {
      if (!text) return;
      buffer += text;

      const boundary = /([.!?।]["')\]]?|[,;:—–])\s+/g;
      let match;

      while ((match = boundary.exec(buffer)) !== null) {
        const end = match.index + match[0].length;
        const sentence = buffer.slice(0, end);
        const isClause = /^[,;:—–]/.test(match[1]);

        if (sentence.trim().length < (isClause ? minClauseChars : minChars) || ABBREVIATION.test(sentence.trimEnd())) continue;

        onSentence(sentence);
        buffer = buffer.slice(end);
        boundary.lastIndex = 0;
      }
    },

    // End of the reply: hand over whatever is left.
    flush() {
      const rest = buffer;
      buffer = "";
      if (rest.trim()) onSentence(rest);
    },
  };
}
