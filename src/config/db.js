// ============================================================
// MONGODB CONNECTION
// ============================================================

import mongoose from "mongoose";
import config from "./env.js";
import createLogger from "../utils/logger.js";

const log = createLogger("db");

export async function connectDB() {
  await mongoose.connect(config.databaseUrl);
  log.info("connected to database:", mongoose.connection.name);
}

// Raw MongoDB driver handle (used for collection().findOne()).
export function getDB() {
  if (!mongoose.connection.db) {
    throw new Error("Database not connected yet — call connectDB() first");
  }
  return mongoose.connection.db;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
