// Best-effort parser for OSM-style opening_hours strings (stored as { raw: "..." }).
// Handles common patterns: "24/7", "Mo-Su 09:00-22:00", "Mo-Fr 09:00-18:00; Sa-Su 10:00-20:00",
// multiple time ranges, and over-midnight closes. Returns "unknown" for anything it can't parse,
// so the UI simply shows nothing rather than guessing.

const DAY_IDX: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };

export interface OpenStatus {
  state: "open" | "closed" | "unknown";
  text: string;
  closesAt?: string;
}

function dayInRange(daysPart: string, day: number): boolean {
  for (const part of daysPart.split(",").map((p) => p.trim())) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((x) => x.trim().slice(0, 2));
      const start = DAY_IDX[a];
      const end = DAY_IDX[b];
      if (start === undefined || end === undefined) continue;
      if (start <= end) {
        if (day >= start && day <= end) return true;
      } else if (day >= start || day <= end) {
        return true; // wraps over the weekend, e.g. Fr-Mo
      }
    } else {
      if (DAY_IDX[part.slice(0, 2)] === day) return true;
    }
  }
  return false;
}

export function getOpenStatus(opening_hours: unknown, now: Date = new Date()): OpenStatus {
  const raw = (opening_hours as { raw?: string } | null)?.raw;
  if (!raw || typeof raw !== "string") return { state: "unknown", text: "" };
  const s = raw.trim();
  if (s === "24/7") return { state: "open", text: "Open 24/7" };

  try {
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();

    for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
      let daysPart = "";
      let timesPart = "";
      const m = rule.match(/^([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/);
      if (m) {
        daysPart = m[1].trim();
        timesPart = m[2].trim();
      } else if (/^\d{1,2}:\d{2}-/.test(rule)) {
        daysPart = "Mo-Su"; // time-only rule applies every day
        timesPart = rule;
      } else {
        continue;
      }

      if (!dayInRange(daysPart, day)) continue;

      for (const tr of timesPart.split(",").map((t) => t.trim())) {
        const tm = tr.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
        if (!tm) continue;
        const start = +tm[1] * 60 + +tm[2];
        let end = +tm[3] * 60 + +tm[4];
        if (end <= start) end += 24 * 60; // closes after midnight
        if (mins >= start && mins < end) {
          return { state: "open", text: "Open now", closesAt: `${tm[3].padStart(2, "0")}:${tm[4]}` };
        }
      }
    }
    return { state: "closed", text: "Closed now" };
  } catch {
    return { state: "unknown", text: "" };
  }
}
