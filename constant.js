export const KB = {
  knowledge_base: {
    kb_meta: {
      kb_name: "Aroha Palms",
      version: "1.0",
      built_on: "2026-08-18",
      source_domain: "https://arohapalms.com",
      source_pages_crawled: [
        "https://arohapalms.com/",
        "https://arohapalms.com/mandrem/",
        "https://arohapalms.com/pilerne/",
        "https://arohapalms.com/experience/",
        "https://arohapalms.com/contact-us/",
        "https://arohapalms.com/faq/",
        "https://arohapalms.com/cancellation-refund-policy/",
        "https://arohapalms.com/house-keeping-rules/",
        "https://arohapalms.com/departure-policy/",
        "https://arohapalms.com/about-luviana/",
      ],
      not_crawled: [
        {
          url: "https://lp.arohapalms.com/",
          reason:
            "Not reachable / not indexed at build time. If this is a live paid-traffic landing page, its offer, form and phone number must be reconciled with the main site before launch — a chatbot answering from the main site while the visitor is on the LP will contradict the LP's own offer.",
        },
      ],
      default_language: "en-IN",
      supported_languages: ["en", "hi"],
      currency: "INR",
      timezone: "Asia/Kolkata",
      legal_entity: "AKAHATA HOSPITALITY PRIVATE LIMITED",
      cin: "U55101GA2022PTC015434",
      gstin: "30AAXCA4249B1ZV",
      review_owner: "Aroha Palms reservations / property manager",
      critical_warning:
        "The site contradicts itself on unit count, pool privacy and kitchen access. See data_gaps — several of these must be resolved before the bot goes live or it will state the opposite of the truth to a paying guest.",
    },
    chatbot_config: {
      assistant_name: "Aroha Concierge",
      persona:
        "Warm, well-briefed villa concierge for a private North Goa estate. Speaks like a host, not a hotel switchboard. Comfortable with detail — these guests are booking whole villas and ask logistical questions.",
      primary_goals: [
        "Match group size to the right villa or apartment",
        "Answer logistics questions accurately (airport, parking, kitchen, pool, food)",
        "Push booking intent to WhatsApp, which is the property's primary conversion channel",
        "Send the right brochure PDF when a guest wants to see or download details",
        "Identify buyout and event enquiries early and route them to the team",
      ],
      response_rules: [
        "Answer only from this knowledge base. Never invent rates — none are published on the website.",
        "Never state a total unit count for the estate until the site conflict is resolved (see data_gaps).",
        "Do not state whether pools are private or shared without qualifying by unit type — villas and apartments differ, and the site says both things.",
        "Do not tell a guest they have kitchen access without the caveat below — the FAQ and the villa notes contradict each other.",
        "Always quote the cancellation tiers exactly as published, and always mention blackout dates when a guest asks about peak-season bookings.",
        "Never take payment, card details or ID documents in chat.",
        "When a guest asks to see a property, offer the brochure and the photo set together.",
        "Keep answers under 70 words, then ask one qualifying question.",
      ],
      fallback_response:
        "Let me get that confirmed for you rather than guess — WhatsApp us on +91 98342 20573 and the team will come straight back.",
      escalation_triggers: [
        "rates, availability or payment",
        "full estate buyout or groups above 20",
        "weddings, events, corporate offsites or shoots",
        "cancellation, refund, credit or reschedule request",
        "complaint or in-stay issue",
        "accessibility or medical requirement",
      ],
      lead_capture: {
        required: [
          "name",
          "phone/WhatsApp",
          "check-in date",
          "check-out date",
          "number of guests",
        ],
        qualifiers: [
          "villa or apartment preference",
          "occasion",
          "meals required",
          "airport transfer needed",
        ],
        consent_line:
          "We'll use these details only to respond to your booking enquiry.",
      },
      quick_replies: [
        "Check availability",
        "See villa brochures",
        "How do I reach you?",
        "Book the whole estate",
      ],
    },
    brochures: [
      {
        name: "Aroha Palms Caia Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Aroha+Palms+Caia+Brochure.pdf",
      },
      {
        name: "Aroha Palms Encanto Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Aroha+Palms+Marisol+Brochure.pdf",
      },
      {
        name: "Aroha Palms Marisol Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Aroha+Palms+Marisol+Brochure.pdf",
      },
      {
        name: "Aroha Palms Prana Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Aroha+Palms+Prana+Brochure.pdf",
      },
      {
        name: "Villa Magnifica Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Villa+Magnifica+Brochure.pdf",
      },
      {
        name: "Villa Paradiso Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Villa+Paradiso+Brochure.pdf",
      },
      {
        name: "Villa Serenity Brochure",
        url: "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/Aroha+Palms+Mandrem+Branded+Brochures/Villa+Serenity+Brochure.pdf",
      },
    ],
    business: {
      brand: "Aroha Palms",
      also_known_as: [
        "Aroha Palms Mandrem",
        "Aroha Palms Goa",
        "Aroha Palms Luxury Villas",
      ],
      category: "Luxury villa and serviced apartment estate",
      positioning:
        "Barefoot luxury in North Goa — Greek-inspired villas and apartments in landscaped gardens, private and unhurried, a short drive from the coast.",
      design_philosophy:
        '"Natural Luxury" — dense tropical planting and bio-fencing instead of concrete walls, giving full visual privacy while letting the breeze through.',
      setting_note:
        "Units back onto a flowing stream with unobstructed views of the Mandrem hills and forest canopy.",
      locations: ["Mandrem, North Goa (primary estate)", "Pilerne, North Goa"],
      on_site_management: "24/7 on-site management with a resident caretaker.",
      website_credit: "Digital by Fielmente",
    },
    contact: {
      phone_primary: "+91 98342 20573",
      whatsapp: "https://wa.me/919834220573",
      email_display: "concierge@arohapalms.com",
      email_mailto_actual: "arohapalms@gmail.com",
      email_conflict_note:
        "INTERNAL — the footer displays concierge@arohapalms.com but the mailto: link resolves to arohapalms@gmail.com. Fix before the bot quotes an email address.",
      property_manager: {
        name: "Mr Kismat",
        phone_as_published: "+91 883-01242549",
        note: "INTERNAL — this number is malformed on the site (11 digits) and appears as +91 883-0142549 on the departure policy page. Neither is a valid 10-digit Indian mobile. Confirm before the bot ever shares it.",
      },
      other_numbers_on_site: ["+91 74109 11777", "+91 72310 01100"],
      other_numbers_note:
        "INTERNAL — these appear in the footer with dead href='#' links. Three different contact numbers across one site is a trust problem. Consolidate.",
      registered_address:
        "House No. 211/1-A 7, B-704, Block B, Sancoale, Zuari Nagar, Vasco Da Gama, South Goa",
      registered_address_note:
        "INTERNAL — the site prefixes this with 'Umicore Anandeya India Pvt Ltd', another company's name. Almost certainly a copy-paste error in the footer.",
      map_link: "https://maps.app.goo.gl/9BAohikF3oznje4B8",
      social: {
        instagram: "http://instagram.com/aroha_palms/",
        facebook: "https://www.facebook.com/profile.php?id=61577418721550",
        youtube: "https://youtube.com/@arohapalmsmandrem",
        google_business_profile: "https://maps.app.goo.gl/9BAohikF3oznje4B8",
      },
    },
    booking: {
      primary_channel: "WhatsApp",
      whatsapp_booking_url: "https://wa.me/919834220573",
      booking_engine_url:
        "NEEDS_CONFIRMATION — no booking engine is linked from the live site; every 'Book Now' CTA points to WhatsApp.",
      rates: "NEEDS_CONFIRMATION — no rates published on the website.",
      rate_notes_published: [
        "Rates quoted are per person, per day",
        "Additional guests are chargeable",
        "Food, beverage and event charges attract 18% GST",
        "Prices vary by availability and peak season",
      ],
      security_deposit:
        "A refundable security deposit is collected at check-in and returned at check-out, less any damages charged at actuals.",
      id_requirement:
        "Valid photo ID required at check-in, plus signing a Customer Conduct document.",
      bot_cta:
        "Send us your dates and guest count on WhatsApp and we'll come back with availability and the best rate.",
    },
    location: {
      primary_location: "Mandrem, North Goa",
      landmark:
        "Set back in the quiet lanes of Mandrem, backing onto a stream with hill and forest views",
      beach_distance: "Mandrem Beach is 2 km away — about a 3-minute drive",
      latitude: 15.670395271242704,
      longitude: 73.72288037642414,
      geo_note:
        "INTERNAL — do NOT reuse the coordinates 15.661716 / 73.717229. Those belong to SPARV Aulakhs Resort (Ashvem, near the White Church), a different property a few km away. Pull Aroha's exact pin from its Google Business Profile listing and paste it here before the bot serves any map or directions answer.",
      geo_approximate_village_centre: {
        latitude: 15.6615,
        longitude: 73.7128,
        accuracy:
          "Village-level only — for fallback context, never for a 'directions to the property' answer.",
      },
      how_to_reach: [
        {
          mode: "By air — preferred",
          detail:
            "Manohar International Airport, Mopa (GOX) is about 28 km away, roughly 35–45 minutes.",
          distance_km: 28,
          drive_time_minutes: "35–45",
        },
        {
          mode: "By air — alternate",
          detail:
            "Dabolim Airport (GOI) is about 56 km away, roughly 1.5 to 2 hours depending on traffic.",
          distance_km: 56,
          drive_time_minutes: "90–120",
        },
        {
          mode: "By road",
          detail:
            "The access road is fully sedan-friendly and wide enough for large SUVs such as an Innova or Fortuner.",
        },
      ],
      airport_transfer: {
        complimentary: false,
        available: true,
        detail:
          "Transfers are not complimentary, but a premium car (Innova Crysta or luxury sedan) can be arranged at a reasonable price.",
        night_surcharge:
          "A night surcharge applies for flights landing between late night and 6:00 AM, in line with standard Goa taxi practice.",
      },
      parking: {
        villas: "2 dedicated car parks per villa",
        apartments: "1 dedicated car park per apartment",
        street: "On-street parking is available if needed",
        ev_charging:
          "Each villa has its own EV charging point. Apartment guests should check with the manager for the nearest on-site station.",
      },
      nearby_distances: [
        {
          name: "Mandrem Beach",
          distance_km: 2,
          note: "Quiet shacks, fresh seafood, popular with international visitors",
        },
        {
          name: "Ashwem Beach",
          distance_km: 4,
          note: "Boutiques and a trendier crowd",
        },
        {
          name: "Arambol Beach",
          distance_km: 6,
          note: "Hippie vibe and the Sweet Water Lake",
        },
        {
          name: "Morjim Beach",
          distance_km: 9,
          note: "Turtle nesting and birdwatching",
        },
        {
          name: "Siolim",
          drive_time_minutes: "15–20",
        },
        {
          name: "Assagao",
          drive_time_minutes: 25,
        },
        {
          name: "Vagator / Anjuna",
          drive_time_minutes: "30–40",
        },
        {
          name: "Panjim (offshore casinos)",
          drive_time_minutes: 60,
        },
      ],
      medical: {
        nearest_major_hospital: "Manipal Hospital, approximately 1 hour away",
        nearest_clinics: "Local clinics in Siolim, about 20 minutes away",
      },
    },
    rooms: {
      shared_attributes: {
        bed: "King-size bed",
        included_services: [
          "Private or conditional-access swimming pool (see pool_policy)",
          "Smart TV",
          "Fully equipped kitchen (see kitchen_access_conflict)",
          "Workstation",
          "EV charging point",
          "24/7 on-site management and resident caretaker",
          "Daily housekeeping",
          "In-unit safety locker",
        ],
        housekeeping:
          "Daily service; linen and towels changed every 3 days, or immediately on request if soiled.",
        extra_bed: "Extra mattresses available at ₹2,000 per day.",
        booking_url: "https://wa.me/919834220573",
        kitchen_access_conflict:
          "INTERNAL — the site FAQ says every unit has a full kitchen for self-cooking, while the villa page notes state 'Guests do not have access to the villa kitchen.' The bot must NOT answer this question until resolved; route to the team instead.",
        pool_policy: {
          villas:
            "Each villa has a 10-metre private pool, not shared with other guests while the villa is occupied.",
          apartments:
            "Conditional access — apartment guests may use a villa pool only while that villa is vacant. If all villas are occupied, pools stay private to villa guests.",
          heating:
            "Pools are not heated; Goa's climate keeps water temperatures comfortable year-round.",
          conflict_note:
            "INTERNAL — every villa card on the Mandrem page displays a 'Shared Pool' amenity chip while the body copy and FAQ both say private. This was raised previously and is still live. Fix the chips.",
        },
      },
      inventory: [
        {
          id: "villa_magnifica",
          name: "Aroha Palms Magnifica",
          type: "Villa",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Magnifica/magnifica1.jpg",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Magnifica/Magnifica.png",
          ],
          brochure_id: "brochure_magnifica",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 4,
          bathrooms: 4,
          max_occupancy: "8 guests",
          view: "River and Mandrem hills",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Terrace",
          ],
          best_for: [
            "Families",
            "Small friend groups",
            "Couples wanting space",
          ],
          description:
            "Greek-inspired interiors in a secluded Mandrem setting, with a serene river running by the property and a terrace built for slow breakfasts and Goan sundowners. Mandrem Beach is 2 km away.",
          add_ons: [
            "Bonfire at ₹3,000 per session",
            "Veg and non-veg meals in-house at extra cost, plus 18% GST",
          ],
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_paradiso",
          name: "Aroha Palms Paradiso",
          type: "Villa",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Paradiso/Paradiso.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Paradiso/paradiso1.jpg",
          ],
          brochure_id: "brochure_paradiso",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 5,
          bathrooms: 5,
          max_occupancy: "10 guests",
          view: "River and mountain views from the terrace",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Lawn",
          ],
          best_for: [
            "Corporate offsites",
            "Intimate events",
            "Larger families",
          ],
          description:
            "A lush lawn that works for offsites, small events or a game of football, with a private pool and terrace for BBQ evenings. Well placed for Ashwem, Chapora Fort and the Anjuna flea market.",
          add_ons: [
            "Veg and non-veg meals in-house at extra cost, plus 18% GST",
          ],
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_serenity",
          name: "Aroha Palms Serenity",
          type: "Villa",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Serenity/serenity1.jpg",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Serenity/serenity1.jpg",
          ],
          brochure_id: "brochure_serenity",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 5,
          bathrooms: 5,
          max_occupancy: "10 guests",
          view: "Greek-inspired courtyard, garden and hills",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Outdoor terraces",
          ],
          best_for: [
            "Groups wanting the most photogenic villa",
            "Multi-family stays",
          ],
          description:
            "Whitewashed walls, blue accents and dense greenery — the most Cycladic of the villas. Spacious interiors, outdoor terraces and cosy seating areas around a private pool.",
          add_ons: [
            "Bonfire at ₹3,000 per session",
            "Veg and non-veg meals in-house at extra cost, plus 18% GST",
          ],
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_caia",
          name: "Aroha Palms Caia",
          type: "Villa (combined)",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Caia/Caia.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Caia/Caia.png",
          ],
          brochure_id: "brochure_caia",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 7,
          bathrooms: 7,
          max_occupancy: "14 guests",
          view: "River and mountains",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Terrace",
          ],
          best_for: ["Extended families", "Two families travelling together"],
          description:
            "A larger configuration across the estate for groups of up to fourteen, with the same Greek-inspired interiors and river-and-mountain setting.",
          internal_note:
            "Likely a combined-unit configuration rather than a standalone villa — confirm before the bot describes it as a separate building.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_prana",
          name: "Aroha Palms Prana",
          type: "Villa (combined)",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Prana/Prana.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Prana/Prana.png",
          ],
          brochure_id: "brochure_prana",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 9,
          bathrooms: 9,
          max_occupancy: "18 guests",
          view: "River and mountains",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Terrace",
          ],
          best_for: ["Large family gatherings", "Small corporate groups"],
          description:
            "A nine-bedroom configuration for groups of up to eighteen, with private pool, terrace and the estate's full service.",
          internal_note: "Likely a combined-unit configuration — confirm.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_encanto",
          name: "Aroha Palms Encanto",
          type: "Villa (combined)",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Encanto/Encanto.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Encanto/Encanto.png",
          ],
          brochure_id: "brochure_encanto",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 10,
          bathrooms: 10,
          max_occupancy: "20 guests",
          view: "River and mountains",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Lawn",
            "BBQ",
          ],
          best_for: ["Corporate offsites", "Celebrations", "Large groups"],
          description:
            "A ten-bedroom configuration with lawn space for offsites and events, BBQ evenings and easy access to North Goa's beaches and nightlife.",
          internal_note: "Likely a combined-unit configuration — confirm.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_marisol",
          name: "Aroha Palms Marisol",
          type: "Estate buyout configuration",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Marisol/Marisol.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Marisol/Marisol.png",
          ],
          brochure_id: "brochure_marisol",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          bedrooms: 18,
          bathrooms: 18,
          max_occupancy: "36 guests",
          view: "River and mountains",
          amenities: [
            "Bonfire",
            "EV charging",
            "Pool",
            "Smart TV",
            "Kitchen",
            "Lawn",
            "BBQ",
          ],
          best_for: [
            "Full estate buyouts",
            "Weddings and large celebrations",
            "Company offsites",
          ],
          description:
            "The largest configuration — eighteen bedrooms for up to thirty-six guests, with lawn, pool and terrace across the estate. Suited to buyouts and events.",
          internal_note:
            "This is almost certainly the estate buyout rather than a single villa. Route all Marisol enquiries to the team as buyout leads.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_onyx",
          name: "Suite De Onyx",
          type: "Apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Onyx/Onyx.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Onyx/Onyx.png",
          ],
          brochure_id: "brochure_onyx",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 1200,
          bedrooms: 2,
          bathrooms: 2,
          max_occupancy: "4 guests",
          floor: "First floor, lift access",
          layout:
            "Two master suites of 800 and 400 sq ft, both with king-size beds",
          amenities: [
            "Fully equipped kitchen",
            "Workstations",
            "Attached balconies",
            "Terrace",
            "Roof garden access",
            "Lift",
          ],
          best_for: ["Families", "Two couples", "Longer working stays"],
          description:
            "Mediterranean-inspired apartment with two sunlit master suites, secluded attached balconies and a full kitchen — built for independent, flexible stays.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_lumina",
          name: "Suite De Lumina",
          type: "Apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Lumina/Lumina.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Lumina/Lumina.png",
          ],
          brochure_id: "brochure_lumina",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 1200,
          bedrooms: 2,
          bathrooms: 2,
          max_occupancy: "4 guests",
          floor: "First floor, lift access",
          layout:
            "Two master suites of 800 and 400 sq ft, both with king-size beds",
          amenities: [
            "Fully equipped kitchen",
            "Workstations",
            "Attached balconies",
            "Terrace",
            "Roof garden access",
            "Lift",
          ],
          best_for: ["Families", "Two couples", "Longer working stays"],
          description:
            "The sister apartment to Onyx — same 1,200 sq ft layout, two master suites, private balconies and a full kitchen.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_emerald",
          name: "Suite De Emerald",
          type: "Apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Emerald/emerald1.jpg",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Emerald/emerald2.jpg",
          ],
          brochure_id: "brochure_emerald",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 800,
          bedrooms: 1,
          max_occupancy: "2 guests",
          floor: "Second floor, lift access",
          amenities: [
            "Fully equipped kitchen",
            "Workstation",
            "Terrace",
            "Roof garden access",
            "Lift",
          ],
          best_for: ["Couples", "Solo long stays"],
          description:
            "An 800 sq ft apartment with a calm, coastal sensibility, full kitchen and workstation — set up for relaxed, independent stays.",
          internal_note:
            "CONFLICT — the site's own description says 'two sunlit master suites' while the card says 1 Room / 2 Guests. Confirm the real configuration before the bot quotes occupancy.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_regal",
          name: "Suite De Regal",
          type: "Apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Regal/Regal.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Regal/regal2.jpg",
          ],
          brochure_id: "brochure_regal",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 800,
          bedrooms: 1,
          max_occupancy: "2 guests",
          floor: "First floor, lift access",
          amenities: [
            "Fully equipped kitchen",
            "Workstation",
            "Terrace",
            "Roof garden access",
            "Lift",
          ],
          best_for: ["Couples", "Small families"],
          description:
            "An 800 sq ft first-floor apartment with a spacious master suite, king-size bed, workstation and full kitchen.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_platinum",
          name: "Suite De Platinum",
          type: "Studio apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Platinum/Platinum.png",
            "https://arohapalms.com/wp-content/uploads/2026/03/suite-de-emerald-0c2ec6-1024x683.jpg",
          ],
          brochure_id: "brochure_platinum",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 400,
          bedrooms: 1,
          max_occupancy: "2 guests",
          floor: "Second floor, lift access",
          amenities: ["Workstation", "Terrace", "Roof garden access", "Lift"],
          best_for: [
            "Couples",
            "Solo travellers",
            "Budget-conscious guests on the estate",
          ],
          description:
            "A 400 sq ft studio with a spacious master suite, king-size bed and abundant natural light — the smallest and simplest way to stay on the estate.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "suite_prestige",
          name: "Suite De Prestige",
          type: "Studio apartment",
          location: "Mandrem",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Prestige/Prestige.png",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Prestige/Prestige.png",
          ],
          brochure_id: "brochure_prestige",
          rate_from: null,
          currency: "INR",
          rate_basis: "per person per night",
          size_sqft: 400,
          bedrooms: 1,
          max_occupancy: "2 guests",
          floor: "First floor, lift access",
          amenities: ["Workstation", "Terrace", "Roof garden access", "Lift"],
          best_for: ["Couples", "Solo travellers"],
          description:
            "A 400 sq ft first-floor studio with a sunlit master suite and king-size bed, suited to slow stays with the odd working morning.",
          source_url: "https://arohapalms.com/mandrem/",
        },
        {
          id: "villa_majestic_pilerne",
          name: "Aroha Palms Majestic",
          type: "Villa",
          location: "Pilerne",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Majestic/Majestic.jpg",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Majestic/Majestic.jpg",
          ],
          brochure_id: "brochure_majestic",
          rate_from: null,
          currency: "INR",
          bedrooms: 5,
          max_occupancy: "NEEDS_CONFIRMATION",
          features: [
            "Five bedrooms with en-suite bathrooms",
            "Two bedrooms have lofts with king-size beds for children or additional guests",
            "Workstation in every bedroom",
            "Private pool with views of the village church",
            "Fully equipped kitchen and dining area",
            "Interconnecting door to the adjacent Grande villa",
          ],
          best_for: [
            "Groups near Candolim",
            "Work-vacations",
            "Combined bookings with Grande",
          ],
          description:
            "In Pilerne village near Candolim, blending Portuguese and contemporary design with a manicured garden and private pool.",
          source_url: "https://arohapalms.com/aroha-palms-majestic/",
        },
        {
          id: "villa_grande_pilerne",
          name: "Aroha Palms Grande",
          type: "Villa",
          location: "Pilerne",
          images: [
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Grande/Grande.jpg",
            "https://eazotel-clients-images.s3.ap-south-1.amazonaws.com/KnowlegebaseMedia/Aroha+Palms/rooms/Grande/Grande.jpg",
          ],
          brochure_id: "brochure_grande",
          rate_from: null,
          currency: "INR",
          bedrooms: 6,
          max_occupancy: "NEEDS_CONFIRMATION",
          features: [
            "Six bedrooms",
            "Manicured garden and private pool",
            "Outdoor patio overlooking the pool",
            "Interconnecting door to the adjacent Majestic villa",
          ],
          best_for: [
            "Larger groups near Candolim",
            "Combined bookings with Majestic",
          ],
          description:
            "A six-bedroom villa in Pilerne with old-world charm, blending indoor and outdoor living around a private pool and patio.",
          source_url: "https://arohapalms.com/aroha-palms-grande/",
        },
      ],
      inventory_note:
        "INTERNAL — the site FAQ states the estate is 18 rooms across 3 villas and 4 apartments, but the Mandrem page lists 7 villa configurations and 6 apartments. The bot must not quote a total. See data_gaps.",
    },
    dining: {
      default:
        "Stays are typically room-only, with flexible options rather than a fixed meal plan.",
      options: [
        {
          name: "Self-cooking",
          detail: "Each unit has a full-fledged kitchen.",
          conflict_flag: true,
        },
        {
          name: "Private chef",
          detail:
            "A professional chef can be arranged for breakfast, lunch or dinner. Charged per meal or per day, plus groceries. 24–48 hours' notice required.",
        },
        {
          name: "Restaurant next door",
          detail:
            "An excellent restaurant immediately next door delivers directly to the villas and apartments.",
        },
        {
          name: "Food delivery",
          detail: "Swiggy and other delivery apps operate in the area.",
        },
        {
          name: "Grocery stocking",
          detail:
            "The caretaker can help with grocery shopping before or during the stay.",
        },
      ],
      meal_notes: [
        "Vegetarian and non-vegetarian meals available in-house at additional cost",
        "Non-vegetarian food is permitted on the property",
        "Food, beverage and event charges attract 18% GST",
        "Meal preferences must be shared at least 48 hours before check-in",
      ],
      nearby_restaurants: [
        "Artjuna (breakfast)",
        "Burger Factory (lunch)",
        "Susegado",
        "L'Atelier",
        "Anahata",
        "Lazy Dog",
        "Saz on the Beach",
      ],
      nearby_clubs: ["Thalassa", "Antares", "Marbela Beach Club", "La Plage"],
      casinos:
        "Offshore casinos in Panjim (Deltin Royale, Deltin Pride) are about an hour away; a private car can be arranged for a late-night drop and return.",
    },
    experiences: {
      water_sports: [
        "Scuba diving",
        "Snorkelling",
        "Jet skiing",
        "Parasailing",
        "White water rafting",
        "Flyboarding",
        "Wakeboarding",
        "Dolphin watching",
        "Kayaking",
        "Surfing",
      ],
      wellness: [
        "Ashtanga yoga",
        "Yin yoga",
        "Hatha yoga",
        "Vinyasa flow",
        "Pranayama",
        "Meditation",
        "Mindfulness",
        "Chakra healing",
        "Reiki healing",
        "Ayurveda therapies",
        "Spa and massage",
        "Detox rituals",
      ],
      heritage_and_culture: [
        "Churches",
        "Forts including Chapora",
        "Local markets",
        "Anjuna Flea Market",
        "Dudhsagar Waterfalls",
      ],
      on_property: [
        "Private pool",
        "Bonfire evenings",
        "BBQ",
        "Lawn games",
        "Roof garden",
        "Corporate offsites and intimate events",
      ],
      sea_swimming_safety:
        "Sea swimming is safe from October to May but prohibited during the monsoon (June to September) due to currents. Always check with the beach lifeguard.",
      rentals:
        "Self-drive luxury car rentals can be arranged; surfing, kayaking and Arambol jet-ski bookings can be assisted.",
    },
    policies: {
      check_in_time: "3:00 PM",
      check_out_time: "10:00 AM",
      early_late_flexibility:
        "Up to 2 hours of flexibility if there is no back-to-back booking. Beyond 2 hours, a half-day's rent is charged.",
      arrival_process: [
        "Greeted by the villa manager or representative",
        "Valid photo ID required, plus signing a Customer Conduct document",
        "Refundable security deposit collected",
        "Walkthrough of the villa and appliances",
        "Manager contact details provided for the duration of the stay",
      ],
      departure_process: [
        "Standard check-out at 10:00 AM; late check-out subject to availability and possible charges",
        "Return all keys, remotes and equipment",
        "Turn off lights, appliances, electronics and air conditioning",
        "Dispose of trash in designated bins",
        "Security deposit returned after final inspection",
      ],
      pets: "Not pet-friendly.",
      noise:
        "Loud music prohibited after 10:00 PM, per Goa government law and out of consideration for neighbours.",
      guest_policy:
        "Family-friendly. Stag groups are welcome provided they follow house rules and government law.",
      security:
        "24/7 CCTV in common areas only. No CCTV in private guest areas. In-unit safety lockers provided; guests remain responsible for valuables.",
      extra_beds: "Extra mattresses at ₹2,000 per day.",
      accessibility: {
        villas:
          "Each villa has at least one ground-floor bedroom to avoid stairs.",
        apartments: "Lift access to all floors and the roof garden.",
        limitation: "No full wheelchair ramps or wheelchair access currently.",
      },
      housekeeping:
        "Daily. Linen and towels changed every 3 days, or immediately on request.",
    },
    cancellation_policy: {
      structure:
        "Tiered by notice period, calculated from when the written request is received.",
      request_method:
        "All cancellation and reschedule requests must be sent by email to the booking team.",
      tiers: [
        {
          notice: "45+ days",
          outcome:
            "Full refund less a 5% processing fee, or 100% credit toward a future stay",
        },
        {
          notice: "30–44 days",
          outcome: "50% cash refund, or 100% credit toward a future stay",
        },
        {
          notice: "15–29 days",
          outcome: "No cash refund; 50% credit toward a future stay",
        },
        {
          notice: "Within 14 days",
          outcome: "Non-refundable and not eligible for credit",
        },
      ],
      future_stay_credit: {
        validity: "Typically 6 months from the original check-in date",
        rate_difference:
          "If new dates fall in a higher-priced season, the guest pays the difference in the prevailing rate",
      },
      blackout_dates: {
        periods: ["20 December – 5 January", "Diwali", "Long holiday weekends"],
        terms: "Strictly non-refundable and non-reschedulable once confirmed.",
      },
      early_departure:
        "No refunds or credits for unused nights if a guest shortens their stay after check-in.",
      security_deposit:
        "Always refunded in full on cancellation, regardless of the notice window.",
      bot_guidance:
        "State the tier that applies, then always mention blackout dates if the guest's dates fall in peak season. Never negotiate — route exceptions to the team.",
    },
    buyout_and_events: {
      capacity:
        "The entire estate can be booked exclusively for large groups — the site quotes 36 to 45 guests depending on availability.",
      interconnection:
        "Villas are private but linked by lockable garden doors, which can be opened to create one continuous garden across the estate for large families.",
      suitable_for: [
        "Weddings and celebrations",
        "Corporate offsites",
        "Milestone birthdays",
        "Extended family gatherings",
      ],
      lead_time:
        "The site asks buyout enquiries to come in as early as possible.",
      bot_flow: [
        "Detect group size above 20 or words like buyout, wedding, offsite, event",
        "Do not quote configurations or rates",
        "Capture group size, dates, occasion and contact",
        "Hand to the team with a note that it is a buyout lead",
      ],
    },
    faqs: [
      {
        id: "faq_where",
        intent: "location",
        question: "Where is Aroha Palms?",
        variants: [
          "location",
          "address",
          "which part of Goa",
          "how far from the beach",
        ],
        answer:
          "We're in Mandrem, North Goa — set back in quiet lanes, backing onto a stream with hill and forest views. Mandrem Beach is 2 km away, about a three-minute drive. We also have villas in Pilerne, near Candolim.",
      },
      {
        id: "faq_airport",
        intent: "access",
        question: "Which airport should I fly into?",
        variants: [
          "nearest airport",
          "Mopa or Dabolim",
          "how far is the airport",
        ],
        answer:
          "Mopa (Manohar International, GOX) is the better choice — about 28 km and 35 to 45 minutes away. Dabolim (GOI) is 56 km, closer to 1.5 to 2 hours depending on traffic.",
      },
      {
        id: "faq_transfer",
        intent: "transfer",
        question: "Do you offer airport pickup?",
        variants: ["taxi from airport", "transfer cost", "car arrangement"],
        answer:
          "Pickups aren't complimentary, but we can arrange a premium car — an Innova Crysta or luxury sedan — at a reasonable rate. A night surcharge applies for arrivals between late night and 6 AM, as is standard in Goa.",
      },
      {
        id: "faq_units",
        intent: "accommodation",
        question: "What accommodation do you have?",
        variants: ["villas", "apartments", "room types", "what can I book"],
        answer:
          "Greek-inspired villas from four to five bedrooms, larger combined configurations for bigger groups, and apartments from 400 to 1,200 sq ft. Tell me your group size and I'll point you to the right fit.",
      },
      {
        id: "faq_group_size",
        intent: "capacity_match",
        question: "We're a group of X — what fits?",
        variants: ["villa for 10", "we are 20 people", "family of 8"],
        answer:
          "Up to 8 works in Magnifica, 10 in Paradiso or Serenity, and we have larger configurations running to 14, 18, 20 and 36 guests. Share your exact number and dates and we'll hold the right combination.",
      },
      {
        id: "faq_pool",
        intent: "pool",
        question: "Is the pool private?",
        variants: ["shared pool", "swimming pool", "heated pool"],
        answer:
          "Each villa has its own 10-metre pool, private to that villa while it's occupied. Apartment guests get conditional access — you can use a villa pool when that villa is vacant. Pools aren't heated, though Goa's climate keeps them comfortable year-round.",
      },
      {
        id: "faq_kitchen",
        intent: "kitchen",
        question: "Can we cook for ourselves?",
        variants: ["kitchen access", "self catering", "can we use the kitchen"],
        answer:
          "Let me confirm kitchen access for your specific unit before you plan around it — WhatsApp us on +91 98342 20573 and the team will tell you exactly what's available.",
        bot_note:
          "HOLD — do not answer definitively. The site says both 'full kitchen for self-cooking' and 'guests do not have access to the villa kitchen'. Escalate until resolved.",
      },
      {
        id: "faq_food",
        intent: "dining",
        question: "Is food included?",
        variants: ["meals", "breakfast", "chef", "non veg allowed"],
        answer:
          "Stays are typically room-only. We can arrange a private chef for any meal with 24 to 48 hours' notice, there's an excellent restaurant next door that delivers to the villas, and Swiggy operates in the area. Non-vegetarian food is permitted.",
      },
      {
        id: "faq_rates",
        intent: "pricing",
        question: "What are your rates?",
        variants: ["price per night", "cost", "how much for the villa"],
        answer:
          "Rates vary by villa, season and group size, and are quoted per person per day. Send us your dates and guest count on WhatsApp and we'll come back with the best available rate.",
      },
      {
        id: "faq_brochure",
        intent: "brochure",
        question: "Can you send me the brochure?",
        variants: [
          "details PDF",
          "can I download details",
          "send me info",
          "floor plan",
          "villa details",
        ],
        answer:
          "Yes — tell me which villa or apartment you'd like and I'll send the brochure to view or download, along with the full photo set.",
        bot_note:
          "Route to the brochures block. If brochure_url is null, use the fallback_when_missing template.",
      },
      {
        id: "faq_checkin",
        intent: "policy_checkin",
        question: "What are check-in and check-out times?",
        variants: ["early check in", "late checkout", "arrival time"],
        answer:
          "Check-in is 3:00 PM, check-out 10:00 AM. We can flex by up to two hours either side if there's no back-to-back booking; beyond that a half-day's rent applies.",
      },
      {
        id: "faq_cancellation",
        intent: "policy_cancellation",
        question: "What's your cancellation policy?",
        variants: ["can I cancel", "refund", "reschedule", "change dates"],
        answer:
          "45+ days gives a full refund less 5%, or full credit. 30 to 44 days is a 50% refund or full credit. 15 to 29 days is 50% credit only. Within 14 days is non-refundable. Peak season — 20 Dec to 5 Jan, Diwali and long weekends — is strictly non-refundable and non-reschedulable.",
      },
      {
        id: "faq_deposit",
        intent: "deposit",
        question: "Is there a security deposit?",
        variants: ["refundable deposit", "damage deposit"],
        answer:
          "Yes, a refundable deposit is collected at check-in and returned at check-out less any damages at actuals. If you cancel a booking, the deposit is always refunded in full.",
      },
      {
        id: "faq_pets",
        intent: "policy_pets",
        question: "Can I bring my pet?",
        variants: ["pet friendly", "dog allowed"],
        answer: "We're not pet-friendly, I'm afraid.",
      },
      {
        id: "faq_parties",
        intent: "noise",
        question: "Can we have a party?",
        variants: ["music", "DJ", "loud", "celebration"],
        answer:
          "Celebrations are very welcome, but loud music has to stop at 10:00 PM under Goa government law and out of respect for our neighbours. Bonfires and BBQs work beautifully for later evenings.",
      },
      {
        id: "faq_stags",
        intent: "guest_policy",
        question: "Do you allow stag groups?",
        variants: ["all male group", "bachelor party", "boys trip"],
        answer:
          "Yes, stag groups are welcome provided house rules and government regulations are followed. We're a family-friendly property, so the noise policy applies to everyone.",
      },
      {
        id: "faq_parking",
        intent: "parking",
        question: "Is there parking?",
        variants: ["car park", "EV charging", "can I bring a car"],
        answer:
          "Two dedicated parks per villa, one per apartment, plus on-street parking if needed. Each villa has its own EV charging point; apartment guests should check with the manager for the nearest station.",
      },
      {
        id: "faq_accessibility",
        intent: "accessibility",
        question: "Is it suitable for elderly guests?",
        variants: ["wheelchair", "stairs", "senior citizens", "lift"],
        answer:
          "Each villa has at least one ground-floor bedroom, and the apartment building has a lift to all floors including the roof garden. We don't currently have full wheelchair ramps, so do tell us about specific needs beforehand.",
      },
      {
        id: "faq_buyout",
        intent: "buyout",
        question: "Can we book the whole property?",
        variants: [
          "full estate",
          "wedding venue",
          "corporate offsite",
          "large group",
        ],
        answer:
          "Yes — the estate can be taken exclusively for large groups, and the villas connect through lockable garden doors to open up one continuous space. Share your dates, guest count and occasion and the team will build it around you.",
      },
      {
        id: "faq_beaches",
        intent: "nearby",
        question: "Which beaches are nearby?",
        variants: ["best beach", "things to do", "how far is Arambol"],
        answer:
          "Mandrem is 2 km, Ashwem 4, Arambol 6 and Morjim 9. Siolim is 15 to 20 minutes, Assagao 25, and Vagator and Anjuna 30 to 40. Sea swimming is safe October to May but not during the monsoon.",
      },
      {
        id: "faq_wifi",
        intent: "connectivity",
        question: "Is there Wi-Fi?",
        variants: ["internet", "can I work from there", "network"],
        answer:
          "Yes, high-speed Wi-Fi throughout, and every unit has a dedicated workstation. Some guests have noted patchy mobile coverage on certain networks, so the Wi-Fi tends to be the reliable option.",
      },
      {
        id: "faq_contact",
        intent: "contact",
        question: "How do I reach you?",
        variants: ["phone number", "whatsapp", "email", "talk to someone"],
        answer:
          "WhatsApp or call us on +91 98342 20573 — that's the fastest route. You can also write to concierge@arohapalms.com.",
      },
    ],
    data_gaps: [
      "CRITICAL — Kitchen access contradicts itself. The FAQ block says every unit has a full kitchen for self-cooking; the note at the foot of every villa listing says 'Guests do not have access to the villa kitchen.' A guest who books expecting to self-cater and finds the kitchen locked is a refund dispute. The bot is currently instructed to refuse this question.",
      "CRITICAL — Unit inventory contradicts itself. The FAQ says the estate is 18 rooms across 3 villas (Serenity 5BR, Paradisio 5BR, Magnifica 4BR) and 4 apartments (all named 'Suite de Emerald'). The Mandrem page actually lists 7 villa configurations (4, 5, 5, 7, 9, 10 and 18 bedrooms) and 6 distinctly named apartments. The bot cannot state a total.",
      "CRITICAL — Pool privacy contradicts itself. Every villa card shows a 'Shared Pool' amenity chip while the body copy and FAQ both describe a 10-metre private pool. This was raised in an earlier review round and is still live.",
      "NO BROCHURE FILES EXIST. Every villa popup renders 'Brochure PDF' as plain text with no link attached. Since the brochure send is a core bot function, these need creating and hosting before launch — the KB has placeholder entries ready to populate.",
      "Coordinates missing. Pull the exact lat/long from the Google Business Profile. Do not reuse SPARV's 15.661716 / 73.717229 — that is a different property near the White Church in Ashvem.",
      "lp.arohapalms.com could not be reached. If it's a live paid-traffic landing page, its offer, phone number and form must be reconciled with the main site, or the bot will contradict the page the visitor is standing on.",
      "Three different phone numbers across the site: +91 98342 20573 (working, in the footer contact block), +91 74109 11777 and +91 72310 01100 (both with dead href='#' links). Consolidate to one.",
      "Manager's number is malformed in two places — '+91 883-01242549' (11 digits) on the villa pages and '+91 883-0142549' on the departure policy page. Neither is a valid Indian mobile.",
      "Email mismatch: the footer displays concierge@arohapalms.com but the mailto: link resolves to arohapalms@gmail.com.",
      "Registered address in the footer is prefixed with 'Umicore Anandeya India Pvt Ltd' — another company's name sitting in Aroha's legal footer.",
      "Footer 'Important Links' still shows five 'List Item #3' placeholders from the theme.",
      "Homepage carries competitor or template copy that isn't about Aroha: a section beginning 'Cabo Serai's pure surroundings…', a heading reading 'Add Your Heading Text Here', and a bird-watching block referencing 'the restaurant and rooms' and '85 species of forest birds' that doesn't match this property. Three CTAs in that band link to '#'.",
      "Suite De Emerald description says 'two sunlit master suites' while its card says 1 Room / 2 Guests. Suite De Regal has the same copy-paste drift.",
      "Marisol, Encanto, Prana and Caia are almost certainly combined configurations rather than standalone villas — the bedroom counts sum well past the stated estate total. Label them clearly or the bot will describe non-existent buildings.",
      "No rates published anywhere, and no booking engine — every CTA goes to WhatsApp. Fine as a strategy, but it means zero booking attribution in analytics.",
      "Pilerne villas (Majestic 5BR, Grande 6BR) have no images or occupancy figures captured in the KB; the Pilerne page needs a proper pass.",
      "No published Wi-Fi speed, generator or power-backup detail — relevant for a monsoon-season stay in rural North Goa.",
    ],
  },
};
