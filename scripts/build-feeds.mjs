#!/usr/bin/env node
/* Builds calendar feeds of entry deadlines: one per ORIS region (feeds/region-XX.ics), one per top level
   group (feeds/level-NC-NP-AL.ics, level-BL-CE.ics, level-BL-MO.ics; no lower levels) and one per secondary source
   that publishes entry deadlines (feeds/source-OL.ics). Also writes one calendar file per event
   (feeds/events/<event ID>.ics) for "Add to calendar" on iPhone and iPad.
   File names: (level|region|source)-<code>.ics, the code in plain ASCII, e.g. level-BL-CE.ics or region-VY.ics.

   ORIS is the primary source. The secondary sources (CONFIG.sources in index.html: O-liga) are web pages a browser
   can't read from another site, so their adapters run here and publish the events in the shape of ORIS events as
   feeds/sources.json, which the app loads. A secondary source gives only its native events: the ones it doesn't
   take over from elsewhere.

   Each entry deadline (1, 2, 3) of an event in the next CONFIG.months months becomes a calendar entry at the
   entry deadline's time, with an alert CONFIG.alert before it. Entry deadlines already past are left out.
   Titles read "Entry deadline 2/3 · <feed> · <level> · <event> · <place>", with the level codes of the marker badges.
   An event filed under several regions (e.g. "ČR, JČ") is in each of their feeds.
   Stages of a multi-day event carry no entry deadlines in ORIS; their parent does, so it appears once.

   Usage: node scripts/build-feeds.mjs [--debug] [output directory, default "feeds"]
   --debug logs each event: ORIS level and its badge code, regions, entry deadlines and the feeds it is in.
   Needs Node 18+ (built-in fetch); no dependencies. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = {
  api: "https://oris.ceskyorientak.cz/API/",
  // an event of a secondary source carries its own address
  eventUrl: (ev) => ev.Url || "https://oris.ceskyorientak.cz/Zavod?id=" + ev.ID,
  appUrl: "https://www.matejkala.com/oris-event-map/",
  // UIDs carry no domain, so they stay the same wherever the feeds are hosted:
  // oris-event-map-<ORIS event ID>-entry-deadline-<1|2|3>-<feed>, e.g. oris-event-map-10072-entry-deadline-1-level-nc-np-al
  uidPrefix: "oris-event-map",
  months: 6,
  alert: "-P1D",
  refresh: "PT6H",
  timeZone: "Europe/Prague",
  userAgent: "oris-event-map feeds (https://www.matejkala.com/oris-event-map/)",
  oliga: { home: "https://o-liga.cz/" },
  // the level feeds (levelFeeds) are defined in the app's CONFIG
};

/* ---------------- Code shared with the app ---------------- */
// The level patterns (CONFIG) and the calendar file helpers (ICS) live in index.html; read them from there so the
// feeds and the app never drift apart
async function appBlocks() {
  const html = await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");
  const block = (name) => {
    const start = html.indexOf("const " + name + " = {");
    const end = html.indexOf("\n};\n", start);
    if (start < 0 || end < 0) throw new Error(name + " not found in index.html");
    return html.slice(start, end + 3);
  };
  // CONFIG reads location.protocol (to pick map tiles); any value does here
  return new Function("location", block("CONFIG") + "\n" + block("ICS") + "\nreturn { app: CONFIG, ics: ICS };")({ protocol: "https:" });
}
let APP = null, ICS = null;   // CONFIG and ICS from index.html, set in main()

/* ---------------- Levels: the same codes as the marker badges ---------------- */
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
  const res = await fetch(CONFIG.api + "?" + q, { headers: { "User-Agent": CONFIG.userAgent } });
  if (!res.ok) throw new Error("ORIS " + method + ": HTTP " + res.status);
  const json = await res.json();
  if (json.Status !== "OK") throw new Error("ORIS " + method + ": " + json.Status);
  return Object.values(json.Data || {});
}

/* ---------------- Secondary sources: one adapter each ----------------
   An adapter reads its source's page and returns the source's native events from the given day on, in the shape of
   ORIS events (the fields the app and the feeds read), plus:
     ID      "<source>-…", never a number, so it can't collide with an ORIS event ID
     Source  the source's code in CONFIG.sources of index.html
     Url     the event's page (the organizer's, or the source's when the event has none)
   The sources list trainings, hence the level; UseORISForEntries = 0 keeps the app from asking ORIS about entries. */
const sourceEvent = (source, id, fields) => Object.assign({ ID: id, Source: source, Sport: { ID: "1" },
  Level: { ShortName: "", NameCZ: "trénink", NameEN: "training" }, Cancelled: "0", UseORISForEntries: "0" }, fields);

async function pageText(url) {
  const res = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
  if (!res.ok) throw new Error(url + ": HTTP " + res.status);
  return res.text();
}
const ENTITY = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const plainText = (html) => html.replace(/<[^>]*>/g, " ").replace(/&(#\d+|[a-z]+);/gi, (all, name) =>
  name[0] === "#" ? String.fromCodePoint(+name.slice(1)) : (ENTITY[name.toLowerCase()] ?? all)).replace(/\s+/g, " ").trim();
const tableCells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
const firstLink = (html) => (/href\s*=\s*"([^"]+)"/i.exec(html) || [])[1] || "";
// "28.11.2026" -> "2026-11-28", or null
function czechDay(text) {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text);
  return m ? m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]) : null;
}

/* O-liga: the table on o-liga.cz, columns #, Datum, Den, Místo, Kde, Mapa, Pokyny, …, Poznámka. Native = Místo carries
   the key "O-liga #<number>" (other rows are events taken over from elsewhere, e.g. PZL). Kde is a Mapy.com short
   link that redirects to an address with the coordinates; the entry deadline is on the event's page. */
async function oligaEvents(fromDay) {
  const home = await pageText(CONFIG.oliga.home);
  const rows = home.split(/<tr[\s>]/i).slice(1).map(tableCells).filter((cells) => cells.length >= 12 && czechDay(plainText(cells[1])));
  if (!rows.length) throw new Error("O-liga: no event rows in " + CONFIG.oliga.home);
  const events = new Map();   // the page shows the next event in a table of its own as well
  for (const cells of rows) {
    const day = czechDay(plainText(cells[1]));
    const key = /O-liga #(\d+)/.exec(plainText(cells[3]));
    if (key && day >= fromDay && !events.has(key[1])) {
      const id = day.slice(0, 4) + "-" + key[1];
      // the event's own page; Pokyny links to it, or to an older article with the instructions
      const page = new URL("/event/" + id + "/info", CONFIG.oliga.home).href;
      const url = new URL(firstLink(cells[6]) || page, CONFIG.oliga.home).href;
      const place = plainText(cells[3].replace(/O-liga #\d+/, ""));
      events.set(key[1], sourceEvent("OL", "oliga-" + id, Object.assign({ Name: "O-liga #" + key[1], Date: day, Place: place,
        Map: plainText(cells[5]), Org1: { Abbr: "O-liga" }, Discipline: { NameCZ: plainText(cells[11]) }, Url: url },
        await mapyCoordinates(firstLink(cells[4])), await oligaEntryDeadline(page))));
    }
  }
  return [...events.values()];
}
// mapy.com/s/<code> redirects to …?x=<longitude>&y=<latitude>&…
async function mapyCoordinates(link) {
  let found = {};
  if (/\/\/mapy\.com\/s\//.test(link)) {
    try {
      const res = await fetch(link, { redirect: "manual", headers: { "User-Agent": CONFIG.userAgent } });
      const to = new URL(res.headers.get("location") || "", link).searchParams;
      if (+to.get("x") && +to.get("y")) found = { GPSLat: to.get("y"), GPSLon: to.get("x") };
    } catch (e) { console.log("::warning::O-liga: no coordinates from " + link + " (" + e.message + ")"); }
  }
  return found;
}
// "Uzávěrka přihlášek … 09. 11. 2026 18:00" on the event's own page
async function oligaEntryDeadline(page) {
  let found = {};
  try {
    const text = plainText(await pageText(page));
    const m = /Uzávěrka přihlášek\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d\d)/.exec(text);
    if (m) found = { EntryDate1: m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]) + " " + pad(+m[4]) + ":" + m[5] + ":00" };
  } catch (e) { console.log("::warning::O-liga: no entry deadline from " + page + " (" + e.message + ")"); }
  return found;
}

const ADAPTERS = { OL: oligaEvents };
// The native events of every secondary source. A source that fails (its site is down, its page changed) is left out
// with a warning; ORIS feeds are built all the same.
async function secondaryEvents(fromDay, debug) {
  const all = [];
  for (const source of APP.sources) {
    try {
      const events = await ADAPTERS[source.code](fromDay);
      all.push(...events);
      console.log("Source " + source.code + ": " + events.length + " native events");
      if (debug) events.forEach((ev) => console.log(ev.ID + " " + ev.Date + " " + ev.Name + " | " + (ev.Place || "-") +
        " | " + (ev.GPSLat ? ev.GPSLat + "," + ev.GPSLon : "no coordinates") + " | entry deadline " + (ev.EntryDate1 || "-") + " | " + ev.Url));
    } catch (e) {
      console.log("::warning::Source " + source.code + " failed and is left out: " + e.message);
    }
  }
  return all;
}

/* ---------------- Regions ---------------- */
// ORIS region ID -> two-letter code, from the app's CONFIG
const regionCode = (orisId) => APP.regionCode[orisId] || orisId;
// plain ASCII for file names and UIDs: ČR -> CR
const ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function eventRegions(ev) {
  let ids = Object.values(ev.Regions || {}).map((r) => r.ID);
  if (!ids.length) ids = String(ev.Region || "").split(",").map((s) => s.trim());
  return ids.filter(Boolean).map(regionCode);
}

/* ---------------- Feeds: one per region, plus one per top level ---------------- */
// A feed is { kind: "region" | "level" | "source", code: "ČR" | "BL-ČE" | "OL", events: [] }
const feedFile = (f) => f.kind + "-" + ascii(f.code).toUpperCase() + ".ics";
const feedId = (f) => f.kind + "-" + ascii(f.code).toLowerCase();
function eventLevelFeeds(app, ev) {
  const level = levelCode(app, ev), regions = eventRegions(ev);
  return APP.levelFeeds.filter((f) => f.levels.includes(level) && (!f.region || regions.includes(f.region))).map((f) => f.code);
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

/* ---------------- iCalendar (escaping, folding and location come from ICS in index.html) ---------------- */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Prague",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
const feedNote = (f) => "ORIS map · " + f.kind + " " + f.code + " entry deadline feed. Manage or unsubscribe: " + CONFIG.appUrl + "#calendars";
// the calendar's name: a source feed goes by the source's name
const feedName = (f) => (f.kind === "source" ? APP.sources.find((s) => s.code === f.code).name : "ORIS " + f.code) + " entry deadlines";

// one calendar entry per entry deadline of the event that is still ahead
function entryDeadlineEntries(app, ev, feed, now, stamp) {
  const tiers = [1, 2, 3].map((n) => ({ n, raw: String(ev["EntryDate" + n] || "").trim(), p: parseOris(ev["EntryDate" + n]) })).filter((t) => t.p);
  const level = levelCode(app, ev);
  const place = String(ev.Place || "").trim();
  const lines = [];
  tiers.forEach((t, i) => {
    if (pragueToDate(t.p) > now) {
      const title = ["Entry deadline " + (i + 1) + "/" + tiers.length, feed.code, level, ev.Name, place].filter(Boolean).join(" · ");
      const about = [ev.Name, place, "Event day: " + ev.Date, "Entry deadline " + (i + 1) + " of " + tiers.length + " closes " + t.raw,
        CONFIG.eventUrl(ev)].filter(Boolean);
      // the feed note is set apart by a blank line
      const desc = about.join("\n") + "\n\n" + feedNote(feed);
      lines.push("BEGIN:VEVENT",
        "UID:" + CONFIG.uidPrefix + "-" + ev.ID + "-entry-deadline-" + t.n + "-" + feedId(feed),
        "DTSTAMP:" + stamp,
        "DTSTART;TZID=" + CONFIG.timeZone + ":" + icsLocal(t.p),
        "SUMMARY:" + ICS.esc(title),
        "DESCRIPTION:" + ICS.esc(desc),
        "URL:" + CONFIG.eventUrl(ev));
      lines.push(...ICS.location(place, +ev.GPSLat, +ev.GPSLon),
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + CONFIG.alert, "DESCRIPTION:" + ICS.esc(title), "END:VALARM",
        "END:VEVENT");
    }
  });
  return lines;
}

function calendar(app, feed, now) {
  const stamp = icsUtc(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//oris-event-map//ORIS map entry deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + ICS.esc(feedName(feed)),
    "X-WR-CALDESC:" + ICS.esc(feedNote(feed)),
    "X-WR-TIMEZONE:" + CONFIG.timeZone,
    "REFRESH-INTERVAL;VALUE=DURATION:" + CONFIG.refresh,
    "X-PUBLISHED-TTL:" + CONFIG.refresh,
    ...VTIMEZONE];
  feed.events.forEach((ev) => lines.push(...entryDeadlineEntries(app, ev, feed, now, stamp)));
  lines.push("END:VCALENDAR");
  return ICS.text(lines);
}

/* ---------------- Main ---------------- */
async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const outDir = args.find((a) => !a.startsWith("--")) || "feeds";
  const shared = await appBlocks();
  const app = shared.app;
  APP = shared.app;
  ICS = shared.ics;
  const now = new Date();
  const to = new Date(now);
  to.setUTCMonth(to.getUTCMonth() + CONFIG.months);

  const regions = (await oris("getList", { list: "region" })).map((r) => regionCode(r.ID));
  const list = await oris("getEventList", { all: 1, datefrom: isoDay(now), dateto: isoDay(to) });
  const live = list.filter((ev) => String(ev.Cancelled) !== "1");
  const secondary = await secondaryEvents(isoDay(now), debug);

  // every feed is written, also an empty one, so a subscription never breaks
  const levels = APP.levelFeeds.map((f) => f.code);
  const sources = APP.sources.filter((s) => s.feed).map((s) => s.code);
  const feeds = new Map([...regions.map((code) => ["region|" + code, { kind: "region", code, events: [] }]),
    ...levels.map((code) => ["level|" + code, { kind: "level", code, events: [] }]),
    ...sources.map((code) => ["source|" + code, { kind: "source", code, events: [] }])]);
  const add = (kind, code, ev) => {
    if (!feeds.has(kind + "|" + code)) feeds.set(kind + "|" + code, { kind, code, events: [] });
    feeds.get(kind + "|" + code).events.push(ev);
  };
  live.forEach((ev) => {
    const regions = eventRegions(ev), levels = eventLevelFeeds(app, ev);
    regions.forEach((code) => add("region", code, ev));
    levels.forEach((code) => add("level", code, ev));
    if (debug) {
      const files = [...regions.map((code) => ({ kind: "region", code })), ...levels.map((code) => ({ kind: "level", code }))].map(feedId);
      const deadlines = [1, 2, 3].map((n) => ev["EntryDate" + n]).filter(Boolean);
      console.log(ev.ID + " " + ev.Name + " | ORIS level " + ((ev.Level || {}).ShortName || "-") + " → " + levelCode(app, ev) +
        " | regions " + (regions.join(", ") || "-") + " | entry deadlines " + (deadlines.join(", ") || "-") + " | feeds " + (files.join(", ") || "-"));
    }
  });

  secondary.filter((ev) => sources.includes(ev.Source)).forEach((ev) => add("source", ev.Source, ev));

  await mkdir(outDir, { recursive: true });
  // the events of the secondary sources, for the app
  await writeFile(join(outDir, "sources.json"), JSON.stringify({ events: secondary }));
  for (const feed of feeds.values()) {
    feed.events.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    const ics = calendar(app, feed, now);
    await writeFile(join(outDir, feedFile(feed)), ics);
    console.log(feedFile(feed) + ": " + (ics.match(/^BEGIN:VEVENT/gm) || []).length + " entry deadlines from " + feed.events.length + " events");
  }

  // one calendar file per event, for "Add to calendar" on iPhone and iPad, which open a calendar file only from a real
  // address: feeds/events/<event ID>.ics. A multi-day event spans to its last stage (stages carry its ParentID).
  const lastStage = new Map();
  live.forEach((ev) => {
    const parent = String(ev.ParentID || "0"), day = String(ev.Date).slice(0, 10);
    if (parent !== "0" && day > (lastStage.get(parent) || "")) lastStage.set(parent, day);
  });
  await mkdir(join(outDir, "events"), { recursive: true });
  for (const ev of live.concat(secondary)) {
    const first = String(ev.Date).slice(0, 10);
    const last = lastStage.get(String(ev.ID)) > first ? lastStage.get(String(ev.ID)) : first;
    await writeFile(join(outDir, "events", ev.ID + ".ics"), ICS.event({ id: String(ev.ID), name: ev.Name, place: String(ev.Place || "").trim(),
      lat: +ev.GPSLat, lon: +ev.GPSLon, url: CONFIG.eventUrl(ev), first, last }));
  }
  console.log("events/: " + (live.length + secondary.length) + " event files");

  const noRegion = live.filter((ev) => !eventRegions(ev).length);
  if (noRegion.length) console.log("Events without a region (in no feed): " + noRegion.map((ev) => ev.ID).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
