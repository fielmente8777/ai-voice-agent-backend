// ============================================================
// HTTP + WEBSOCKET SERVER
// Exotel's Voicebot Applet connects here: ws(s)://<host>/?ndid=<id>
// ============================================================

import http from "node:http";
import { WebSocketServer } from "ws";
import { handleExotelConnection } from "../exotel/connectionHandler.js";

export function createServer() {
  // Plain GET / returns "ok" — handy as a health check behind ngrok / a load balancer.
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", handleExotelConnection);

  return { server, wss };
}
