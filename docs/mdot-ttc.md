# MDOT TTC Typical Selector

The Work Zones card opens `calculators/mdot-ttc/`. Users browse all individual MDOT construction, maintenance, and survey traffic typicals, keep a separate project selection, copy a two-column table into Word, download an editable Word table, or combine selected MDOT sheets into one PDF. The tool uses the existing static site and makes no runtime requests to MDOT for exports.

## Catalog sources and meaning

The catalog contains **136 individual typicals: 88 construction, 32 maintenance, and 16 survey**. Membership comes from all three official MDOT PDF catalogs, so future refreshes include newly listed typicals even when the workbook has no corresponding row. Combined sets, CAD files, and sign-calculation spreadsheets are excluded to avoid duplicate details and non-PDF documents.

**Sheet1** of `MDOT TTC Typ Cheat Sheet.xlsx` supplies titles, classifications, notes, and maintenance relationships for its original 82 construction typicals and 15 maintenance alternatives. The workbook is read by sheet name, not worksheet file order. Totals, sign quantities, saved usage counts, saved project selections, and the “DID NOT REVIEW” placeholder are not imported.

Workbook titles, notes, and original classifications are preserved in `filters`. Missing titles are filled from the matching MDOT catalog record; missing workbook classifications are “Unspecified.” Only case and whitespace variants are combined in those source fields. Original lane labels such as “2,” “2+,” and “4 or 5” remain available in the card's workbook disclosure. A maintenance sister is a related choice, not an automatic replacement or a recipient of the construction typical's RCOC classification.

The browsing fields in `classifications` separate **Roadway type**, **Traffic arrangement**, and **Control method**. Roadway types are Divided, Undivided, and Freeway; arrangements include crossovers, closures, shifts, merges, and rolling roadblocks; methods include traffic regulators, temporary signals, and AFADs. `classify()` in the refresh script derives these only from explicit workbook labels and the record's workbook/MDOT titles. Filename abbreviations, notes about other typicals, and related sheets are not used to infer classifications. Unknown values remain Unspecified. These are browsing categories, not additional MDOT classifications.

A record can have multiple values: a freeway/divided-roadway detail with a closure and shift appears under both roadway types and both arrangements. OR within a field and AND across fields still apply, with no duplicate results; option counts can overlap. Intersection stays a Work area, while Crossovers, Single Shift, and Crush and Shape are removed from Work area. Notes, Signal Work, and Crush and Shape are not control methods. The cards retain their **Original workbook classifications** disclosure, including the workbook's Crush and Shape label on sheet 311, whose title instead identifies a crossover closure. Refreshes regenerate the browsing categories without changing the workbook, original labels, titles, notes, RCOC usage, or paint flags.

For typicals absent from the workbook, project type comes from the MDOT source family; all other original workbook classifications, including RCOC usage and paint, remain “Unspecified.” Their cards identify the missing workbook classifications, while explicit titles can supply the browsing categories above. Four filename-only catalog entries (302, 303, 304, and 4204) use titles verified from the PDF title blocks, recorded in `DOCUMENT_TITLES` in the importer. Descriptive MDOT catalog titles take precedence if MDOT adds them later.

**Existing lanes** and **Lanes closed** replace the ambiguous Number of lanes filter. Existing counts are labeled as totals across both directions (including a center turn lane where present), counts in the affected direction, or counts on the ramp. `lane_classifications()` prefers the descriptive MDOT title, falling back to the workbook title when MDOT lists only an identifier. Exact workbook counts can fill missing totals for explicitly undivided roads. Mixed labels and `+` values are preserved as source text, not interpreted as applicability ranges. For example, 123 uses MDOT's four-lane title while retaining the workbook's “4 or 5”; 202 uses three lanes in the affected direction while retaining “1+.”

Closed-lane counts are separate from road size and shift counts, and include center turn lanes when explicitly closed. Staged closures such as 202 match both one- and two-lane closure choices without duplicating the typical. Parking-only and ramp-only closures are identified separately. Shoulder closures and work outside the shoulder show “No lane closure”; unspecified counts are never treated as zero. A shift, temporary signal, unnumbered group of lanes, or mobile operation alone does not establish the number closed. Shoulder references become Work area options rather than lane-count labels. These are descriptive browsing categories; the original detail and workbook references remain available on every card.

The workbook's paint-quantity column supplies flags rather than a filter. “Yes” shows **Paint required** and “Maybe” shows **Paint may be required** on the typical and in the selected-details list. A reminder above the download buttons summarizes flagged selections and updates when details are added, removed, restored, or reset. “No” and “Unspecified” do not trigger a warning; missing values are not treated as a confirmed “No.”

PDF identifiers, URLs, and update dates are verified against the [MDOT construction catalog](https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=1403892&subCategory=Maintaining+Traffic+Typicals+), [maintenance catalog](https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=2173385&subCategory=Maintenance+Maintaining+Traffic+Typicals+), and [survey catalog](https://mdotjboss.state.mi.us/TSSD/getSubCategoryDocuments.htm?category=Work+Zones&prjNumber=2173386&subCategory=Survey+Maintaining+Traffic+Typicals+). Matching uses the unique typical number within its document family. For example, workbook 101 is mapped to `101-GEN-SPACING-CHARTS`, correcting its workbook hyperlink to 102. Codes with spacing or suffix discrepancies use the verified MDOT filename; literal plus signs in filenames are URL-encoded correctly.

`catalog.json` records the source workbook checksum, verification time, provenance rows, source URL and title, MDOT update date, PDF byte count, page count, and SHA-256 checksum. PDFs are stored under immutable checksum filenames. Source pages are copied without rasterization, resizing, or rotation changes. The downloaded packet adds a title page, index, and page-number labels; stored source PDFs stay intact.

## Refreshing the stored documents

Use Python 3.10 or later with `pypdf` installed. From the repository root:

```powershell
py -3.13 calculators/mdot-ttc/update_catalog.py
```

An alternate workbook or output directory can be supplied with `--workbook` and `--output`. Review the changed catalog and run the checks below before publishing through the site's existing deployment process. Refresh is manual; the displayed verification date describes the stored snapshot, not a live check on MDOT.

The script validates the expected workbook headers, resolves every workbook reference, imports every individual PDF from all three MDOT listings, downloads PDFs into a temporary directory, checks signatures and page geometry, and only then promotes the files. It records the official family counts and replaces the catalog last, atomically. Missing catalogs or PDF links, ambiguous identifiers, invalid responses, and interrupted promotion cannot switch the active catalog to an incomplete set. Older PDF files are retained because an open browser may still reference an earlier catalog. The source workbook is never edited.

If an identifier in the previous stored catalog disappears from MDOT, refresh stops with the affected IDs. After confirming an official withdrawal, `--allow-removals` permits that change. Workbook references to withdrawn typicals must still be resolved in the workbook before refreshing.

## Project and export behavior

New projects start with no details selected, no active filters, and all 136 typicals visible. **Show all typicals** and **Clear filters** clear the search and filters to expose the complete catalog, including unclassified additions and the Survey Work project type. Changing filters does not change selections. Clear selection persists an intentionally empty project; Reset project clears the project name, selections, search, and filters. The project name and selected IDs are stored in this browser under `mdot-ttc-project-v1`; earlier saved selections without a name still load. Existing saved projects retain their choices until cleared or reset. If storage is unavailable, selection and exports continue in memory with a visible message.

Filter options display live matching counts that include the search and all other filter groups, while ignoring choices within their own group. This keeps alternatives visible when multiple choices are allowed. Zero-count options remain visible and selectable, and checked options can always be removed. Counts update without closing filter groups or moving keyboard focus. Selected project details do not affect the counts.

RCOC usage is a card tag, not a filter. Once any valid typical is selected, every record classified RCOC **Always** (currently general sheets 100–104) is included in the report. The automatically added sheets appear separately from the user's selections; the report total and Word table preview include them. Copy, Word, and PDF exports all use the same naturally sorted union, including each detail only once, even if an Always sheet was explicitly selected. Search and filters never exclude these required sheets from reports. Clearing the last selection or resetting the project leaves an empty report with exports disabled. Only explicit choices are saved; automatic inclusions are recalculated from the catalog.

Every export captures its full report before starting, including the Always sheets; PDF export also captures the project name. Both formats use the same natural typical-number order. PDF export checks each file's checksum and expected page count, aborts the entire packet on failure, and identifies the affected typical. Retry uses the current selection and project name. A failed Always sheet must be restored before the report can be downloaded.

The project name is required for PDF downloads and may contain up to 160 characters. The PDF begins with a letter-sized title page and an index listing each typical number, title, and packet page range. Index rows link to the first page of that detail. Index pages expand as needed and repeat their column headings. Continuous “Page X of Y” labels include the title and index, so references match a PDF viewer's page count. Number labels occupy the blank bottom margin on current MDOT sheets, leaving their dimensions and original artwork intact. Project names use the PDF's standard Helvetica font; unsupported characters produce a clear error instead of being silently dropped.

Word exports are real OOXML `.docx` tables with repeating headers, explicit column widths, wrapped titles, and rows that do not split across pages. Clipboard export supplies HTML and plain text. If clipboard access fails, the visible table is selected for manual copying. Word and clipboard exports do not require a project name and retain the two-column table. Exports are disabled until at least one detail is selected.

The export libraries are stored locally in `vendor/`: **pdf-lib 1.17.1** and **docx 9.5.1**, with their MIT licenses. `vendor/manifest.json` records the npm archive URLs, registry integrity hashes, and local bundle checksums. No package installation or build step is needed to serve the selector.

## Validation

```powershell
node --test tests/*.test.cjs
py -3.13 -m unittest discover -s tests -p test_mdot_ttc_catalog.py
py -3.13 tests/mdot_ttc_browser.py
py -3.13 tests/calculator_routes_browser.py
```

Core checks cover filters, notes, defaults, project-name and selection persistence, immutable export selections, escaping, source checksums, PDF page geometry, rotated pages, and export failures. Importer tests simulate failed downloads, malformed PDFs, ambiguous catalog records, and a failed final promotion. Browser checks cover the real downloads, title and index content, index destinations, page numbers, clipboard fallback, storage failures, catalog loading failures, mobile layout, and hosting under `/calc/`. Generated QA files stay in the system temporary directory.
