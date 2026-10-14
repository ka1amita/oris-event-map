# ORIS map

A map of Czech orienteering events from [ORIS](https://oris.ceskyorientak.cz/), with the context the ORIS map view leaves out: format, level, sport, night, relay, services, entry deadlines, and whether you and your group are entered.

Static page, no build step. Data comes live from the public ORIS API (JSONP, as ORIS documents for cross-domain use). Map tiles from OpenStreetMap, map library Leaflet.

## Files

```
index.html               the whole app (HTML, CSS, JS)
icon.png                 Home Screen icon
scripts/build-feeds.mjs  builds the entry deadline calendar feeds (Node, no dependencies)
.github/workflows/       deploy.yml: deploys the app and the feeds to the gh-pages branch
README.md
```

## Deploy on GitHub Pages

GitHub Pages serves the `gh-pages` branch, which the *Deploy* workflow (`.github/workflows/deploy.yml`) writes; never edit it by hand. A push to `main` deploys nothing: test on `main`, then deploy.

- **Deploy the app:** Actions → Deploy → Run workflow (*app and feeds*), or `gh workflow run deploy.yml`. It publishes the app files from `main` and freshly built feeds.
- **Feeds** are rebuilt and published every 6 hours; the app files on `gh-pages` stay as they are. These runs use the feed script (and the level mapping in `index.html`) from `main`, so a change to them goes live with the next feed run, without a deploy. Run the script locally before pushing such a change (see below); a broken run fails and leaves the last good feeds online.
- **Checks:** the deploy fails when a file tracked on `main` is neither in the `DEPLOY` list (`index.html`, `icon.png`, `README.md`) nor matches `NOT_DEPLOYED` (`scripts/`, `.github/`) in `deploy.yml`, so add new files to one of them. It also fails when the page's script doesn't parse, a required feed is missing or incomplete, or a feed now on `gh-pages` would be removed (allowed only by hand, with *Allow removing feeds*, as it breaks its subscriptions).

Setting up a new copy: create a public repo, push `main`, run the workflow by hand once (it creates `gh-pages`), then Settings → Pages → *Deploy from a branch* → `gh-pages` / `(root)`.

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

Picking with the pill writes words; editing ranges writes dates.

`#calendars` (the link in every entry of the calendar feeds) opens the entry deadline reminders dialog; it's a fragment, not a parameter, as it opens a part of the page rather than setting the map view. The app then drops it from the URL.

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
- **Calendar**: what "Add to calendar" on the detail card does. It adds the event as one all-day calendar event (name, place, ORIS link) and is a one-time import, not a subscription. A stage of a multi-day event (E1, E2, …) is its own day; the multi-day event itself spans from its first to its last stage (ORIS keeps no last day, so the app looks up the stages' dates). "Calendar file" opens an `.ics` file: on a desktop the page makes it, and it downloads and opens in Apple Calendar, Outlook or another calendar app. iPhone and iPad open a calendar file only from a real address, so there the button links to the event's file published with the feeds (`feeds/events/<ORIS event ID>.ics`, for events in the next 6 months, updated every 6 hours); for an event without one (further out, or added to ORIS in the last few hours) it offers Google Calendar instead. "Google Calendar" opens a prefilled Google Calendar event. "Phone default" is Google Calendar on Android, which can't open a calendar file into Google Calendar, and a calendar file elsewhere. The same setting decides how "Subscribe" works in the entry deadline reminders.
- **Entry deadline reminders** (*Subscribe in your calendar…*): lists the calendar feeds of entry deadlines (see below), the top levels and every region, sorted by code, with your club's region highlighted (found in ORIS from your registration IDs). *Subscribe* opens a `webcal://` link, which iPhone, iPad and Mac hand to Calendar, or with the Google setting Google Calendar's "add by URL"; the copy button copies the feed's address for other apps.

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

`scripts/build-feeds.mjs` builds calendar feeds (`.ics`) that remind you of entry deadlines. Subscribe to the ones you want in your phone's calendar app, from Settings → *Subscribe in your calendar…* in the app, or by their addresses, e.g. `https://www.matejkala.com/oris-event-map/feeds/level-NC-NP-AL.ics`.

- **Feeds:** `(level|region)-<code>.ics`, the code in plain ASCII, e.g. `region-VY.ics` or `level-BL-CE.ics`.
  - One per ORIS region: `region-CR` (national), `region-CE` (Čechy), `region-MO` (Morava), and the regional areas (`region-PR`, `region-SC`, `region-HA`, …). An event filed under several regions is in each of their feeds. Region feeds hold every level, including trainings and other events.
  - One per top level group: `level-NC-NP-AL` (national championship, national cup, A ladder), `level-BL-CE` and `level-BL-MO` (B ladder Čechy and Morava). No lower levels.
- **Entries:** one per entry deadline (1, 2, 3) that is still ahead, in the next 6 months, at the deadline's time (ORIS times are Prague time), with an alert 1 day before. Title: `Entry deadline 2/3 · <feed> · <level> · <event> · <place>`, with the level codes of the markers; the description has the ORIS link and how to unsubscribe.
- **Multi-day events** appear once: ORIS keeps the entry deadlines on the parent event, not on its stages.
- **Unsubscribe:** on iPhone, Settings → Apps → Calendar → Calendar Accounts → Subscribed Calendars → the feed → Delete Account; in Google Calendar, the calendar's options → Settings → Unsubscribe.

It also writes one calendar file per event in its range, `feeds/events/<ORIS event ID>.ics`, used by "Add to calendar" on iPhone and iPad (no feed: these come and go with the events).

Run it with `node scripts/build-feeds.mjs [--debug] [output directory]` (default `feeds`). `--debug` logs each event: its ORIS level and badge code, regions, entry deadlines and feeds.

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
