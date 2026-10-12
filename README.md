# ORIS map

A map of Czech orienteering events from [ORIS](https://oris.ceskyorientak.cz/), with the context the ORIS map view leaves out: format, level, sport, night, relay, services, entry deadlines, and whether you and your group are entered.

Static page, no build step. Data comes live from the public ORIS API (JSONP, as ORIS documents for cross-domain use). Map tiles from OpenStreetMap, map library Leaflet.

## Files

```
index.html   the whole app (HTML, CSS, JS)
icon.png     Home Screen icon
README.md
```

## Deploy on GitHub Pages

1. Create a public repo, e.g. `oris-map`, and add the files at the root.
2. Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<username>.github.io/oris-map/`.

## Home Screen

The page no longer redirects, so Safari → Share → **Add to Home Screen** works directly.

- This week (today to Sunday): `https://<username>.github.io/oris-map/`
- Next week (Monday to Sunday): `https://<username>.github.io/oris-map/?range=next`
- Both weeks (today to next Sunday): `https://<username>.github.io/oris-map/?range=both`

## Dates

"This week" and "Next week" can be switched on together to span both. The From and To fields show the current range and accept any dates (up to 62 days, to keep the number of ORIS requests reasonable). Week presets stay relative in the URL; custom dates are saved as fixed `?from=…&to=…`.

## Settings

Tap the gear and enter your club (abbreviation or ORIS ID), your registration numbers, and optionally your group's. They are stored only in your browser (localStorage), never in the repo.

- **Entered (orange marker, check)**: one of your registration numbers is entered.
- **Group badge**: number of entries from your group, or from the whole club if the group is empty.
- **Navigation app**: what "Open in Maps" on the detail card opens, with the race location as the destination. "Phone default" uses Apple Maps on iPhone, iPad and Mac, the system chooser (`geo:` link) on Android, and Google Maps on the web elsewhere. Google Maps, Mapy.com and Waze can be picked explicitly; their links open the app when it is installed.

## Marker encoding

| Element | Meaning |
|---|---|
| Disc color and letter | Format: S sprint (yellow), M middle (blue), L long (green), + other (gray) |
| Border | Level: white unofficial, thin gray regional, bronze national ranking, thick gold championship |
| Badge, top left | Sport: shoe, bike, ski, trail |
| Badges, top edge | Services: bed = accommodation, fork and knife = meals. Orange background = you ordered it |
| Badge, top right | Night race |
| Badge, bottom left | Relay or team |
| Badge, bottom right | Entries from your group |
| Dots | Current entry deadline (1–3). Clock and empty dots = not open yet. Lock = closed |
| Orange marker | You are entered |

Zoomed out, markers shrink to colored dots. Zoom in to see the full markers.

## Tuning the mapping

ORIS returns disciplines, levels and services as names. The patterns that map them to the encoding are in the `CONFIG` block at the top of the script in `index.html`. Open the page with `?debug=1` and check the browser console: each event logs its discipline, level and service names, so you can adjust the patterns.

## Data used

| Method | Used for |
|---|---|
| `getEventList` | Events in the date range (with `all=1`; cancelled events are hidden) |
| `getEvent` | Entry start and deadlines, services, start list and results counts, stages |
| `getEventEntries` (with `clubid`) | Your and your group's entries; only when a club is set |
| `getEventServiceEntries` (with `clubid`) | Services you ordered; only when a club and your registration numbers are set |

## Caching

Data is kept in the browser (localStorage), so changing dates or filters is instant and the Home Screen app opens with the last known data.

- **Event lists are stored per day.** A new date range only fetches the days that aren't stored yet or are older than 6 hours.
- **Event details** are refetched when ORIS reports a new version of the event (every list fetch carries the version), or after 7 days.
- **Your club's entries and service orders** expire after 30 minutes, since they change most often.
- **Filters** (open for entry, entered) never fetch anything; they filter what is already loaded.
- **Refresh button** (circular arrow): forgets all saved ORIS data and loads the current dates fresh. Your settings (club, registration numbers) stay.

Past days are dropped automatically. The durations are in `CONFIG.ttl`.
