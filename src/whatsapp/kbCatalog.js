// ============================================================
// KB CATALOG
// Turns any hotel KB into a simple list of things we can send on
// WhatsApp, each with a short id the AI can refer to:
//
//   rooms:     [{ id, name, info, images[], url, brochure, video }]
//   brochures: [{ id, name, url }]
//   links:     { map, website, booking }
//
// The AI only ever says ids ("villa_magnifica"). All URLs come from
// here, so the AI can never invent or mistype a link.
// ============================================================

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function walk(node, visit, key = "") {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit, key));
  else if (isObject(node)) {
    visit(node, key);
    Object.entries(node).forEach(([k, v]) => walk(v, visit, k));
  }
}

// Words that don't identify a specific room ("villa", the hotel's own name...).
const GENERIC = new Set(["villa", "villas", "suite", "suites", "room", "rooms", "the", "de", "brochure", "apartment", "studio", "cottage", "tent", "and"]);
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function roomInfo(o) {
  const parts = [];
  if (o.type) parts.push(o.type);
  if (o.bedrooms) parts.push(`${o.bedrooms} bedroom${o.bedrooms > 1 ? "s" : ""}`);
  if (o.max_occupancy && !/NEEDS/i.test(o.max_occupancy)) parts.push(`sleeps ${String(o.max_occupancy).replace(/ guests?/i, "")}`);
  if (o.size_sqft) parts.push(`${o.size_sqft} sq ft`);
  if (o.view) parts.push(`${o.view} view`);
  return parts.join(" · ");
}

export function buildCatalog(kb, hotelName = "") {
  const ignore = new Set([...GENERIC, ...words(hotelName)]);
  const keyWords = (name) => words(name).filter((w) => !ignore.has(w));

  const rooms = new Map();
  const brochures = new Map();
  const links = {};

  walk(kb, (o, key) => {
    const name = o.name || o.title;

    // Room = has a name and a list of image urls
    const images = Array.isArray(o.images) ? [...new Set(o.images.filter(isUrl))] : [];
    if (name && images.length) {
      const id = o.id ? slug(o.id) : slug(name);
      if (!rooms.has(id)) {
        rooms.set(id, {
          id,
          name,
          info: roomInfo(o),
          images,
          url: [o.source_url, o.url, o.booking_url, o.page_url].find(isUrl) || null,
          videos: [...(Array.isArray(o.videos) ? o.videos : []), o.video, o.video_url]
            .filter((v) => isUrl(v) && /\.(mp4|3gp)(\?|$)/i.test(v)),
          brochureId: o.brochure_id ? slug(o.brochure_id) : null,
          brochure: null,
        });
      }
    }

    // Brochure = something with a .pdf link
    const pdf = [o.url, o.link, o.brochure_url].find((v) => isUrl(v) && /\.pdf(\?|$)/i.test(v));
    if (pdf) {
      const bName = (name || "Brochure").replace(/\.pdf$/i, "");
      const id = o.id ? slug(o.id) : slug(bName);
      if (!brochures.has(id)) brochures.set(id, { id, name: bName, url: pdf });
    }

    // Useful links, found by key name
    for (const [k, v] of Object.entries(o)) {
      if (!isUrl(v)) continue;
      const kl = k.toLowerCase();
      if (!links.map && (kl.includes("map") || /maps\.app\.goo\.gl|google\.[a-z.]+\/maps/.test(v))) links.map = v;
      else if (!links.website && /^(website|site|source_domain|homepage|web)$/.test(kl)) links.website = v;
      else if (!links.booking && kl.includes("booking") && !/wa\.me/.test(v)) links.booking = v;
    }
  });

  // Link each room to its brochure (by brochure_id, else by name words: "Serenity")
  const brochureList = [...brochures.values()];
  for (const room of rooms.values()) {
    const kw = keyWords(room.name);
    room.brochure =
      brochures.get(room.brochureId) ||
      brochureList.find((b) => b.id === room.brochureId) ||
      brochureList.find((b) => kw.some((w) => words(b.name).includes(w))) ||
      null;
  }

  // Every URL in the KB — used to check URLs the LLM writes itself.
  const allUrls = new Set();
  (function collect(node) {
    if (typeof node === "string") node.match(/https?:\/\/[^\s"'<>]+/g)?.forEach((u) => allUrls.add(u.trim()));
    else if (Array.isArray(node)) node.forEach(collect);
    else if (isObject(node)) Object.values(node).forEach(collect);
  })(kb);

  return { rooms: [...rooms.values()], brochures: brochureList, links, allUrls };
}

// Short list for the system prompt — ids only, no URLs (saves tokens, stops invented links).
export function catalogForPrompt(catalog) {
  const lines = [];

  lines.push("ROOMS (id — name — what can be sent):");
  for (const r of catalog.rooms) {
    const can = ["photos"];
    if (r.brochure) can.push("brochure");
    if (r.videos.length) can.push("video");
    lines.push(`- ${r.id} — ${r.name}${r.info ? ` (${r.info})` : ""} — ${can.join(", ")}`);
  }

  const loose = catalog.brochures.filter((b) => !catalog.rooms.some((r) => r.brochure?.id === b.id));
  if (loose.length) {
    lines.push("OTHER BROCHURES:");
    loose.forEach((b) => lines.push(`- ${b.id} — ${b.name}`));
  }

  const linkNames = Object.keys(catalog.links);
  if (linkNames.length) lines.push(`LINKS: ${linkNames.join(", ")}`);

  return lines.join("\n");
}
