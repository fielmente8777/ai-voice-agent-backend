// ============================================================
// EXOTEL CHANNEL
// Everything we SEND to Exotel goes through here (audio, mark, clear).
//
// Exotel requires every outbound audio chunk to be 3200–100000 bytes and a
// multiple of 320. Sarvam streams chunks of random sizes, so we re-buffer
// them into steady ~100 ms chunks — this is what removes the choppy/breaking audio.
// ============================================================

import config from "../config/env.js";
import { safeSend } from "../utils/ws.js";

const MIN_CHUNK = 3200;
const ALIGN = 320;

// ~100 ms of 16-bit mono audio, rounded to a multiple of 320, never below 3200.
const CHUNK_BYTES = Math.max(
  MIN_CHUNK,
  Math.round((config.audio.sampleRate * 2 * 0.1) / ALIGN) * ALIGN,
);

export default class ExotelChannel {
  constructor(ws, log) {
    this.ws = ws;
    this.log = log;
    this.streamSid = null;
    this.audioBuffer = Buffer.alloc(0);
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  // Queue a base64 PCM chunk from TTS; sends full fixed-size chunks.
  sendAudio(base64Audio) {
    let pcm = Buffer.from(base64Audio, "base64");

    // Safety: if a chunk ever arrives as WAV, drop its 44-byte header (it plays as a click).
    if (pcm.length > 44 && pcm.toString("ascii", 0, 4) === "RIFF") {
      pcm = pcm.subarray(44);
    }

    this.audioBuffer = Buffer.concat([this.audioBuffer, pcm]);

    while (this.audioBuffer.length >= CHUNK_BYTES) {
      this.#sendChunk(this.audioBuffer.subarray(0, CHUNK_BYTES));
      this.audioBuffer = this.audioBuffer.subarray(CHUNK_BYTES);
    }
  }

  // End of a reply: send what's left, padded with silence to a valid size.
  flushAudio() {
    if (!this.audioBuffer.length) return;

    const size = Math.max(MIN_CHUNK, Math.ceil(this.audioBuffer.length / ALIGN) * ALIGN);
    const padded = Buffer.alloc(size); // zeros = silence
    this.audioBuffer.copy(padded);

    this.audioBuffer = Buffer.alloc(0);
    this.#sendChunk(padded);
  }

  #sendChunk(chunk) {
    safeSend(
      this.ws,
      { event: "media", stream_sid: this.streamSid, media: { payload: chunk.toString("base64") } },
      this.log,
    );
  }

  // Exotel echoes this mark back once playback reaches this point.
  sendMark(name) {
    return safeSend(
      this.ws,
      { event: "mark", stream_sid: this.streamSid, mark: { name } },
      this.log,
    );
  }

  // Drop any audio Exotel has queued but not yet played (barge-in).
  clear() {
    this.audioBuffer = Buffer.alloc(0); // also drop what we haven't sent yet

    if (!this.streamSid) return;

    this.log.info("clearing queued outbound audio");

    safeSend(this.ws, { event: "clear", stream_sid: this.streamSid }, this.log);
  }

  // Agent ends the call: closing the stream makes Exotel move on to the next
  // applet in the flow (put a Hangup applet after the Voicebot applet).
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}
