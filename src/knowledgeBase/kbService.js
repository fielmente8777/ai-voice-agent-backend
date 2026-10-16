// ============================================================
// KNOWLEDGE BASE SERVICE
// Loads a hotel's KB from MongoDB by ndid, with a small in-memory cache.
// After the first call for a hotel the KB is always served from memory
// (a call never waits on the database); it refreshes in the background.
// ============================================================

import config from "../config/env.js";
import { getDB } from "../config/db.js";
import createLogger from "../utils/logger.js";

const log = createLogger("kb");
const { collection, ndidField, cacheTtlMs, staleTtlMs } = config.knowledgeBase;

const cache = new Map(); // ndid -> { kb, fetchedAt }
const loading = new Map(); // ndid -> promise (so parallel calls share one query)

function loadFromDb(ndid) {
  if (loading.has(ndid)) return loading.get(ndid);

  log.info("fetching from db:", ndid);

  // If an ndid has several KB documents, the first one created is used
  // (same document a plain findOne returns).
  const promise = getDB()
    .collection(collection)
    .find({ [ndidField]: ndid }, { projection: { _id: 0, __v: 0, createdAt: 0, updatedAt: 0 } })
    .sort({ _id: 1 })
    .limit(2)
    .toArray()
    .then(([doc, other]) => {
      if (other) log.warn(`more than one KB document for ndid ${ndid} — using "${getHotelName(doc)}", ignoring "${getHotelName(other)}". Delete the one you don't want.`);

      // Full KB is large — only print it with LOG_LEVEL=debug.
      log.debug("fetch result:", ndid, JSON.stringify(doc));

      if (doc) cache.set(ndid, { kb: doc, fetchedAt: Date.now() });
      return doc || null;
    })
    .finally(() => loading.delete(ndid));

  loading.set(ndid, promise);
  return promise;
}

export async function fetchKnowledgeBase(ndid) {
  if (!ndid) {
    return null;
  }

  const cached = cache.get(ndid);
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;

  if (age < cacheTtlMs) {
    log.info("cache hit:", ndid);
    return cached.kb;
  }

  // A bit old: answer the call with it now, pick up dashboard edits for the next call.
  if (age < staleTtlMs) {
    log.info("cache hit (refreshing in background):", ndid);
    loadFromDb(ndid).catch((err) => log.warn("background refresh failed:", err.message));
    return cached.kb;
  }

  return loadFromDb(ndid);
}

// Use after editing a KB in the dashboard so the next call picks it up.
export function clearKnowledgeBaseCache(ndid) {
  if (ndid) cache.delete(ndid);
  else cache.clear();
}

// Adjust to match your KB document structure.
export function getHotelName(kb) {
  return (
    kb?.hotelName ||
    kb?.hotel_name ||
    kb?.name ||
    kb?.propertyName ||
    kb?.hotel?.name ||
    kb?.knowledge_base?.business?.brand ||
    config.call.defaultHotelName
  );
}

// Grouped as one object so tests can stub it (ESM named exports are read-only).
const kbService = { fetchKnowledgeBase, clearKnowledgeBaseCache, getHotelName };

export default kbService;
