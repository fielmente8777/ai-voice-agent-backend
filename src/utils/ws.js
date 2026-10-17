// ============================================================
// WEBSOCKET HELPERS
// ============================================================

import { WebSocket } from "ws";

// Send JSON only if the socket is open. Never throws.
export function safeSend(ws, payload, log) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (err) {
    log?.error("send failed:", err.message);
    return false;
  }
}

// Parse a WebSocket message as JSON. Returns null if it isn't JSON.
export function parseJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

// Close a socket only when it is open (closing a CONNECTING socket throws an error event).
export function safeClose(ws, log) {
  if (!ws) return;

  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  } catch (err) {
    log?.error("close error:", err.message);
  }
}
