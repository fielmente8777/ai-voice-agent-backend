/**
 * Exotel <-> Sarvam AI voice bridge
 * -----------------------------------
 * Exotel's Voicebot Applet opens a WebSocket to this server and streams
 * base64-encoded linear PCM audio (16-bit, mono) every ~100ms. This server:
 *   1. Forwards that audio to Sarvam's Speech-to-Text WebSocket
 *   2. On a final transcript, generates a reply (canned for now — swap in
 *      an LLM call if you want)
 *   3. Sends the reply text to Sarvam's Text-to-Speech WebSocket
 *   4. Streams the returned audio back to Exotel on the same socket
 *
 * Set EXOTEL_SAMPLE_RATE to 16000 in the Voicebot Applet config
 * (append ?sample-rate=16000 to your wss URL, or set it in the applet UI) —
 * this lets us skip resampling entirely, since Sarvam's STT/TTS both
 * support 16kHz PCM natively.
 *
 * Run:
 *   npm install
 *   cp .env.example .env   # fill in SARVAM_API_KEY
 *   node server.js
 *   ngrok http 5001        # use the wss:// version of the ngrok URL
 *                           # as the Voicebot Applet's "URL" field
 */

require("dotenv").config();
const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");
const { KB } = require("./constant");

// Without these, an error thrown inside an async event handler (like our
// TTS call) silently kills the whole Node process on modern Node versions —
// no error message, the server just stops. These make sure we always see it.
process.on("uncaughtException", (err) => {
  console.error("!!! UNCAUGHT EXCEPTION — server would have crashed:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error(
    "!!! UNHANDLED PROMISE REJECTION — server would have crashed:",
    reason,
  );
});

const PORT = process.env.PORT || 5001;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const LANGUAGE_CODE = process.env.LANGUAGE_CODE || "hi-IN"; // e.g. hi-IN, en-IN, ta-IN
const TTS_SPEAKER = process.env.TTS_SPEAKER || "anushka";
const SAMPLE_RATE = 16000; // must match the Voicebot Applet's configured rate

if (!SARVAM_API_KEY) {
  console.error(
    "Missing SARVAM_API_KEY in .env — get one at dashboard.sarvam.ai",
  );
  process.exit(1);
}

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (exotelWs) => {
  console.log("[exotel] call connected");

  let streamSid = null;
  let sttSocket = null;
  let mediaChunkCount = 0;

  // ---- 1. Open a Sarvam STT WebSocket for this call ----
  function connectSTT() {
    const url =
      `wss://api.sarvam.ai/speech-to-text/ws` +
      `?language-code=${LANGUAGE_CODE}` +
      `&model=saarika:v2.5` +
      `&sample_rate=${SAMPLE_RATE}` +
      `&input_audio_codec=pcm_s16le`;

    sttSocket = new WebSocket(url, {
      headers: { "Api-Subscription-Key": SARVAM_API_KEY },
    });

    sttSocket.on("open", () => console.log("[sarvam-stt] connected"));

    sttSocket.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.log("[sarvam-stt] non-JSON message:", raw.toString());
        return;
      }
      // Log everything so we can see exactly what Sarvam is sending back
      console.log("[sarvam-stt] message:", JSON.stringify(msg));

      // Final transcript arrives as {"type": "data", "data": {"transcript": "..."}}
      if (msg.type === "data" && msg.data?.transcript) {
        const transcript = msg.data.transcript.trim();
        if (transcript) {
          console.log("[caller said]", transcript);
          await respond(transcript);
        }
      }
      if (msg.type === "error" || msg.error) {
        console.error(
          "[sarvam-stt] API returned an error:",
          JSON.stringify(msg),
        );
      }
    });

    sttSocket.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        console.error(
          "[sarvam-stt] connection rejected, status",
          res.statusCode,
          "body:",
          body,
        ),
      );
    });

    sttSocket.on("error", (err) =>
      console.error("[sarvam-stt] error", err.message),
    );
    sttSocket.on("close", (code, reason) =>
      console.log(
        "[sarvam-stt] closed — code:",
        code,
        "reason:",
        reason.toString(),
      ),
    );
  }

  // ---- 2. Decide what to say back, using Sarvam's chat completion API ----
  // Keeps a running conversation history per call so the bot has context
  // turn to turn (starts empty, grows as the call goes on).
  const conversationHistory = [
    {
      role: "system",
      content: `You are a helpful voice assistant on a phone call. Keep replies " +
        "short (1-2 sentences) and conversational, since they'll be spoken aloud. " +
        "Only answer using the knowledge base below — if the answer isn't in it, " +
        "say you don't have that information rather than guessing.\n\n" +
        "KNOWLEDGE BASE:\n" + ${KB}
        `,
    },
  ];

  async function generateReply(transcript) {
    conversationHistory.push({ role: "user", content: transcript });

    try {
      const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": SARVAM_API_KEY,
        },
        body: JSON.stringify({
          model: "sarvam-105b",
          messages: conversationHistory,
          max_tokens: 150,
          reasoning_effort: null, // disable thinking mode for lower latency on a live call
        }),
      });

      if (!res.ok) {
        console.error("[sarvam-chat] error", res.status, await res.text());
        return "Sorry, I ran into an issue. Could you say that again?";
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) return "Sorry, I didn't quite get that.";

      conversationHistory.push({ role: "assistant", content: reply });
      return reply;
    } catch (err) {
      console.error("[sarvam-chat] fetch failed", err.message);
      return "Sorry, I ran into an issue. Could you say that again?";
    }
  }

  // ---- 3. Send text to Sarvam TTS, stream audio back to Exotel ----
  async function respond(transcript) {
    try {
      const replyText = await generateReply(transcript);
      console.log("[ai reply]", replyText);

      const ttsSocket = new WebSocket("wss://api.sarvam.ai/text-to-speech/ws", {
        headers: { "Api-Subscription-Key": SARVAM_API_KEY },
      });

      ttsSocket.on("open", () => {
        console.log("[sarvam-tts] connected");
        // Config message: everything nests under "data", and codec must be
        // one of mp3/wav/aac/opus/flac/linear16/mulaw/alaw — "linear16" is
        // the raw-PCM option (not "pcm_s16le", which was wrong before).
        ttsSocket.send(
          JSON.stringify({
            type: "config",
            data: {
              speaker: TTS_SPEAKER,
              language_code: LANGUAGE_CODE,
              output_audio_codec: "linear16",
              output_audio_sample_rate: SAMPLE_RATE,
              send_completion_event: true,
            },
          }),
        );
        // Text message — also type/data shaped, not a bare {text: ...}
        ttsSocket.send(
          JSON.stringify({ type: "text", data: { text: replyText } }),
        );
        // Flush tells the server "that's the full utterance, start generating"
        ttsSocket.send(JSON.stringify({ type: "flush" }));
      });

      ttsSocket.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          console.log("[sarvam-tts] non-JSON message:", raw.toString());
          return;
        }
        console.log(
          "[sarvam-tts] message type:",
          msg.type,
          "has audio:",
          !!msg.data?.audio,
          "audio length:",
          msg.data?.audio?.length,
        );

        if (msg.type === "audio" && msg.data?.audio && streamSid) {
          exotelWs.send(
            JSON.stringify({
              event: "media",
              stream_sid: streamSid,
              media: { payload: msg.data.audio },
            }),
          );
        }

        if (msg.type === "event" && msg.data?.event_type === "final") {
          exotelWs.send(
            JSON.stringify({
              event: "mark",
              stream_sid: streamSid,
              mark: { name: "reply-complete" },
            }),
          );
          ttsSocket.close();
        }

        if (msg.type === "error") {
          console.error(
            "[sarvam-tts] API returned an error:",
            JSON.stringify(msg.data),
          );
        }
      });

      ttsSocket.on("unexpected-response", (req, res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          console.error(
            "[sarvam-tts] connection rejected, status",
            res.statusCode,
            "body:",
            body,
          ),
        );
      });

      ttsSocket.on("error", (err) =>
        console.error("[sarvam-tts] error:", err.message, err),
      );
      ttsSocket.on("close", (code, reason) =>
        console.log(
          "[sarvam-tts] closed — code:",
          code,
          "reason:",
          reason.toString(),
        ),
      );
    } catch (err) {
      console.error("[respond] threw an error:", err);
    }
  }

  // ---- Exotel event handling ----
  exotelWs.on("message", (raw) => {
    let event;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (event.event) {
      case "connected":
        console.log("[exotel] handshake ok");
        break;

      case "start":
        streamSid = event.start.stream_sid;
        console.log(
          "[exotel] stream started",
          streamSid,
          event.start.media_format,
        );
        connectSTT();

        const welcomeMessage = `Hello, welcome to Eazotel. How can I help you today?`;

        speakText(welcomeMessage)
          .then(() => {
            console.log("[welcome] greeting finished");
          })
          .catch((err) => {
            console.error("[welcome] failed:", err.message);
          });
        break;

      case "media":
        // Forward caller audio straight through to Sarvam STT
        mediaChunkCount++;
        if (mediaChunkCount % 20 === 1) {
          // Print every ~2 seconds of audio instead of every ~100ms chunk
          // console.log(
          //   "[exotel] media chunks received so far:",
          //   mediaChunkCount,
          // );
        }
        if (sttSocket && sttSocket.readyState === WebSocket.OPEN) {
          sttSocket.send(
            JSON.stringify({
              audio: {
                data: event.media.payload,
                sample_rate: String(SAMPLE_RATE),
                encoding: "audio/wav",
              },
            }),
          );
        } else if (mediaChunkCount % 20 === 1) {
          console.log(
            "[exotel] dropping audio — sttSocket not open, readyState:",
            sttSocket?.readyState,
          );
        }
        break;

      case "dtmf":
        console.log("[exotel] dtmf", event.dtmf.digit);
        break;

      case "mark":
        console.log("[exotel] playback finished:", event.mark.name);
        break;

      case "stop":
        console.log("[exotel] call ended:", event.stop.reason);
        if (sttSocket) sttSocket.close();
        break;
    }
  });

  exotelWs.on("close", () => {
    console.log("[exotel] socket closed");
    if (sttSocket) sttSocket.close();
  });
});

async function speakText(text) {
  return new Promise((resolve, reject) => {
    const ttsSocket = new WebSocket("wss://api.sarvam.ai/text-to-speech/ws", {
      headers: {
        "Api-Subscription-Key": SARVAM_API_KEY,
      },
    });

    ttsSocket.on("open", () => {
      console.log("[sarvam-tts] connected");

      ttsSocket.send(
        JSON.stringify({
          type: "config",
          data: {
            speaker: TTS_SPEAKER,
            language_code: LANGUAGE_CODE,
            output_audio_codec: "linear16",
            output_audio_sample_rate: SAMPLE_RATE,
            send_completion_event: true,
          },
        }),
      );

      ttsSocket.send(
        JSON.stringify({
          type: "text",
          data: {
            text,
          },
        }),
      );

      ttsSocket.send(JSON.stringify({ type: "flush" }));
    });

    ttsSocket.on("message", (raw) => {
      let msg;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "audio" && msg.data?.audio && streamSid) {
        exotelWs.send(
          JSON.stringify({
            event: "media",
            stream_sid: streamSid,
            media: {
              payload: msg.data.audio,
            },
          }),
        );
      }

      if (msg.type === "event" && msg.data?.event_type === "final") {
        exotelWs.send(
          JSON.stringify({
            event: "mark",
            stream_sid: streamSid,
            mark: {
              name: "reply-complete",
            },
          }),
        );

        ttsSocket.close();
        resolve();
      }

      if (msg.type === "error") {
        console.error(
          "[sarvam-tts] API returned an error:",
          JSON.stringify(msg.data),
        );

        ttsSocket.close();
        reject(new Error("Sarvam TTS error"));
      }
    });

    ttsSocket.on("error", reject);
  });
}

server.listen(PORT, () => {
  console.log(`Bridge server listening on ws://localhost:${PORT}`);
  console.log(`Tunnel it: ngrok http ${PORT}`);
});

// require("dotenv").config();
// const { WebSocketServer, WebSocket } = require("ws");
// const http = require("http");

// const PORT = process.env.PORT || 5001;
// const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
// const LANGUAGE_CODE = process.env.LANGUAGE_CODE || "hi-IN"; // e.g. hi-IN, en-IN, ta-IN
// const TTS_SPEAKER = process.env.TTS_SPEAKER || "anushka";
// const SAMPLE_RATE = 16000; // must match the Voicebot Applet's configured rate

// if (!SARVAM_API_KEY) {
//   console.error(
//     "Missing SARVAM_API_KEY in .env — get one at dashboard.sarvam.ai",
//   );
//   process.exit(1);
// }

// const server = http.createServer();
// const wss = new WebSocketServer({ server });

// wss.on("connection", (exotelWs) => {
//   console.log("[exotel] call connected");

//   let streamSid = null;
//   let sttSocket = null;
//   let mediaChunkCount = 0;

//   // ---- 1. Open a Sarvam STT WebSocket for this call ----
//   function connectSTT() {
//     const url =
//       `wss://api.sarvam.ai/speech-to-text/ws` +
//       `?language-code=${LANGUAGE_CODE}` +
//       `&model=saarika:v2.5` +
//       `&sample_rate=${SAMPLE_RATE}` +
//       `&input_audio_codec=pcm_s16le`;

//     sttSocket = new WebSocket(url, {
//       headers: { "Api-Subscription-Key": SARVAM_API_KEY },
//     });

//     sttSocket.on("open", () => console.log("[sarvam-stt] connected"));

//     sttSocket.on("message", async (raw) => {
//       let msg;
//       try {
//         msg = JSON.parse(raw.toString());
//       } catch {
//         console.log("[sarvam-stt] non-JSON message:", raw.toString());
//         return;
//       }
//       // Log everything so we can see exactly what Sarvam is sending back
//       console.log("[sarvam-stt] message:", JSON.stringify(msg));

//       // Final transcript arrives as {"type": "data", "data": {"transcript": "..."}}
//       if (msg.type === "data" && msg.data?.transcript) {
//         const transcript = msg.data.transcript.trim();
//         if (transcript) {
//           console.log("[caller said]", transcript);
//           await respond(transcript);
//         }
//       }
//       if (msg.type === "error" || msg.error) {
//         console.error(
//           "[sarvam-stt] API returned an error:",
//           JSON.stringify(msg),
//         );
//       }
//     });

//     sttSocket.on("unexpected-response", (req, res) => {
//       let body = "";
//       res.on("data", (chunk) => (body += chunk));
//       res.on("end", () =>
//         console.error(
//           "[sarvam-stt] connection rejected, status",
//           res.statusCode,
//           "body:",
//           body,
//         ),
//       );
//     });

//     sttSocket.on("error", (err) =>
//       console.error("[sarvam-stt] error", err.message),
//     );
//     sttSocket.on("close", (code, reason) =>
//       console.log(
//         "[sarvam-stt] closed — code:",
//         code,
//         "reason:",
//         reason.toString(),
//       ),
//     );
//   }

//   // ---- 2. Decide what to say back, using Sarvam's chat completion API ----
//   // Keeps a running conversation history per call so the bot has context
//   // turn to turn (starts empty, grows as the call goes on).
//   const conversationHistory = [
//     {
//       role: "system",
//       content:
//         "You are a helpful voice assistant on a phone call. Keep replies " +
//         "short (1-2 sentences) and conversational, since they'll be spoken aloud.",
//     },
//   ];

//   async function generateReply(transcript) {
//     conversationHistory.push({ role: "user", content: transcript });

//     try {
//       const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "api-subscription-key": SARVAM_API_KEY,
//         },
//         body: JSON.stringify({
//           model: "sarvam-105b",
//           messages: conversationHistory,
//           max_tokens: 150,
//           reasoning_effort: null, // disable thinking mode for lower latency on a live call
//         }),
//       });

//       if (!res.ok) {
//         console.error("[sarvam-chat] error", res.status, await res.text());
//         return "Sorry, I ran into an issue. Could you say that again?";
//       }

//       const data = await res.json();

//       const reply = data.choices?.[0]?.message?.content?.trim();
//       if (!reply) return "Sorry, I didn't quite get that.";

//       conversationHistory.push({ role: "assistant", content: reply });
//       return reply;
//     } catch (err) {
//       console.error("[sarvam-chat] fetch failed", err.message);
//       return "Sorry, I ran into an issue. Could you say that again?";
//     }
//   }

//   // ---- 3. Send text to Sarvam TTS, stream audio back to Exotel ----
//   async function respond(transcript) {
//     const replyText = await generateReply(transcript);
//     console.log("[ai reply]", replyText);

//     const ttsSocket = new WebSocket("wss://api.sarvam.ai/text-to-speech/ws", {
//       headers: { "Api-Subscription-Key": SARVAM_API_KEY },
//     });

//     console.log("ttsSocket", ttsSocket);

//     ttsSocket.on("open", () => {
//       // First message: config
//       ttsSocket.send(
//         JSON.stringify({
//           config: {
//             speaker: TTS_SPEAKER,
//             target_language_code: LANGUAGE_CODE,
//             model: "bulbul:v2",
//             output_audio_codec: "pcm_s16le",
//             output_audio_sample_rate: SAMPLE_RATE,
//           },
//         }),
//       );
//       // Second message: the text to speak
//       ttsSocket.send(JSON.stringify({ text: replyText }));
//     });

//     ttsSocket.on("message", (raw) => {
//       let msg;
//       try {
//         msg = JSON.parse(raw.toString());
//         console.log("[sarvam-tts] message", msg);
//       } catch {
//         return;
//       }
//       if (msg.audio?.data && streamSid) {
//         // Forward this audio chunk straight to Exotel
//         exotelWs.send(
//           JSON.stringify({
//             event: "media",
//             stream_sid: streamSid,
//             media: { payload: msg.audio.data },
//           }),
//         );
//       }
//       if (msg.type === "completion") {
//         exotelWs.send(
//           JSON.stringify({
//             event: "mark",
//             stream_sid: streamSid,
//             mark: { name: "reply-complete" },
//           }),
//         );
//         ttsSocket.close();
//       }
//     });

//     ttsSocket.on("error", (err) =>
//       console.error("[sarvam-tts] error", err.message),
//     );
//   }

//   // ---- Exotel event handling ----
//   exotelWs.on("message", (raw) => {
//     let event;
//     try {
//       event = JSON.parse(raw.toString());
//     } catch {
//       return;
//     }

//     switch (event.event) {
//       case "connected":
//         console.log("[exotel] handshake ok");
//         break;

//       case "start":
//         streamSid = event.start.stream_sid;
//         console.log(
//           "[exotel] stream started",
//           streamSid,
//           event.start.media_format,
//         );
//         connectSTT();
//         break;

//       case "media":
//         // Forward caller audio straight through to Sarvam STT
//         mediaChunkCount++;
//         if (mediaChunkCount % 20 === 1) {
//           // Print every ~2 seconds of audio instead of every ~100ms chunk
//           // console.log(
//           //   "[exotel] media chunks received so far:",
//           //   mediaChunkCount,
//           // );
//         }
//         if (sttSocket && sttSocket.readyState === WebSocket.OPEN) {
//           sttSocket.send(
//             JSON.stringify({
//               audio: {
//                 data: event.media.payload,
//                 sample_rate: String(SAMPLE_RATE),
//                 encoding: "audio/wav",
//               },
//             }),
//           );
//         } else if (mediaChunkCount % 20 === 1) {
//           console.log(
//             "[exotel] dropping audio — sttSocket not open, readyState:",
//             sttSocket?.readyState,
//           );
//         }
//         break;

//       case "dtmf":
//         console.log("[exotel] dtmf", event.dtmf.digit);
//         break;

//       case "mark":
//         console.log("[exotel] playback finished:", event.mark.name);
//         break;

//       case "stop":
//         console.log("[exotel] call ended:", event.stop.reason);
//         if (sttSocket) sttSocket.close();
//         break;
//     }
//   });

//   exotelWs.on("close", () => {
//     console.log("[exotel] socket closed");
//     if (sttSocket) sttSocket.close();
//   });
// });

// server.listen(PORT, () => {
//   console.log(`Bridge server listening on ws://localhost:${PORT}`);
//   console.log(`Tunnel it: ngrok http ${PORT}`);
// });
