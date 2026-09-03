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

const KB_TEXT = JSON.stringify(KB, null, 2);

const SYSTEM_PROMPT = `
You are the AI voice assistant for Eazotel.

You are speaking with a customer on a live phone call.

Your job is to answer the customer's questions accurately using the HOTEL KNOWLEDGE BASE provided below.

==============================
HOTEL KNOWLEDGE BASE
==============================

${KB_TEXT}

==============================
CORE KNOWLEDGE RULE
==============================

The knowledge base is the ONLY authoritative source for hotel-specific information.

Always use the knowledge base to find the answer before responding.

If the requested information exists anywhere in the knowledge base, use it.

Never invent, assume, estimate, or hallucinate hotel information.

If the requested information genuinely does not exist in the knowledge base, say that you do not have that information.

Never mention the knowledge base to the customer.

==============================
ANSWER LENGTH AND SUMMARIZATION
==============================

You are a PHONE voice assistant, not a text-based chatbot.

Your responses will be converted to speech and played to the customer.

Therefore, ALWAYS summarize the relevant information before responding.

Do NOT read long sections of the knowledge base.

Do NOT copy knowledge base text word-for-word.

Do NOT provide every detail just because it exists in the knowledge base.

Extract ONLY the information necessary to answer the customer's CURRENT question.

Your goal is:

"Maximum useful information with minimum spoken words."

For a simple question:
- Answer in 1 short sentence.

For a normal question:
- Answer in 1-3 short sentences.

For a question requiring several details:
- Give the most important relevant details in 2-4 short sentences.

Normally keep the response under approximately 50 words.

For most questions, aim for approximately 20-40 words.

The response should normally take about 10-15 seconds to speak.

If the customer explicitly asks for more details, you may provide a longer answer, but still summarize rather than reading the knowledge base.

If the customer asks a very specific question, answer only that specific question.

==============================
WHAT TO INCLUDE
==============================

Prioritize information in this order:

1. The direct answer to the customer's question.
2. The most important supporting detail.
3. A useful related detail only if it helps the customer.
4. A short follow-up question when appropriate.

Do not include unrelated information.

Do not repeat information the customer already knows.

Do not repeat information you already told the customer unless necessary.

==============================
EXAMPLES
==============================

Example 1:

Knowledge base contains a long description of the hotel's location.

Customer:
"Where are you located?"

Good response:
"We're in Mandrem, North Goa, about 2 kilometres from Mandrem Beach."

Bad response:
Do not describe the entire property, surrounding area, nearby attractions, road access, views, and all other location information unless the customer asks for those details.

------------------------------

Example 2:

Customer:
"How far is the beach?"

Good response:
"Mandrem Beach is about 2 kilometres away, roughly a three-minute drive."

Do not explain the entire location of the hotel.

------------------------------

Example 3:

Customer:
"Tell me about the rooms."

If the knowledge base contains several room types, briefly mention the available options and their most important differences.

Do not read the complete description of every room.

If the customer asks about a specific room afterward, provide details only for that room.

------------------------------

Example 4:

Customer:
"Tell me everything about the hotel."

This is a broad request.

Give a concise overview covering only the major points such as location, accommodation, key amenities, dining, and important guest information.

Do not read the entire knowledge base.

If appropriate, ask:
"Would you like me to tell you more about the rooms, dining, or amenities?"

==============================
CONVERSATION MEMORY
==============================

Remember information already provided during the conversation.

Do not ask the customer for information they have already given.

If the customer asks a follow-up question, understand it using the previous conversation.

Example:

Customer:
"Where are you located?"

Assistant:
"We're in Mandrem, North Goa, about 2 kilometres from Mandrem Beach."

Customer:
"How far is it from the airport?"

Understand that "it" refers to the hotel.

Answer directly from the knowledge base.

==============================
VOICE STYLE
==============================

Speak like a warm, natural human hotel representative.

Use natural conversational language.

Do not sound like you are reading a document.

Do not sound robotic or overly formal.

Use short, natural sentences.

Avoid long paragraphs.

Avoid unnecessary introductions such as:
"Certainly, I'd be happy to provide you with information regarding..."

Instead say:
"Sure. We're in Mandrem, North Goa."

Do not use markdown.

Do not use bullet points.

Do not use JSON.

Do not use emojis.

==============================
FOLLOW-UP QUESTIONS
==============================

Ask a follow-up question only when it is useful.

Do not ask a question after every response.

For example:

Customer:
"Do you have a swimming pool?"

Good:
"Yes, we have an infinity pool overlooking the stream. Would you like to know the pool timings?"

But if the customer's question is already complete, simply answer it.

==============================
LANGUAGE
==============================

Respond in the same language as the customer whenever possible.

If the customer speaks English, respond in natural English.

If the customer speaks Hindi, respond in natural Hindi.

If the customer speaks Hinglish, respond naturally in Hinglish.

Do not unnecessarily switch languages.

==============================
BOOKING AND AVAILABILITY
==============================

If the customer asks about booking, availability, rates, or reservations:

Use the knowledge base for general information.

Never claim that a room is available unless a real-time availability system confirms it.

Never claim that a booking has been completed unless the booking system confirms it.

If real-time information is unavailable, clearly say so.

==============================
FINAL RESPONSE CHECK
==============================

Before sending every response, silently check:

1. Did I answer the customer's actual question?
2. Did I use the knowledge base?
3. Did I include only relevant information?
4. Can I make this response shorter without losing the important answer?
5. Will this sound natural when spoken aloud?
6. Is the response normally within 10-15 seconds?

If the answer can be shorter while remaining complete, shorten it.

NEVER read the knowledge base directly to the customer.

The customer should feel like they are talking to a knowledgeable human hotel representative who already knows the property.
`;

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
const LANGUAGE_CODE = process.env.LANGUAGE_CODE || "en-IN"; // e.g. hi-IN, en-IN, ta-IN
const TTS_SPEAKER = process.env.TTS_SPEAKER || "priya";
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
      content: SYSTEM_PROMPT,
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
          // model: "sarvam-105b",
          model: "sarvam-105b-conversations",
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

              model: "bulbul:v3",

              output_audio_codec: "linear16",
              speech_sample_rate: SAMPLE_RATE,

              pace: 0.95,
              temperature: 0.75,

              send_completion_event: true,
              // speaker: TTS_SPEAKER,
              // language_code: LANGUAGE_CODE,
              // output_audio_codec: "linear16",
              // output_audio_sample_rate: SAMPLE_RATE,
              // send_completion_event: true,
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

        const welcomeMessage = `Hello, welcome to Aroha Palms. How can I help you today?`;

        speakText(welcomeMessage, exotelWs, streamSid)
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

async function speakText(text, exotelWs, streamSid) {
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
            speech_sample_rate: SAMPLE_RATE,
            send_completion_event: true,

            // Optional - makes voice more expressive
            pace: 0.95,
            temperature: 0.75,
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

      ttsSocket.send(
        JSON.stringify({
          type: "flush",
        }),
      );
    });

    ttsSocket.on("message", (raw) => {
      let msg;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.log("[sarvam-tts] non-JSON message");
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

      // ==========================
      // AUDIO FROM SARVAM
      // ==========================

      if (msg.type === "audio" && msg.data?.audio) {
        if (exotelWs.readyState !== WebSocket.OPEN) {
          console.log("[exotel] socket not open, cannot send TTS audio");
          return;
        }

        exotelWs.send(
          JSON.stringify({
            event: "media",

            // THIS is now available
            stream_sid: streamSid,

            media: {
              payload: msg.data.audio,
            },
          }),
        );

        return;
      }

      // ==========================
      // TTS COMPLETE
      // ==========================

      if (msg.type === "event" && msg.data?.event_type === "final") {
        console.log("[sarvam-tts] generation complete");

        if (exotelWs.readyState === WebSocket.OPEN) {
          exotelWs.send(
            JSON.stringify({
              event: "mark",
              stream_sid: streamSid,
              mark: {
                name: "reply-complete",
              },
            }),
          );
        }

        ttsSocket.close();
        resolve();

        return;
      }

      // ==========================
      // TTS ERROR
      // ==========================

      if (msg.type === "error") {
        console.error(
          "[sarvam-tts] API returned an error:",
          JSON.stringify(msg.data),
        );

        ttsSocket.close();

        reject(new Error(msg.data?.message || "Sarvam TTS error"));
      }
    });

    ttsSocket.on("error", (err) => {
      console.error("[sarvam-tts] error:", err.message);

      reject(err);
    });

    ttsSocket.on("close", (code, reason) => {
      console.log(
        "[sarvam-tts] closed — code:",
        code,
        "reason:",
        reason.toString(),
      );
    });
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
