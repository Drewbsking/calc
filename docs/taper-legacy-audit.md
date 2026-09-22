# Taper calculator archive audit

Reviewed September 21, 2026. `Audit/` contained five files, all under `Audit/Taper/`. The current [Taper Lengths tool](../taper_lengths.html) retains every calculation and user-facing capability found in those files. The five redundant archive files were removed after comparison; their output fixtures and SHA-256 source hashes remain in [taper_legacy.json](../tests/fixtures/taper_legacy.json).

The empty `Audit/Taper` and `Audit` directories remain: automatic approval review rejected their removal with “blocked by policy.” No old source files remain in them.

## File-by-file disposition

| Archived file | Current replacement | Finding |
| --- | --- | --- |
| `Audit/Taper/index.html` | `taper_lengths.html` mode buttons; home-page Taper card | The old page only selected Simple or Complicated. Both workflows are available together. Its background photograph is retained at `img/pexels-hngstrm-1203768.jpg` and used on the current page. |
| `Audit/Taper/simple_calculator.html` | Simple panel and `scripts/taperLengths.js` | Width, all eight speed choices, formula selection, calculated L, Design L, shift length, rounding note, Enter submission, and the wiki reference are retained. Shift rounding was deliberately changed as requested; see below. |
| `Audit/Taper/complicated_calculator.html` | Advanced panel in `taper_lengths.html` | Posted/work-speed inputs, the 40/45 MPH choice, formula details, both result columns, and the reference are retained. The former B/D/L title adds no calculation missing from the current result table. |
| `Audit/Taper/script.js` | `scripts/taperLengths.js` | Both complete distance lookup tables, short/long formulas, merging/shift/shoulder results, buffer/sign distances, and explanatory notes are retained. |
| `Audit/Taper/styles.css` | `styles/styles.css` | Calculator/reference panels, highlighted speed buttons, peach work-speed results, formula panels, mobile layouts, and confirmation dialog are retained. The unused `#results` selector has no corresponding feature to migrate. |

No unique logic, example data, document, or image needs to be recovered from the removed files.

## Numerical and interaction comparison

Before changes, executed the archived JavaScript and current JavaScript with identical inputs. All **217 cases matched**: 56 Simple cases and 161 Advanced cases. Cases cover every speed available in the old UI and seven widths: 0, 0.1, 1, 5.5, 12, 12.25, and 16. Advanced cases cover every available posted/work-speed pair. The comparison removes the current tool's additional length-to-width ratios before comparing numeric results.

- Simple and posted speeds remain 25–60 MPH in 5 MPH increments. Work-speed buttons remain 35–60 MPH, limited to the posted speed. For posted speeds through 35 MPH, work speed automatically matches posted speed.
- The short formula remains `L = W × S² / 60` through 40 MPH; the long formula remains `L = W × S` from 45 MPH among the supported choices. Simple Design L remains rounded up to a whole number.
- Advanced merging, shift, and shoulder lengths retain their original rounding up to multiples of five. Both posted and work-speed columns match the archived outputs.
- The full buffer lookup, including its 20/65/70/75 MPH entries outside the UI, and full sign-distance lookup match the archive. The buffer is rounded up to a multiple of five for display.
- The existing 200 ft RCOC buffer text, 350 ft RCOC sign-distance text, and instruction about target arrows remain. This was a comparison of code behavior; it did not independently revalidate those engineering policies.
- The 40 MPH dialog retains both choices. The current tool also preserves independent Simple/Advanced inputs, length-to-width ratios, and explicit speed-button highlighting.

## Deliberate corrections

1. **Round shifts up in both calculators, as requested.** The archived Simple calculator could round L/2 down to the nearest five. Simple now rounds up, matching the Advanced rule. Example: width 1 and speed 25 give calculated L 10.42 and Design L 11; the Simple shift changes from 5 to 10. This changes 14 of the 56 recorded Simple cases, while their calculated L and Design L remain identical. The explanatory note and standalone Simple page were updated too.
2. **Require a speed selection.** Both old workflows could treat an unselected speed of zero as a valid input. The current tool and standalone pages now reject calculations until a speed is selected. Invalid/nonfinite widths are rejected; a deliberately entered width of zero remains supported as before.
3. **Keep the selected work speed consistent with available buttons.** Moving from posted 25/30 to a higher posted speed previously retained an invisible 25/30 work speed. That value now clears and requires a new selection from the existing buttons. A retained valid choice, such as 35, is visibly highlighted. Higher work speeds clear when posted speed decreases. The standalone Advanced page receives the same fixes and now waits for the 40/45 decision before changing its work-speed controls.

## Files to keep

- `taper_lengths.html`, `scripts/taperLengths.js`, and the shared stylesheet: the current toolbox implementation.
- `img/pexels-hngstrm-1203768.jpg`: the background image, already moved out of the old layout.
- [Regression tests](../tests/taperLengths.test.cjs), [DOM harness](../tests/helpers/taperPageHarness.cjs), and [legacy output fixtures](../tests/fixtures/taper_legacy.json): checks that do not depend on the deleted archive. Fixtures contain the original results unchanged, including the old Simple rounding, so the intentional difference is documented and tested.
- `simple_calculator.html` / `scripts/simple.js` and `complicated_calculator.html` / `scripts/complicated.js` remain working standalone URLs. They are outside `Audit/` and are not linked from the home-page toolbox. They add no unique calculation; a later consolidation could redirect these URLs to the combined tool instead of maintaining duplicate code.

## Verification

All 16 regression tests pass. Browser checks cover the main page and both standalone routes: upward rounding, speed validation, 25/30-to-60 work-speed transitions, retained-choice highlighting, both 40/45 confirmations, Enter submission, result notes, and desktop/mobile layout. No browser JavaScript errors occurred. All five archived files were hash-checked immediately before removal to ensure the reviewed copies had not changed.

Run the retained regression suite with:

```powershell
node --test tests/taperLengths.test.cjs
```
