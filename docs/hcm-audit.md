# Audit/HCM integration and audit

Reviewed September 22, 2026. The folder contains a **basic freeway** calculator, a Version 6.0 manual extract, a worked example in two formats, and an HCM 7th Edition review guide. The live site previously offered **multilane highway** LOS, which uses different geometry, capacity and speed-flow equations. No live basic freeway LOS tool existed.

The missing method is now available in [Basic Freeway LOS](../freewayLOS.html), linked from the toolbox and [Multilane LOS](../ML.html). The implementation uses **HCM 6th Edition (2016), Chapter 12, Version 6.0, base conditions**. The original five supplied files remain unchanged as audit evidence. The flawed archived Python script is not executed by the site.

## File disposition

| Supplied file | Contents and use |
| --- | --- |
| [LOS.py](../Audit/HCM/LOS.py) | Standalone interactive Python calculator. Its unique freeway capability has been implemented in the browser, correcting the defects below. Retained as historical evidence. |
| [LOS - Freeway.pdf](../Audit/HCM/LOS%20-%20Freeway.pdf) | 23-page HCM extract, printed pp. 12-17–12-39, explicitly Version 6.0. Primary source for freeway geometry, demand, capacity, PCEs and LOS. |
| [example.jpg](../Audit/HCM/example.jpg) | Four-lane urban freeway practice problem with handwritten solution. Added as a loadable example; independently recalculated below. |
| [DOC040924-04092024120826.pdf](../Audit/HCM/DOC040924-04092024120826.pdf) | One-page scan of the same worked problem. Visually reviewed; not an additional calculation method. |
| [HCM7 Reference Guide](../Audit/HCM/D4-TO-22-137-HCM7RG-FINAL-HCM7-Reference-Guide.pdf) | 91-page review guide. Its basic-freeway discussion (printed pp. 19–21 / PDF pp. 28–30) and multilane discussion (printed pp. 39–41 / PDF pp. 48–50) were checked against the implemented scope. Linked from the new calculator. It is not a complete substitute for the 7th Edition equations and tables. |

## Findings in the archived code and example

| Finding | Effect | Implemented correction |
| --- | --- | --- |
| `FFS = BFFS + fLW + fRLC - ...` | Narrow lanes and restricted clearance incorrectly increase speed. | Subtract both penalties, per Eq. 12-2. |
| Integer conversions of BFFS, lane-width and lateral-clearance penalties | Discards decimal speed reductions; decimal input can also fail conversion. | Accept decimal inputs and keep full calculation precision. Width uses the published bands; lateral clearance interpolates. |
| Capacity starts at 2,000 rather than 2,200; no 2,400 ceiling | Understates capacity for the example and does not enforce the freeway maximum. | `c = min(2200 + 10*(FFS-50), 2400)` pc/h/ln, Eq. 12-6. |
| Density always equals flow / FFS | Understates density once flow passes the speed-curve breakpoint. | Use operating speed from Eq. 12-1 / Exhibit 12-6 before calculating density. At FFS 65 mph and 2,100 pc/h/ln, speed is 58.06248 mph, density 36.16793, LOS E; flow / FFS would incorrectly give LOS D. |
| Capacity is computed but never used to determine LOS | Can report LOS A–E for demand above capacity. | Demand above capacity returns LOS F, with speed and density unavailable. |
| Density 18, 26, 35 and 45 assigned to the worse category | Exact boundaries incorrectly become C, D, E and F. | Inclusive upper boundaries yield B, C, D and E respectively (Exhibit 12-15). |
| `>=5 lanes` table key cannot be selected with a plain numeric input; later uses only the first character for N | Five or more lanes can crash; multi-digit lane counts would be misread. | Validate a whole directional lane count ≥2 and use the ≥5 clearance column for all such lane counts. |
| Ramps always equal twice the interchange count; arbitrary denominator | Incorrect for nonstandard interchange arrangements or a different counting window. | Enter ramp density directly, with instructions to count on/off ramps in the analysis direction within 3 mi either side of the segment midpoint and divide by 6 mi. |
| RVs excluded | Omits part of the heavy-vehicle stream. | Include buses and RVs as SUTs, per p. 12-34. |
| Missing domain checks | Invalid percentages, PHF, geometry or FFS may crash or return a plausible result. | Reject blank/nonfinite/negative and unsupported values. Clear previous results when inputs change. |
| Handwritten example rounds fHV to 0.95 before dividing | Produces 1,403.50 rather than 1,400 pc/h/ln. | Keep `fHV = 1/1.05` until final display. The Python script itself already keeps this factor unrounded. |

## Independent example reconciliation

Inputs: 2,400 veh/h in one direction; two directional lanes; PHF 0.90; 5% heavy vehicles; level terrain; base speed 60 mph; 12 ft lanes; 10 ft right clearance; six directional ramps in the six-mile counting window (TRD = 1).

The problem supplies a **60 mph base speed**. The normal HCM default base speed is **75.4 mph**; the calculator opens with that default and uses 60 only when the archived example is loaded or entered by the analyst.

| Quantity | Correct result |
| --- | --- |
| FFS | `60 - 0 - 0 - 3.22*1^0.84 = 56.78 mph` |
| Capacity | `2200 + 10*(56.78-50) = 2267.80 pc/h/ln` |
| Breakpoint | `1000 + 40*(75-56.78) = 1728.80 pc/h/ln` |
| ET; fHV | `2`; `1/(1 + .05*(2-1)) = .95238095238...` |
| Passenger-car flow | `2400/(.9*2*.95238095238...) = 1400 pc/h/ln` |
| Operating speed | `56.78 mph`, because flow is below the breakpoint |
| Density | `1400/56.78 = 24.6565692145... pc/mi/ln` |
| LOS | **C**, matching the circled answer |

The script and handwritten solution both show capacity **2,067.8**. The handwritten density **24.71** comes from the prematurely rounded heavy-vehicle factor. Neither error changes LOS for this particular example; both matter for other inputs.

## Source map and existing-method audit

| Item | Verified source |
| --- | --- |
| LOS limits and oversaturation | Supplied extract PDF p. 3, Exhibit 12-15, printed p. 12-19; PDF p. 23, Steps 5–6 |
| Measured FFS used directly | PDF p. 11, printed p. 12-27 |
| Freeway FFS estimate; default BFFS 75.4 | PDF pp. 11–12, Eq. 12-2, printed pp. 12-27–28 |
| Width bands; directional-lane clearance table | PDF p. 13, Exhibits 12-20 and 12-21, printed p. 12-29 |
| Ramp count and six-mile window | PDF p. 14, printed p. 12-30 |
| Freeway/multilane capacity formulas and ceilings | PDF p. 16, Eqs. 12-6 / 12-7, printed p. 12-32 |
| Flow, heavy vehicles, RV treatment | PDF pp. 17–18, Eqs. 12-9 / 12-10, printed pp. 12-33–34 |
| General terrain and specific-grade PCEs | PDF pp. 19–22, Exhibits 12-25–28, printed pp. 12-35–38 |
| Freeway speed curve: variable breakpoint, exponent 2, capacity density 45 | Previously supplied `HCM6EdVol2.pdf`, PDF p. 136 / printed p. 12-10, Eq. 12-1 and Exhibit 12-6; rechecked against its rendered page during this audit. This page precedes the new folder's extract. Source fingerprint is in [the multilane reconciliation](ml-source-reconciliation.md). |

The manual equations, table headings, boundaries and relevant footnotes were read as text and checked on rendered pages. The example and duplicate scan were visually inspected.

A coordinate-based extraction from the new PDF's pages 20–22 independently compared **all 1,215 PCE values and 135 length entries** with `MLdata.js`. All matched. The existing ODOT-sourced fixture remains the permanent independent regression check for those same tables.

The existing multilane calculator already covers the supplied extract's **multilane** branch. Its four-lane lateral-clearance table, lane bands, median/access deductions, capacity formula, demand adjustment, PCE tables and LOS boundaries agree with the Version 6.0 extract. Freeway geometry and speed-flow parameters are kept in `freewayLOSCore.js`; they do not replace the multilane method. HCM 2010 remains a separate edition in `ML.html`.

The new freeway core shares `ML.getPCE` and `ML.getLOS`. All other freeway formulas are independent. This avoids maintaining duplicate copies of the 1,215-cell Chapter 12 PCE tables. The shared multilane module also loads its existing 2010 data, but the freeway calculation never calls the 2010 method.

## Edition and supported scope

- This is a basic **general-purpose freeway segment** analysis, one direction per run, with FFS 55–75 mph, at least two directional lanes, and SAF = CAF = 1.00. A geometry estimate outside the FFS range is rejected rather than silently clamped. PHF is constrained to 0.25–1.00, the possible range for a peak 15-minute interval within an hour.
- Level and rolling terrain use ET 2 and 3. Specific grades reuse the existing Chapter 12 tables and their documented interpolation/range rules: signed grade −2% through +6%, minimum length 0.125 mi and minimum positive heavy percentage 2%. Zero heavy vehicles bypasses the lookup. Terminal percentage and length rows follow the previously audited conventions. A different PCE requires an explicit value and source.
- Mountainous terrain, composite-grade mixed flow, managed lanes, merging/diverging/weaving, downstream queues, incidents, weather and calibrated SAF/CAF are outside this implementation. A supplied PCE does not implement these missing methods. Speed/density estimates on steep grades with substantial truck traffic need the separate mixed-flow model described in the manual.
- The **7th Edition guide is a reference**, not a newly implemented edition. It describes additional CAV capacity adjustment factors on printed p. 20 and calibration guidance for multilane highways on p. 40. The 6th Edition results have not been relabeled as 7th Edition. The [publisher's 7th Edition description](https://www.nationalacademies.org/publications/26432) independently confirms the 2022 edition and its new CAV methods. Full 7th Edition equations, tables and applicable updates would be needed to implement and verify those additions.
- Later errata were not newly authenticated by this folder. The verified numerical basis remains Version 6.0, as already recorded in the multilane reconciliation.

## Source fingerprints (SHA-256)

```text
LOS.py
bd28b7650e88c6bf0f63cdb97cec05b09572116d145506edddff502874bcfb4f
LOS - Freeway.pdf
e98ad4cbd06621538fefea9c4a7ace4845012b49602149f1ab9614a8751b3905
example.jpg
918938444e960ef2d9e84bf229932cf4e20974141c471cd5d24764d6d0697442
DOC040924-04092024120826.pdf
d04146baa394c5ea8ea691de7b2691a0ad981f2912ee76cbdeddc051fb8fb135
D4-TO-22-137-HCM7RG-FINAL-HCM7-Reference-Guide.pdf
3d761034133c6e59a51e2a6f40c56a676038335b534ed663f3df996170647ac8
```

## Validation

**Result:** all 41 calculation tests passed. Both browser suites passed with no JavaScript errors; the new page and existing edition comparison fit a 320 px viewport. Desktop and mobile screenshots were visually reviewed. `git diff --check` reported no whitespace errors.

- `node --test tests/freewayLOS.test.cjs tests/ml.test.cjs tests/ml2010.test.cjs` covers the archived example, corrected geometry, all clearance cells, five-plus directional lanes, speed decline, capacity endpoints/ceiling, oversaturation, grade lookup, documented overrides, invalid inputs and both existing multilane editions.
- `py -3.13 tests/freeway_los_browser.py` exercises the page, numeric examples, speed modes, terrain modes, overrides, stale-result clearing, invalid values, source-text escaping, mobile layout and navigation/source links.
- `py -3.13 tests/ml_browser.py` checks the existing multilane page and edition comparison after the new navigation link was added.
