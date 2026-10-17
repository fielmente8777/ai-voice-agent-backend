// ============================================================
// SARVAM TTS (streaming text-to-speech)
// One socket per reply. Text goes in sentence by sentence (sendText),
// audio chunks come out via onAudio() while the reply is still being written.
//
//   const tts = createTtsStream({...});   // socket starts connecting right away
//   tts.sendText("First sentence. ");     // Sarvam starts speaking at ~50 chars
//   tts.sendText("Second sentence.");
//   tts.end();                            // no more text
//   await tts.done;                       // all audio generated (or stopped)
//
// isCancelled(): checked on every event; when true, audio is dropped
//               (the caller interrupted or the call ended).
// onGenerationComplete(): Sarvam finished generating all audio.
//
// NOTE: `send_completion_event=true` must be in the URL. In the config
// message alone Sarvam ignores it and the "final" event never arrives.
// ============================================================

import { WebSocket } from "ws";
import config from "../config/env.js";
import { parseJson, safeClose } from "../utils/ws.js";

const { apiKey, languageCode } = config.sarvam;
const tts = config.sarvam.tts;
const { sampleRate } = config.audio;

const STREAM_URL = `${tts.url}?model=${encodeURIComponent(tts.model)}&send_completion_event=true`;

// The reply's script decides the voice language, so Hindi written in
// Devanagari is spoken as Hindi even when the default is en-IN.
const SCRIPTS = [
  [/[ऀ-ॿ]/, "hi-IN"],
  [/[ঀ-৿]/, "bn-IN"],
  [/[਀-੿]/, "pa-IN"],
  [/[઀-૿]/, "gu-IN"],
  [/[஀-௿]/, "ta-IN"],
  [/[ఀ-౿]/, "te-IN"],
  [/[ಀ-೿]/, "kn-IN"],
  [/[ഀ-ൿ]/, "ml-IN"],
];

export function languageFor(text) {
  return SCRIPTS.find(([script]) => script.test(text))?.[1] || languageCode;
}

export function createTtsStream({ isCancelled, onAudio, onGenerationComplete, log }) {
  const ws = new WebSocket(STREAM_URL, {
    headers: { "Api-Subscription-Key": apiKey },
  });

  let open = false;
  let configured = false;
  let ended = false;
  let finished = false;
  let completionTimer = null;
  const queue = []; // text given before the socket opened

  let settle;
  const done = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  function finish(error = null) {
    if (finished) return;
    finished = true;
    clearTimeout(completionTimer);
    safeClose(ws, log);
    error ? settle.reject(error) : settle.resolve();
  }

  function complete() {
    if (finished) return;
    if (!isCancelled()) onGenerationComplete?.();
    finish();
  }

  function write(text) {
    if (!configured) {
      configured = true;
      const language = languageFor(text);
      ws.send(
        JSON.stringify({
          type: "config",
          data: {
            speaker: tts.speaker,
            target_language_code: language,
            language_code: language,
            model: tts.model,
            output_audio_codec: "linear16",
            speech_sample_rate: sampleRate,
            pace: tts.pace,
            temperature: tts.temperature,
            max_chunk_length: tts.maxChunkLength,
            min_buffer_size: tts.minBufferSize,
            send_completion_event: true,
          },
        }),
      );
    }

    ws.send(JSON.stringify({ type: "text", data: { text } }));
  }

  function flush() {
    // Nothing was ever said -> nothing to wait for.
    if (!configured) return complete();

    ws.send(JSON.stringify({ type: "flush" }));

    // Safety net: never leave the call stuck if the "final" event is lost.
    completionTimer = setTimeout(() => {
      log.warn("no completion event from Sarvam, moving on");
      complete();
    }, tts.completionTimeoutMs);
  }

  ws.on("open", () => {
    // Reply became obsolete while the socket was connecting.
    if (finished || isCancelled()) {
      log.debug("stale response, not sending");
      safeClose(ws, log);
      finish();
      return;
    }

    open = true;

    try {
      queue.splice(0).forEach(write);
      if (ended) flush();
    } catch (err) {
      finish(err);
    }
  });

  ws.on("message", (raw) => {
    const msg = parseJson(raw);
    if (!msg || finished) return;

    // AUDIO CHUNK
    if (msg.type === "audio" && msg.data?.audio) {
      if (isCancelled()) {
        log.debug("dropping stale audio");
        return;
      }
      onAudio(msg.data.audio);
      return;
    }

    // GENERATION COMPLETE
    if (msg.type === "event" && msg.data?.event_type === "final") {
      log.debug("generation complete");
      complete();
      return;
    }

    // ERROR
    if (msg.type === "error") {
      log.error("api error:", JSON.stringify(msg));
      finish(new Error(msg.data?.message || "TTS error"));
    }
  });

  ws.on("unexpected-response", (_req, res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      log.error("rejected, status", res.statusCode, body);
      finish(new Error(`TTS rejected: ${res.statusCode}`));
    });
  });

  ws.on("error", (err) => {
    log.error("socket error:", err.message);
    finish(err);
  });

  ws.on("close", () => finish());

  return {
    done,

    sendText(text) {
      if (finished || ended || !text) return;

      if (!open) {
        queue.push(text);
        return;
      }

      try {
        write(text);
      } catch (err) {
        finish(err);
      }
    },

    // No more text is coming — generate what's buffered and finish.
    end() {
      if (finished || ended) return;
      ended = true;

      if (!open) return;

      try {
        flush();
      } catch (err) {
        finish(err);
      }
    },

    // Caller interrupted / call ended.
    stop() {
      finish();
    },
  };
}

// Whole text in -> all audio chunks out (used to pre-make the welcome line).
export function synthesizeToChunks(text, log) {
  const chunks = [];

  const stream = createTtsStream({
    log,
    isCancelled: () => false,
    onAudio: (audio) => chunks.push(audio),
  });

  stream.sendText(text);
  stream.end();

  return stream.done.then(() => chunks);
}
