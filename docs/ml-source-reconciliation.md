# Multilane LOS source reconciliation

Reviewed September 21, 2026. The final implementation uses **HCM 6th Edition (2016), Volume 2, Chapter 12, Version 6.0**, following the user's decision after inspection of the supplied manual. It does not combine 2010 heavy-vehicle tables with 6th Edition speed-flow equations.

## Sources and verification

The primary source is the user's `HCM6EdVol2.pdf` (352 PDF pages). The relevant equations, table headings, interval labels and footnotes were read from the text and visually inspected on rendered pages. The reference PDF and rendered pages were not added to the site.

Source-file SHA-256: `C33739838D77396127B06E41028504FF9E928753DB5E5F1BF6F12C77FD4BEC0A`.

| Implemented item | Manual location | PDF page |
| --- | --- | --- |
| Multilane speed-flow relationship, exponent 1.31, breakpoint 1,400, density at capacity 45, FFS 45–70 mph | Equation 12-1 and Exhibit 12-6, p. 12-10 | 136 |
| LOS A–F criteria | Exhibit 12-15, p. 12-19 | 145 |
| Measured FFS; no 5 mph rounding | Step 2, p. 12-27 | 153 |
| Estimated FFS | Equation 12-3, p. 12-28 | 154 |
| Lane width bands | Exhibit 12-20, p. 12-29 | 155 |
| Total lateral clearance and median adjustments | Equation 12-4, Exhibits 12-22 and 12-23, p. 12-30 | 156 |
| Access-point adjustment | Exhibit 12-24, p. 12-31 | 157 |
| Multilane capacity, maximum 2,300 pc/h/ln | Equation 12-7, p. 12-32 | 158 |
| Demand flow and heavy-vehicle factor; buses and RVs treated as SUTs | Equations 12-9 and 12-10, pp. 12-33–34 | 159–160 |
| General terrain: level ET = 2, rolling ET = 3 | Exhibit 12-25, p. 12-35 | 161 |
| PCE tables for 30/70, 50/50 and 70/30 SUT/TT mixes | Exhibits 12-26 through 12-28, pp. 12-36–38 | 162–164 |
| Demand above capacity; density = flow / operating speed | Equation 12-11 and Steps 5–6, p. 12-39 | 165 |

An independent comparison against [ODOT Analysis Procedures Manual Appendix 11D](https://www.oregon.gov/ODOT/Planning/Documents/APMv2_App11D.pdf), updated November 2018, confirmed **all 1,215 PCE cells and all 135 length entries** in the three tables. ODOT explicitly reproduces the 6th Edition exhibits. Its first page also directs use of the longest tabulated length when a segment exceeds that length; the calculator follows that rule and identifies it in the results.

[TRB's errata index](https://www.trb.org/Publications/PubsErrata.aspx) points to the [HCM Volume 4 archived errata](https://hcmvolume4.org/errata-updates/archived-errata/). That archive requires an authenticated account. **Later errata were not verified**; the checked basis is the supplied Version 6.0 manual and the ODOT reproduction. This is a remaining source check, not a claim that no errata exist.

## Reconciled behavior

- Traffic volume now comes from the form. The volume is explicitly one-direction hourly demand across two lanes. Upgrade and downgrade comparisons share the entered volume, PHF, vehicle mix and FFS; separate runs are needed for different directional conditions.
- Measured FFS receives no geometric deductions. Estimated FFS uses base FFS, lane width, left/right lateral clearance, median type and access density. The old single “shoulder width” was insufficient to describe total lateral clearance.
- Lane-width adjustments follow the published bands: at least 12 ft → 0 mph, 11 to under 12 ft → 1.9 mph, and 10 to under 11 ft → 6.6 mph. Width is not interpolated. Lateral/access adjustments interpolate and round to 0.1 mph as recommended in the exhibits. Each lateral clearance is capped at 6 ft; undivided/TWLTL roads use 6 ft on the left. Access adjustment is capped at 10 mph.
- The actual FFS, including 56 mph, drives both capacity and the continuous speed-flow equation. The earlier exact-speed lookup failure is gone. HCM 2010's nearest-5-mph rule is not used in the 6th Edition implementation.
- Capacity is `min(1900 + 20 × (FFS − 45), 2300)` pc/h/ln. Above 1,400 pc/h/ln, operating speed decreases using Equation 12-1. Density uses that operating speed, not FFS at all flows.
- Density boundaries are 11, 18, 26, 35 and 45 pc/mi/ln. Zero demand is LOS A. Demand above capacity is LOS F with speed/density unavailable, as specified by the method. Numerical roundoff at capacity does not turn LOS E into F.
- Heavy vehicles now use total SUT + TT percentage and an explicit choice of the three published composition tables. Buses and RVs are included in SUTs. The obsolete separate RV factor and fixed downgrade factor are removed.
- PCEs interpolate within percentage and length, then between signed-grade rows. Intermediate PCEs retain precision. The old nearest-percentage lookup, malformed string keys and silent fallback factors are removed.
- Summary grade length and density units now match the calculation. Blank, nonfinite, negative and out-of-range inputs do not produce an LOS; edits clear stale results. PHF must be 0.25–1.
- The default example uses 15% total heavy vehicles (the former 13% trucks plus 2% RVs), an explicitly displayed 50/50 SUT/TT mix, and a 2% grade. The grade was changed from 2.5% so both signed directions lie within the new tables. These are example defaults, not inferred site measurements.

## Table boundaries and limits

These implementation choices are explicit; unsupported inputs are not silently assigned a default PCE:

- The tables cover signed grades −2% through +6%. An upgrade of 2.5% can be looked up; the corresponding −2.5% downgrade cannot. Each direction is handled separately, so a supported direction can still display its result.
- Automatic lookup requires at least 0.125 mi (660 ft) and at least 2% heavy vehicles. Shorter segments or positive percentages below 2% require a documented PCE or a suitable separate analysis. Zero heavy vehicles uses `fHV = 1` without a PCE lookup.
- The terminal percentage column is printed `>25%`; the implementation uses it as the 25% endpoint and for higher percentages, documenting that convention rather than extrapolating past the table.
- Above the maximum length, use the last available row in each bracketing grade group, following ODOT's explicit guidance. Maximum rows are 1.5 mi for grades through 3.5%, and 1 mi for steeper tabulated grades.
- A user-supplied PCE override is available separately for upgrade and downgrade. It must be finite, at least 1, and accompanied by a basis/source. Results identify an override and display its source. This does not establish the validity of the underlying study.
- General level/rolling terrain is an explicit alternative using Exhibit 12-25. The tool does not automatically classify a steep or unsupported grade as level terrain. Mountainous/composite-grade mixed-flow analysis, signal effects and queue propagation are outside this calculator's scope. The manual recommends the mixed-flow model for detailed speed/density estimates with steep grades or high truck percentages.
- FFS outside 45–70 mph is rejected. For FFS above 60 mph the result notes the manual's limited field calibration of the higher speed curves. Multilane SAF and CAF remain 1 per Exhibit 12-6; freeway-only adjustments are not imported.

## What to retain from the old folder

All nine files in `Audit/LOS 4-Lane/` remain intact. The four archived runtime files add no unique executable capability, as established in the [original audit](ml-legacy-audit.md). They can be removed in a later cleanup. The five reference HTML pages and the images remain useful historical records, but **are not the active 6th Edition source**.

The supplied Appendix 2.B photos corroborate the historical transcription problems: missing/shifted ET length rows, incorrect high-grade ET values, and ER = 2.0 rather than 1.5 at a 3–4% upgrade longer than 0.5 mi with 15% RVs. The HTML working references also contain interval-label mistakes, including a duplicated 0.75–1.00 mi label. Their relationship to the active tool is now resolved by edition: retain them as HCM 2010 working material, not interchangeable current tables. The exact 2% boundary in the older secondary references remains inconsistent; it has no effect on the new continuous 6th Edition lookup.

## Validation

- `node --test tests/ml.test.cjs`: 16 tests, including all 1,215 independently sourced PCE cells, multidimensional interpolation, table limits, overrides, geometry adjustments, continuous FFS, capacity endpoints, all LOS boundaries and invalid inputs.
- `py -3.13 tests/ml_browser.py`: real browser checks for volume/length changes, measured/estimated modes, median controls, general terrain, unavailable directions, override source escaping, invalid-input handling, mobile width, local links and toolbox description.
- `node --test tests/*.test.cjs`: all 251 JavaScript tests passed, including the ML tests and the existing toolbox regressions. Browser checks passed with no JavaScript errors; desktop and mobile screenshots were inspected.
- The reference fixture identifies its ODOT source. The full manual and rendered page images stay outside the repository.
