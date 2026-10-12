# ORIS event map

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

- This week: `https://<username>.github.io/oris-map/`
- Next week: `https://<username>.github.io/oris-map/?range=next`

## Settings

Tap the gear and enter your club (abbreviation or ORIS ID), your registration numbers, and optionally your group's. They are stored only in your browser (localStorage), never in the repo.

- **Entered (orange marker, check)**: one of your registration numbers is entered.
- **Group badge**: number of entries from your group, or from the whole club if the group is empty.

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

Responses are cached in the browser for 30 minutes to go easy on ORIS.
