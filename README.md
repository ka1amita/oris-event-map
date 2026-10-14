# ORIS map

A map of Czech orienteering events from [ORIS](https://oris.ceskyorientak.cz/), with the context the ORIS map view leaves out: format, level, sport, night, relay, services, entry deadlines, and whether you and your group are entered.

Static page, no build step. Data comes live from the public ORIS API (JSONP, as ORIS documents for cross-domain use). Map tiles from OpenStreetMap, map library Leaflet.

## Files

```
index.html               the whole app (HTML, CSS, JS)
icon.png                 Home Screen icon
scripts/build-feeds.mjs  builds the entry deadline calendar feeds (Node, no dependencies)
README.md
```

## Deploy on GitHub Pages

1. Create a public repo, e.g. `oris-map`, and add the files at the root.
2. Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<username>.github.io/oris-map/`.

## Choosing dates

The pill **This | Next | work | week | end** reads as a phrase; the lit words are the selection:

| Lit words | Days |
|---|---|
| this week | today to Sunday |
| next week | Monday to Sunday of next week |
| this next week | today to next Sunday |
| this work week / next work week | Monday to Friday only |
| this week end / this next week end | Saturday and Sunday only |

Tap the date line in the header to see and edit all ranges. Each range has From and To; **Add range** adds an empty row that joins the selection once both dates are picked. When there are several ranges, the header shows the first one and a "+N" badge. Edited dates that match a pill combination light it up. Up to 62 days in total.

## URL

One parameter, `days`:

- Words, relative to today: `?days=next-week`, `?days=this-next-work-week`, `?days=this-next-week-end`. No parameter means this week.
- Fixed dates, `from..to`, ranges separated by commas: `?days=2026-10-12..2026-10-18` or `?days=2026-10-17..2026-10-18,2026-10-24..2026-10-25`. A single day is `2026-10-17..2026-10-17`.

Picking with the pill writes words; editing ranges writes dates. Older links with `?range=` or `?from=&to=` still work.

## Home Screen

Words stay relative, so use them for Home Screen icons (Safari → Share → **Add to Home Screen**):

- This week: `https://<site>/oris-event-map/`
- Next week: `https://<site>/oris-event-map/?days=next-week`
- Both weekends: `https://<site>/oris-event-map/?days=this-next-week-end`

A link with fixed dates keeps showing those dates.

## Settings

Tap the gear and enter your registration IDs (several are fine, e.g. if you enter for family) and optionally your group's (e.g. friends). The club comes from the letters at the start of each ID (ABC1234 → club ABC), so there is nothing else to set. With no group IDs, the group is everyone from the club(s) of your own IDs. Everything is stored only in your browser.

Without a club, enter your SI IDs instead. Unregistered runners get a one-off registration ID per event (e.g. 0270001: one-off club 027, member 0001), which changes every time, so such IDs are flagged in the settings and ignored. Your entries are found by SI ID in each event's full entry list.

- **Entered (orange marker, check)**: one of your registration IDs or SI IDs is entered.
- **Group badge**: number of entries from your group, or from your whole club if the group is empty.
- **Entered** and **Free** filters appear once a club registration ID or an SI ID is set. Entered shows only events you are entered in; Free hides other events on days you already have one (your own stay visible).
- **Navigation app**: what "Open in Maps" on the detail card opens, with the event location as the destination. "Phone default" uses Apple Maps on iPhone, iPad and Mac, the system chooser (`geo:` link) on Android, and Google Maps on the web elsewhere. Google Maps, Mapy.com and Waze can be picked explicitly; their links open the app when it is installed.

## Marker encoding

| Element | Meaning |
|---|---|
| Disc color and letter | Format: S sprint (red), M middle (blue), L long (green), + other (gray) |
| Badge, top right | Level code: NC national championship, NP national cup, AL A ladder, BL B ladder, RC regional championship, RL regional ladder, OP other public, NN non-competition. Fill from black (NC, NP) through dark gray (AL, BL) and light gray (RC, RL) to white (OP, NN) |
| Badge, top left | Sport: shoe, bike, ski, trail |
| Badges, top edge | Services (bed = accommodation, fork and knife = meals; orange = you ordered it), then a moon for night events |
| Badge, bottom left | Relay or team |
| Badge, bottom right | Entries from your group |
| Dots | Current entry deadline (1–3). Clock and empty dots = not open yet. Lock = closed |
| Orange marker | You are entered |

Zoomed out, markers shrink to dots: the ring is the format color (orange when you are entered; the letter still gives the format), the center the level fill. Zoom in to see the full markers.

## Calendar feeds of entry deadlines

`scripts/build-feeds.mjs` builds calendar feeds (`.ics`) that remind you of entry deadlines. Subscribe to the ones you want in your phone's calendar app.

- **Feeds:** `(level|region)-<code>.ics`, the code in plain ASCII, e.g. `region-VY.ics` or `level-BL-CE.ics`.
  - One per ORIS region: `region-CR` (national), `region-CE` (Čechy), `region-MO` (Morava), and the regional areas (`region-PR`, `region-SC`, `region-HA`, …). An event filed under several regions is in each of their feeds. Region feeds hold every level, including trainings and other events.
  - One per top level group: `level-NC-NP-AL` (national championship, national cup, A ladder), `level-BL-CE` and `level-BL-MO` (B ladder Čechy and Morava). No lower levels.
- **Entries:** one per entry deadline (1, 2, 3) that is still ahead, in the next 6 months, at the deadline's time (ORIS times are Prague time), with an alert 1 day before. Title: `Entry deadline 2/3 · <feed> · <level> · <event> · <place>`, with the level codes of the markers; the description has the ORIS link and how to unsubscribe.
- **Multi-day events** appear once: ORIS keeps the entry deadlines on the parent event, not on its stages.
- **Unsubscribe:** on iPhone, Settings → Apps → Calendar → Calendar Accounts → Subscribed Calendars → the feed → Delete Account; in Google Calendar, the calendar's options → Settings → Unsubscribe.

Run it with `node scripts/build-feeds.mjs [output directory]` (default `feeds`).

### Levels of combined races

ORIS files every event under a single level, even a race that counts for several. "Kitl Český pohár, INOV-8 CUP - žebříček A, žebříček B-Morava" (ORIS ID 8948) has level ČP (Český pohár) only. The A ladder and the B ladder (Morava) appear only in its name, and ČP + ŽA in `RankingKoef` ("1,06 (pro ČP+ŽA)"). Its regions, "ČR, JM, M", do include M, the B ladder Morava region.

ORIS doesn't keep these levels apart for now, and the feeds never parse event names. So the levels a combined race can be filed under share one feed (`level-NC-NP-AL`), and the B ladder feeds are split by region and also take the higher levels in it.

## Tuning the mapping

ORIS returns disciplines, levels and services as names. The patterns that map them to the encoding are in the `CONFIG` block at the top of the script in `index.html`. Open the page with `?debug=1` and check the browser console: each event logs its discipline, level and service names, so you can adjust the patterns.

## Data used

| Method | Used for |
|---|---|
| `getEventList` | Events in the date range (with `all=1`; cancelled events are hidden) |
| `getEvent` | Entry start and deadlines, services, start list and results counts, stages |
| `getEventEntries` (with `clubid`) | Your and your group's entries, per club taken from the registration IDs |
| `getEventEntries` (without `clubid`) | Entries without a club, matched by SI ID; only when an SI ID is set |
| `getEventServiceEntries` (with `clubid`) | Services you ordered, for your own club(s) or the one-off club of your entry without a club |

## Caching

Data is kept in the browser (localStorage), so changing dates or filters is instant and the Home Screen app opens with the last known data.

- **Event lists are stored per day.** A new date range only fetches the days that aren't stored yet or are older than 6 hours.
- **Event details** are refetched when ORIS reports a new version of the event (every list fetch carries the version), or after 7 days.
- **Your club's entries and service orders** expire after 30 minutes, since they change most often.
- **Full entry lists** (only with an SI ID set) are heavy for ORIS, so they are fetched one at a time, 1.5 s apart, nearest events first, at most 120 per hour (also across reloads and refreshes). Events that don't take entries in ORIS are skipped, except stages of a multi-day event (E1, E2, …): ORIS marks those as not taking entries, as their entries go through the parent event, but each stage still has its own entry list. A stage without its own entry start and deadlines shows its parent's. Lists expire after 30 minutes for events within 14 days, 12 hours for later ones. Events not reached within the hourly cap show "Entries not checked yet for all SI IDs" and are checked on a later load.
- **Refresh from ORIS** on the event card refetches that event's entries and service orders right away, e.g. right after you entered. It skips the hourly cap (it is one request you ask for), but counts toward it.
- **Filters** (open for entry, entered) never fetch anything; they filter what is already loaded.
- **Refresh button** (circular arrow): forgets all saved ORIS data and loads the current dates fresh. Your settings (registration IDs, SI IDs, navigation app) stay.

Past days are dropped automatically. The durations are in `CONFIG.ttl`.
