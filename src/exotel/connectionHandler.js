// ============================================================
// EXOTEL CONNECTION HANDLER
// One WebSocket connection = one phone call.
// Reads Exotel events and routes them to the CallSession.
// ============================================================

import { randomUUID } from "node:crypto";
import createLogger from "../utils/logger.js";
import { parseJson } from "../utils/ws.js";
import ExotelChannel from "./ExotelChannel.js";
import CallSession from "../call/CallSession.js";

// ?ndid=<hotel>            which hotel's knowledge base answers the call
// &wa_ndid=<hotel>         (optional) whose WhatsApp number sends the brochure, if different
function getParam(req, name) {
  try {
    const url = new URL(req.url, "http://localhost");
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

export const getNdidFromRequest = (req) => getParam(req, "ndid");

export function handleExotelConnection(ws, req) {
  // Short id so you can follow one call in the logs.
  const callId = randomUUID().slice(0, 8);
  const log = createLogger(`call:${callId}`);
  const exotelLog = log.child("exotel");

  const ndid = getNdidFromRequest(req);

  exotelLog.info("connected, url:", req.url, "ndid:", ndid);

  const exotel = new ExotelChannel(ws, exotelLog);
  const session = new CallSession({ exotel, ndid, waNdid: getParam(req, "wa_ndid"), log });

  // Start loading the hotel's KB now — don't wait for Exotel's "start" event.
  session.prewarm();

  ws.on("message", (raw) => {
    const event = parseJson(raw);

    if (!event) {
      exotelLog.error("invalid JSON");
      return;
    }

    switch (event.event) {
      case "connected":
        exotelLog.info("handshake ok");
        break;

      case "start":
        exotelLog.info("media format:", event.start?.media_format);
        session.start(event.start);
        break;

      case "media":
        session.handleCallerAudio(event.media?.payload);
        break;

      case "mark":
        session.handlePlaybackMark(event.mark?.name);
        break;

      case "dtmf":
        exotelLog.info("dtmf:", event.dtmf?.digit);
        break;

      case "stop":
        session.end(`call stopped: ${event.stop?.reason}`);
        break;

      default:
        exotelLog.debug("unhandled event:", event.event);
        break;
    }
  });

  ws.on("close", () => session.end("socket closed"));

  ws.on("error", (err) => exotelLog.error("websocket error:", err.message));
}
