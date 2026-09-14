# RPM calculator basis

Verified September 14, 2026 against the official **MUTCD 11th Edition with Revision 1, December 2025**, with the fixed Michigan broken-line cycle verified from **MDOT PAVE-905-E, sheet 1**.

- [Current-edition landing page](https://mutcd.fhwa.dot.gov/kno_11th_Editionr1.htm)
- [Official complete manual](https://mutcd.fhwa.dot.gov/pdfs/11th_Editionr1/mutcd11theditionr1hl.pdf)
- [MDOT PAVE-905-E: Longitudinal Line Types & Placement](https://mdotjboss.state.mi.us/TSSD/getTSDocument.htm?docGuid=0ad39b33-78dc-4b24-9eb9-8bc06279d8bd&fileName=PAVE-905-E.pdf)

The current PDF was downloaded and the applicable pages read locally. PDF page numbers are one-based.

| Provision | Printed page | PDF page |
| --- | ---: | ---: |
| 3A.03 colors; 3A.04 longitudinal patterns | 537–538 | 578–579 |
| 3B.14 paragraph 01 color; paragraph 06 pattern alignment | 568 | 609 |
| 3B.14 paragraphs 07–08; 3B.15; 3B.16 | 571 | 612 |
| 3B.17 substitution requirements | 572 | 613 |

Page 571 retains its December 2023 footer within Revision 1. Page 572 is revised December 2025: broken-line substitution is paragraph 05, solid-line substitution paragraph 06, and dotted-line substitution paragraph 08. Do not use the original 11th Edition's older paragraph numbers.

## Implemented provisions

### RCOC workbook method

The active estimator uses **RPM Spacing.xlsx, Sheet1!Q26:R33, “Existing RCOC unwritten”**, as requested by the user. Each curve requires a PC-to-PT length and a listed speed difference. The workbook's tangent / curve values are applied directly:

| Speed difference | Curve spacing | Approach / departure spacing | Physical units per station |
| --- | ---: | ---: | ---: |
| 0 mph | 50 ft | 100 ft | 1 |
| 5 mph | 25 ft | 50 ft | 1 |
| 10 mph | 25 ft | 50 ft | 1 |
| 15 mph | 25 ft | 50 ft | 1 |
| 20 mph | 25 ft | 50 ft | 1 |
| 25 mph | 25 ft | 50 ft | 1 |
| 30 mph | 25 ft | 50 ft | 1 |

The selector accepts only these seven workbook rows. Other differences are rejected rather than interpolated or extrapolated. No radius or degree of curvature is needed. The neighboring **“Andy proposed Spacing (Tanget/Curve)”** column is not used.

Sheet1!Q34 supplies the three-before-PC / three-after-PT note. The estimator places three individual markers at S, 2S, and 3S outside each end, using the tangent spacing S from that curve's workbook row. This extends 300 ft beyond each end for a 0 mph difference, or 150 ft for a listed 5–30 mph difference. Approach spacing is automatic for each curve; there is no global override.

Each curve station counts as one physical marker. The archived curvature method's two-marker rule does not apply. The active curve estimate is independent of N; the fixed Michigan N = 50 ft remains in the MUTCD reference catalogue.

The source is identified as the workbook's “Existing RCOC unwritten” method, not a published agency standard. The [1998 FHWA curvature excerpt](https://www.fhwa.dot.gov/publications/research/safety/97152/ch02.cfm) remains in a collapsed **Information only** section with its original image and N = 40 ft dimensions. Neither the archived curvature bands nor the workbook's separate speed/time calculations affect the RCOC totals.

Other MUTCD applications remain in a separate, collapsed **Information only** browser. Its selector updates only its own notes and diagram. The estimator starts with a blank curve row and a $66 unit price, updates live, and has no multiplier or Calculate button. A collapsed illustrative example uses two 500 ft curves with speed differences of 0 and 10 mph.

### Reference catalogue

N is the actual highway broken-line dash plus gap (3B.14 paragraph 07, Standard). The calculator fixes the cycle at Michigan's **12.5 ft painted dash + 37.5 ft unpainted gap = N of 50 ft**, shown for broken white lane lines and broken yellow centerlines on PAVE-905-E, sheet 1. The 12.5 ft dimension is the painted dash, not the entire cycle. The plan labels these dimensions typical; dotted lines and special patterns have separate dimensions.

The MDOT PDF was downloaded, both sheets rendered, and their dimensions visually verified. Plan date: March 25, 2020. FHWA approval: September 21, 2020. The broken-line cycle is not editable; all N-based spacing and grouping use the fixed 50 ft cycle.

With the fixed Michigan cycle, N/4 = 12.5 ft, N/2 = 25 ft, N = 50 ft, 2N = 100 ft, and 3N = 150 ft. These values are used only in the corresponding RPM applications below.

| Application | Spacing / pattern | Type |
| --- | --- | --- |
| General positioning guides | 2N | Guidance, 3B.15 paragraph 02 |
| Sharp-curve / transition guides | N or less | Option, 3B.15 paragraph 03 |
| Straight, level freeway/expressway guides | 3N, conditional on engineering judgment for wet-night delineation | Option, 3B.15 paragraph 04 |
| Solid-line supplements | No greater than N | Guidance, 3B.16 paragraph 01 B.1 |
| Edge / channelizing supplements | No greater than N/2 | Guidance, 3B.16 paragraph 01 B.1 |
| Broken-line supplements | No greater than 3N; reversible lanes N | Guidance, 3B.16 paragraph 01 B.2 |
| Dotted lane-line supplements | Application-specific; no numeric limit supplied | Guidance, 3B.16 paragraph 01 B.3 |
| At-grade intersection extensions | One marker per actual short line | Guidance, 3B.16 paragraph 01 B.4 |
| Freeway interchange extensions | No greater than N | Guidance, 3B.16 paragraph 01 B.5 |
| Solid-line substitutes | No greater than N/4; reflective units no farther apart than N/2 | Standard, 3B.17 paragraph 06 |
| Broken-line substitutes | 3–5 markers/group; pitch no greater than N/8 | Standard, 3B.17 paragraph 05 |
| Dotted-line substitutes | No greater than N/4, at least one per dot, reflective unit at least every N | Standard, 3B.17 paragraph 08 |

All estimated units are retroreflective. Mixed reflective/nonreflective arrays are not implemented.

Double and wide supplemental markings use lateral pairs (3B.16 paragraph 01 A). Positioning guides may be single rows between double lines (3B.15 paragraph 01). Double-solid substitution uses two parallel rows to simulate the pattern (3B.17 paragraph 02, Guidance), each respecting paragraph 06. Repeats multiply the complete layout, not its stripes or reflective faces.

Closer uniform spacing requires a recorded engineering basis under 3B.14 paragraph 08. The tool restricts these selections to the preset value or less. This is a tool boundary, not a claim that Guidance is a mandatory Standard. The tool does not decide warrants, engineering exceptions, or overall compliance.

Right-edge supplements display the conditions in 3B.16 paragraph 02: bicycle impacts and avoiding a wet-night pattern resembling a broken line. Freeway 3N displays its conditional nature.

## Quantity conventions and underlying model

The active curve estimator uses:

- Curve stations = ceil(PC-to-PT length / selected curve spacing) + 1. PC and PT are each counted once; a partial final interval terminates at PT.
- Curve physical markers = stations (one marker per station).
- Each curve adds three individual markers before PC and three after PT.
- Each entered curve is counted once. There is no repeat/identical-applications multiplier in the curve estimator, even if an obsolete runs input is supplied.
- Curve length and treatment length are reported separately. Treatment length = curve length + 6 × that curve’s approach spacing.
- Per-curve quantities are summed. Shared stations and overlapping treatments are not deducted because no stationing or adjacency data is entered.
- Currency is calculated in integer cents. The $66 starting unit price is the user's earlier estimate.
- A positive finite length and a listed speed difference are required for every curve. Invalid, blank, or unsafe totals are hidden instead of partially summing valid rows.

The source does not dictate this endpoint-counting convention. It is a transparent estimator choice. The workbook's five-second lookup is not stacked on top of the six-marker allowance. Current MUTCD §3B.16 paragraph 04 permits approximately five seconds of advance treatment for supplemental centerline RPMs; it does not establish the workbook's exterior-marker count.

The shared general RPM model retains its earlier arithmetic for provision regression coverage, including custom spacing, pairs, groups, project mileage, intersection counts, and supplemental approaches. The page's informational choices call only layout resolution, never those quantity calculations.

Independent example check: two 500 ft curves with 0 and 10 mph speed differences produce 11 and 21 curve markers, plus 6 exterior markers each. Their individual totals are 17 and 27 markers. Project total: 44 physical markers, $2,904 at $66 each; 1,000 ft of curves and 1,900 ft including end treatments (600 ft added to the first curve and 300 ft to the second).

## Image provenance

- img/rpm/archived-curve-guidance.png: unchanged embedded image xl/media/image1.png from the user-provided RPM Spacing.xlsx, matching the archived FHWA curvature excerpt. Its dimensions assume N = 40 ft; it is retained as information only and does not drive the estimator.

- img/rpm/pave-905-e-sheet-1.png: unchanged rendering of MDOT PAVE-905-E, sheet 1, showing Michigan broken-line dimensions and other longitudinal patterns.
- img/rpm/mutcd-spacing-provisions.png: unchanged rendering of official PDF page 612 (printed 571).
- img/rpm/mutcd-substitution-provisions.png: unchanged rendering of official PDF page 613 (printed 572).
- img/rpm/reflective-marker.png: lossless format conversion of [FHWA Figure 16](https://safety.fhwa.dot.gov/roadway_dept/horicurves/fhwasa15084/images/fig16.gif).
- img/rpm/snowplowable-marker.png: lossless format conversion of [FHWA Figure 17](https://safety.fhwa.dot.gov/roadway_dept/horicurves/fhwasa15084/images/fig17.gif).
- Photo context: [Low-Cost Treatments for Horizontal Curve Safety, 2016, Chapter 3](https://highways.dot.gov/safety/rwd/keep-vehicles-road/horizontal-curve/low-cost-treatments-horizontal-curve-safety-2016-3). Its older section numbering is not used for calculation rules.
- The live SVGs are original functional schematics, not official figures or final field layouts. The curve preview labels PC/PT, three exterior markers at each end, and up to 13 representative curve stations. The active RCOC diagram shows one physical marker per station. The reference preview retains up to 12 markers per group. Drawing coordinates are schematic rather than surveyed geometry.

## Michigan and scope

[MDOT's official index](https://mdotjboss.state.mi.us/TSSD/getCategoryDocuments.htm?category=MMUTCD&categoryPrjNumbers=2682785,1403854,1403855) lists the 2025 MMUTCD and Michigan change document. PAVE-905-E has been verified for the fixed broken-line cycle. The full Michigan manual could not be retrieved during the earlier RPM review. The page distinguishes **federal RPM provisions** from the **verified Michigan broken-line cycle** without claiming a complete Michigan or RCOC compliance review.

Temporary flexible markers, bicycle facilities, special islands, wrong-way arrows, and unlisted configurations are outside this quantity model.

## Validation

Run the Node test runner on tests/*.test.cjs. RCOC tests cover all seven workbook rows, mixed per-curve approach lengths, PC/PT endpoints, six exterior markers, partial intervals, currency, missing and unlisted speed differences, and invalid/overflowing inputs. Obsolete geometry, approach overrides, and repeat multipliers cannot change the RCOC result. Page tests cover blank inputs and the $66 starting price, both example patterns, diagram and table values, adding/removing curves, changing speed differences, invalid prices, and independent information-only browsing. The broader MUTCD provision regression fixtures remain in place.
