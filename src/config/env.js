// ============================================================
// ENV / APP CONFIG
// Every setting the app uses lives here. Nothing else reads process.env.
// ============================================================

import "dotenv/config";

function required(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    console.error(`[config] Missing ${name} in .env`);
    process.exit(1);
  }

  return value.trim();
}

const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const languageCode = process.env.LANGUAGE_CODE || "en-IN";

const config = {
  port: Number(process.env.PORT) || 5001,

  databaseUrl: required("DATABASE_URL"),

  // Hotels to load (KB + welcome audio) when the server boots, so even the
  // first call after a restart gets an instant welcome. Comma-separated ndids.
  prewarmNdids: list(process.env.PREWARM_NDIDS),

  audio: {
    // MUST match the Exotel Voicebot Applet (check the "media format" log line).
    // Exotel supports 8000 / 16000 / 24000 — default on Exotel's side is 8000.
    sampleRate: Number(process.env.SAMPLE_RATE) || 16000,
  },

  sarvam: {
    apiKey: required("SARVAM_API_KEY"),
    languageCode,

    stt: {
      url:
        process.env.SARVAM_STT_URL || "wss://api.sarvam.ai/speech-to-text/ws",
      model: "saarika:v2.5",
      // en-IN  -> Hindi is transcribed in English letters ("mujhe villa chahiye").
      // unknown -> auto-detect; each language comes in its own script.
      languageCode: process.env.STT_LANGUAGE_CODE || languageCode,
    },

    tts: {
      url:
        process.env.SARVAM_TTS_URL || "wss://api.sarvam.ai/text-to-speech/ws",
      model: "bulbul:v3",
      speaker: process.env.TTS_SPEAKER || "priya",
      pace: Number(process.env.TTS_PACE) || 1.0,
      temperature: Number(process.env.TTS_TEMPERATURE) || 0.6,
      // Sarvam splits text into chunks of this many chars (default 150, max 500).
      // Bigger = fewer mid-sentence joins = smoother intonation.
      maxChunkLength: 300,
      // Sarvam starts speaking once this many chars are buffered (or on flush).
      minBufferSize: 50,
      // Give up waiting for Sarvam's "finished" event after this long.
      completionTimeoutMs: 12000,
    },

    llm: {
      url:
        process.env.SARVAM_CHAT_URL ||
        "https://api.sarvam.ai/v1/chat/completions",
      model: "sarvam-105b-conversations",
      // Spoken replies stay short via the prompt; the extra room is for
      // WhatsApp payloads (a carousel is ~300 tokens).
      maxTokens: Number(process.env.LLM_MAX_TOKENS) || 1000,
      // Low = focused, answers the question asked. High = chattier, wanders more.
      temperature: Number(process.env.LLM_TEMPERATURE) || 0.3,
      timeoutMs: 15000,
    },
  },

  agent: {
    // Name the agent introduces itself with. If set, it wins over the KB's
    // chatbot_config.assistant_name (a person's name sounds better on a call
    // than "Hotel Concierge").
    name: process.env.AGENT_NAME || "",
    timezone: "Asia/Kolkata",
  },

  whatsapp: {
    graphUrl: process.env.META_GRAPH_URL || "https://graph.facebook.com",
    apiVersion: process.env.META_API_VERSION || "v25.0",

    // true = build and log every WhatsApp payload but never call Meta (for testing).
    dryRun: process.env.WHATSAPP_DRY_RUN === "true",

    // The platform's Meta system-user token (the one the Eazotel WhatsApp backend
    // sends with). Optional: without it the token saved on the hotel's account
    // document is used — but many of those are expired (Meta error 190).
    accessToken: (process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),

    // When a hotel's KB and its WhatsApp number live under DIFFERENT ndids:
    //   WHATSAPP_NDID_MAP=<kb ndid>:<whatsapp ndid>,<kb ndid>:<whatsapp ndid>
    // (or put &wa_ndid=<whatsapp ndid> in the Exotel applet URL).
    ndidMap: Object.fromEntries(
      list(process.env.WHATSAPP_NDID_MAP).map((pair) =>
        pair.split(":").map((x) => x.trim()),
      ),
    ),

    // After "please send us a Hi on WhatsApp": keep checking for the caller's
    // message this often, for this long, and send as soon as it arrives.
    replyPollMs: 4000,
    replyWaitMs: 3 * 60 * 1000,

    // Mongo collection holding each hotel's WhatsApp account (ndid, accessToken, phoneNumberInfo, wabaInfo).
    accountCollection:
      process.env.WHATSAPP_ACCOUNT_COLLECTION || "hotelwhatsappaccounts",
    accountCacheTtlMs: 5 * 60 * 1000,

    // The Eazotel inbox collections — used to know if the caller is inside
    // WhatsApp's 24-hour window (did they message the hotel in the last 24h?).
    conversationCollection:
      process.env.WHATSAPP_CONVERSATION_COLLECTION || "whatsapp-conversations",
    messageCollection:
      process.env.WHATSAPP_MESSAGE_COLLECTION || "whatsappmessages",
    templateCollection:
      process.env.WHATSAPP_TEMPLATE_COLLECTION || "whatsapptemplates",
    windowMs: 24 * 60 * 60 * 1000,

    // Caller numbers without a country code get this prefix.
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "91",

    // Max messages the AI may send in one go (e.g. brochure + carousel).
    maxMessagesPerReply: 5,

    // Approved templates used when the caller is OUTSIDE the 24h window
    // (first-time callers — most of them). See src/whatsapp/templates.js.
    templates: {
      document: process.env.WHATSAPP_TEMPLATE_DOCUMENT || "voice_call_brochure", // DOCUMENT header
      image: process.env.WHATSAPP_TEMPLATE_IMAGE || "voice_call_photos", // IMAGE header
      text:
        process.env.WHATSAPP_TEMPLATE_TEXT ||
        process.env.WHATSAPP_FALLBACK_TEMPLATE ||
        "voice_call_followup",
      language:
        process.env.WHATSAPP_TEMPLATE_LANG ||
        process.env.WHATSAPP_FALLBACK_TEMPLATE_LANG ||
        "en",
      cacheTtlMs: 10 * 60 * 1000,
    },
  },

  // Per-hotel switches from the dashboard ({ ndid, voiceEnabled, whatsappIntegrationEnabled }).
  // See src/knowledgeBase/settingsService.js.
  hotelSettings: {
    // Mongo collection with one settings document per hotel. Empty = not used
    // (WhatsApp is then on for every hotel that has a WhatsApp account).
    collection: (
      process.env.HOTEL_SETTINGS_COLLECTION || "VoiceInstructionSettings"
    ).trim(),
    cacheTtlMs: 60 * 1000,
    // Fields that may hold the hotel's own line for "we can't send on WhatsApp".
    defaultMessageFields: [
      "whatsappDefaultMessage",
      "defaultMessage",
      "default_message",
      "fallbackMessage",
      "fallback_message",
    ],
    // Said when WhatsApp is off and the hotel has no default message.
    whatsappOffMessage:
      process.env.WHATSAPP_OFF_MESSAGE ||
      "Our team will send it to you shortly.",
  },

  // The hotel's saved quick replies — an extra knowledge source for the agent.
  quickReplies: {
    collection: "quickreplies",
    cacheTtlMs: 5 * 60 * 1000,
  },

  knowledgeBase: {
    collection: "KnowledgeBase",
    ndidField: "ndid", // change if your documents use a different field name
    // Fresh for 5 min. After that the old copy is still served instantly
    // (for up to 6 h) while a new one loads in the background.
    cacheTtlMs: 5 * 60 * 1000,
    staleTtlMs: 6 * 60 * 60 * 1000,
  },

  call: {
    // Extra wait after the audio should have finished, if Exotel never echoes the "mark".
    playbackGraceMs: 1500,
    // Ignored while the AI is speaking, so "hmm" doesn't cut the bot off.
    fillerWords: ["hmm", "hm", "umm", "um", "uh", "uhh", "हम्म", "हूँ", "हूं"],
    // Short "I'm listening" words that should NOT cut the agent off mid-sentence.
    backchannelWords: [
      "ok",
      "okay",
      "haan",
      "han",
      "ha",
      "ji",
      "haan ji",
      "achha",
      "acha",
      "right",
      "yeah",
      "yes",
      "hmm ok",
      "theek hai",
      "sure",
      "हाँ",
      "हां",
      "जी",
      "हाँ जी",
      "हां जी",
      "अच्छा",
      "ठीक है",
      "ओके",
    ],
    // ...unless the agent is within this many ms of finishing — then it's an answer.
    backchannelTailMs: 1200,
    defaultHotelName: "our hotel",
    // How long to wait for the next piece when a caller reads out a phone number.
    numberPieceWaitMs: 2000,

    // Caller started a new sentence just as the agent was about to speak:
    // hold the agent's audio until they finish (max this long).
    callerSpeakingMaxMs: 6000,
    callerPauseGraceMs: 700,

    // Dead air: check in after this much silence, at most this many times, then say bye.
    silenceMs: Number(process.env.SILENCE_MS) || 10000,
    maxSilenceNudges: 2,

    // Abusive callers: calm reply -> clear warning -> polite goodbye and hang up.
    abuseStrikesToEnd: 3,

    // false = the agent never ends the call itself (it still says goodbye).
    canHangUp: process.env.AGENT_CAN_HANG_UP !== "false",
  },
};

export default config;
