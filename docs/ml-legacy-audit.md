# ML versus the LOS 4-Lane working copy

**Follow-up:** The calculator has since been reconciled to the user's HCM 6th Edition manual, as requested. See [source reconciliation, fixes and validation](ml-source-reconciliation.md). The comparisons below describe the original code before those fixes. The archive remains intact.

Reviewed September 21, 2026. Compared all nine files in `Audit/LOS 4-Lane/` with [ML.html](../ML.html), [MLscripts.js](../MLscripts.js), [MLdata.js](../MLdata.js), and [MLstyles.css](../styles/MLstyles.css).

**The executable calculator is already present in ML. Keep the five separate HTML reference pages until their contents are verified.** The reference pages contain conflicting values and interval labels, so they are not interchangeable with the JavaScript data. They have been identified as working references, not verified source tables. All nine archive files remain in place; no ML calculation or data was changed during this audit.

## Runtime files

| Archive file | Current counterpart | Comparison |
| --- | --- | --- |
| `data.js` | `MLdata.js` | Byte-for-byte identical. All truck/RV upgrade values, the downgrade table, and LOS thresholds are already present. |
| `scripts.js` | `MLscripts.js` | Exactly identical after replacing the identifier `obsFreeFlowSpeed` with `freeFlowSpeed`. No additional calculation is present in this copy. |
| `index.html` | `ML.html` | Same ten inputs, defaults, Calculate action, result, and worked steps. The current page adds the site layout and an accessible live result region. Two pieces of wording changed, recorded below. |
| `styles.css` | `styles/MLstyles.css` plus the shared stylesheet | Layout and selector scoping changes. Form/result styling remains; the current page arranges the form and results vertically and adds the shared header/footer. No calculation or control is defined only in the old CSS. |

The old heading says **“Highway LOS Calculator based on HCM 2010 Chapter 14 for Multilane Highways.”** The current heading omits the HCM edition/chapter. The old speed label says **“Observed Free Flow Speed (mph)”**; the current label says **“Free Flow Speed (mph).”** Preserve this provenance and input meaning when revising ML. The heading is an attribution in the working copy, not independent verification that the implementation follows that source correctly.

The five reference pages are not linked or loaded by the archived calculator either. Their presence adds reference material, not a separate executable feature.

## Working references to retain

| File | What it contributes / comparison |
| --- | --- |
| [ET on upgrades.html](../Audit/LOS%204-Lane/ET%20on%20upgrades.html) | Human-readable truck/bus PCE table with an HCM 2010 Exhibit 14-13 attribution. Contains 270 numeric cells, differing values, and different/ambiguous length intervals. Keep for verification. |
| [ER on upgrades.html](../Audit/LOS%204-Lane/ER%20on%20upgrades.html) | Human-readable RV PCE table with 108 numeric cells. Contains a concrete disagreement with both JavaScript copies. Keep for verification. |
| [ET on downgrades.html](../Audit/LOS%204-Lane/ET%20on%20downgrades.html) | All 28 numeric values match the JavaScript object named `erDowngradeTable`. The page identifies these as truck ET values and uses a `>4`-mile row label; the object calls that key `>>4`. Useful for resolving the lookup implementation. |
| [ER  on downgrades.html](../Audit/LOS%204-Lane/ER%20%20on%20downgrades.html) | States that downgrade ER is always 1.2. Both calculator scripts already use that fixed value. Retained with the working references. |
| [LOSforMultilane.html](../Audit/LOS%204-Lane/LOSforMultilane.html) | Human-readable A–F density criteria, FFS-dependent E/F limits, the density unit `pc/mi/ln`, and “Demand Exceeds Capacity” wording. The numeric thresholds already exist in `losTable`; this page is not displayed in ML. |

### Concrete disagreements

These comparisons use matching interior grade/length conditions; they do not choose which source is correct.

| Conditions | HTML working reference | Both copies of JavaScript data |
| --- | --- | --- |
| ET upgrade: grade >6%, length 0–0.25 mi, trucks 2% | 4.0 | 3.0 |
| ET upgrade: grade between 3% and 4%, length >1.50 mi, trucks 4% | 3.5 | 4.0 |
| ER upgrade: grade between 3% and 4%, length >0.50 mi, RVs 15% | 2.0 | 1.5 |

The ET HTML also includes the literal length label `>1.00-150`, repeats a `>0.75-1.00` interval within the 4–5% grade group, and uses 0.25–0.30 / 0.30–0.50 intervals in higher-grade groups where the JavaScript uses different buckets. A row-by-row numeric replacement would therefore be unreliable. Preserve the references intact until an authoritative table and its interval conventions are checked.

## Shared defects and incomplete behavior

These findings occur in both copies. Matching the working copy does not resolve them.

| Finding | Verified reproduction / implementation |
| --- | --- |
| Traffic volume input is ignored | `MLscripts.js` line 2 fixes V at 1,900. Changing the visible input to 3,800 leaves the complete calculation and worked steps unchanged. |
| Lane width, shoulder width, and access density do not affect results | All three are read but never used. Changing 11→12 ft, 4→8 ft, or 20→0 access points leaves the complete output unchanged. Their intended role depends on whether the supplied FFS is observed or should be estimated. |
| Downgrade ET table is not reached correctly | `getETValue` applies upgrade grade/length/percentage keys to the differently structured downgrade table. At grade 6.5%, length 5 mi, and trucks 15%, it returns fallback 1.5 although the stored downgrade row is 5.5. The current key mapping cannot reach the downgrade rows. |
| Some upgrade rows are unreachable | At grade 2.5%, length 1.2 mi, and trucks 10%, ET returns fallback 1.5 although the stored `2-3` / `>1.00` row is 2.0. The function asks for `1.00-1.50` instead. The ER 2–3% short-grade `0.00-0.50` row likewise does not match the function's split length keys; its fallback happens to equal that row's 1.2 values. |
| Intermediate FFS values can skip LOS E | `getLOS(36, 55)` and `getLOS(36, 60)` return E, while `getLOS(36, 56)` returns fallback F. E/F rows only match exact speeds 45, 50, 55, and 60. The default speed input is 56. No interpolation or alternative selection rule is implemented. Zero density also falls through to F. |
| Grade length in the summary is fixed | Entering 5,280 ft updates the length conversion step but the result sentence still says “3200 ft long grade.” |
| Density label loses the table's units | The result steps say “vehicles per mile”; the retained LOS reference labels density `pc/mi/ln`, and the calculation starts with passenger-car flow per lane. |

No alternate implementation in this folder fixes these issues. Correcting the table lookups, input assumptions, and unsupported FFS handling is separate work requiring verified source rules; the working HTML tables should not be imported blindly.

## Verification and cleanup recommendation

- Verified exact data-file equality and script equality after the single identifier rename.
- Executed old and current helpers for **14,280 lookup cases**, including grade/length boundaries, percentages, and both helper directions. All results matched.
- Compared **171 LOS boundary/speed cases** and **255 complete grade/length scenarios**. All results and complete worked-step output matched, including shared fallback behavior. Additional input-change probes reproduced the unused inputs above.
- Browser checks confirmed equal default results (upgrade C, downgrade C), ignored traffic-volume changes, and the fixed grade-length sentence in both pages. All six archived HTML pages load successfully.
- Compared the separate reference tables with the JavaScript data and inspected their labels and source attributions.

The four runtime files (`index.html`, `scripts.js`, `data.js`, and `styles.css`) add no executable capability that ML lacks. Their identifying wording is preserved in this report. They are candidates for removal in a cleanup pass. **Keep the five reference pages together until verified**, as requested; the entire folder has been left intact for now.
