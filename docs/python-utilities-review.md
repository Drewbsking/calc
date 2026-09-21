# Python utilities: archive review

Reviewed all 29 Python scripts supplied in `python/OLD`, including the later CSV-to-MediaWiki converter, wrapped-data cleaner, PDF-to-MP3 converter, audio transcription tool, UD-10 downloader, and SVG-to-DXF converter, plus `python/Seasonal Factors/SeasonalFactorPlots.py`. The catalog now provides 25 standalone downloads: the two existing tools plus 23 additions. Related variations are combined and their original uses are documented on the page.

Many scripts originated in Traffic Control Order (TCO) file cleanup. Job-specific values are examples, not current TCO naming standards. Originals were inspected as source only; they were not run against their embedded paths.

## Decisions

- Combine related variations, keeping named presets or settings for their original uses.
- Removed superseded source files after verifying their replacements, including `Transcribe.py`, `ud10.py`, and `batch_svg_to_dxf.py`. The `python/OLD` folder is now empty; its removal was previously blocked by Windows access restrictions and a policy rejection of forced deletion. The mapping below preserves the history of all 29 original scripts. The CSV converter's supplied output is preserved as `tests/fixtures/csv_to_mediawiki_legacy.txt` for regression checks. The Atomic Habits examples are preserved in `python/examples/pdf-to-mp3/`, and the supplied crash-ID CSV is preserved unchanged in `python/examples/ud10/Crash_IDs_for_2019.csv`.
- Some old TCO rules could not be confirmed. The replacement utility starts with REPLACEMENT and MATCH_TEXT blank; year conversion starts with YEAR_CUTOFF unset. These scripts reject execution until users supply those settings.
- Keep downloads standalone. The first 20, the UD-10 downloader, and the SVG-to-DXF converter use only Python's standard library. SVG-to-DXF also requires desktop Inkscape. UD-10 downloads require internet access. PDF-to-MP3 requires `pypdf`, `gTTS`, and internet access. Audio transcription requires `openai-whisper`, FFmpeg, and internet access for the initial model download, then runs locally. Each has a settings box, a main guard, generic path placeholders, and result reporting.
- Preserve the original folder scope in each listing. New utilities skip symbolic links and directory junctions.
- Seasonal factor plotting requires `openpyxl` and `matplotlib`. It runs locally and keeps the supplied workbook, three PNGs, and two PDFs unchanged in `python/examples/seasonal-factors/`. The catalog links all six example assets. The redundant `SeasonalFactorPlots.py` was removed; the maintained download is `python/seasonal_factor_plots.py`. The former `python/Seasonal Factors/` folder was moved into examples after its redundant script was removed.
- Find and Replace retains a preview and confirmation. Report tools do not modify files; other tools apply changes when run.

## Original-to-catalog mapping

| Original script | Catalog download | Disposition / scope |
| --- | --- | --- |
| `add 00 to thrid section.py` | [Clean TCO Prefix, Spaces and Third Section](../python/normalize_tco_filename.py) | Combined variation; Selected folder only |
| `add dash after SS.py` | [Add a Hyphen After YS or SS](../python/normalize_stop_yield_separator.py) | Added; Includes subfolders |
| `add dash.py` | [Replace Spaces in PDF and Word Filenames](../python/replace_spaces_in_filenames.py) | Duplicate removed; already listed; Selected folder only |
| `add Files in sequance.py` | [Create Missing TCO Number Placeholders](../python/create_missing_sequence_files.py) | Combined variation; Selected folder only |
| `add Text files.py` | [Create Missing TCO Number Placeholders](../python/create_missing_sequence_files.py) | Combined variation; Selected folder only |
| `add Text.py` | [Fill Empty TXT Files](../python/fill_empty_txt_files.py) | Duplicate removed; already listed; Selected folder only |
| `add to text.py` | [Append a TCO Investigation Note](../python/append_tco_note.py) | Added; Selected folder only |
| `append folder to file name..py` | [Add Revision and Folder Name](../python/append_folder_to_tco_filename.py) | Added; Includes subfolders |
| `batch_svg_to_dxf.py` | [Batch Convert SVG to DXF](../python/batch_svg_to_dxf.py) | Added; Includes subfolders; installed Inkscape required |
| `check for P.py` | [List Filenames Missing a Marker](../python/report_missing_filename_marker.py) | Added; Selected folder only · Report only |
| `clean_data.py` | [Join Wrapped Data Lines](../python/clean_wrapped_data.py) | Added; One CSV or text input, one new CSV output |
| `CVS to WIki/CVS to Wiki Table.py` | [Convert a Pay-Item CSV to MediaWiki](../python/csv_to_mediawiki.py) | Added; One CSV input, one TXT output |
| `empty folders.py` | [Find Empty Folders](../python/find_empty_folders.py) | Added; Includes subfolders · Report only |
| `fiund and replaec.py` | [Find and Replace Filename Text](../python/find_replace_filenames.py) | Combined variation; Includes subfolders by default |
| `move text in file name.py` | [Move a Filename Section to the End](../python/move_filename_token_to_end.py) | Added; Selected folder only |
| `PDFtoGTTS.py` | [Convert PDF to MP3](../python/pdf_to_mp3.py) | Added; One PDF input, one new MP3 output; online speech service |
| `rename thrid part.py` | [Replace the Third TCO Section](../python/replace_tco_third_section.py) | Added; Includes subfolders |
| `second part three.py` | [Pad the Second TCO Section](../python/pad_tco_sequence_number.py) | Added; Includes subfolders |
| `Seasonal Factors/SeasonalFactorPlots.py` | [Seasonal Factor Heatmaps](../python/seasonal_factor_plots.py) | Added; One Excel workbook, one PNG per selected year; redundant original removed, all six examples retained |
| `strip before 63.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip before space p space.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip before TS.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip ending.py` | [Remove a Trailing Filename Suffix](../python/remove_filename_suffix.py) | Added; Selected folder only |
| `suffix.py` | [Append a Filename Suffix](../python/append_filename_suffix.py) | Added; Selected folder only |
| `take away leading text.py` | [Find and Replace Filename Text](../python/find_replace_filenames.py) | Combined variation; Includes subfolders by default |
| `take away tco add 0000 and add -.py` | [Clean TCO Prefix, Spaces and Third Section](../python/normalize_tco_filename.py) | Combined variation; Selected folder only |
| `to the right of comma.py` | [Keep Text Before a Comma and Add a Revision](../python/trim_after_comma_add_revision.py) | Added; Selected folder only |
| `Transcribe.py` | [Transcribe Audio to Text](../python/transcribe_audio.py) | Added; One recording, one new TXT output; local Whisper model |
| `ud10.py` | [Download UD-10 Reports from a CSV](../python/download_ud10_reports.py) | Added; First-column crash IDs from one CSV; downloads SEMCOG PDFs |
| `years.py` | [Expand a Two-Digit TCO Year](../python/expand_tco_year.py) | Added; Includes subfolders |

## Clarified behavior and corrections

- **Seasonal factors:** preserves Jan–Dec rows, Mon–Sun columns, the default 2021–2023 years, and 300 DPI PNG export. Adds workbook, sheet, year range, output folder, and DPI settings. Uses openpyxl and Matplotlib directly instead of pandas and seaborn. All selected years share symmetric color bounds centered at 1.00; factors from 0.95 to 1.05 use actual bold text instead of literal Markdown asterisks. Missing data is gray and marked with a dash. Required columns, numeric factors, duplicate months, and missing years are checked before writing. The default output is `seasonal_heatmaps` beside the workbook. Existing output names reject the run; exclusive creation protects against files appearing later, and failed saves remove only their partial image. Plotting uses an offscreen canvas without blocking windows. Formula inputs use saved values and should be recalculated in Excel first. The supplied workbook contains 300 monthly records from 1999–2023. The original PNGs and PDFs are linked as supplied examples, not presented as output from the revised renderer. API reference: [Matplotlib image plots](https://matplotlib.org/stable/api/_as_gen/matplotlib.axes.Axes.imshow.html).

- **SVG-to-DXF:** retains recursive conversion, parallel workers, mirrored output folders, CSV reporting, and the original command-line options. Adds catalog-style settings and a per-file timeout. Starts with two workers rather than one per CPU core. SVG matching is case-insensitive; links and junctions are excluded. Exports to a temporary DXF and checks for a successful, nonempty result before saving it. Default exclusive creation preserves existing destinations; explicit `OVERWRITE` or `--overwrite` atomically replaces a DXF only after conversion succeeds. Export failures and timeouts are reported per file and produce a nonzero exit status without stopping the remaining conversions. Reports default to the chosen output root or SVG folder; numbered report names preserve prior runs, and explicit existing report paths are rejected. DXF details depend on the installed Inkscape exporter; no specific DXF version is assumed. CLI export reference: [Inkscape's export-extension implementation and DXF examples](https://gitlab.com/inkscape/inkscape/-/merge_requests/2294). The old `python/OLD/batch_svg_to_dxf.py` is removed after verification.

- **UD-10 downloads:** replaces pandas, Selenium, and webdriver-manager with standard-library CSV parsing and HTTP downloads. The archived SEMCOG page returned HTTP 403 during verification; the `https://ud10.semcog.org/ud10?crash_id=...` endpoint already used by `scripts/ud10.js` returned a PDF for the first supplied example ID. Validates all first-column IDs before making requests, preserves leading zeros, and skips blanks and duplicate IDs. Creates `UD10_reports/UD10_<ID>.pdf` beside the CSV by default. Offers an output folder, report limit, request delay, and timeout. Downloads are sequential; existing destinations are skipped, new files are created exclusively, and non-PDF or incomplete responses are rejected with partial files removed. HTTP 401, 403, and 429 stop the batch; other report failures are counted and processing continues. The 547-ID example CSV is preserved byte-for-byte. Verification downloads only the first example report to temporary storage, not the full list.

- **Audio transcription:** replaces the personal meeting path with `AUDIO_FILE_PATH`, preserves Whisper's `base` model by default, and adds optional model and language settings. Runs on the CPU with `fp16=False`, producing speech in its original language. Prints the transcript and saves UTF-8 text as `<audio name>_transcription.txt` beside the recording, with an optional output path. Validates paths, FFmpeg availability, and model name before loading the model. Rejects existing output files before transcription and uses exclusive creation to protect files created during a run. Failed transcription or empty results create no output; failed writes and Ctrl+C remove incomplete output. Importing the script does not load Whisper or start work. Recordings stay local; model downloads require internet on first use. The obsolete `python/OLD/Transcribe.py` is removed. Setup reference: [official Whisper documentation](https://github.com/openai/whisper#setup).

- **PDF-to-MP3:** replaces Tkinter dialogs with catalog-style file settings and PyPDF2 with `pypdf`. Uses gTTS for speech, with English and normal speed as defaults. Joins extracted pages with separators, skips and reports pages without text, and rejects entirely unreadable or encrypted PDFs. OCR is not included. Creates `<PDF name>.mp3` beside the input unless another output path is set. Existing destinations are rejected before conversion, creation is exclusive, and a service failure or Ctrl+C removes incomplete output. Extracted text is sent to Google's speech service; the page states this exception to local processing. The supplied Atomic Habits PDF and MP3 are linked as examples, with an audio player using `preload="none"`; the supplied audio is not represented as newly generated output. Package API references: [pypdf text extraction](https://pypdf.readthedocs.io/en/stable/user/extract-text.html) and [gTTS](https://gtts.readthedocs.io/en/stable/module.html).

- **Wrapped-data cleanup:** preserves the original rule that any comma-containing line starts a record and subsequent comma-free lines are appended with a comma and space. Replaces Tkinter dialogs with marked input/output path settings. Ignores blank lines to avoid the original stray delimiters, and rejects leading continuation text rather than inventing an empty first field. This is a format-specific line joiner, not a general CSV parser: quoted commas also start records. The input is preserved, existing outputs are rejected, and the default output is `<input name>_cleaned.csv` beside the input.

- **CSV-to-MediaWiki:** replaces pandas with the standard CSV library. Requires PayItemCode, Units, Description, and AUP headers; allows reordered headers and ignores extra columns. Preserves text values, leading zeros, and decimal formatting. UTF-8 BOMs, quoted commas, and multiline cells are supported; literal wiki syntax is escaped. Creates MediaWiki_Table.txt beside the input by default, with an optional output path. Rejects existing output files and malformed CSV before creating output. The original 230-row sample is covered by a format regression test.

- **Third-section replacement:** the source checked whether the section contained `0` or `25`, although its comment said otherwise. The historical replacement was `2500`. Users must explicitly choose both matching substrings and replacement.
- **Year conversion:** the old cutoff of 25 maps 25 to 1925. Users must choose a cutoff; no current-year assumption is introduced.
- **Comma cleanup:** despite the old script's title, its code kept text before the comma. The catalog names this accurately and avoids adding a duplicate revision.
- **Combined TCO cleanup:** prefix removal and space replacement now apply independently of third-section expansion. The old code only renamed files when that section had two characters.
- **Numeric operations:** padding and year conversion require numeric sections instead of changing arbitrary text or failing on it.
- **NLT cleanup:** moving a token matches a whole hyphen-separated section; removing a suffix affects only the trailing suffix.
- **Reruns:** suffixes, folder names, revisions, and identical investigation notes are not appended repeatedly.
- **Collisions:** renames skip existing destinations. The old YS/SS utility generated numbered alternatives; the catalog consistently skips conflicts. Placeholder creation uses exclusive creation.
- **Sequence presets:** TP fills the observed minimum-to-maximum range with empty text files; YS starts at 50 and writes its original note. Explicit endpoints support known ranges. Empty folders require both endpoints.
- **Find and Replace:** literal replacement can include the extension, as in the original. The TCO-removal preset strips outer spaces. Folder separators and empty results are rejected.
- **Text notes:** existing bytes are preserved. An investigation label does not verify that a TCO has been rescinded.

## Maintaining the catalog

Add a standalone file under `python/`, then a matching static `data-python-utility` section and task-index link in `pythonUtilities.html`. The download link supplies the displayed and copied source. Keep settings, examples, file types, and folder scope aligned with the download, and add focused behavioral tests.

```powershell
py -B -W error -m unittest discover -s tests -p "test_python_utilit*.py" -v
node --test tests/pythonUtilitiesPage.test.cjs
node --check scripts/pythonUtilities.js
```
