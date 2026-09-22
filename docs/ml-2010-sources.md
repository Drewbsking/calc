# HCM 2010 and 6th Edition multilane LOS

Reviewed September 22, 2026. `ML.html` offers HCM 2010, HCM 6th Edition (2016), and Compare both. The 6th Edition remains the default and keeps its existing calculation and data. The two editions share only the four-lane geometry adjustments, whose numeric values were checked in both editions.

## HCM 2010 source

The primary basis is **Highway Capacity Manual 2010, Volume 2, Chapter 14, December 2010 printing**, inspected as text and rendered pages in a [copy hosted by JP Autoceste FBiH](https://www.jpautoceste.ba/wp-content/uploads/2022/05/Highway-Capacity-Manual-2010-PDFDrive-.pdf). It is the original TRB publication, rather than a secondary implementation. The combined PDF has 1,475 pages; relevant locations are below. The PDF and page images remain outside the repository.

Source SHA-256: `BF757D2DEC04E094BD63E9E5A314E3F0C8B60B59EAFEB24902EB56151446FC43`.

| Item | Printed page | PDF page (1-based) |
| --- | --- | --- |
| FFS selection intervals and speed curves, Exhibit 14-3 | 14-3 | 535 |
| Capacity and LOS limits, Exhibit 14-4 | 14-4 | 536 |
| Measured/estimated FFS, Equations 14-1 and 14-2, Exhibits 14-8 through 14-11 | 14-10 through 14-12 | 542–544 |
| Demand and heavy-vehicle adjustments, Equations 14-3 and 14-4 | 14-13 and 14-14 | 545–546 |
| General terrain, Exhibit 14-12 | 14-15 | 547 |
| Upgrade truck/bus and RV PCEs, Exhibits 14-13 and 14-14 | 14-16 | 548 |
| Downgrade PCEs, Exhibit 14-15 and accompanying RV rule | 14-17 | 549 |
| Driver population factor, capacity test, speed and density, Equation 14-5 | 14-18 | 550 |
| Independent worked example 1 | 14-27 through 14-29 | 559–561 |

Later HCM 2010 errata have not been verified. This implementation identifies its December 2010 basis and does not claim to include later corrections.

## Edition behavior

| Item | HCM 2010 | HCM 6th Edition |
| --- | --- | --- |
| Heavy vehicles | Separate trucks/buses and RV percentages | Total heavy vehicles, including RVs/buses as SUTs |
| Heavy-vehicle factor | `1 / [1 + PT(ET - 1) + PR(ER - 1)]` | `1 / [1 + PT(ET - 1)]` |
| Driver population | `fp`, default 1.00; supported range 0.85–1.00 | No separate driver factor |
| General level ET / ER | 1.5 / 1.2 | Combined ET = 2.0 |
| General rolling ET / ER | 2.5 / 2.0 | Combined ET = 3.0 |
| Speed selection | 42.5 ≤ measured/estimated FFS < 62.5; round to 45, 50, 55 or 60 mph, half-step ties upward | Actual FFS from 45 to 70 mph |
| Capacity | 1,900 / 2,000 / 2,100 / 2,200 pc/h/ln for the four selected curves | `min(1900 + 20(FFS - 45), 2300)` |
| Speed above 1,400 pc/h/ln | `F - a[(vp - 1400)/(c - 1400)]^1.31`; a = 2.78 / 3.49 / 3.78 / 5.00 | Existing Chapter 12 continuous equation |
| LOS E density limit | 45 / 43 / 41 / 40 for F = 45 / 50 / 55 / 60 mph | 45 pc/mi/ln |

For both editions, density is flow divided by **operating speed**. Flow above capacity returns LOS F without a predicted speed or density. The printed 2010 speed coefficients are rounded; at capacity, calculated density may be slightly different from the tabulated E limit (for example, 1,900 / 42.22 = 45.0024). The demand/capacity test controls LOS F, so this printing precision does not incorrectly classify flow at capacity as F.

## 2010 lookup rules and supported scope

- Use the printed grade and length bands, with inclusive upper boundaries. Grade ≤2% uses ET = 1.5 and ER = 1.2. Grade 3% belongs to >2–3%, not >3–4%. Length 0.30 mi belongs to the >0.25–0.30 row where present. Do not interpolate grade or length.
- Interpolate upgrade vehicle-class percentages, rounding the resulting PCE to 0.1 per the exhibit notes. Long-downgrade truck percentages also interpolate to 0.1 as an explicit implementation convention.
- For upgrades above 2%, positive truck/bus and RV percentages must each be in the tabulated 2–25% range unless a documented override is supplied. No extrapolation or silent terminal-column substitution is used. A class with zero vehicles contributes nothing and needs no table lookup.
- Downgrade ER is 1.2 for RVs present. Truck ET is 1.5 for grades below 4% or lengths ≤4 mi. Longer grades of at least 4% use their correct Exhibit 14-15 group and require 5–20% trucks/buses, or a documented override.
- **Disputed source cell:** Exhibit 14-13 prints ET = 1.0 for grade >6%, length ≤0.25 mi, 25% trucks/buses, while the archived working reference/data say 2.0. The printed value is preserved in the data and source fixture for traceability, but is never used automatically. Inputs above 20% in this row would use that endpoint in interpolation, so they require a verified upgrade ET override. No presumed erratum is substituted.
- PCE overrides are independent by edition, direction and (for 2010) vehicle class. A source is required. A 6th Edition override cannot silently become a 2010 ET or ER.
- General terrain supports level and rolling conditions. Uniform grades are analyzed in both directions. Composite grades, mountainous general terrain, downstream queues, signal effects and oversaturated speed predictions are outside this tool's scope.
- Driver factors below 0.85 are outside this calculator's supported range even though the manual notes that lower values have sometimes been observed.

## Comparison and interface

Compare both uses the entered truck/bus percentage plus RV percentage as the 6th Edition's total heavy-vehicle percentage. Its SUT/TT mix describes that combined heavy-vehicle population, including buses and RVs among SUTs. Both editions use the same traffic volume, PHF, lane count, grade and measured/estimated FFS; each applies its own curve and factor rules. Driver population factor applies only to 2010.

Results show LOS, analysis speed, ET/ER, fHV, adjusted flow, capacity, demand/capacity, operating speed and density for each direction and edition. A range or PCE limitation in one edition/direction leaves the other available results visible with a specific explanation. Edits clear results. Hidden edition inputs are disabled and ignored; values are retained for switching back. Formula references follow the edition selector and remain available before calculating.

## Files and validation

- `ML2010data.js`: independently transcribed 2010 tables and speed-curve coefficients; archived files stay intact.
- `MLscripts.js`: pure calculation functions for both editions and comparison.
- `MLpage.js`: edition controls, comparison tables and worked substitutions.
- `tests/fixtures/ml_hcm2010_pce.json`: 406 PCE values extracted by cell position from the source PDF, independent of the hand-transcribed runtime data, with printed band limits.
- `node --test tests/ml.test.cjs tests/ml2010.test.cjs`: existing 6th Edition regressions, all 2010 PCE cells, correct band boundaries, interpolation, source discrepancy handling, published example 1, speed selection, capacity endpoints, demand inputs, overrides and comparison isolation.
- `py -3.13 tests/ml_browser.py`: existing page regressions plus all edition modes, comparison, inputs, formulas, unavailable cases, source escaping and mobile layouts.

The earlier [legacy audit](ml-legacy-audit.md) describes the superseded archived implementation. The [6th Edition source reconciliation](ml-source-reconciliation.md) continues to document that edition's basis.
