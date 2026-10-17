# Exotel × Sarvam Voice AI Bridge

Phone call → Exotel Voicebot Applet → **this server** → Sarvam STT / LLM / TTS → back to the caller.

Written as ES modules (`import` / `export`, `"type": "module"`). Requires Node 20.19+. Local imports must include the `.js` extension.

## Run

```bash
cp .env.example .env   # fill in SARVAM_API_KEY and DATABASE_URL
npm install
npm run dev            # or: npm run dev:debug  (verbose logs)
ngrok http 5001        # point the Exotel Voicebot Applet at wss://<ngrok-host>/?ndid=<hotel ndid>
```

Put a **Hangup applet after the Voicebot applet** in the Exotel flow: when the agent ends a call (goodbye, abusive caller, silent line) it closes the stream and Exotel moves to the next applet.

## Test without a phone

```bash
WHATSAPP_DRY_RUN=true npm run dev                         # terminal 1 (dry run = WhatsApp is logged, not sent)
npm run test:call -- <ndid>                               # terminal 2: a scripted caller talks to the agent
npm run test:call -- <ndid> "Do you have a pool?" "Send me the brochure on WhatsApp" "Okay bye"
npm run test:call -- <ndid> --silence=40 "Hello"          # caller goes quiet
```

It prints how long the agent took to start answering; the agent's words are in the server log.

## Folder structure

```
src/
├── index.js                     Entry point: connect DB → prewarm hotels → start server → graceful shutdown
├── config/
│   ├── env.js                   ALL settings (ports, models, voice, timeouts). Only file that reads .env
│   └── db.js                    MongoDB connect / getDB / disconnect
├── server/
│   └── wsServer.js              HTTP + WebSocket server, health check on GET /
├── exotel/
│   ├── connectionHandler.js     One connection = one call. Routes Exotel events → CallSession
│   └── ExotelChannel.js         Everything we SEND to Exotel: audio, mark, clear, close
├── call/
│   ├── CallSession.js           Brain of a call: welcome, response loop, barge-in, silence, abuse, hang-up, WhatsApp dispatch
│   ├── Conversation.js          Chat history (system prompt + turns + system notes)
│   ├── PlaybackTracker.js       Waits for Exotel to confirm audio finished playing
│   ├── numberCapture.js         Joins a phone number spoken in pieces ("nine eight..." -> 98...)
│   └── transcriptFilter.js      Ignore empty / filler / backchannel transcripts
├── sarvam/
│   ├── sttClient.js             Streaming speech-to-text socket (+ "caller started/stopped speaking" events, auto-reconnect)
│   ├── llmClient.js             Streamed chat completion (JSON mode)
│   ├── ttsClient.js             Streaming text-to-speech socket: text in sentence by sentence, audio out
│   └── audioCache.js            Ready-made audio for the welcome line
├── agent/
│   ├── responseParser.js        AI JSON {"reply","whatsapp":[...],"end_call"} -> speech + actions
│   ├── replyStream.js           Pulls the spoken "reply" out of the JSON while it is still streaming
│   ├── intent.js                yes / no / "shall I send" / goodbye detection (English, Hinglish, Hindi)
│   ├── abuse.js                 Abusive-language word list
│   └── speechText.js            Cleans text for TTS (no links/markdown, ₹ -> rupees)
├── whatsapp/
│   ├── kbCatalog.js             Rooms -> images / videos / brochure / url from the KB, + every KB URL (allow-list)
│   ├── messageBuilder.js        Shapes actions into Meta payloads: carousel, image, video, document, list, buttons
│   ├── whatsappService.js       Checks the 24h window -> sends free-form, or templates for first-time contacts
│   ├── whatsappWindow.js        Has this caller messaged the hotel in the last 24h? (reads the Eazotel inbox)
│   ├── templates.js             Approved templates that carry the brochure PDF / a photo to first-time contacts
│   ├── metaClient.js            POST /{phone-number-id}/messages, GET helper
│   └── whatsappAccountService.js ndid -> phoneNumberId + accessToken + wabaId (cached)
├── knowledgeBase/
│   └── kbService.js             Fetch hotel KB by ndid (served from memory, refreshed in the background)
├── prompts/
│   └── systemPrompt.js          System prompt (voice, sales flow, difficult callers, WhatsApp rules) + welcome message
└── utils/
    ├── phone.js                 Caller number -> WhatsApp format (919876543210)
    ├── logger.js                Tagged logger: [call:<id>:tts] ...
    └── ws.js                    safeSend / safeClose / parseJson
scripts/
├── check-whatsapp.js            Is WhatsApp ready for this hotel? (token, templates) + send a real test
├── create-whatsapp-templates.js Creates the first-contact templates at Meta
└── simulate-call.js             A scripted caller, no phone needed
```

## How a call flows

```
socket connects → CallSession.prewarm()  → KB + WhatsApp account start loading
Exotel "start"  → CallSession.start()    → build prompt → open STT → welcome (cached audio = instant)
Exotel "media"  → sttClient.sendAudio()
STT transcript  → CallSession.handleTranscript()
                     ├─ AI speaking?            → interrupt (clear Exotel audio, stop TTS) → answer new question
                     ├─ AI thinking, not yet    → throw the half-made reply away, answer everything together
                     │  audible?
                     └─ otherwise               → runResponseLoop()
respond()       → LLM stream ──first sentence──▶ TTS ──▶ ExotelChannel.sendAudio()   (speaks while the rest is written)
                             └─whatsapp list──▶ whatsappService (background)
TTS finished    → sendMark("reply-N")
Exotel "mark"   → PlaybackTracker.complete() → ready for next turn
quiet line      → after SILENCE_MS: "Hello? Are you there?" ×2 → goodbye → hang up
Exotel "stop"   → CallSession.end() → close STT / TTS
```

### Why it sounds quick

- **Welcome:** the audio for each hotel's greeting is kept in memory, so it plays the moment the call connects. Only the first call after a restart generates it (~0.7s); list hotels in `PREWARM_NDIDS` to avoid even that.
- **Replies:** the LLM is streamed and the first sentence goes to TTS while the rest is still being written. The TTS socket is opened in parallel with the LLM request. Each reply logs `first words ready in Nms` and `llm took Nms`.
- What's left is mostly Sarvam: ~0.5s for STT to decide the caller has stopped, ~1s for the LLM's first words (the whole KB is in the prompt — a smaller KB is faster).

### Turn-taking

- "hmm" / "okay" / "haan ji" while the agent talks do not interrupt it — except in the last second of a reply, or after "Shall I send it?", where they are an answer.
- A caller who pauses mid-sentence is not talked over: if they start speaking again before the agent's audio begins, the audio is held; if more words arrive the reply is redone with the full sentence.
- A bare "hello?" said over the welcome is not answered twice.

### Difficult callers

- **Abuse** (`src/agent/abuse.js` word list): 1st time the agent stays calm and keeps helping, 2nd time it gives one polite warning, 3rd time it says goodbye and hangs up. Real complaints are not abuse and are handled as complaints.
- **Silence:** two check-ins, then a goodbye and hang-up.
- **Goodbye:** the agent hangs up only when the caller actually said bye (`isGoodbye` in `intent.js`) — the AI alone cannot end a call.
- Flirting, pranks, wrong numbers, "give me a human", emergencies: see DIFFICULT MOMENTS in the system prompt.
- Set `AGENT_CAN_HANG_UP=false` to never end calls from our side.

## WhatsApp during the call

The LLM gets the whole KB and answers with ONE JSON object.

```json
{"reply":"Sure, sending the Magnifica brochure and photos now.",
 "whatsapp":[
  {"type":"document","documentUrl":"<.pdf from KB>","filename":"Villa Magnifica Brochure.pdf","caption":"Brochure"},
  {"type":"carousel","body":"Our villas","cards":[{"title":"Aroha Palms Magnifica","description":"4 bedrooms · private pool","imageUrl":"<from KB>","url":"<from KB>"}]}],
 "end_call":false}
```

1. `reply` is spoken. `whatsapp` never reaches the caller's ear.
2. `responseParser.js` reads the JSON → `messageBuilder.js` turns each item into the payload Meta expects.
3. Every URL is checked against the KB. A wrong URL for a named room is swapped for that room's real link; anything else is dropped and logged.
4. `whatsappService.js` sends them from the hotel's own number.
5. If the agent only *offers* ("Shall I send…?"), the offer is remembered and a "yes" sends it.
6. The real outcome is fed back to the AI as `[system: ...]`, and the agent tells the caller the truth.

### The 24-hour rule (the reason brochures "didn't arrive")

WhatsApp delivers free-form messages (PDF, photos, carousel) **only to people who messaged the hotel in the last 24 hours**. For everyone else Meta *accepts* the request, returns a message id, and then fails it silently a second later. Most callers have never messaged the hotel.

So before sending, `whatsappWindow.js` looks in the Eazotel inbox (`whatsapp-conversations` + `whatsappmessages`) for a recent message from that number:

| Caller | What is sent |
|---|---|
| Messaged the hotel in the last 24h | Everything, as-is (brochure, carousel, video, buttons) |
| Never messaged / more than 24h ago | Approved **templates**: `voice_call_brochure` carries the PDF in its header, `voice_call_photos` carries a room photo. The agent asks the caller to reply "Hi" there to get the rest. |
| Outside the window and no templates | Nothing can arrive. The agent says so honestly and asks them to send "Hi" to the hotel's WhatsApp. |

**Which number?** Before the first send of a call the agent asks: "Shall I send it on the same number you're calling from, or on a different WhatsApp number?" "Same" sends at once; "different" makes it ask for the number (only a full 10-digit number is accepted) and send there. If a "Hi" is needed, it must come **from the number the items are going to**, and the agent says so. The hotel's WhatsApp number is spoken by code (the AI writes the token `HOTEL_WHATSAPP_NUMBER`), so it can never read out a wrong number.

When the agent has to ask for a "Hi", it says the hotel's WhatsApp number aloud (the window is per business number — a "Hi" to any other number of the hotel does not count), then keeps checking the inbox for up to 3 minutes and sends everything by itself the moment the message arrives.

**KB and WhatsApp under different ndids.** The agent sends from the WhatsApp account saved under the call's `ndid`. If the hotel's real WhatsApp number is connected under another ndid, point to it — either in the applet URL, `wss://<host>/?ndid=<kb ndid>&wa_ndid=<whatsapp ndid>`, or in `.env`: `WHATSAPP_NDID_MAP=<kb ndid>:<whatsapp ndid>`. Every call logs the number it will send from: `whatsapp on (from +91 …)`.

**Set up once per hotel:**

```bash
npm run check:whatsapp -- <ndid>                 # token valid? templates approved?
npm run create:templates -- <ndid>               # preview the three templates
npm run create:templates -- <ndid> --create      # submit them to Meta (approval: minutes to hours)
npm run check:whatsapp -- <ndid> 98XXXXXXXX      # send the brochure + photos to your own phone
```

If `check:whatsapp` says the token is invalid (Meta error 190), reconnect WhatsApp for that hotel in the dashboard, or set `WHATSAPP_ACCESS_TOKEN` in `.env` to the platform's system-user token.

Videos must be under 16 MB, PDFs under 100 MB. Images must be JPG or PNG (not WebP).

## Where to change things

| I want to…                         | Edit                          |
|------------------------------------|-------------------------------|
| Change voice, language, model      | `src/config/env.js` or `.env` |
| Change bot behaviour / sales style | `src/prompts/systemPrompt.js` |
| Change welcome line                | `buildWelcomeMessage` in `src/prompts/systemPrompt.js` |
| Give the agent a person's name     | `AGENT_NAME` in `.env`        |
| Change how the KB is looked up     | `src/knowledgeBase/kbService.js` |
| Change barge-in / turn-taking      | `src/call/CallSession.js`     |
| Silence timing, abuse strikes      | `call` section of `src/config/env.js` |
| Add abusive words                  | `src/agent/abuse.js`          |
| Ignore more filler words           | `fillerWords` in `src/config/env.js` |
| Swap Sarvam for another provider   | only the files in `src/sarvam/` |
| WhatsApp formats / rules for the AI | `whatsappSection` in `src/prompts/systemPrompt.js` |
| How a WhatsApp item becomes a Meta payload | `src/whatsapp/messageBuilder.js` |
| Template names / wording           | `.env` (`WHATSAPP_TEMPLATE_*`) / `scripts/create-whatsapp-templates.js` |
| Field names of the WhatsApp account doc | `pickPhoneNumberId` in `src/whatsapp/whatsappAccountService.js` |

## Debugging

- Every log line carries a short call id: `[call:3f9a1c2b:tts] connected`. With multiple calls live, filter one: `npm run dev | grep 3f9a1c2b`.
- `LOG_LEVEL=debug` prints the full KB document, WhatsApp payloads, and when the caller starts/stops speaking.
- If Sarvam rejects a socket (bad key / params), the status and body are logged by `sttClient` / `ttsClient`.
- Each reply logs `first words ready in Nms` and `llm took Nms`; the welcome logs how long after the hotel was ready the caller heard it.
- WhatsApp: each send logs `24h window for …1234: open/closed` and the final `result:` (`sent`, `template_sent`, `unconfirmed`, `failed` + reason).

### Two things Sarvam does not tell you

- **LLM:** `response_format: {type: "json_object"}` is required. Without it, any reply that is a JSON object comes back as `content: null`.
- **TTS:** `send_completion_event=true` must be in the socket **URL**. In the config message it is ignored and the "finished" event never arrives.
