// The NIGHTLIFE QUARTERS' two prefects (docs/CITY_SPEC.md "The Prefects", "THE NIGHTLIFE QUARTERS").
// Machine constructs of the Overlord like the other twelve, never people, each with its own look and
// voice; prefectData.js appends them, prefectDraw.js paints their heads, uniforms and props.
//
//   UPT-13 THE MAITRE D'          a silver serving-cloche for a head, one amber lens in the slot, a
//                                  cream dinner jacket, the guest list. Lenient on capital: festivals and
//                                  decrees first (nightlifeSim.js nightPressure leans it softer still).
//   DWN-14 THE LICENSING OFFICER  a loudspeaker horn for a head, a decibel lens, a hi-vis tabard, the
//                                  sound meter. Curfews and inspections first, harder on Fridays and
//                                  Saturdays (nightPressure).
export const NIGHT_PREFECTS = [
  {
    id: "uptown", code: "UPT-13", name: "THE MAITRE D'", unit: "HOSPITALITY ENFORCEMENT CONSTRUCT",
    style: "LENIENT ON CAPITAL. THE GUEST LIST IS THE LAW.",
    why: "UPTOWN IS MARBLE, BOTTLE SERVICE AND THE TOP TWO TIERS. IT IS NOT POLICED SO MUCH AS SEATED. THE MAITRE D' SEATS IT.",
    temper: { strict: -0.6, unrest: "placate", content: "relax", prefs: ["permits", "decree"] },
    look: { head: "cloche", build: "slim", legs: "legs", prop: "guestlist", pal: { body: "#e8e0cc", trim: "#c9a227", dark: "#1c1917", lens: "#fbbf24", accent: "#7f1d1d", metal: "#d4d4d8" } },
    signoff: "YOUR TABLE IS READY. YOU ARE NOT.",
    lines: {
      permits: "A GALA HAS BEEN PERMITTED ON THE AVENUE. THE DRESS CODE IS YOUR TIER. YOUR TABLE IS READY. YOU ARE NOT.",
      decree: "UPTOWN IS REMINDED THAT THE ROPE IS NOT A SUGGESTION. IT IS FURNITURE. YOUR TABLE IS READY. YOU ARE NOT.",
      wellness: "WELLNESS CHECKS AT EVERY BANQUETTE. PLEASE EXHALE INTO THE CHAMPAGNE. YOUR TABLE IS READY. YOU ARE NOT.",
      patrols: "I WILL BE CIRCULATING. GRACIOUSLY. AT ALL TIMES. YOUR TABLE IS READY. YOU ARE NOT.",
      inspections: "THE KITCHENS, THE CELLARS AND THE MEZZANINE WILL BE INSPECTED. THE GUESTS WILL NOT. YOUR TABLE IS READY. YOU ARE NOT.",
      curfew: "LAST SERVICE AT 22:00. THE TOP TIERS WILL BE SERVED AFTER LAST SERVICE. YOUR TABLE IS READY. YOU ARE NOT.",
      bark: ["THAT TIER DOES NOT GO WITH THOSE SHOES. YOUR TABLE IS READY. YOU ARE NOT.", "THE WAIT IS FORTY MINUTES. IT HAS BEEN FORTY MINUTES SINCE 1981. YOUR TABLE IS READY. YOU ARE NOT.", "THE MEZZANINE IS FULL. IT IS ALWAYS FULL. YOUR TABLE IS READY. YOU ARE NOT.", "PLEASE STAND BEHIND THE ROPE. FURTHER. YOUR TABLE IS READY. YOU ARE NOT."],
      clash: ["THE COUNCILLOR WISHES TO SPEAK WITH THE MANAGER. I AM THE MANAGER. YOUR TABLE IS READY. YOU ARE NOT.", "A COUNCIL MOTION AGAINST THE ROPE. THE MOTION HAS BEEN SEATED BY THE KITCHEN DOOR. YOUR TABLE IS READY. YOU ARE NOT."],
      placated: "UPTOWN IS CONTENT. CONTENTMENT HAS BEEN ADDED TO THE BILL. YOUR TABLE IS READY. YOU ARE NOT.",
      seething: "UPTOWN IS SEETHING. A ROUND ON THE HOUSE HAS BEEN APPROVED AND THEN WITHDRAWN. YOUR TABLE IS READY. YOU ARE NOT.",
    },
  },
  {
    id: "downtown", code: "DWN-14", name: "THE LICENSING OFFICER", unit: "NOISE AND LICENSING CONSTRUCT",
    style: "CURFEWS FIRST. INSPECTIONS SECOND. FUN IS A LICENSED ACTIVITY.",
    why: "DOWNTOWN IS BASS, BRICK AND THE LOWER TIERS OUT LATE. IT IS LOUD, CHEAP AND BUSY. THE LICENSING OFFICER MEASURES ALL THREE.",
    temper: { strict: 1.3, unrest: "clamp", content: "probe", prefs: ["curfew", "inspections"] },
    look: { head: "horn", build: "stocky", legs: "legs", prop: "meter", pal: { body: "#1e293b", trim: "#a3e635", dark: "#0f172a", lens: "#fb7185", accent: "#facc15", metal: "#94a3b8" } },
    signoff: "DECIBELS LOGGED.",
    lines: {
      permits: "A STREET PARTY IS LICENSED FROM 20:00 UNTIL THE FIRST COMPLAINT. DECIBELS LOGGED.",
      decree: "DOWNTOWN IS REMINDED THAT THE BASS IS AUDIBLE FROM THE ARCHIVE. THE ARCHIVE HAS FILED IT. DECIBELS LOGGED.",
      wellness: "WELLNESS CHECKS IN EVERY QUEUE. HYDRATION IS MANDATORY. SO IS THE QUEUE. DECIBELS LOGGED.",
      patrols: "PATROLS ON EVERY CORNER UNTIL CLOSE. I DO NOT DANCE. I MEASURE. DECIBELS LOGGED.",
      inspections: "LICENCE INSPECTIONS TONIGHT: THE CLUBS, THE CART, THE BOTTLES ON THE SHELF. DECIBELS LOGGED.",
      curfew: "CURFEW FROM 22:00. THE CLUBS MAY REMAIN OPEN. THE STREET MAY NOT. DECIBELS LOGGED.",
      bark: ["THAT KICK DRUM IS FOUR DECIBELS OVER THE PERMIT. DECIBELS LOGGED.", "THE CHICKEN IS LICENSED. THE SAUCE IS UNDER REVIEW. DECIBELS LOGGED.", "MOVE ALONG FROM THE DOOR. THE QUEUE IS FOR QUEUING. DECIBELS LOGGED.", "CLOSING TIME IS A LAW OF PHYSICS DOWNTOWN. DECIBELS LOGGED."],
      clash: ["THE COUNCILLOR OBJECTS TO THE CURFEW. THE OBJECTION WAS TOO LOUD. DECIBELS LOGGED.", "A COUNCIL MOTION TO EXTEND OPENING HOURS. EXTENDED: THE HOURS OF MY PATROL. DECIBELS LOGGED."],
      placated: "DOWNTOWN IS CONTENT. CONTENTMENT IS UNUSUALLY QUIET. IT WILL BE INVESTIGATED. DECIBELS LOGGED.",
      seething: "DOWNTOWN IS SEETHING. THE VOLUME OF THE SEETHING HAS BEEN MEASURED AND FINED. DECIBELS LOGGED.",
    },
  },
];
