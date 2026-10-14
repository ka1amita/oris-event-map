#!/usr/bin/env node
/* Builds calendar feeds of entry deadlines: one per ORIS region (feeds/region-XX.ics) and one per top level
   group (feeds/level-NC-NP-AL.ics, level-BL-CE.ics, level-BL-MO.ics; no lower levels).
   File names: (level|region)-<code>.ics, the code in plain ASCII, e.g. level-BL-CE.ics or region-VY.ics.

   Each entry deadline (1, 2, 3) of an event in the next CONFIG.months months becomes a calendar entry at the
   entry deadline's time, with an alert CONFIG.alert before it. Entry deadlines already past are left out.
   Titles read "Entry deadline 2/3 · <feed> · <level> · <event> · <place>", with the level codes of the marker badges.
   An event filed under several regions (e.g. "ČR, JČ") is in each of their feeds.
   Stages of a multi-day event carry no entry deadlines in ORIS; their parent does, so it appears once.

   Usage: node scripts/build-feeds.mjs [output directory, default "feeds"]
   Needs Node 18+ (built-in fetch); no dependencies. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = {
  api: "https://oris.ceskyorientak.cz/API/",
  eventUrl: (id) => "https://oris.ceskyorientak.cz/Zavod?id=" + id,
  appUrl: "https://www.matejkala.com/oris-event-map/",
  // UIDs carry no domain, so they stay the same wherever the feeds are hosted:
  // oris-event-map-<ORIS event ID>-entry-deadline-<1|2|3>-<feed>, e.g. oris-event-map-10072-entry-deadline-1-level-nc-np-al
  uidPrefix: "oris-event-map",
  months: 6,
  alert: "-P1D",
  refresh: "PT6H",
  timeZone: "Europe/Prague",
  // ORIS region ID -> two-letter code; IDs not listed are already two letters
  regionCode: { "Č": "ČE", "M": "MO", "P": "PR", "StČ": "SČ", "MSK": "MS" },
  // Level feeds, by the one level ORIS files an event under (as the marker badge codes), never by its name.
  // ORIS gives an event a single level, even when the race counts for several. "Kitl Český pohár, INOV-8 CUP -
  // žebříček A, žebříček B-Morava" (ID 8948) has Level ČP (Český pohár) only; žebříček A and žebříček B-Morava
  // appear just in its name, and ČP + ŽA in RankingKoef ("1,06 (pro ČP+ŽA)"). Its regions "ČR, JM, M" do list
  // the B ladder region (M). ORIS doesn't separate these levels properly for now; until it does, the levels a
  // combined race is filed under (the highest) share a feed, so NC, NP and AL are one feed, and the B ladder is
  // split by region and also takes the higher levels there.
  levelFeeds: [
    { code: "NC-NP-AL", levels: ["NC", "NP", "AL"] },
    { code: "BL-ČE", region: "ČE", levels: ["NC", "NP", "AL", "BL"] },
    { code: "BL-MO", region: "MO", levels: ["NC", "NP", "AL", "BL"] },
  ],
};

/* ---------------- Levels: the same codes as the marker badges ---------------- */
// The level patterns live in the app's CONFIG in index.html; read them from there so the two never drift apart
async function appConfig() {
  const html = await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");
  const start = html.indexOf("const CONFIG = {");
  const end = html.indexOf("\n};\n", start);
  if (start < 0 || end < 0) throw new Error("CONFIG not found in index.html");
  // CONFIG reads location.protocol (to pick map tiles); any value does here
  return new Function("location", html.slice(start, end + 3) + "\nreturn CONFIG;")({ protocol: "https:" });
}
// as classify() in index.html: the ORIS short name first, then patterns on the full names, then the fallback
function levelCode(app, ev) {
  const lvl = ev.Level || {};
  let level = app.levelShort[String(lvl.ShortName || "").trim().toUpperCase()] || null;
  if (!level) for (const [key, re] of app.level) if (re.test([lvl.NameCZ, lvl.NameEN].filter(Boolean).join(" "))) { level = key; break; }
  return level || app.levelFallback;
}

/* ---------------- ORIS ---------------- */
async function oris(method, params) {
  const q = new URLSearchParams(Object.assign({ format: "json", method }, params));
  const res = await fetch(CONFIG.api + "?" + q, { headers: { "User-Agent": "oris-event-map feeds (" + CONFIG.appUrl + ")" } });
  if (!res.ok) throw new Error("ORIS " + method + ": HTTP " + res.status);
  const json = await res.json();
  if (json.Status !== "OK") throw new Error("ORIS " + method + ": " + json.Status);
  return Object.values(json.Data || {});
}

/* ---------------- Regions ---------------- */
const regionCode = (orisId) => CONFIG.regionCode[orisId] || orisId;
// plain ASCII for file names and UIDs: ČR -> CR
const ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function eventRegions(ev) {
  let ids = Object.values(ev.Regions || {}).map((r) => r.ID);
  if (!ids.length) ids = String(ev.Region || "").split(",").map((s) => s.trim());
  return ids.filter(Boolean).map(regionCode);
}

/* ---------------- Feeds: one per region, plus one per top level ---------------- */
// A feed is { kind: "region" | "level", code: "ČR" | "BL-ČE", events: [] }
const feedFile = (f) => f.kind + "-" + ascii(f.code).toUpperCase() + ".ics";
const feedId = (f) => f.kind + "-" + ascii(f.code).toLowerCase();
function eventLevelFeeds(app, ev) {
  const level = levelCode(app, ev), regions = eventRegions(ev);
  return CONFIG.levelFeeds.filter((f) => f.levels.includes(level) && (!f.region || regions.includes(f.region))).map((f) => f.code);
}

/* ---------------- Dates (ORIS times are local Prague time without a zone) ---------------- */
const pad = (n) => String(n).padStart(2, "0");
// "2026-10-20 23:59:59" -> [2026, 10, 20, 23, 59, 59], or null
function parseOris(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?: (\d\d):(\d\d)(?::(\d\d))?)?$/.exec(String(s || "").trim());
  return m ? [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)] : null;
}
// the UTC instant of a Prague wall-clock time
function pragueToDate(p) {
  const guess = Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CONFIG.timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess)).reduce((o, x) => Object.assign(o, { [x.type]: +x.value }), {});
  const offset = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - guess;
  return new Date(guess - offset);
}
const icsLocal = (p) => "" + p[0] + pad(p[1]) + pad(p[2]) + "T" + pad(p[3]) + pad(p[4]) + pad(p[5]);
const icsUtc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const isoDay = (d) => d.toISOString().slice(0, 10);
const czDateTime = (p) => p[2] + ". " + p[1] + ". " + p[0] + " " + p[3] + ":" + pad(p[4]);

/* ---------------- iCalendar ---------------- */
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// lines longer than 75 octets are folded (RFC 5545 3.1), without splitting a UTF-8 character
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Prague",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
const feedNote = (f) => "ORIS map · " + f.kind + " " + f.code + " entry deadline feed. Manage or unsubscribe: " + CONFIG.appUrl + "?calendars";

// one calendar entry per entry deadline of the event that is still ahead
function entryDeadlineEntries(app, ev, feed, now, stamp) {
  const tiers = [1, 2, 3].map((n) => ({ n, p: parseOris(ev["EntryDate" + n]) })).filter((t) => t.p);
  const level = levelCode(app, ev);
  const place = String(ev.Place || "").trim();
  const lines = [];
  tiers.forEach((t, i) => {
    if (pragueToDate(t.p) > now) {
      const title = ["Entry deadline " + (i + 1) + "/" + tiers.length, feed.code, level, ev.Name, place].filter(Boolean).join(" · ");
      const about = [ev.Name, place, "Event day: " + ev.Date, "Entry deadline " + (i + 1) + " of " + tiers.length + " closes " + czDateTime(t.p),
        CONFIG.eventUrl(ev.ID)].filter(Boolean);
      // the feed note is set apart by a blank line
      const desc = about.join("\n") + "\n\n" + feedNote(feed);
      lines.push("BEGIN:VEVENT",
        "UID:" + CONFIG.uidPrefix + "-" + ev.ID + "-entry-deadline-" + t.n + "-" + feedId(feed),
        "DTSTAMP:" + stamp,
        "DTSTART;TZID=" + CONFIG.timeZone + ":" + icsLocal(t.p),
        "SUMMARY:" + esc(title),
        "DESCRIPTION:" + esc(desc),
        "URL:" + CONFIG.eventUrl(ev.ID));
      if (place) lines.push("LOCATION:" + esc(place));
      if (ev.GPSLat && ev.GPSLon && +ev.GPSLat && +ev.GPSLon) lines.push("GEO:" + (+ev.GPSLat) + ";" + (+ev.GPSLon));
      lines.push("TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + CONFIG.alert, "DESCRIPTION:" + esc(title), "END:VALARM",
        "END:VEVENT");
    }
  });
  return lines;
}

function calendar(app, feed, now) {
  const stamp = icsUtc(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//matejkala.com//ORIS map entry deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc("ORIS " + feed.code + " entry deadlines"),
    "X-WR-CALDESC:" + esc(feedNote(feed)),
    "X-WR-TIMEZONE:" + CONFIG.timeZone,
    "REFRESH-INTERVAL;VALUE=DURATION:" + CONFIG.refresh,
    "X-PUBLISHED-TTL:" + CONFIG.refresh,
    ...VTIMEZONE];
  feed.events.forEach((ev) => lines.push(...entryDeadlineEntries(app, ev, feed, now, stamp)));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ---------------- Main ---------------- */
async function main() {
  const outDir = process.argv[2] || "feeds";
  const app = await appConfig();
  const now = new Date();
  const to = new Date(now);
  to.setUTCMonth(to.getUTCMonth() + CONFIG.months);

  const regions = (await oris("getList", { list: "region" })).map((r) => regionCode(r.ID));
  const list = await oris("getEventList", { all: 1, datefrom: isoDay(now), dateto: isoDay(to) });
  const live = list.filter((ev) => String(ev.Cancelled) !== "1");

  // every feed is written, also an empty one, so a subscription never breaks
  const levels = CONFIG.levelFeeds.map((f) => f.code);
  const feeds = new Map([...regions.map((code) => ["region|" + code, { kind: "region", code, events: [] }]),
    ...levels.map((code) => ["level|" + code, { kind: "level", code, events: [] }])]);
  const add = (kind, code, ev) => {
    if (!feeds.has(kind + "|" + code)) feeds.set(kind + "|" + code, { kind, code, events: [] });
    feeds.get(kind + "|" + code).events.push(ev);
  };
  live.forEach((ev) => {
    eventRegions(ev).forEach((code) => add("region", code, ev));
    eventLevelFeeds(app, ev).forEach((code) => add("level", code, ev));
  });

  await mkdir(outDir, { recursive: true });
  for (const feed of feeds.values()) {
    feed.events.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    const ics = calendar(app, feed, now);
    await writeFile(join(outDir, feedFile(feed)), ics);
    console.log(feedFile(feed) + ": " + (ics.match(/^BEGIN:VEVENT/gm) || []).length + " entry deadlines from " + feed.events.length + " events");
  }
  const noRegion = live.filter((ev) => !eventRegions(ev).length);
  if (noRegion.length) console.log("Events without a region (in no feed): " + noRegion.map((ev) => ev.ID).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
