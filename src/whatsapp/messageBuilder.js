// ============================================================
// MESSAGE BUILDER
// AI action  ->  exact WhatsApp Cloud API payload(s).
//
// The AI writes a tiny action, e.g.
//   { "send": "photos",   "rooms": ["villa_magnifica", "villa_paradiso"] }
//   { "send": "brochure", "rooms": ["villa_serenity"] }
//   { "send": "room_list" }
//   { "send": "buttons",  "text": "What next?", "buttons": ["Check availability", "Call me back"] }
//   { "send": "link",     "link": "map" }
//   { "send": "video",    "rooms": ["villa_serenity"] }
//   { "send": "text",     "text": "..." }
//
// This file builds the Meta JSON (without "to" — whatsappService adds it).
// Limits follow Meta's docs (carousel: 2–10 cards, card body 160 chars,
// button 20 chars, same button type on every card).
// ============================================================

const clip = (s, max) => {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// ---------- pick rooms the AI asked for ----------

function pickRooms(catalog, ids, { need } = {}) {
  let rooms = catalog.rooms;
  if (Array.isArray(ids) && ids.length) {
    const wanted = ids.map(slug);
    rooms = rooms.filter((r) => wanted.includes(r.id)); // unknown ids -> nothing (logged as a problem)
  }
  if (need) rooms = rooms.filter(need);
  return rooms;
}

// ---------- builders, one per action ----------

function brochure(action, catalog) {
  const rooms = pickRooms(catalog, action.rooms || action.items, { need: (r) => r.brochure });
  let docs = [...new Map(rooms.map((r) => [r.brochure.id, r.brochure])).values()];

  // Brochure ids given directly, or no room brochure -> first general brochure
  if (!action.rooms?.length && action.items?.length) {
    const byId = catalog.brochures.filter((b) => action.items.map(slug).includes(b.id));
    if (byId.length) docs = byId;
  }
  if (!docs.length && catalog.brochures.length) docs = [catalog.brochures[0]];

  return docs.slice(0, 3).map((b) => ({
    type: "document",
    document: { link: b.url, filename: `${b.name}.pdf`, caption: clip(action.text || b.name, 1024) },
  }));
}

function photos(action, catalog) {
  const rooms = pickRooms(catalog, action.rooms || action.items).slice(0, 10);
  if (!rooms.length) return [];

  // One room -> carousel of its photos (or a single image if it has only one)
  if (rooms.length === 1) {
    const r = rooms[0];
    if (r.images.length < 2) {
      return [{ type: "image", image: { link: r.images[0], caption: clip(`${r.name}${r.info ? `\n${r.info}` : ""}`, 1024) } }];
    }
    return [carousel(
      action.text || `Here's a look at ${r.name}`,
      r.images.slice(0, 10).map((img) => ({ image: img, body: r.name, url: r.url, id: r.id })),
    )];
  }

  // Several rooms -> one card per room
  return [carousel(
    action.text || "Here are the rooms we talked about",
    rooms.map((r) => ({ image: r.images[0], body: `*${r.name}*${r.info ? `\n${r.info}` : ""}`, url: r.url, id: r.id })),
  )];
}

// Meta: every card must have the SAME button type -> cta_url only if all have a link.
function carousel(bodyText, items) {
  const allHaveUrl = items.every((i) => i.url);

  return {
    type: "interactive",
    interactive: {
      type: "carousel",
      body: { text: clip(bodyText, 1024) },
      action: {
        cards: items.map((item, i) => ({
          card_index: i,
          type: "cta_url",
          header: { type: "image", image: { link: item.image } },
          body: { text: clip(item.body, 160) },
          action: allHaveUrl
            ? { name: "cta_url", parameters: { display_text: "View details", url: item.url } }
            : { buttons: [{ type: "quick_reply", quick_reply: { id: `book_${item.id}_${i}`, title: "I'm interested" } }] },
        })),
      },
    },
  };
}

function roomList(action, catalog) {
  const rooms = catalog.rooms.slice(0, 10);
  if (!rooms.length) return [];

  return [{
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(action.text || "Here are all our stays. Tap one to know more.", 1024) },
      action: {
        button: "View rooms",
        sections: [{
          title: "Our stays",
          rows: rooms.map((r) => ({
            id: `room_${r.id}`,
            title: clip(r.name, 24),
            ...(r.info ? { description: clip(r.info, 72) } : {}),
          })),
        }],
      },
    },
  }];
}

function buttons(action) {
  const titles = (action.buttons || []).map((b) => clip(b, 20)).filter(Boolean).slice(0, 3);
  if (!titles.length || !action.text) return [];

  return [{
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: clip(action.text, 1024) },
      action: { buttons: titles.map((title) => ({ type: "reply", reply: { id: slug(title), title } })) },
    },
  }];
}

function link(action, catalog) {
  const which = action.link || "website";
  const url = catalog.links[which];
  if (!url) return [];

  const label = { map: "Open map", website: "Visit website", booking: "Book now" }[which] || "Open";
  return [{
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: clip(action.text || "Here's the link", 1024) },
      action: { name: "cta_url", parameters: { display_text: label, url } },
    },
  }];
}

function video(action, catalog) {
  return pickRooms(catalog, action.rooms || action.items, { need: (r) => r.videos.length })
    .slice(0, 3)
    .map((r) => ({ type: "video", video: { link: r.videos[0], caption: clip(action.text || r.name, 1024) } }));
}

function text(action) {
  return action.text ? [{ type: "text", text: { body: clip(action.text, 4096), preview_url: true } }] : [];
}

// ---------- LLM wrote the items itself (urls + details copied from KB) ----------
// {"send":"photos","items":[{"name":"...","image":"https://..jpg","details":"...","url":"https://.."}]}
// {"send":"brochure","items":[{"name":"...","url":"https://...pdf"}]}
// {"send":"video","items":[{"name":"...","url":"https://...mp4"}]}
function fromItems(action, catalog, problems) {
  const inKb = (u) => typeof u === "string" && catalog.allUrls?.has(u.trim());
  const checked = (u, what) => {
    if (!u) return null;
    if (inKb(u)) return u.trim();
    problems.push(`${what} url not in KB (using the room's KB link if the name matches): ${u}`);
    return null;
  };
  const items = action.items.filter((i) => i && typeof i === "object");
  const kind = String(action.send).toLowerCase();

  // If a URL is wrong but the item names a room, use that room's real media from the KB.
  const roomFor = (name) => {
    const w = String(name || "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3);
    return catalog.rooms.find((r) => w.some((x) => r.name.toLowerCase().includes(x) && !["aroha", "palms", "villa", "suite"].includes(x)));
  };

  if (["photos", "images", "carousel", "room_photos", "image"].includes(kind)) {
    const cards = items
      .map((i, n) => ({
        image: checked(i.image || i.image_url || i.link, "image") || roomFor(i.name)?.images[n % (roomFor(i.name)?.images.length || 1)] || null,
        body: `*${i.name || i.title || "Room"}*${i.details ? `\n${i.details}` : ""}`,
        url: checked(i.url || i.page_url, "page") || roomFor(i.name)?.url || null,
        id: slug(i.id || i.name || `item_${n}`),
      }))
      .filter((c, idx, all) => c.image && all.findIndex((x) => x.image === c.image) === idx)
      .slice(0, 10);

    if (!cards.length) return [];
    if (cards.length === 1) {
      return [{ type: "image", image: { link: cards[0].image, caption: clip(cards[0].body.replace(/\*/g, ""), 1024) } }];
    }
    return [carousel(action.text || "Here are the photos", cards)];
  }

  if (["brochure", "brochures", "pdf", "document"].includes(kind)) {
    return items
      .map((i) => ({ name: i.name || i.title || "Brochure", url: checked(i.url || i.link, "brochure") || roomFor(i.name)?.brochure?.url || null }))
      .filter((b) => b.url)
      .slice(0, 3)
      .map((b) => ({
        type: "document",
        document: { link: b.url, filename: `${b.name.replace(/\.pdf$/i, "")}.pdf`, caption: clip(action.text || b.name, 1024) },
      }));
  }

  if (["video", "videos"].includes(kind)) {
    return items
      .map((i) => ({ name: i.name || i.title || "", url: checked(i.url || i.link, "video") || roomFor(i.name)?.videos[0] || null }))
      .filter((v) => v.url)
      .slice(0, 3)
      .map((v) => ({ type: "video", video: { link: v.url, caption: clip(action.text || v.name, 1024) } }));
  }

  return null; // other types -> normal builders
}

const BUILDERS = {
  brochure, brochures: brochure, pdf: brochure,
  photos, images: photos, carousel: photos, room_photos: photos,
  room_list: roomList, list: roomList,
  buttons, options: buttons,
  link, map: (a, c) => link({ ...a, link: "map" }, c),
  video, videos: video,
  text,
};

// ---------- main ----------

export function buildMessages(actions, catalog) {
  const messages = [];
  const problems = [];

  for (const action of actions) {
    const builder = BUILDERS[String(action?.send || "").toLowerCase()];
    if (!builder) {
      problems.push(`unknown action "${action?.send}"`);
      continue;
    }
    // LLM gave full items (urls + details) -> use them; else look up by room id.
    const hasItems = Array.isArray(action.items) && action.items.some((i) => i && typeof i === "object");
    const built = (hasItems && fromItems(action, catalog, problems)) || builder(action, catalog);
    if (!built.length) problems.push(`nothing to send for ${JSON.stringify(action)} (not in KB)`);
    messages.push(...built);
  }

  return { messages: messages.slice(0, 5), problems };
}

// Safety net: the AI said "sending" but gave no action -> guess from the conversation.
export function inferActions(recentText, catalog) {
  const text = (recentText || "").toLowerCase();
  const mentioned = catalog.rooms
    .filter((r) => r.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length > 3 && text.includes(w)))
    .map((r) => r.id);

  const actions = [];
  if (/brochure|pdf|detail|ब्रोशर|डिटेल/.test(text)) actions.push({ send: "brochure", rooms: mentioned });
  if (/photo|picture|pic|image|tasveer|dikh|फोटो|फ़ोटो|तस्वीर|दिख/.test(text)) actions.push({ send: "photos", rooms: mentioned });
  if (/video|वीडियो/.test(text)) actions.push({ send: "video", rooms: mentioned });
  if (/location|map|direction|लोकेशन|मैप/.test(text)) actions.push({ send: "link", link: "map" });
  if (!actions.length) actions.push({ send: "brochure", rooms: mentioned }, { send: "photos", rooms: mentioned });

  return actions;
}
