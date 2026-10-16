// ============================================================
// SIMULATE A CALL (no phone, no Exotel needed)
//
//   1. Start the server:   WHATSAPP_DRY_RUN=true npm run dev
//   2. In another terminal:
//        npm run test:call -- <ndid>
//        npm run test:call -- <ndid> "Do you have a pool?" "Send me the brochure on WhatsApp" "Okay bye"
//        npm run test:call -- <ndid> --from=9876543210 "Send me photos"
//        npm run test:call -- <ndid> --silence=40 "Hello"      (then say nothing for 40s)
//
// Pretends to be Exotel: speaks each line to the agent (the caller's voice is
// made with Sarvam TTS), "plays" the agent's audio, and prints how long the
// agent took to start answering. What the agent SAID is in the server log.
//
// --from is the caller's number. WhatsApp messages go to it for real unless
// the server runs with WHATSAPP_DRY_RUN=true.
// ============================================================

import "dotenv/config";
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const [ndid, ...custom] = args.filter((a) => !a.startsWith("--"));

if (!ndid) {
  console.log('Usage: npm run test:call -- <ndid> [--from=9876543210] ["line 1" "line 2" ...]');
  process.exit(1);
}

const lines = custom.length
  ? custom
  : [
      "Hi, I am looking for a place to stay for eight people next weekend.",
      "Can you send me the brochure and photos on WhatsApp?",
      "What is the check in time?",
      "Okay, thank you, bye.",
    ];

const PORT = process.env.PORT || 5001;
const RATE = Number(process.env.SAMPLE_RATE) || 16000;
const FRAME_BYTES = (RATE * 2) / 10; // 100 ms
const SILENCE = Buffer.alloc(FRAME_BYTES).toString("base64");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const t0 = Date.now();
const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`;

// ---- caller's voice (Sarvam TTS) ----
function speak(text) {
  return new Promise((resolve, reject) => {
    const url = `${process.env.SARVAM_TTS_URL || "wss://api.sarvam.ai/text-to-speech/ws"}?model=bulbul:v3&send_completion_event=true`;
    const ws = new WebSocket(url, { headers: { "Api-Subscription-Key": process.env.SARVAM_API_KEY } });
    const chunks = [];

    ws.on("open", () => {
      const language = /[ऀ-ॿ]/.test(text) ? "hi-IN" : "en-IN";
      ws.send(JSON.stringify({ type: "config", data: { speaker: process.env.TTS_SPEAKER || "priya", target_language_code: language, model: "bulbul:v3", output_audio_codec: "linear16", speech_sample_rate: RATE } }));
      ws.send(JSON.stringify({ type: "text", data: { text } }));
      ws.send(JSON.stringify({ type: "flush" }));
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "audio") chunks.push(Buffer.from(msg.data.audio, "base64"));
      if (msg.type === "event" && msg.data?.event_type === "final") {
        ws.close();
        resolve(Buffer.concat(chunks));
      }
      if (msg.type === "error") reject(new Error(JSON.stringify(msg)));
    });
    ws.on("error", reject);
  });
}

console.log("Preparing the caller's voice...");
const voices = await Promise.all(lines.map(speak));

// ---- fake Exotel ----
const ws = new WebSocket(`ws://localhost:${PORT}/?ndid=${ndid}${flag("wa_ndid") ? `&wa_ndid=${flag("wa_ndid")}` : ""}`);
const streamSid = `sim-${Date.now()}`;

let outgoing = []; // caller audio frames waiting to be sent
let playbackEnd = 0; // when the agent's audio finishes "playing"
let lastAgentAudio = 0;
let firstAgentAudio = null; // first agent audio after the caller stopped
let callerStoppedAt = null;
let pendingMarks = [];
let ended = false;

ws.on("open", () => {
  ws.send(JSON.stringify({ event: "connected" }));
  ws.send(JSON.stringify({
    event: "start",
    stream_sid: streamSid,
    start: { stream_sid: streamSid, call_sid: `sim-call-${Date.now()}`, from: flag("from") || "", media_format: { encoding: "raw/slin", sample_rate: RATE } },
  }));
  console.log(stamp(), "call connected");
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.event === "media") {
    const ms = Buffer.from(msg.media.payload, "base64").length / ((RATE * 2) / 1000);
    const now = Date.now();
    lastAgentAudio = now;
    playbackEnd = Math.max(playbackEnd, now) + ms;

    if (firstAgentAudio === null) {
      firstAgentAudio = now;
      if (callerStoppedAt) console.log(stamp(), `agent started speaking ${now - callerStoppedAt}ms after the caller stopped`);
      else console.log(stamp(), "agent started speaking (welcome)");
    }
  }

  // Echo the mark back when playback reaches it, like Exotel does.
  if (msg.event === "mark") {
    const timer = setTimeout(() => {
      ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ event: "mark", stream_sid: streamSid, mark: msg.mark }));
      console.log(stamp(), "agent finished speaking");
    }, Math.max(0, playbackEnd - Date.now()));
    pendingMarks.push(timer);
  }

  if (msg.event === "clear") {
    console.log(stamp(), "agent stopped talking (interrupted)");
    pendingMarks.forEach(clearTimeout);
    pendingMarks = [];
    playbackEnd = Date.now();
  }
});

ws.on("close", () => {
  ended = true;
  console.log(stamp(), "call ended by the agent");
});
ws.on("error", (err) => {
  console.error("Could not reach the server — is it running?", err.message);
  process.exit(1);
});

// A phone line sends audio all the time: speech when talking, silence otherwise.
const pump = setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const frame = outgoing.shift();

  if (!frame && callerStoppedAt === 0) {
    callerStoppedAt = Date.now();
    firstAgentAudio = null;
  }

  ws.send(JSON.stringify({ event: "media", stream_sid: streamSid, media: { payload: frame || SILENCE } }));
}, 100);

function say(pcm) {
  callerStoppedAt = 0; // 0 = talking; set to a time when the last frame is sent
  for (let i = 0; i < pcm.length; i += FRAME_BYTES) {
    const frame = Buffer.alloc(FRAME_BYTES);
    pcm.copy(frame, 0, i, Math.min(i + FRAME_BYTES, pcm.length));
    outgoing.push(frame.toString("base64"));
  }
}

// Agent has answered and its audio has finished playing.
async function agentDone(timeoutMs = 30000) {
  const start = Date.now();
  while (!ended && Date.now() - start < timeoutMs) {
    await sleep(100);
    const answered = firstAgentAudio !== null;
    if (answered && Date.now() > playbackEnd + 400 && Date.now() - lastAgentAudio > 800) return true;
  }
  return false;
}

await agentDone(15000); // welcome

for (let i = 0; i < lines.length && !ended; i++) {
  console.log(stamp(), `caller: "${lines[i]}"`);
  say(voices[i]);
  while (outgoing.length) await sleep(50);

  if (!(await agentDone()) && !ended) console.log(stamp(), "!! no answer from the agent within 30s");
  await sleep(600);
}

// Stay on the line saying nothing (--silence), or just long enough for a goodbye hang-up.
const quietMs = Number(flag("silence") || 3) * 1000;
if (quietMs > 3000) console.log(stamp(), `caller stays silent for ${quietMs / 1000}s`);
callerStoppedAt = null;
for (let waited = 0; waited < quietMs && !ended; waited += 100) await sleep(100);

clearInterval(pump);
if (!ended) {
  ws.send(JSON.stringify({ event: "stop", stream_sid: streamSid, stop: { reason: "simulation finished" } }));
  ws.close();
}
console.log("\nDone. The agent's words and WhatsApp activity are in the server log.");
setTimeout(() => process.exit(0), 300);
