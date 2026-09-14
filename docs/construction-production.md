# Construction Production Calculator

Open `constructionProduction.html` from the repository's normal static host, or follow **Construction Production Calculator** on `index.html`. This is a standalone HTML/CSS/JavaScript tool, matching the existing repository. No dependencies, framework, build step, accounts, backend, or database were added.

## Using the calculator

1. Choose **Project Duration** (quantity → time) or **Maximum Production** (time → quantity). Switching modes retains the current operations and assumptions.
2. Load a template or start a custom project. Templates replace the operation list. For a weekend closure, select Saturday and Sunday explicitly, or use the actual closure dates and enabled working weekdays.
3. Set quantity units, working weekdays, shift hours, and any dates. In maximum mode, requested quantity is an optional additional fit check.
4. Choose one of the 136 MDOT work items in the grouped **Work item** dropdown on any operation, or the **Add work item** dropdown. Selection fills the chosen production level, compatible units, and source comments. If a work item has a different quantity dimension from the project (such as LF of culvert on an SF project), enter its fixed quantity or supply an explicit quantity factor. Custom operations remain available.
5. Set same-day transitions, concurrent crews, separate days, and minimum delays. Select **Calculate** to update results; edits clear stale results.
6. Expand **Show Calculation** for formulas and inspect the daily sequence. **Duplicate Scenario** saves a comparison snapshot and opens an editable copy. **Print** recalculates and includes the assumptions, quantities, schedule, and formulas.

Rate-library edits are saved separately from scenario operations. Choose the library and production level, then **Apply library rates to operations**. Mapped operations receive that library's rates; independent custom operations retain their values. A copied library preserves mapping IDs so low/average/high and agency/contractor alternatives are easy to compare. Saved comparison snapshots keep their original quantities and rate assumptions.

Local storage uses `construction-production-v1`. It contains the current scenario, rate libraries, and comparison snapshots. Existing browsers receive the November 2023 MDOT library through a one-time migration. Mapped operations in the active MDOT scenario receive the new source rates. The previous MDOT library is retained under **Previous MDOT planning presets (saved)**, and existing comparison snapshots retain their original assumptions. Contractor/custom libraries and subsequent edits are preserved. Storage failure does not prevent calculation or printing. Reset resets the current mode's example while retaining libraries and comparisons. Clear saved comparisons removes only comparison snapshots.

## Calculation modules

| File | Responsibility |
| --- | --- |
| `scripts/production/units.js` | Compatible unit conversion and numeric validation |
| `scripts/production/quantities.js` | Area, thickness, volume, density, weight, fixed quantities, and quantity factors |
| `scripts/production/production.js` | Compatible production-rate conversion and productive hours/days |
| `scripts/production/calendar.js` | Working shifts, weekends, holidays, date windows, and civil date/time arithmetic |
| `scripts/production/engine.js` | Forward scheduling and inverse complete-sequence solver |
| `scripts/production/mdotRates2023.js` | All 136 source work items, printed Low/Average/High rate cells, comments, and page references |
| `scripts/production/presets.js` | Source-rate normalization, editable libraries, saved-state migration, and operation templates |
| `scripts/constructionProductionPage.js` | DOM controls, local persistence, comparison snapshots, and results |

The calculation/data modules expose CommonJS exports for Node tests and browser globals for static pages. They have no DOM dependencies. Quick calculators call the same conversion, quantity, and production functions. The older HMA Weight Factor calculator retains its separate Gmb-based workflow.

## Quantity and rate conventions

- Project quantity can be area, length, volume, weight, or count. FT and LF are aliases. Tons are short tons (2,000 LB).
- **Project quantity / unit conversion** converts compatible dimensions, for example SF to SY.
- **Area × thickness → volume** computes CF = area SF × inches / 12, then converts to CF/CY.
- **Area × thickness × density → weight** computes tons = area SF × inches / 12 × LB/CF / 2,000. Each lift remains its own operation.
- **Quantity per project unit** uses an explicit dimensional factor (for example 0.05 LF of curb per SF of project). It scales in both modes.
- **Fixed operation quantity** is independent of project size, useful for setup or a specified number of installations. A closure made entirely of fixed operations cannot define a finite maximum project quantity; at least one operation must scale.
- Productive duration converts quantity into the rate's quantity unit before dividing. A workday rate uses the configured **Hours per workday / rate basis**. An hourly rate is direct; a rate per calendar day is normalized over 24 hours and still works only during shifts. A calendar waiting activity runs continuously and consumes no crew time.
- Variable weekday hours change available shift time, while the explicit workday rate basis stays the same. EA maxima are rounded down to whole items. Other maximum quantities are continuous planning estimates, displayed approximately.

## Scheduling conventions

The scheduler places fractional productive hours into working shifts. It does not round each operation up to a whole workday.

- **Sequential** is the default. The next operation starts after all prior work has finished, using any remaining shift time when same-day transitions are allowed.
- **Same-day sequential** explicitly expresses that preference; capacity may still carry an operation into the next shift. It does not promise that two operations will fit on one date.
- **Next workday / separate day** requires a shift starting on a later workday than the latest preceding productive work. Overnight shifts belong to their starting workday.
- **Concurrent with previous** starts at the preceding operation's start (plus the configured delay), assuming independent crews and capacity. The next sequential operation waits for all preceding concurrent work to finish. Concurrent operations require the global permission checkbox.
- **Minimum delay** is elapsed civil-clock hours before an operation begins. It continues through non-working periods; subsequent productive work resumes in a valid shift.
- **Calendar activity / full days** starts at the next midnight, with its specified number of full calendar days. A Thursday pour with three days of cure consumes Friday, Saturday, and Sunday; a following Monday shift is eligible. **Immediately / continuous** instead starts the clock when predecessors finish.
- Every enabled operation, including an enabled optional operation, is included in the sequence. Disabling an operation clears its required flag. A disabled operation explicitly marked required makes the calculation invalid, avoiding claims of incomplete production as completed work.

Workdays per week is a convenience selector that chooses the first N weekdays beginning Monday. Individual weekday checkboxes are authoritative. Holidays omit shifts beginning on those dates. Overnight work already in progress from a previous date is retained.

Date/time windows clip each shift at closure start and required completion. An available-workdays window uses the first N enabled shifts; a fractional last workday uses that fraction of the last shift. Actual available hours can therefore vary by weekday.

Dates use a deterministic civil-clock representation; timezone and daylight-saving elapsed-second changes are not modeled. With no start date, the first enabled weekday on/after an assumed Monday starts the relative schedule. An explicit non-working start date remains the start of the elapsed calendar duration. The planning horizon is approximately 100 years.

**Scheduled workdays** count distinct shifts with productive work. Calendar-only waiting does not count as crew work. **Productive crew days** sum crew hours divided by reference hours per workday, including concurrent crews. **Elapsed calendar days** count both the starting and last occupied calendar date; a midnight finish belongs to the preceding date. Six full Monday–Thursday workdays beginning Monday finish Tuesday of week two: nine calendar days inclusive. Minute-resolution display times are approximate; calculations retain fractional hours.

## Inverse solver and controlling operations

Maximum production derives each operation's fixed and variable hours per common project unit. Individual normalized capacities give an upper bound. A monotone binary search then calls the **same forward scheduler** for every trial quantity. A trial is feasible only if the last enabled operation, including calendar waits and fixed setup, completes by the deadline. The solver never treats milling-only capacity as completed mill-and-fill production.

Small positive-quantity checks preserve mandatory separate-day transitions. If even a tiny positive quantity cannot fit, the result explains the minimum sequence's workdays. For EA, at least one whole item must fit. Insufficient or missing production rates generate a clear input error instead of an invented complete-sequence answer.

In duration mode, **controlling operation** identifies the largest productive crew-time demand, with a label explaining that calendar waits and day boundaries also affect completion. In closure mode, a 1% rate-improvement sensitivity check reuses the forward scheduler to identify rates whose improvement increases continuous maximum capacity. Several sequential operations can jointly control; tied concurrent capacities or calendar constraints can remain limiting when changing one rate alone has no effect. This is a planning calculation, not resource leveling or CPM.

Utilization is operation hours divided by the total available hours in its occupied shifts. Sequential lifts on the same day share the shift's time. The detailed schedule shows each operation's time and quantity in each shift. For very long schedules, the first 120 productive shifts are displayed; all shifts remain in the totals.

## MDOT source and rate interpretations

The **MDOT — November 2023** library uses all 136 rows from the supplied [MDOT Roadway & Bridge Production Rates PDF](<../MDOT_Production_Rates_November_2023 (1).pdf>): 40 on page 1, 48 on page 2, and 48 on page 3. Work item names, all three rate columns, source comments, and page references are retained. The original printed cells remain visible in the library even when a user edits a rate. These are planning assumptions, not guarantees or a substitute for contract requirements. Key pavement rates are:

| Activity | Unit / workday | Low | Average | High |
| --- | --- | ---: | ---: | ---: |
| Concrete pavement removal | SY | 1,000 | 1,500 | 4,000 |
| Concrete placement, non-freeway | CY | 500 | 750 | 1,500 |
| Concrete placement, freeway | CY | 750 | 1,500 | 3,000 |
| Cold Milling | SY | 2,000 | 8,000 | 15,000 |
| HMA Pavement, mainline & shoulder, non-freeway | Tons | 600 | 1,300 | 2,100 |
| HMA Pavement, mainline & shoulder, freeway | Tons | 1,000 | 1,700 | 2,500 |
| HMA Pavement, miscellaneous | Tons | 100 | 200 | 500 |

HMA density remains the original editable 145 LB/CF planning assumption; it is not a density prescribed by this PDF. The concrete pavement source comments call for additional cure time; the existing editable 3/5/7-day curing choices remain available. HMA overlay surface preparation intentionally has no invented production rate; enter a project-specific assumption.

Source-specific interpretation is kept separate from the scheduling engine:

- **Quantity/day:** use the printed quantity rate directly. Unit aliases such as Units, Each, Signs, Piles, Beams, Pieces, and Shafts map to EA with a description of what is counted. VLF maps to LF of vertical length. Rates per person or per side keep those qualifications and assume one person/side; no hidden multiplier is applied.
- **Days/item:** library fields keep the printed days/item values. Operations use the reciprocal EA/workday rate. For example, two headwalls at the low rate of 6 days/unit take 12 productive workdays. EA can mean a unit, move, span, bridge, lane, pour, or repair, as indicated by the source note.
- **Fixed construction days:** bridge deck formwork/rebar and railroad reconstruction are modeled as one fixed activity (quantity 1 EA at the reciprocal daily rate).
- **Cure and lead-time days:** these are calendar activities for one activity/order. Cure uses full days beginning at the next midnight; lead times run continuously from predecessor completion.
- **Months:** pedestrian fencing plan approval/fabrication uses the printed 3/2/1-month values, explicitly normalized to 90/60/30 calendar days using a 30-day planning month. Edit the duration if actual month boundaries matter.
- Additional setup, testing, cure, or mobilization allowances in source titles/comments are preserved and flagged for explicit inclusion as operations or delays. Selecting the production item alone does not add them automatically.

Two printed discrepancies are preserved and called out in the interface and results:

- **Grading (Grader, Dozer, and Scraper):** Low is 400 **SY/day**, while Average is 1,040 **CY/day** and High is 2,000 **CY/day**. Selecting a level applies that level's quantity unit; it does not silently change the source's Low unit to CY. Each level's unit is editable in the library.
- **Riprap Placement:** Low/Average/High are **100/300/200 CY/day**. The columns are not sorted or corrected; confirm the source's intended assumption before use.

## Verified examples

### 21,000 SF concrete remove and replace

At low non-freeway rates, 10 inches thick, 8-hour shifts, Monday–Thursday:

- Removal = 21,000 / 9 = **2,333.333333 SY**; / 1,000 = **2.333333 crew days**.
- Placement = 21,000 × 10 / 12 / 27 = **648.148148 CY**; / 500 = **1.296296 crew days**.
- Total productive crew time = **3.629630 days**, placed in **4 scheduled workdays**.
- Starting Monday, September 14, 2026, removal ends Wednesday at about 09:40 and placement ends Thursday at about 12:02. Full-day cure occupies September 18–20. Completion is the end of Sunday, September 20: **7 inclusive calendar days**. Following productive work is eligible Monday, September 21.

### Original two-day mill-and-fill acceptance example (explicit rate overrides)

The template explicitly reserves **a separate workday between milling and the first paving lift**, and permits both paving lifts to share their paving day. The original requested example remains tested using explicit overrides of 7,600 SY/day milling and 2,000 tons/day paving, two 1.5-inch lifts and 145 LB/CF. These overrides are not the November 2023 library defaults:

- Maximum complete area ≈ **68,400 SF = 7,600 SY**.
- Milling requires **1.00 crew day**.
- Each lift = 68,400 × 1.5 / 12 × 145 / 2,000 = **619.875 tons**.
- Total paving = **1,239.75 tons**, requiring **0.619875 crew day**.
- Workday 1 mills; workday 2 places both lifts. **Milling controls**.
- Requiring each paving lift on a separate workday makes any positive full sequence require **at least 3 workdays**, so the two-day result is infeasible.

The separate milling/paving day is essential to the requested 68,400 SF answer. If the user explicitly permits the first paving lift to use milling day's leftover time, the purely sequential bound is larger:

`maximum SF = 2 / [1/(9 × 7600) + 2 × (1.5/12 × 145/2000)/2000]`

Cooling, compaction, bond coat, and preparation do not receive a hidden time allowance. Add actual minimum delays or explicit operations; the calculator warns about this assumption.

### Two-day closure with November 2023 PDF defaults

For the same two 1.5-inch lifts and separate milling/paving days, the low non-freeway rates (2,000 SY/day milling and 600 tons/day paving) complete **18,000 SF**, controlled by milling. At the PDF's average rates (8,000 SY/day milling and 1,300 tons/day paving), the maximum is approximately **71,724.14 SF**: the two lifts together use the full 1,300-ton paving day. Both cases are tested with the shared inverse scheduler.

## Validation

Run all repository tests from the repository root:

```sh
node --test tests/*.test.cjs
```

`constructionProduction.test.cjs` covers the requested numeric fixtures, fractional sequencing, inverse capacity, fixed setup, dimensional factors, whole-item rounding, calendars, holidays, delays, concurrency, partial date windows, night shifts, variable hours, and invalid inputs. `constructionProductionPage.test.cjs` exercises the actual HTML and UI handlers through a small DOM fixture, matching the repository's dependency-free test approach. It covers editing, quick calculations, templates, complete/infeasible closures, print invocation, persistence, rate copies, comparisons, and escaping user text. `mdotProductionRates.test.cjs` checks all 136 source rows and all three columns, normalization, new default closures, source discrepancies, dropdown coverage, and saved-data migration. DOM fixtures do not test browser rendering or physical print pagination.
