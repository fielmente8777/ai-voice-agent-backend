// ============================================================
// SARVAM STT (streaming speech-to-text)
// One stream per call. Caller audio in -> onTranscript(text) out.
//
// Also reports when the caller STARTS and STOPS making sound
// (onSpeechStart / onSpeechEnd) — the transcript itself only arrives
// ~half a second after they stop, which is too late to avoid talking
// over someone who paused mid-sentence.
//
// If the socket drops mid-call it reconnects, so the agent never goes deaf.
// ============================================================

import { WebSocket } from "ws";
import config from "../config/env.js";
import { parseJson } from "../utils/ws.js";

const { apiKey } = config.sarvam;
const { url, model, languageCode } = config.sarvam.stt;
const { sampleRate } = config.audio;

const MAX_RECONNECTS = 5;

export function createSttStream({ onTranscript, onSpeechStart, onSpeechEnd, log }) {
  const streamUrl =
    `${url}` +
    `?language-code=${languageCode}` +
    `&model=${model}` +
    `&sample_rate=${sampleRate}` +
    `&input_audio_codec=pcm_s16le` +
    `&vad_signals=true`;

  let ws = null;
  let closedByUs = false;
  let reconnects = 0;

  function connect() {
    log.info(reconnects ? `reconnecting (${reconnects})...` : "connecting...");

    ws = new WebSocket(streamUrl, {
      headers: { "Api-Subscription-Key": apiKey },
    });

    ws.on("open", () => log.info("connected"));

    ws.on("message", (raw) => {
      const msg = parseJson(raw);
      if (!msg) return;

      // Final transcript: {"type":"data","data":{"transcript":"...","language_code":"hi-IN"}}
      if (msg.type === "data" && msg.data?.transcript) {
        onTranscript(msg.data.transcript.trim(), msg.data.language_code);
        return;
      }

      // Voice activity: {"type":"events","data":{"signal_type":"START_SPEECH"}}
      if (msg.type === "events") {
        if (msg.data?.signal_type === "START_SPEECH") onSpeechStart?.();
        if (msg.data?.signal_type === "END_SPEECH") onSpeechEnd?.();
        return;
      }

      if (msg.type === "error" || msg.error) {
        log.error("api error:", JSON.stringify(msg));
      }
    });

    // Shows the real reason when Sarvam rejects the connection (bad key, bad params).
    ws.on("unexpected-response", (_req, res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => log.error("rejected, status", res.statusCode, body));
    });

    ws.on("error", (err) => log.error("socket error:", err.message));

    ws.on("close", (code, reason) => {
      log.info("closed:", code, reason.toString());

      if (closedByUs || reconnects >= MAX_RECONNECTS) return;

      reconnects++;
      setTimeout(() => !closedByUs && connect(), 300 * reconnects);
    });
  }

  connect();

  return {
    // payload = base64 PCM chunk straight from Exotel
    sendAudio(payload) {
      if (ws.readyState !== WebSocket.OPEN) return;

      try {
        ws.send(
          JSON.stringify({
            audio: {
              data: payload,
              sample_rate: String(sampleRate),
              encoding: "audio/wav",
            },
          }),
        );
      } catch (err) {
        log.error("send error:", err.message);
      }
    },

    close() {
      closedByUs = true;
      try {
        ws.close();
      } catch {}
    },
  };
}
