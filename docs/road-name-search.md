# Road Centerline Name Search

`road-name-search.html` searches Oakland County's public road centerlines by `StreetName` and displays grouped road/location results alongside a Leaflet map. It uses the site's existing static HTML architecture, shared stylesheet, `layoutScript.js` header/footer loader, and pinned Leaflet 1.9.4 CDN. There are no server components, build steps, package manifests, credentials, databases, or new application frameworks.

No `AGENTS.md` or `README.md` was present in this checkout. Existing uncommitted changes were preserved. The only change to an existing application file is a calculator card in `index.html`; existing calculators and shared styles/scripts were not changed.

## Files

Created:

- `road-name-search.html`: labeled form, results panel, map, source links, shared layout.
- `styles/roadNameSearch.css`: page-specific styles and desktop/mobile layout.
- `scripts/roadNameSearchCore.js`: input validation, REST queries, pagination, grouping, detail formatting.
- `scripts/roadNameSearch.js`: DOM rendering, map interaction, selection, cancellation, status and retry handling.
- `tests/roadNameSearch.test.cjs`: dependency-free Node regression tests.
- `tests/road_name_search_browser.py`: optional browser QA using an already installed Python Playwright and Chrome.
- `docs/road-name-search.md`: this implementation and test report.
- `.gitignore`: excludes road-search browser QA output and generated Python bytecode.

Modified: `index.html`, adding the tool under **Maps & GIS** using the existing card/category pattern.

## Data and behavior

The tool uses the `/query` endpoints of the official [Roads layer](https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseTransportationDataMapService/MapServer/0) and [Municipal District layer](https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseAdminDataMapService/MapServer/2). Requests omit credentials. Only the boundaries use `where=1=1`; roads always use a validated name predicate.

- Begins with is the default. Exact, Begins with and Contains are the only accepted modes. Optional exclusions become `AND StreetName NOT LIKE '%term%'`.
- Terms are trimmed and limited to 80 characters. Non-exact searches need at least two characters. Apostrophes are doubled in SQL literals. Wildcards, control characters, and punctuation outside ordinary road-name punctuation are rejected before a request. All REST parameters are encoded with `URLSearchParams`.
- Road requests include all 15 requested attributes, geometry in EPSG:4326, GeoJSON, `OBJECTID` ordering and pages of 2,000. Pagination checks both ArcGIS transfer-limit locations and advances `resultOffset` by the returned page length. A full page without a flag is followed by another request. Repeated record IDs are deduplicated; a stalled page produces an error. At 10,000 segments, the tool stops and explicitly asks for a narrower search.
- Results group by full cartographic name, left community, right community and jurisdiction. All segment geometries remain on the map. Details retain the distinct segment address ranges rather than inventing a continuous range across gaps, and include differing road codes/speeds within a group. Missing or zero address/speed values are shown as unavailable.
- Communities have thin gray outlines and nearly transparent fill. Hover/touch tooltips show name and type. Blue matching centerlines become thicker brown lines when selected. There is no basemap or tile layer.
- Both map clicks and keyboard-accessible result buttons select, emphasize and zoom to all segments in that group. Details are available in the panel and map popup. GIS values are inserted through DOM `textContent`, never `innerHTML`.
- A new search or Clear aborts the previous search. An identity check also prevents late responses from replacing current results. Boundary loading is independent and cannot override a road selection; failures offer a Retry boundaries button. Requests time out after 30 seconds.

## Local preview and tests

Run from the repository root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/road-name-search.html`. Use HTTP, not `file://`.

Automated checks run in this checkout:

```powershell
node --check scripts/roadNameSearchCore.js
node --check scripts/roadNameSearch.js
node --test tests/*.test.cjs
python -B -m unittest discover -s tests -p 'test_*.py'
python -B tests/road_name_search_browser.py
git diff --check
```

Run the browser command with a Python interpreter that already has Playwright installed and with Chrome available; no dependency was added to the website. The HTTP server must remain running during browser QA. The optional browser script writes screenshots and a check summary to `tmp/road-name-search-qa/`, which is ignored by Git along with Python bytecode caches.

Validation completed September 17, 2026 and repeated September 21, 2026:

| Check | Result |
| --- | --- |
| Public boundaries without login; initial county fit; no tile layers | Passed against live data |
| Begins with `isla`, no exclusion | Passed; Island roads and grouped segments displayed |
| Begins with `isla`, exclude `island` | Passed; no current matches |
| Exact `isla` | Passed; no current matches |
| Normal `Woodward` search | Passed; results and centerlines displayed |
| Contains `wood`, spanning multiple 2,000-record pages | Passed against live data |
| Result activation with keyboard; real centerline click | Passed; group emphasized, zoomed and detailed |
| Repeated searches and Clear | Passed; old segments removed and county view restored |
| Apostrophes, punctuation, short/wildcard/operator/markup input | Passed; valid literals queried, invalid input rejected |
| Network and ArcGIS errors; boundary retry | Passed with intercepted failures |
| Overlapping searches and Clear during pending work | Passed; stale responses could not change the display |
| Hostile GIS attribute content | Passed; displayed as text in rows, details and popups |
| Mobile layout at 390px and desktop layout | Passed; no horizontal overflow, usable map height; screenshots inspected |
| Homepage card/category, shared navigation, existing curve map/reset | Passed in Chrome |
| Browser JavaScript errors | None |
| Node test suite | 205 passed, including 11 new road-search tests |
| Existing Python test suite | 57 passed |
| JavaScript syntax and diff whitespace checks | Passed |

Tests do not hard-code live GIS result counts. Pagination edge cases, the 10,000-segment cap, grouping, cancellation and error handling also have deterministic fixtures in the Node tests. The browser suite performs 15 grouped checks.

## Limitations

- An internet connection and the public Oakland County services/CDN are required. Service data and record counts can change. The tool handles reported service failures but cannot make an unavailable service respond.
- A search reaching 10,000 segments is deliberately incomplete and requires a narrower term. Every result below the cap is rendered; very broad searches can be heavier on older mobile devices.
- Address ranges, road codes and speeds are published GIS attributes; absent values cannot be filled in by this tool.
- Browser QA used Chrome, including a mobile viewport. Physical touch devices and other browser engines were not tested.
- Changes were implemented and verified locally; no production deployment was performed.
