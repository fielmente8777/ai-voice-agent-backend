// ============================================================
// ENTRY POINT
// 1. load config  2. connect DB  3. start server
// ============================================================

import config from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { createServer } from "./server/wsServer.js";
import { prewarmHotel } from "./call/CallSession.js";
import createLogger from "./utils/logger.js";

const log = createLogger("app");

// Without these, an error inside an async handler can silently kill the process.
process.on("uncaughtException", (err) => log.error("UNCAUGHT EXCEPTION:", err));
process.on("unhandledRejection", (reason) =>
  log.error("UNHANDLED REJECTION:", reason),
);

async function main() {
  try {
    await connectDB();
  } catch (err) {
    log.error("db connection failed:", err.message);
    process.exit(1);
  }

  // Optional: have these hotels' KB and welcome audio ready before the first call.
  for (const ndid of config.prewarmNdids) {
    prewarmHotel(ndid, log).catch((err) =>
      log.warn(`prewarm failed for ${ndid}:`, err.message),
    );
  }

  const { server, wss } = createServer();

  server.listen(config.port, () => {
    log.info(`Bridge server listening on ws://localhost:${config.port}`);
    log.info(`Tunnel it: ngrok http ${config.port}`);
  });

  // Ctrl+C / container stop: close calls and DB cleanly.
  const shutdown = async (signal) => {
    log.info(`${signal} received, shutting down`);
    wss.clients.forEach((client) => client.terminate());
    server.close();
    await disconnectDB().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

await main();
