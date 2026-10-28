// ============================================================
// CALL SESSION
// The "brain" of one phone call. Owns all per-call state and the
// listen -> think -> speak (-> WhatsApp) loop:
//
//   caller audio -> STT -> transcript -> LLM (streamed) -> first sentence -> TTS -> Exotel
//                                              │                (speaks while the rest is written)
//                                              └─ whatsapp -> Meta API (background)
//
// It never talks to WebSockets or Meta directly — it uses:
//   ExotelChannel, sttClient, ttsClient, llmClient, whatsappService.
// ============================================================

import config from "../config/env.js";
import kbService from "../knowledgeBase/kbService.js";
import whatsappService from "../whatsapp/whatsappService.js";
import whatsappAccountService from "../whatsapp/whatsappAccountService.js";
import settingsService from "../knowledgeBase/settingsService.js";
import quickReplyService from "../knowledgeBase/quickReplyService.js";
import {
  buildSystemPrompt,
  buildWelcomeMessage,
  getAgentName,
  GREETINGS,
} from "../prompts/systemPrompt.js";
import { createSttStream } from "../sarvam/sttClient.js";
import { createTtsStream } from "../sarvam/ttsClient.js";
import { streamChat } from "../sarvam/llmClient.js";
import { getCachedAudio, storeAudio, prefetchAudio } from "../sarvam/audioCache.js";
import { parseAgentResponse } from "../agent/responseParser.js";
import { createReplyExtractor, createSentenceSplitter } from "../agent/replyStream.js";
import { isSendOffer, isYes, isNo, claimsToBeSending, isGoodbye, wantsDifferentNumber, isSendRequest } from "../agent/intent.js";
import { isAbusive } from "../agent/abuse.js";
import { toSpeakableText } from "../agent/speechText.js";
import { toWhatsAppNumber, lastDigits } from "../utils/phone.js";
import { getIgnoreReason } from "./transcriptFilter.js";
import { isNumberPiece, extractDigits, normaliseIndianMobile } from "./numberCapture.js";
import { buildCatalog, catalogForPrompt } from "../whatsapp/kbCatalog.js";
import { buildMessages, inferActions } from "../whatsapp/messageBuilder.js";
import Conversation from "./Conversation.js";
import PlaybackTracker from "./PlaybackTracker.js";

const FALLBACK = {
  apiError: "Sorry, could you say that once more?",
  emptyReply: "Sorry, I didn't quite catch that. Could you repeat it?",
  networkError: "Sorry, the line broke up for a second. Could you say that again?",
  sendingOnly: "Sure, I'm sending that to your WhatsApp right now.",
};

// Before the first WhatsApp send the caller must say WHERE it should go.
const ASK_WHICH_NUMBER =
  'The caller has not yet said which WhatsApp number to use. Do NOT send yet and keep "whatsapp" empty. Ask ONE short question: should you send it on the same number they are calling from, or on a different WhatsApp number?';

// What the AI sees as the "caller turn" when WE start a turn (silence, WhatsApp result).
const SYSTEM_TURN = "(no speech from the caller)";

// 16-bit mono PCM: bytes of audio per millisecond.
const BYTES_PER_MS = (config.audio.sampleRate * 2) / 1000;

const ABUSE_NOTES = {
  1: "The caller just used abusive language. Do not react to it, do not repeat it and do not lecture. Treat them as a frustrated person: one calm line, then help with what they actually need.",
  2: "The caller is using abusive language AGAIN. Stay calm and polite and give ONE clear warning: you're glad to help, but you'll have to end the call if the language continues. Then ask how you can help.",
  3: 'The caller is STILL being abusive after your warning. Say ONE short, polite, non-judgemental closing line (you\'re ending the call now; they\'re welcome to call back or message the hotel anytime) and set "end_call": true.',
};

// A bare "hello?" said over the welcome needs no answer of its own.
const JUST_A_GREETING = /^(hello|hi|hey|helo|hallo|haan|han|ji|namaste|namaskar|हेलो|हैलो|हाँ|हां|जी|नमस्ते|नमस्कार|[\s.,!?।])+$/i;

// The AI writes this token where the hotel's WhatsApp number belongs; the real
// digits are put in just before speaking, so it can never say a wrong number.
const HOTEL_NUMBER_TOKEN = /\{?\bHOTEL_WHATSAPP_NUMBER\b\}?/g;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// KB + WhatsApp account + dashboard settings for a hotel (all cached).
function loadHotel(ndid, waNdid, log) {
  return Promise.all([
    kbService.fetchKnowledgeBase(ndid).catch((err) => {
      log.error("kb fetch failed:", err.message);
      return null;
    }),
    whatsappAccountService.getWhatsappAccount(waNdid).catch((err) => {
      log.error("whatsapp account fetch failed:", err.message);
      return null;
    }),
    settingsService.getHotelSettings(ndid).catch((err) => {
      log.error("settings fetch failed:", err.message);
      return { whatsappEnabled: false, voiceEnabled: true, defaultMessage: null, found: false };
    }),
    quickReplyService.fetchQuickRepliesText(ndid).catch((err) => {
      log.error("quick replies fetch failed:", err.message);
      return "";
    }),
  ]).then(([kb, waAccount, settings, quickRepliesText]) => ({ kb, waAccount, settings, quickRepliesText }));
}

// Server start-up: load a hotel and pre-make its welcome audio.
export async function prewarmHotel(ndid, log) {
  const { kb } = await loadHotel(ndid, config.whatsapp.ndidMap[ndid] || ndid, log);
  if (!kb) return log.warn(`prewarm: no KB for ndid ${ndid}`);

  const names = { hotelName: kbService.getHotelName(kb), agentName: getAgentName(kb) };
  await Promise.all(GREETINGS.map((greeting) => prefetchAudio(toSpeakableText(buildWelcomeMessage({ ...names, greeting })))));

  log.info(`prewarmed "${names.hotelName}" (${ndid})`);
}

export default class CallSession {
  constructor({ exotel, ndid, waNdid, log }) {
    this.exotel = exotel;
    this.ndid = ndid; // whose knowledge base answers the call
    this.waNdidParam = waNdid || null; // whose WhatsApp number sends (if different)
    this.log = log;

    // Call info (filled from Exotel "start")
    this.callSid = null;
    this.callerNumber = null; // WhatsApp format, e.g. 919876543210
    this.whatsappNumber = null; // number the caller SAID on the call (wins over callerNumber)
    this.startedAt = Date.now();

    // Number said in pieces ("98765" ... "43210") is collected here before replying.
    this.numberBuffer = "";
    this.numberTimer = null;

    // Hotel context (filled in init)
    this.hotel = null; // promise from loadHotel()
    this.kb = null;
    this.catalog = { rooms: [], brochures: [], links: {} }; // sendable items from the KB
    this.hotelName = config.call.defaultHotelName;
    this.agentName = "";
    this.whatsappEnabled = false;

    // Lifecycle
    this.callEnded = false;
    this.initialized = false;
    this.abort = new AbortController(); // cancels an in-flight LLM request when the call ends

    // Connections
    this.stt = null;
    this.currentTts = null;

    // Turn-taking state
    this.isProcessing = false; // generating / playing a reply
    this.isSpeaking = false; // the caller is hearing the agent right now
    this.pendingTranscript = null; // latest caller question not yet answered
    this.systemTurnQueued = false; // we have something to say on our own (see systemTurn)
    this.responseId = 0; // bump to invalidate an in-flight reply
    this.loopRunning = false;
    this.turn = null; // audio state of the reply being spoken (see beginTurn)

    // Caller is making sound right now (from STT voice-activity events).
    this.callerSpeaking = false;
    this.callerQuietTimer = null;

    // Dead air / difficult callers
    this.silenceTimer = null;
    this.silenceCount = 0;
    this.abuseStrikes = 0;

    // WhatsApp: same payload is never sent twice in one call
    this.sentWhatsappKeys = new Set();
    this.hotelWhatsapp = null; // the hotel's WhatsApp number, e.g. "+91 98342 24907"
    this.replyWatch = null; // timer: waiting for the caller's "Hi" so we can send

    // Agent asked "Shall I send it?" -> what to send when the caller says yes.
    // Array of actions, or "infer" = work it out from the conversation.
    this.pendingOffer = null;

    // Which WhatsApp number to send to is agreed with the caller ONCE per call:
    // "same number I'm calling from" or a different one they read out.
    this.numberConfirmed = false;
    this.numberIsNew = false; // caller has just given a number (consumed by the next reply)
    this.awaitingNumber = null; // items to send as soon as the caller gives the other number
    this.mustSayHotelNumber = false; // the next reply has to tell the caller the hotel's WhatsApp number

    this.conversation = new Conversation();
    this.playback = new PlaybackTracker();
  }

  // ==========================================================
  // EXOTEL EVENTS (called by connectionHandler)
  // ==========================================================

  // The hotel whose WhatsApp account sends: URL param > WHATSAPP_NDID_MAP > same as the KB.
  get waNdid() {
    return this.waNdidParam || config.whatsapp.ndidMap[this.ndid] || this.ndid;
  }

  // Socket connected (before "start"): begin loading the hotel right away.
  prewarm() {
    if (this.ndid && !this.hotel) this.hotel = loadHotel(this.ndid, this.waNdid, this.log);
  }

  start(startEvent) {
    this.exotel.setStreamSid(startEvent?.stream_sid);

    const params = startEvent?.custom_parameters || {};

    // Exotel may also forward URL params in custom_parameters.
    this.ndid = this.ndid || params.ndid || null;
    this.waNdidParam = this.waNdidParam || params.wa_ndid || null;
    this.callSid = startEvent?.call_sid || null;
    this.callerNumber = toWhatsAppNumber(startEvent?.from || params.from);

    this.log.info(
      "stream started:",
      startEvent?.stream_sid,
      "call:",
      this.callSid,
      "ndid:",
      this.ndid,
      "caller:",
      this.callerNumber ? `…${lastDigits(this.callerNumber)}` : "unknown",
    );

    if (!this.ndid) {
      this.log.warn("no ndid found, start payload:", JSON.stringify(startEvent));
    }

    this.init();
  }

  // Always forward caller audio to STT (needed for barge-in too).
  handleCallerAudio(payload) {
    if (payload) this.stt?.sendAudio(payload);
  }

  handlePlaybackMark(name) {
    this.log.debug("mark:", name);

    // Only the reply being played counts (an old mark can arrive after a barge-in).
    if (this.turn && name === `reply-${this.turn.id}`) {
      this.isSpeaking = false;
      this.playback.complete();
    }
  }

  end(reason) {
    if (this.callEnded) return;

    const seconds = Math.round((Date.now() - this.startedAt) / 1000);
    this.log.info("call ended:", reason, `(${this.conversation.turnCount} turns, ${seconds}s)`);

    this.callEnded = true;
    this.pendingTranscript = null;
    this.systemTurnQueued = false;
    this.responseId++;

    clearTimeout(this.numberTimer);
    clearTimeout(this.silenceTimer);
    clearTimeout(this.callerQuietTimer);
    clearInterval(this.replyWatch);
    this.abort.abort();
    this.stopTts();
    this.playback.release();
    this.stt?.close();
  }

  // The agent ends the call itself (goodbye, abuse, caller gone silent).
  hangup(reason) {
    if (this.callEnded) return;

    if (!config.call.canHangUp) {
      this.log.info(`would hang up (${reason}) but AGENT_CAN_HANG_UP=false`);
      return;
    }

    this.end(reason);
    this.exotel.close();
  }

  // ==========================================================
  // INIT: LOAD KB + WHATSAPP ACCOUNT, THEN START STT + WELCOME
  // ==========================================================

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    const started = Date.now();
    const { kb, waAccount, settings, quickRepliesText } = await (this.hotel ??= loadHotel(this.ndid, this.waNdid, this.log));

    if (!kb) {
      this.log.warn(`no KB found for ndid "${this.ndid}" — bot has no hotel data`);
    }

    if (this.callEnded) return;

    this.kb = kb;
    this.hotelName = kbService.getHotelName(kb);
    this.agentName = getAgentName(kb);
    this.catalog = buildCatalog(kb, this.hotelName);
    // WhatsApp only when the dashboard switch (whatsappIntegrationEnabled) is on AND an account exists.
    this.whatsappEnabled = settings.whatsappEnabled && Boolean(waAccount);
    this.hotelWhatsapp = waAccount?.displayNumber || null;
    // What the agent says when WhatsApp is off and the caller asks for something on it.
    this.whatsappOffMessage = settings.defaultMessage || config.hotelSettings.whatsappOffMessage;

    if (!settings.whatsappEnabled) this.log.info("WhatsApp integration is switched OFF for this hotel (whatsappIntegrationEnabled)");
    else if (!waAccount) this.log.warn("WhatsApp integration is ON but no WhatsApp account was found for this hotel");

    this.log.info(`catalog: ${this.catalog.rooms.length} rooms, ${this.catalog.brochures.length} brochures, links: ${Object.keys(this.catalog.links).join(",") || "-"}`);

    this.conversation.setSystemPrompt(
      buildSystemPrompt({
        kb,
        hotelName: this.hotelName,
        agentName: this.agentName,
        callerLast4: lastDigits(this.callerNumber),
        whatsappEnabled: this.whatsappEnabled,
        whatsappOffMessage: this.whatsappOffMessage,
        catalogText: catalogForPrompt(this.catalog),
        quickRepliesText,
      }),
    );

    this.log.info(
      `ready in ${Date.now() - started}ms: "${this.hotelName}", agent "${this.agentName || "-"}", whatsapp ${this.whatsappEnabled ? `on (from ${this.hotelWhatsapp || "?"}${this.waNdid !== this.ndid ? `, account of ndid ${this.waNdid}` : ""})` : "off"}`,
    );

    // Listen only once the prompt is ready, so no transcript
    // can reach the LLM without a KB.
    this.stt = createSttStream({
      log: this.log.child("stt"),
      onTranscript: (text) => this.handleTranscript(text),
      onSpeechStart: () => this.handleSpeechStart(),
      onSpeechEnd: () => this.handleSpeechEnd(),
    });

    this.sendWelcome();
  }

  // ==========================================================
  // CALLER SPOKE
  // ==========================================================

  // Caller started making sound (arrives well before the transcript).
  handleSpeechStart() {
    if (this.callEnded) return;

    this.log.debug("caller started speaking");
    this.callerSpeaking = true;
    clearTimeout(this.silenceTimer);

    // Safety: never stay "caller is speaking" forever if the end event is lost.
    clearTimeout(this.callerQuietTimer);
    this.callerQuietTimer = setTimeout(() => this.setCallerQuiet(), config.call.callerSpeakingMaxMs);
  }

  // Caller stopped. A transcript normally follows within ~200ms; if none does
  // it was a cough / background noise, and the agent may speak.
  handleSpeechEnd() {
    this.log.debug("caller stopped speaking");
    clearTimeout(this.callerQuietTimer);
    this.callerQuietTimer = setTimeout(() => this.setCallerQuiet(), config.call.callerPauseGraceMs);
  }

  setCallerQuiet() {
    clearTimeout(this.callerQuietTimer);
    this.callerSpeaking = false;
    this.releaseHeldAudio();

    if (!this.isBusy()) this.armSilenceTimer();
  }

  handleTranscript(text) {
    if (this.callEnded) return;

    clearTimeout(this.callerQuietTimer);
    this.callerSpeaking = false;

    // "okay" while the agent talks = listening. But in its last second, or
    // when we asked "Shall I send it?", a short "yes" is an answer, not noise.
    const ignoreReason = getIgnoreReason(text, {
      isSpeaking: this.isSpeaking && this.playbackRemainingMs() > config.call.backchannelTailMs,
      expectingAnswer: Boolean(this.pendingOffer),
    });

    if (ignoreReason) {
      this.log.info(`ignoring "${text}" (${ignoreReason})`);
      this.releaseHeldAudio();
      return;
    }

    this.log.info("[caller said]", text);
    this.silenceCount = 0;
    clearTimeout(this.silenceTimer);

    // Caller is reading out a phone number in pieces -> collect, don't reply yet.
    if (isNumberPiece(text)) {
      this.collectNumberPiece(text);
      return;
    }

    // A full number inside a normal sentence ("send it to 98765 43210").
    const digits = normaliseIndianMobile(extractDigits(text));
    if (digits.length === 10) this.setWhatsappNumber(digits);

    this.queueTranscript(text);
  }

  // Merge with anything the caller said that hasn't been answered yet,
  // so nothing they said is lost (they don't have to repeat themselves).
  queueTranscript(text) {
    this.pendingTranscript = this.pendingTranscript
      ? `${this.pendingTranscript} ${text}`
      : text;

    // Caller talked over the AI -> stop it and answer the new question.
    if (this.isSpeaking) {
      this.log.info("[barge-in] caller spoke while AI was speaking");
      this.interrupt();
      this.runResponseLoop();
      return;
    }

    if (this.isProcessing) {
      // Caller added more before the agent said a word (they paused mid-thought):
      // throw the half-made reply away and answer everything together.
      if (this.turn?.mergeable && !this.turn.audioStarted && !this.isStale(this.turn.id)) {
        this.log.info("caller added more while AI was thinking — answering it all together");
        this.responseId++;
        this.stopTts();
      } else {
        this.log.info("AI is busy, saved latest transcript");
        this.releaseHeldAudio();
      }
      return;
    }

    this.runResponseLoop();
  }

  // ==========================================================
  // PHONE NUMBER — collected over several transcripts
  // ==========================================================

  collectNumberPiece(text) {
    // Caller started dictating while the agent talks -> stop talking.
    if (this.isSpeaking) this.interrupt();
    else this.releaseHeldAudio();

    this.numberBuffer += extractDigits(text);
    clearTimeout(this.numberTimer);

    const digits = normaliseIndianMobile(this.numberBuffer);
    this.log.info(`number so far: ${digits.length} digits`);

    // Got a full mobile number -> go now; otherwise wait for the next piece.
    if (digits.length >= 10) {
      this.flushNumber();
    } else {
      this.numberTimer = setTimeout(() => this.flushNumber(), config.call.numberPieceWaitMs);
    }
  }

  flushNumber() {
    clearTimeout(this.numberTimer);
    const digits = normaliseIndianMobile(this.numberBuffer);
    this.numberBuffer = "";
    if (!digits || this.callEnded) return;

    if (digits.length === 10) {
      this.setWhatsappNumber(digits);
      this.queueTranscript(`My WhatsApp number is ${digits}.`);
    } else {
      // Too few or too many digits = misheard. Never send to a guessed number.
      this.queueTranscript(`${digits} (${digits.length} digits heard — a mobile number has 10. Ask them to say the number again, slowly.)`);
    }
  }

  setWhatsappNumber(digits) {
    const number = toWhatsAppNumber(digits);
    if (!number || number === this.whatsappNumber) return;

    this.whatsappNumber = number;
    this.numberConfirmed = true;
    this.numberIsNew = true;
    this.log.info(`whatsapp number set by caller: …${lastDigits(number)}`);
    this.conversation.addNote(
      `The caller's WhatsApp number is saved (ends in ${lastDigits(number)}). Do NOT ask for the number again and do NOT read it back in full. If you confirm it, say only the last four digits, once.`,
    );
  }

  interrupt() {
    this.log.info("INTERRUPTING current AI response");

    this.responseId++; // invalidate the old reply immediately
    this.exotel.clear(); // drop audio Exotel already queued
    this.stopTts();

    this.isSpeaking = false;
    this.playback.complete(); // don't wait for an old mark after clear
  }

  // ==========================================================
  // SILENCE + TURNS WE START OURSELVES
  // ==========================================================

  isBusy() {
    return this.isProcessing || this.loopRunning || this.isSpeaking || this.callerSpeaking || Boolean(this.numberBuffer);
  }

  // Start counting dead air (called whenever the line goes quiet).
  armSilenceTimer() {
    clearTimeout(this.silenceTimer);
    if (this.callEnded) return;

    this.silenceTimer = setTimeout(() => this.handleSilence(), config.call.silenceMs);
  }

  handleSilence() {
    if (this.callEnded) return;
    if (this.isBusy()) return this.armSilenceTimer();

    this.silenceCount++;
    const seconds = Math.round(config.call.silenceMs / 1000);
    this.log.info(`caller silent for ${seconds}s (${this.silenceCount})`);

    if (this.silenceCount > config.call.maxSilenceNudges) {
      this.systemTurn(
        'The caller has not answered your check-ins. Say ONE short, warm goodbye (they can call back or message anytime) and set "end_call": true.',
      );
    } else {
      this.systemTurn(
        `The caller has said nothing for about ${seconds} seconds. Check in with ONE short natural line in the language you were speaking (like "Hello? Are you still there?"). Do not repeat your previous answer${this.silenceCount > 1 ? ", and use different words from your last check-in" : ""}.`,
      );
    }
  }

  // Tell the AI something happened and let it speak about it — right away if
  // the line is quiet, otherwise as soon as the current reply is done. If the
  // caller speaks first, the note simply rides along with their turn.
  systemTurn(note) {
    if (this.callEnded) return;

    this.conversation.addNote(note);
    this.systemTurnQueued = true;
    this.runResponseLoop();
  }

  // ==========================================================
  // RESPONSE LOOP — answers pending questions one at a time
  // ==========================================================

  async runResponseLoop() {
    if (this.loopRunning || this.isProcessing || this.callEnded) return;

    this.loopRunning = true;
    clearTimeout(this.silenceTimer);

    try {
      while (!this.callEnded && (this.pendingTranscript || this.systemTurnQueued)) {
        const transcript = this.pendingTranscript || SYSTEM_TURN;
        this.pendingTranscript = null;
        this.systemTurnQueued = false;

        this.isProcessing = true;

        try {
          await this.respond(transcript);
        } catch (err) {
          this.log.error("response loop error:", err.message);
        }

        this.isProcessing = false;
      }
    } finally {
      this.isProcessing = false;
      this.loopRunning = false;
      this.armSilenceTimer();
    }
  }

  async respond(transcript) {
    const id = ++this.responseId;
    const tag = `[response ${id}]`;
    const started = Date.now();
    const isSystemTurn = transcript === SYSTEM_TURN;

    this.log.info(tag, "user:", transcript);

    const needsHotelNumber = this.mustSayHotelNumber; // this reply must include the hotel's WhatsApp number
    this.mustSayHotelNumber = false;

    let offerSent = false; // we sent the offered items ourselves this turn
    let mustEnd = false; // hang up after this reply no matter what the AI writes

    if (isSystemTurn) {
      mustEnd = this.silenceCount > config.call.maxSilenceNudges;
    } else {
      const gotNumber = this.numberIsNew; // caller has just read out a WhatsApp number
      this.numberIsNew = false;

      // Send what was offered / asked for, in code, no AI needed.
      const sendOffer = (offer, why) => {
        const actions = offer === "infer" ? inferActions(this.recentText(), this.catalog) : offer;
        const to = this.whatsappNumber || this.callerNumber;

        this.numberConfirmed = true;
        this.log.info(tag, `${why} -> sending: ${JSON.stringify(actions)}`);
        this.dispatchWhatsapp(actions, tag);
        offerSent = true;
        this.conversation.addNote(
          `The system is sending the items right now to the WhatsApp number ending in ${lastDigits(to)}${this.whatsappNumber ? " (the number the caller gave)" : " (the number they are calling from)"}. Say in a few words that you are sending it now (do not claim it has already arrived) and keep "whatsapp" empty — do NOT send them again.`,
        );
      };

      if (this.awaitingNumber && gotNumber) {
        // They chose "a different number" earlier and have now given it.
        const offer = this.awaitingNumber;
        this.awaitingNumber = null;
        this.pendingOffer = null;
        sendOffer(offer, "caller gave the other number");
      } else if (this.pendingOffer) {
        // Caller answered "Shall I send it on this number or a different one?"
        const offer = this.pendingOffer;
        this.pendingOffer = null;

        if (gotNumber) {
          sendOffer(offer, "caller gave a number");
        } else if (wantsDifferentNumber(transcript) || extractDigits(transcript).length >= 3) {
          this.awaitingNumber = offer;
          this.log.info(tag, "caller wants a different WhatsApp number — waiting for it");
          this.conversation.addNote(
            'The caller wants it on a DIFFERENT WhatsApp number. Ask them to tell you that number (one short line). Do NOT send anything yet and keep "whatsapp" empty.',
          );
        } else if (isYes(transcript)) {
          sendOffer(offer, "caller said yes / same number");
        } else if (isNo(transcript)) {
          this.log.info(tag, "caller declined the WhatsApp offer");
        }
      }

      // First send of the call and nobody has agreed where to: the AI must ask first.
      if (!offerSent && !this.awaitingNumber && this.needsNumberChoice() && isSendRequest(transcript)) {
        this.conversation.addNote(ASK_WHICH_NUMBER);
      }

      // WhatsApp is switched off for this hotel: the hotel's own line, nothing about WhatsApp.
      if (!this.whatsappEnabled && isSendRequest(transcript)) {
        this.conversation.addNote(
          `WhatsApp is not available for this hotel. Do not offer, promise or mention sending anything on WhatsApp, and do not ask for a number. Answer with this message, in the caller's language: "${this.whatsappOffMessage}"`,
        );
      }

      if (isAbusive(transcript)) {
        this.abuseStrikes++;
        const strike = Math.min(this.abuseStrikes, config.call.abuseStrikesToEnd);
        this.log.warn(tag, `abusive language (strike ${this.abuseStrikes})`);
        this.conversation.addNote(ABUSE_NOTES[Math.min(strike, 3)]);
        mustEnd = this.abuseStrikes >= config.call.abuseStrikesToEnd;
      }
    }

    this.conversation.addUser(transcript);

    // TTS connects while the LLM thinks; each sentence is spoken as soon as it's written.
    const turn = this.beginTurn(id, { mergeable: true });
    const tts = this.openTts(turn);

    let spoken = "";
    const say = (text) => {
      const clean = toSpeakableText(text.replace(HOTEL_NUMBER_TOKEN, this.speakableHotelWhatsapp() || "our WhatsApp number"));
      if (!clean) return;

      if (!spoken) this.log.info(tag, `first words ready in ${Date.now() - started}ms`);
      spoken += `${clean} `;
      tts.sendText(`${clean} `);
    };

    const extractor = createReplyExtractor();
    const sentences = createSentenceSplitter(say);

    let raw = "";
    let fallback = FALLBACK.emptyReply;

    try {
      raw = await streamChat(this.conversation.messages, {
        signal: this.abort.signal,
        onDelta: (delta) => {
          sentences.push(extractor.push(delta));
          // Reply is complete (only the WhatsApp part is still being written) -> say the rest now.
          if (extractor.done) sentences.flush();
        },
      });
      this.log.info(tag, `llm took ${Date.now() - started}ms`);
    } catch (err) {
      if (this.callEnded) return;
      this.log.error(tag, "llm error:", err.message);
      fallback = err.message.startsWith("Sarvam chat HTTP") ? FALLBACK.apiError : FALLBACK.networkError;
    }

    if (this.callEnded) return;

    // Caller spoke again before the agent said anything -> answer it all in one go.
    if (this.isStale(id) && !turn.audioStarted) {
      this.log.info(tag, "discarded before speaking — merging with what the caller said next");
      tts.stop();
      this.conversation.dropLastUser();

      if (isSystemTurn) {
        // Its note is back in the queue; say it only if the caller hasn't taken over.
        if (!this.pendingTranscript) this.systemTurnQueued = true;
      } else {
        this.pendingTranscript = this.pendingTranscript ? `${transcript} ${this.pendingTranscript}` : transcript;
      }
      return;
    }

    let { speech, actions, endCall, error } = parseAgentResponse(raw);

    if (error) this.log.error(tag, error);
    if (actions.length) this.log.info(tag, "AI actions:", JSON.stringify(actions));

    // The offered items already went out this turn — never send them twice.
    if (offerSent) actions = [];

    // Agent is ASKING "Shall I send it (on this number)?" -> hold the actions until the caller answers.
    let held = false;
    if (this.whatsappEnabled && isSendOffer(speech)) {
      this.pendingOffer = actions.length ? actions : "infer";
      this.log.info(tag, "offer pending — waiting for the caller's answer");
      actions = [];
      held = true;
    }

    // The AI skipped the question and went straight to sending: hold it and ask now.
    const sendingNow = actions.length || (!offerSent && !held && claimsToBeSending(speech));
    if (sendingNow && !held && this.needsNumberChoice() && !this.awaitingNumber) {
      this.pendingOffer = actions.length ? actions : "infer";
      this.log.warn(tag, "AI tried to send before the number was agreed — holding it and asking");
      actions = [];
      held = true;
      this.systemTurn(ASK_WHICH_NUMBER.replace("Do NOT send yet", "Nothing has been sent yet. Do NOT send"));
    }

    // Caller chose a different number but hasn't given it yet: nothing goes out.
    if (this.awaitingNumber && actions.length) {
      this.awaitingNumber = actions;
      actions = [];
      held = true;
    }

    // Safety net: the AI said "sending it now" but gave no action -> work it out from the conversation.
    if (!actions.length && !offerSent && !held && !this.awaitingNumber && claimsToBeSending(speech)) {
      if (this.whatsappEnabled) {
        actions = inferActions(this.recentText(), this.catalog);
        this.log.warn(tag, "AI said it's sending but gave no action — inferred:", JSON.stringify(actions));
      } else {
        this.log.warn(tag, "AI said it's sending, but WhatsApp is OFF for this hotel (no account found)");
      }
    }

    // Finish speaking: the rest of the last sentence, or a fallback if nothing came out.
    sentences.flush();
    if (!spoken) say(speech || (actions.length ? FALLBACK.sendingOnly : fallback));

    // The caller can't send "Hi" without knowing where: if the AI left the number out, add it.
    if (needsHotelNumber && !/HOTEL_WHATSAPP_NUMBER/.test(raw)) {
      say(/[\u0900-\u097F]/.test(spoken) ? "हमारा WhatsApp number है HOTEL_WHATSAPP_NUMBER।" : "Our WhatsApp number is HOTEL_WHATSAPP_NUMBER.");
    }
    tts.end();

    // What was actually said becomes the history (always valid JSON for the model).
    this.conversation.addAssistant(speech ? raw : JSON.stringify({ reply: spoken.trim(), whatsapp: [], end_call: false }));
    this.log.info(tag, "AI:", spoken.trim());

    // WhatsApp goes out in the background while the agent keeps talking.
    if (actions.length) this.dispatchWhatsapp(actions, tag);

    try {
      await tts.done;
    } catch (err) {
      this.log.error(tag, "TTS failed:", err.message);
    }

    this.finishAudio(turn);

    if (this.isStale(id)) {
      this.log.info(tag, "interrupted");
      return;
    }

    await this.waitForPlayback(turn);

    if (this.isStale(id)) return;

    this.log.info(tag, "finished");

    // Hang up only when it's really over: forced (abuse / silence), or the AI
    // said goodbye AND the caller was actually leaving.
    const callerLeaving = !isSystemTurn && (isGoodbye(transcript) || this.abuseStrikes >= 2);
    if (mustEnd || (endCall && callerLeaving)) {
      await sleep(400); // let the last word land
      if (!this.isStale(id)) this.hangup(mustEnd ? "agent ended the call (abuse / silence)" : "caller said goodbye");
    }
  }

  // ==========================================================
  // WHATSAPP — runs in the background, reports back via notes
  // ==========================================================

  async dispatchWhatsapp(actions, tag) {
    const log = this.log.child("whatsapp");

    if (!this.whatsappEnabled) {
      log.warn(tag, "AI tried to send but WhatsApp is not set up for this hotel");
      return;
    }

    // Number the caller said on the call > number the AI wrote > number they're calling from.
    const overrideTo = actions.find((a) => a?.to)?.to;
    const to = this.whatsappNumber || toWhatsAppNumber(overrideTo) || this.callerNumber;

    // AI action -> exact Meta payloads, URLs taken from the KB catalog.
    const { messages, problems } = buildMessages(actions, this.catalog);
    problems.forEach((p) => log.warn(tag, p));

    // Never send the exact same message twice in one call.
    const keyOf = (m) => `${to}:${JSON.stringify(m)}`;
    const fresh = messages.filter((m) => !this.sentWhatsappKeys.has(keyOf(m)));
    if (!fresh.length) {
      log.info(tag, messages.length ? "already sent these — skipped" : "nothing to send");
      if (!messages.length) this.conversation.addNote("That item isn't available to send (not in the KB). Tell the caller the team will share it.");
      return;
    }
    fresh.forEach((m) => this.sentWhatsappKeys.add(keyOf(m)));
    const allowRetry = () => fresh.forEach((m) => this.sentWhatsappKeys.delete(keyOf(m)));

    log.info(tag, `sending ${fresh.length} message(s) to …${lastDigits(to)}`);

    let result;
    try {
      result = await whatsappService.sendMessages({ ndid: this.waNdid, to, messages: fresh, hotelName: this.hotelName, log });
    } catch (err) {
      result = { status: "failed", sent: 0, reason: err.message };
    }

    log.info(tag, "result:", result.status, result.reason || "");
    if (this.callEnded) return;

    if (result.status === "sent") {
      clearInterval(this.replyWatch); // nothing left to wait for
      this.conversation.addNote(`WhatsApp delivered ${result.sent} message(s) to the caller.`);
      return;
    }

    allowRetry(); // the rest can be sent once the caller replies on WhatsApp

    // The caller must message the hotel's number first. Tell them WHICH number
    // (it is usually not the number they dialled), and send by ourselves the
    // moment their message arrives.
    const number = this.speakableHotelWhatsapp(result.hotelWhatsapp);
    const sayNumber = number
      ? ' Tell them the number by writing the token HOTEL_WHATSAPP_NUMBER exactly where the number belongs in your sentence (for example: "just send a Hi to HOTEL_WHATSAPP_NUMBER") — the system speaks the real digits in its place. NEVER write the digits yourself and never use a phone number from the knowledge base for this. Offer to repeat it.'
      : "";
    this.mustSayHotelNumber = Boolean(number);
    const autoSend = " You do NOT need to send anything again: the system sends it automatically the moment their message arrives.";
    // The "Hi" must come from the number the items are going to.
    const fromWhere = to !== this.callerNumber
      ? ` IMPORTANT: the "Hi" must be sent FROM the WhatsApp number ending in ${lastDigits(to)} (the number the items are going to), not from the phone they are calling on.`
      : ' The "Hi" must be sent from the same number they are calling from.';

    if (result.status === "template_sent") {
      const rest = result.waiting.length
        ? ` Still waiting: ${result.waiting.join(", ")} — WhatsApp only allows those after the caller replies. Ask them to reply "Hi" to the message they just received and the rest follows at once.${autoSend}`
        : "";

      // The brochure already went as a template; send the rest when they reply.
      const sentBrochure = result.delivered.some((d) => d.startsWith("brochure"));
      const remaining = fresh.filter((m) => !(sentBrochure && m.type === "document"));
      if (result.waiting.length && remaining.length) this.watchForReply(to, remaining, tag);
      this.systemTurn(
        `This caller has never messaged the hotel on WhatsApp, so it went as a first-contact message. Delivered: ${result.delivered.join(", ")}.${rest} Tell the caller this in one short line.`,
      );
      return;
    }

    if (result.status === "unconfirmed") {
      this.systemTurn(
        `The WhatsApp message will probably NOT reach the caller: they have never messaged the hotel on WhatsApp, and WhatsApp blocks first messages like this. Do not say it is on its way. Be honest and brief: ask them to send "Hi" on WhatsApp to the hotel's WhatsApp number, and it will be shared right away.${sayNumber}${fromWhere}${autoSend}`,
      );
      this.watchForReply(to, fresh, tag);
      return;
    }

    this.systemTurn(
      `WhatsApp sending FAILED (${result.reason}). Nothing was delivered. Apologise in one short line and say the team will share it shortly.`,
    );
  }

  // True until the caller has said where WhatsApp messages should go.
  // (No caller number at all -> the AI simply asks for a number; nothing to choose.)
  needsNumberChoice() {
    return this.whatsappEnabled && !this.numberConfirmed && Boolean(this.callerNumber);
  }

  // "+91 98342 24907" -> "98342 24907" (TTS then reads it digit by digit).
  speakableHotelWhatsapp(displayNumber) {
    const digits = String(displayNumber || this.hotelWhatsapp || "").replace(/\D/g, "");
    if (digits.length < 10) return "";

    const local = digits.slice(-10);
    return `${local.slice(0, 5)} ${local.slice(5)}`;
  }

  // We asked the caller to message the hotel on WhatsApp. Keep checking the
  // inbox; the moment their message is there, send what they were promised.
  watchForReply(to, messages, tag) {
    clearInterval(this.replyWatch);

    const log = this.log.child("whatsapp");
    const keyOf = (m) => `${to}:${JSON.stringify(m)}`;
    const giveUpAt = Date.now() + config.whatsapp.replyWaitMs;
    let checking = false;

    log.info(tag, `waiting for the caller's WhatsApp message to ${this.hotelWhatsapp || "the hotel"}...`);

    this.replyWatch = setInterval(async () => {
      if (this.callEnded || Date.now() > giveUpAt) return clearInterval(this.replyWatch);
      if (checking) return;
      checking = true;

      try {
        const open = await whatsappService.canSendFreely({ ndid: this.waNdid, to, hotelName: this.hotelName, log });
        if (!open || this.callEnded) return;

        clearInterval(this.replyWatch);

        // Skip anything that went out another way in the meantime.
        const pending = messages.filter((m) => !this.sentWhatsappKeys.has(keyOf(m)));
        if (!pending.length) return;
        pending.forEach((m) => this.sentWhatsappKeys.add(keyOf(m)));

        log.info(tag, `caller's message arrived — sending ${pending.length} message(s)`);
        const result = await whatsappService.sendMessages({ ndid: this.waNdid, to, messages: pending, hotelName: this.hotelName, log });
        log.info(tag, "result:", result.status, result.reason || "");

        if (result.status === "sent") {
          this.systemTurn("The caller's WhatsApp message just arrived and everything you promised has now been delivered to their WhatsApp. Tell them in one short, happy line, then carry on.");
        } else {
          pending.forEach((m) => this.sentWhatsappKeys.delete(keyOf(m)));
          this.systemTurn(`Their WhatsApp message arrived but sending still FAILED (${result.reason}). Apologise in one short line and say the team will share it shortly.`);
        }
      } catch (err) {
        log.warn(tag, "reply check failed:", err.message);
      } finally {
        checking = false;
      }
    }, config.whatsapp.replyPollMs);
  }

  // Last few turns as plain text (to guess which brochure/rooms were discussed).
  recentText() {
    return this.conversation.messages
      .slice(-6)
      .filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join(" ");
  }

  // ==========================================================
  // SPEAK — TTS -> Exotel
  // ==========================================================

  // Audio state of one reply.
  beginTurn(id, { mergeable = false } = {}) {
    this.turn = {
      id,
      mergeable, // may be thrown away and redone if the caller adds more before it starts
      audioStarted: false, // the caller has started hearing it
      startedAt: 0,
      bytes: 0, // audio handed to Exotel so far
      held: [], // audio waiting because the caller is talking
      generated: false, // no more audio is coming
      complete: false, // TTS produced the WHOLE reply (not cut short)
      finished: false, // end-of-reply mark sent to Exotel
    };
    return this.turn;
  }

  // record: optional array that receives a copy of the audio (to cache it).
  openTts(turn, record = null) {
    // Never allow two TTS sockets.
    this.stopTts();

    const tts = createTtsStream({
      log: this.log.child("tts"),
      isCancelled: () => this.callEnded || this.isStale(turn.id),
      onAudio: (audio) => {
        record?.push(audio);
        this.playAudio(turn, audio);
      },
      onGenerationComplete: () => {
        turn.complete = true;
        this.finishAudio(turn);
      },
    });

    this.currentTts = tts;
    tts.done.catch(() => {}).finally(() => {
      if (this.currentTts === tts) this.currentTts = null;
    });

    return tts;
  }

  playAudio(turn, audio) {
    if (this.callEnded || this.isStale(turn.id)) return;

    // The caller is mid-sentence (they only paused) — don't talk over them.
    // If more words arrive this reply is redone; if it was just noise it plays.
    if (!turn.audioStarted && (this.callerSpeaking || turn.held.length)) {
      if (!turn.held.length) {
        turn.heldAt = Date.now();
        this.log.info("caller is still speaking — holding the reply");
      }
      turn.held.push(audio);
      return;
    }

    this.emitAudio(turn, audio);
  }

  emitAudio(turn, audio) {
    if (!turn.audioStarted) {
      turn.audioStarted = true;
      turn.startedAt = Date.now();
      turn.onStart?.();
      this.isSpeaking = true;
      this.playback.begin();
    }

    turn.bytes += Math.floor((audio.length * 3) / 4);
    this.exotel.sendAudio(audio);
  }

  releaseHeldAudio() {
    const turn = this.turn;
    if (!turn?.held.length || this.callEnded || this.isStale(turn.id)) return;

    const held = turn.held;
    turn.held = [];
    this.log.info(`caller went quiet — speaking now (held ${Date.now() - turn.heldAt}ms)`);
    held.forEach((audio) => this.emitAudio(turn, audio));

    if (turn.generated) this.finishAudio(turn);
  }

  // All audio for this reply has been generated: ask Exotel to tell us when
  // playback reaches the end.
  finishAudio(turn) {
    turn.generated = true;
    if (turn.finished || turn.held.length || this.callEnded || this.isStale(turn.id)) return;

    turn.finished = true;
    if (!turn.audioStarted) return; // nothing was said

    this.exotel.flushAudio(); // send the last partial chunk first
    this.exotel.sendMark(`reply-${turn.id}`);
  }

  stopTts() {
    const tts = this.currentTts;
    this.currentTts = null;
    tts?.stop();
  }

  // How much of the current reply the caller still has to hear.
  playbackRemainingMs() {
    const turn = this.turn;
    if (!turn?.audioStarted || !this.isSpeaking) return 0;
    if (!turn.generated) return Infinity;

    return Math.max(0, turn.startedAt + turn.bytes / BYTES_PER_MS - Date.now());
  }

  async waitForPlayback(turn) {
    // Audio held back while the caller talks: wait for them to finish.
    while (turn.held.length && !this.isStale(turn.id) && !this.callEnded) await sleep(50);

    if (this.isStale(turn.id) || !turn.audioStarted) return;

    // Exotel echoes our mark when playback ends. If it never does, the length
    // of the audio tells us when the caller has heard everything.
    const timeout = this.playbackRemainingMs() + config.call.playbackGraceMs;

    await this.playback.wait(timeout, () => {
      if (this.isStale(turn.id)) return;
      this.log.debug("no playback mark from Exotel — continuing on audio length");
      this.isSpeaking = false;
      this.playback.complete();
    });
  }

  isStale(id) {
    return id !== this.responseId;
  }

  // ==========================================================
  // WELCOME
  // ==========================================================

  async sendWelcome() {
    this.isProcessing = true;
    const id = ++this.responseId;
    const started = Date.now();

    const names = { hotelName: this.hotelName, agentName: this.agentName };
    const welcome = buildWelcomeMessage(names);
    const text = toSpeakableText(welcome);

    // So the AI knows it already greeted and doesn't greet again.
    // (Added to the system prompt, not as an assistant turn — some models
    // require the first turn after "system" to be "user".)
    this.conversation.messages[0].content += `\n\nYou have already greeted the caller with: "${welcome}" Do not greet again.`;

    const turn = this.beginTurn(id);
    turn.onStart = () => this.log.info(`[welcome] caller hears it ${Date.now() - started}ms after the hotel was ready`);

    try {
      const cached = getCachedAudio(text);

      if (cached) {
        // Ready-made audio: the caller hears it the moment the call connects.
        this.log.info("[welcome] playing cached audio");
        cached.forEach((audio) => this.playAudio(turn, audio));
        this.finishAudio(turn);
      } else {
        this.log.info("[welcome] generating");
        const recorded = []; // keep a copy for the next call
        const tts = this.openTts(turn, recorded);

        tts.sendText(text);
        tts.end();
        await tts.done;

        this.finishAudio(turn);
        if (turn.complete) storeAudio(text, recorded);
      }

      // The other greetings ("Good evening...") get made in the background.
      setTimeout(() => {
        GREETINGS.forEach((greeting) => prefetchAudio(toSpeakableText(buildWelcomeMessage({ ...names, greeting }))));
      }, 3000).unref?.();

      if (this.isStale(id)) return; // caller interrupted the welcome

      await this.waitForPlayback(turn);

      this.log.info("[welcome] playback finished");
    } catch (err) {
      this.log.error("[welcome] error:", err.message);
    } finally {
      this.isProcessing = false;

      if (JUST_A_GREETING.test(this.pendingTranscript || "")) this.pendingTranscript = null;

      // Caller spoke while the welcome was playing.
      if (this.pendingTranscript || this.systemTurnQueued) this.runResponseLoop();
      else this.armSilenceTimer();
    }
  }
}
