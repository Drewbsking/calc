# Sign placement review

Reviewed November 24, 2026. Entry point: `calculators/sign-placement/`.
The legacy `signPlacement.html` redirect still preserves the query string and hash.

## Sources and table behavior

The tool offers both sources, with **2025 MMUTCD** selected by default, as requested.
Published tables are the initial mode. The tables are kept separate; there are no
interpolated cells or manual overrides.

| Source | Local reference | Coverage |
| --- | --- | --- |
| 2025 MMUTCD, Section 2C.04 and Table 2C-3, printed p. 156 | [Excerpt, PDF p. 3](../calculators/curve/references/mmutcd-curve-reference.pdf#page=3) | 20-85 mph approach rows; potential stop and 10-mph advisory columns |
| MDOT Traffic Sign Design, Placement, and Application Guidelines, November 2023, Table 3, printed p. 21 | [Excerpt, PDF p. 2](../calculators/curve/references/mdot-curve-reference.pdf#page=2) | 25-75 mph approach rows; potential stop and 5-mph advisory columns |
| FHWA MUTCD 11th Edition with Revision 1, Section 2A.08 paragraph 08 | [Chapter 2A, PDF p. 7](https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/Chapter2ar1.pdf#page=7) | Word-message letter-height ratio: 1 inch per 30 ft of legibility distance |

The source PDFs and their existing [provenance record](../calculators/curve/references/sources.json)
are reused from the curve tool. Table values and footnotes were checked against the
rendered source pages. Official listings were checked at the
[MDOT MMUTCD page](https://mdotjboss.state.mi.us/TSSD/getCategoryDocuments.htm?category=MMUTCD&categoryPrjNumbers=2682785,1403854,1403855)
and [MDOT Traffic Signing page](https://mdotjboss.state.mi.us/TSSD/getCategoryDocuments.htm?category=Traffic+Signing&categoryPrjNumbers=1403886).
The [full MDOT guide](https://mdotjboss.state.mi.us/TSSD/getTSDocument.htm?docGuid=b6544036-b4a5-428b-b5ca-2a444b5a72c4&fileName=mdot_signing_design_placement_application_guidelines.pdf#page=26)
contains Table 4's sign classifications, which are outside this tool's automatic selection.

- Conditions: A (speed reduction and lane changing in heavy traffic), B potential
  stop, and B advisory-speed reduction.
- MMUTCD uses posted or 85th-percentile approach speed; MDOT's table labels its rows
  as posted speed. Selectors offer only published rows and columns. Between-column
  choices require an explicit engineering selection; the tool does not silently
  round to a nearby speed or extrapolate outside a source's coverage.
- Switching sources restores each source's own speed selections, shown next to the
  result. Inputs from a source with a different range are not silently rounded.
- MMUTCD `N/A` (Note 5) is retained as site-dependent placement. Dashes and empty
  cells remain blank. Equal/higher advisory speeds are rejected for deceleration.
- MMUTCD Note 1's minimum 100-ft addition for a word-message sign with legend under
  6 inches or more than four words is opt-in and displayed separately. It applies
  only to MMUTCD results; an N/A cell never turns into a numeric recommendation.
- MMUTCD Note 6 and MDOT Note 4 mark the 100-ft spacing allowance. It is not an extra
  100 ft to add to each result.
- MDOT's instruction for a supplementary plaque beyond twice the table minimum
  is displayed with the selected distance. The tool does not select the plaque.

Examples that expose the old mixed-source defect:

| Approach / advisory | MMUTCD | MDOT |
| --- | --- | --- |
| 50 / 20 mph | 175 ft | 225 ft |
| 45 / 35 mph | No 35-mph column | 125 ft (published value, not an override) |
| 25 / 20 mph | N/A, Note 5 | 100 ft, Note 4 |
| 70 mph / potential stop | 730 ft | 695 ft |
| 75 mph / potential stop | 820 ft | 730 ft |

## Formula review

The calculation core is in `signPlacementCore.js`; DOM updates are in
`signPlacement.js`, with page-scoped styles in `signPlacement.css`.

For level-road, constant-deceleration motion:

```text
v_i = V_i * 5280 / 3600         mph to ft/s, exact conversion
v_f = V_f * 5280 / 3600
D_r = v_i * t                  perception-response travel, ft
D_b = (v_i^2 - v_f^2) / (2a)   braking travel, ft
D_total = D_r + D_b            travel from first recognition to target speed
D_sign = max(0, D_total - L)   estimated sign-to-condition distance, ft
H = L / 30                    word-message letter height, inches
```

`a` is a positive deceleration magnitude in ft/s², `t` is seconds, and `L` is the
distance before the sign at which it can be read or recognized. The last distance
equation is a geometric deduction from travel distance and available legibility;
it does not reproduce table rounding, spacing minima, or all field conditions.
The 30-ft/inch ratio is a word-message check, not a symbol-size rule. The result is
not shown for zero legibility credit, and prescribed sign lettering still applies.

Changes from the former formula:

- Replaced the approximate 1.467 conversion with 5280/3600.
- Removed `abs()` from braking distance and reject target speeds above the approach.
- Require finite inputs, positive approach speed and deceleration, and nonnegative
  target speed, response time, and legibility. Blank fields are errors. An explicit
  zero response time is honored rather than silently changed to 1.5 seconds.
- Replaced the g-force input (formerly 0.3 g) with deceleration in ft/s². Defaults
  are 2.5 s and 10 ft/s², matching the advisory-speed assumptions in MMUTCD Note 4;
  the UI also identifies 11.2 ft/s² for the potential-stop column (Note 3).
- Default legibility credit is **0 ft**. A positive credit is an explicit user
  assumption. A credit greater than travel distance gives zero with an explanatory
  message, never a negative placement distance.
- Letter height is now based on explicit legibility distance and shown in inches.
  The former `response distance / 30` was labeled in feet and treated response
  distance as reading distance without an independent basis.
- Invalid inputs clear every dependent result so a previous valid distance cannot
  remain on screen after the assumptions become invalid.

Hand check: 30 to 15 mph is 44 to 22 ft/s. At 11 ft/s², braking lasts 2 s and covers
66 ft at an average 33 ft/s. A 2.5-s response adds 110 ft, for 176 ft total. With
60 ft legibility credit, the calculated placement is 116 ft and the letter-height
check is 2 inches.

## Verification

```powershell
node --test tests/signPlacement.test.cjs
py -3.13 tests/sign_placement_browser.py
git diff --check
```

Unit checks cover source differences, footnotes, unsupported speeds, independent
kinematic examples, units, zero/equal-speed cases, input errors, and numeric overflow.
Browser checks cover both hosting prefixes (`/` and `/calc/`), legacy routing,
PDF/related-tool links, all conditions, source switching, added legibility, table
highlighting, stale-result clearing, keyboard switching, and widths from 320 to
1440 pixels. Screenshots are written outside the repository in the system temporary
directory under `sign-placement-check` for visual inspection.
