# Roadway alignment, access points, and reports

Open `accessDensity.html` through the repository's normal static web server. The page implements alignment creation, station inquiry, access-point entry, and station-based reports using Leaflet and the existing Esri basemap. It needs no backend or build step.

## Interaction

- **Study name / road:** enter the name of the road being studied (up to 120 characters). Drawing can begin before the name is entered; opening Reports requires a nonblank name. Every report page carries the name, including the speed recommendation and hypothetical graph. The PDF document title and download filename identify the study. Reset clears the name for the next study.
- **DRAW ALIGNMENT:** the first map click establishes Station 0+00. Later clicks append straight sections. Immediately after a curve, the next point snaps to its forward exit tangent; backward extensions are rejected.
- **ADD CURVE:** the last alignment point automatically becomes PC, the end of the incoming tangent. The next two clicks are **MID, then PT**. Place the alignment start first to enable Add Curve. To begin a curve farther along the road, draw a tangent to that location before selecting Add Curve. On completion, controls are adjusted to enforce tangent connections, and drawing returns to tangents.
- **FINISH:** stops adding points. Hover or tap near the alignment to inquire about a station. Editing handles remain draggable. Either drawing button resumes construction.
- **RESET:** clears the working alignment and all access points, then returns to drawing. The map stays at its current view.
- Selecting Draw Alignment during an incomplete curve discards the pending MID and retains the existing alignment and its endpoint. Finish is unavailable until PT completes the curve. The dashed PC-to-MID preview is excluded from stationing.

PC, MID, and PT remain visible and draggable. A shared PT/PC handle is labeled `PT/PC`. Curves and tangent sections share endpoint objects. Curve entry and exit directions must match the adjoining sections' travel directions.

- With straight sections on both sides, PC and PT slide along the existing tangent lines. Dragging either endpoint adjusts the radius and the other endpoint. MID changes radius while preserving both tangent bearings and the far endpoints.
- A PC at the end of a straight connecting two curves can also move across the old tangent. The connecting straight rotates toward the dragged PC, and both curves refit to it. The preceding curve retains its radius; the other incoming and outgoing tangent bearings stay fixed. A free PT follows the refitted curve.
- With one free end, the adjoining tangent is held and the free end follows the circle. An isolated curve retains its original free three-point editing.
- A half-circle between opposing parallel tangent lines has a fixed radius; its controls slide longitudinally along those lines.
- Consecutive curves keep their common tangent and contact point as edits propagate through the connected curves.
- Dragging a straight-section endpoint intentionally changes that line's bearing and refits the adjoining curves.
- A drag that creates an impossible radius, reverses an adjoining tangent, or breaks a smooth connection is rejected. The last valid geometry and stationing remain, and the handle returns to its valid location.

## Geometry and stationing

`scripts/accessDensityCore.js` is independent of Leaflet and the DOM. It exports the same API to the browser and Node tests. All X/Y coordinates, radii, offsets, and internal distances are in meters; station arguments and formatted values are in feet (1 ft = 0.3048 m).

`scripts/accessDensity.js` stores a first geographic point and an ordered list of line/curve definitions. Geographic endpoints are shared objects. The map adapter converts those definitions to local X/Y coordinates before rebuilding derived geometry.

The local spherical coordinate conversion follows the existing curve tool. One fixed frame is established at the first point and lasts until Reset. This is a map-tracing measurement model. Moving the first point does not change the frame, but the first point remains Station 0+00.

A circle is first fit through the existing PC and the selected MID and PT. The geometry module then fits its controls to the adjoining tangent lines. Initial clicks are guides when they conflict with tangency; the adjusted PC, MID, and PT all lie on the resulting true circle. Its signed angular sweep passes from PC through MID to PT, including clockwise, counterclockwise, angle wraparound, and major arcs. MID need not bisect the arc. Arc length is radius times absolute sweep in radians. Display sampling is independent of length and station calculations.

For intersecting tangent lines, the curve's tangent distance from their intersection is `R × tan(|sweep| / 2)`. The PC/PT handles project onto their respective tangent lines; MID projects onto the constant-fraction locus of the arc as radius changes. When relocating PC on a straight between curves, a new tangent guide runs from the preceding curve's current PT through the requested PC. Both curves use that guide in the same refit. Tangent support geometry is derived from the current alignment, without adding another stored model. Every accepted edit is checked for connected endpoints, forward tangent lengths, and matching tangent directions.

Each section receives cumulative start/end distances. Station labels appear at 0, 500, 1,000 feet, and so on. Inquiry compares exact nearest points on finite lines and circular arcs; it is displayed within 24 screen pixels of the alignment. At equally near locations, the earlier section wins. In drawing mode a map click adds a point; Finish allows tapping for inquiry without adding points.

An initially incomplete or invalid curve must be repaired before finishing. Invalid completed definitions make station totals unavailable and appear in red. Once the alignment is valid, an invalid drag retains that valid alignment and its station totals.

## Access points

**ADD ACCESS POINTS** becomes available once the alignment has a valid section and no unfinished curve. Each map click places an access marker at the exact geographic location clicked. A compact popup provides Type, a Name field for Named Road / Access, Save, and Delete. Residential markers are green circles, Commercial markers orange squares, and Named Road / Access markers purple diamonds. Letters distinguish the types as well as color and shape.

In access mode, **R**, **C**, and **N** select the type. Shortcuts do not intercept typing in the name field or modified keyboard shortcuts. Save or Enter closes the popup. Clicking the next map location also keeps the current point and starts the next, using the last selected type. Points and edits are kept immediately; closing the popup does not discard them. Delete removes the selected point. Named roads/accesses remain a distinct type from residential and commercial driveways for future reporting.

The table lists only **Station, Type, and Name**, sorted by numeric station with insertion order breaking ties. Clicking a row pans to, highlights, and opens that point; rows also support Enter and Space. A selected point has a yellow outline. Name values are rendered as text rather than HTML.

`scripts/accessDensityPoints.js` owns the small in-memory point list, markers, popup, and table. Each record contains `id`, `coordinate: {lat, lng}`, `type`, `name`, and numeric `stationFeet`. It calls the existing geometry module's `nearestStation` against the current local-frame alignment, including exact radial projection and arc length on curves. Neither the marker nor its stored coordinate is snapped to the roadway. Offset is used only internally by the nearest-location search; it is not stored in access records, shown in the access table, or used to filter points. Points beyond the alignment ends receive the nearest endpoint's station.

Dragging an access marker recalculates its station and table order during the drag. Every alignment redraw recalculates all access stations without moving their map locations, including curve edits, changes to the start point, and drawing additional sections. If the alignment becomes invalid, access stations display as unavailable until it is repaired. Changing modes preserves access points.

## Reports

**REPORTS** opens the **Complete PDF report**, with the study map, MCL speed recommendation, hypothetical 100-ft speed graph, and four access reports. Choose a report and use Previous/Next for additional pages. Every selection includes the study map, MCL recommendation, its basis, and the separate hypothetical graph. Reopening reports reads the current access stations after alignment and point edits. An invalid or incomplete alignment cannot be reported.

### Study map

`scripts/accessDensityReportMap.js` builds an overview using the same Esri imagery and reference layers as the interactive Leaflet map. The view fits the entire sampled alignment and the access points at their actual geographic locations, with 500-ft station labels, the end station, distinct access symbols, a north arrow, a scale, and Esri attribution. It does not move the user's interactive map. Curves are sampled only for drawing; true arc lengths still determine stationing and report counts.

The browser draws CORS-enabled map tiles and overlays into a 2,700-pixel-wide image embedded in the report SVG and PDF. No new dependency, service, or backend is needed. Export waits for the map image; reopening reports captures current geometry and accesses. Missing imagery tiles are clearly noted on the map page. A capture failure disables export and explains how to retry. Closing reports discards a pending capture's result. The study name is included on every page, including the map; the PDF filename and metadata also use it.

- **Access Point Density Along Alignment:** total recorded access points per interval, including named accesses. Residential and commercial driveway dots share one common display row at their stations; their vertical position has no analytical meaning. Named accesses are vertical lines with bold names above the chart, never dots. There is no descriptive subtitle.
- **Stacked Access Type:** each interval stacks residential, commercial, and named access counts. The height is the total recorded count.
- **Commercial / Named Access:** each interval stacks only commercial and named access counts.
- **Access Gaps:** all consecutive recorded access pairs, sorted by gap length from longest to shortest. Columns are Start Station, End Station, Gap Length, Previous Access, and Next Access. The alignment start and end are not invented access points. Coincident accesses retain their zero-length gap. Fewer than two points produces an empty-state message.

Intervals start at Station 0+00 and default to **1,000 feet**; the Interval field allows changing this. Each interval includes its start and excludes its end, with the alignment endpoint included in the final interval. A partial final interval uses its actual station range and unscaled count. Tiny floating point errors within one millionth of a foot of a boundary are normalized so records do not fall into phantom intervals. Zero-count intervals remain visible. Invalid access stations stop report generation rather than silently excluding records.

Matching nonblank road names within **100 feet** share one display label, ignoring case and repeated whitespace. Each group spans at most 100 feet; a chain of nearby entries cannot combine distant occurrences. The shared label is centered over the grouped stations, with a line at every recorded named-access station. Grouping affects only labels: every record still counts in the bars and gaps. No geographic side or offset is used to group, count, or calculate gaps. Distinct names and unnamed accesses stay separate.

`scripts/accessDensityReportCore.js` is a pure calculation module usable in Node and the browser. It accepts the study name, alignment length, stationed access records, interval, label tolerance, and short-highway flag. It returns the normalized name, interval counts, driveway stations, grouped road labels, sorted gaps, and speed results, without depending on Leaflet, the DOM, or chart rendering. Study names are escaped as text and wrap in report headings; they do not affect any analysis.

### MCL speed recommendation

The speed calculation uses [MCL 257.627(2)(f)-(j)](https://legislature.mi.gov/Laws/MCL?objectName=mcl-257-627), reviewed September 15, 2026:

| Access points within 1/2 mile | Access-based speed | MCL 257.627 |
| --- | --- | --- |
| 60 or more | 25 mph | (2)(f) |
| 50-59 | 30 mph | (2)(g) |
| 45-49 | 35 mph | (2)(h) |
| 40-44 | 40 mph | (2)(i) |
| 30-39 | 45 mph | (2)(j) |
| Fewer than 30 | Not prescribed by these access-point provisions | (2)(f)-(j) |

Driveways and intersecting roadways are vehicular access points under (18)(b). All recorded types count equally, including separate accesses with a shared display name. The code does not infer a 50- or 55-mph recommendation from a low access count. Subsection (9)'s conditional 55-mph general limit for trunk line and county highways is explained in the report, not assigned without road classification and other applicable limits.

The application uses a **sliding 2,640-ft window**. Sliding is an application analysis method, not a claim that the MCL explicitly mandates it. The calculation checks positions where an access enters or exits and each intervening span, including full windows at both alignment ends. Both endpoints of each window count. A two-pointer sweep finds the true maximum count without depending on the chart interval. Overlapping window counts are never summed. The report identifies the most restrictive result and its actual window stations. To keep the table readable, it retains the endpoint windows, the highest-count window, and windows on each side of speed-category changes.

The result is a recommendation for the evaluated window, not one speed imposed on the entire alignment. Different adjoining access densities need separate determinations under (5)(b). Special-area provisions (2)(a)-(e), traffic-control-order and posting requirements (11)-(12), and superseding modified limits under [MCL 257.628](https://legislature.mi.gov/Laws/MCL?objectName=mcl-257-628) and 257.627(13) are stated in the PDF.

A traced portion shorter than 2,640 ft does not establish that the whole highway is short. By default the report withholds a recommendation if no complete half-mile window exists. For an alignment shorter than half a mile, the user can explicitly identify it as the **entire short highway**. Only then does the application apply (5)(c)'s 1/10-mile proration: slide a complete 528-ft window and multiply its count by five before comparing it with the half-mile thresholds. A trace shorter than 528 ft still has no full window and is not extrapolated. Reset clears this confirmation.

### Hypothetical speed every 100 feet

This separate what-if graph uses **each independent 100-ft section's own access count**, not a moving half-mile count. The pure report core computes `hypotheticalSpeed` independently of the statutory analysis, chart interval, and short-highway confirmation. It multiplies each section's count by `2640 / sectionLengthFeet` and compares that equivalent density against the same speed thresholds. Intervals include their start and exclude their end; the final alignment endpoint counts in the last interval. A final partial interval uses its actual length.

For a full 100-ft section, zero or one access is below the thresholds, two accesses correspond to 30 mph, and three or more correspond to 25 mph. These discrete counts cannot produce 35, 40, or 45 mph in a full 100-ft section. No-category sections appear in gray with a separate display row, never as zero or an assumed 55 mph. The step graph holds each category across its own section and shows the actual counts below. Undefined categories interrupt the line. Pages cover up to thirty sections (3,000 ft), using a consistent mph scale.

The graph states that it is hypothetical, that the MCL supplies comparison thresholds only, and that the statute does not authorize this 100-ft proration method. It does not change the existing MCL recommendation or apply the tenth-mile short-highway provision. The **Hypothetical Speed - Every 100 ft** selection opens the graph first; all printed/PDF selections include it with the statutory basis.

`scripts/accessDensityReportCharts.js` renders the calculated result as standalone SVG pages. Access-count charts use at most ten intervals per page and a common count scale across pages of the same report. Gap tables paginate without splitting rows. Road labels wrap and use separate rows to avoid overlaps. Names are escaped as text in the generated SVG.

`scripts/accessDensityReports.js` owns the report selector, interval input, page controls, and exports:

- **Print:** prints all pages of the selected report on landscape US Letter pages, with report controls and the map excluded. SVG graphics remain vector in browser printing.
- **Save PDF Report:** downloads all pages of the selected report in landscape US Letter format, including the MCL speed recommendation, window stations, counts, method, and clickable links to the official statutes. Graphics are rendered at 3,000 pixels wide (300 dpi at a 10-inch printable width). The page uses the pinned browser build of [jsPDF 4.2.1](https://github.com/parallax/jsPDF/releases/tag/v4.2.1) from cdnjs. If that library fails to load, Print can still save a PDF through the browser. PNG download has been removed.

The **Complete PDF report** option prints or saves the combined report. Invalid chart-interval input clears the previous preview and disables exports so a stale report cannot be saved.

## Checks

Run `node --test tests/accessDensityCore.test.cjs tests/accessDensityTangency.test.cjs tests/accessDensityPage.test.cjs tests/accessDensityPoints.test.cjs tests/accessDensityReports.test.cjs tests/accessDensitySpeed.test.cjs tests/accessDensityReportMap.test.cjs` for geometry, access-point, report, map, and MCL threshold coverage, or `node --test tests/*.test.cjs` for all repository tests. JavaScript files can also be checked with `node --check`.

Geometry fixtures use known line lengths, circle centers, radii, angular sweeps, and independently calculated station locations. The interaction harness drives the page event handlers with a minimal Leaflet/DOM substitute; it does not verify remote imagery or browser rendering.

Working data is in memory for this implementation. Reloading the page clears the alignment and access points.
