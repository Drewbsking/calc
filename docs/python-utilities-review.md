# Python utilities: archive review

Reviewed all 25 Python scripts supplied in `python/OLD`, including the later CSV-to-MediaWiki converter and wrapped-data cleaner. The catalog now provides 20 standalone downloads: the two existing tools plus 18 additions. Related variations are combined and their original uses are documented on the page.

Many scripts originated in Traffic Control Order (TCO) file cleanup. Job-specific values are examples, not current TCO naming standards. Originals were inspected as source only; they were not run against their embedded paths.

## Decisions

- Combine related variations, keeping named presets or settings for their original uses.
- Removed superseded source files after verifying their replacements. The mapping below preserves the history of all 25 original scripts. The CSV converter's supplied output is preserved as `tests/fixtures/csv_to_mediawiki_legacy.txt` for regression checks.
- Some old TCO rules could not be confirmed. The replacement utility starts with REPLACEMENT and MATCH_TEXT blank; year conversion starts with YEAR_CUTOFF unset. These scripts reject execution until users supply those settings.
- Keep downloads standalone and dependency-free. Each has a settings box, a main guard, generic folder placeholders, per-file reporting, and a final summary.
- Preserve the original folder scope in each listing. New utilities skip symbolic links and directory junctions.
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
| `check for P.py` | [List Filenames Missing a Marker](../python/report_missing_filename_marker.py) | Added; Selected folder only · Report only |
| `clean_data.py` | [Join Wrapped Data Lines](../python/clean_wrapped_data.py) | Added; One CSV or text input, one new CSV output |
| `CVS to WIki/CVS to Wiki Table.py` | [Convert a Pay-Item CSV to MediaWiki](../python/csv_to_mediawiki.py) | Added; One CSV input, one TXT output |
| `empty folders.py` | [Find Empty Folders](../python/find_empty_folders.py) | Added; Includes subfolders · Report only |
| `fiund and replaec.py` | [Find and Replace Filename Text](../python/find_replace_filenames.py) | Combined variation; Includes subfolders by default |
| `move text in file name.py` | [Move a Filename Section to the End](../python/move_filename_token_to_end.py) | Added; Selected folder only |
| `rename thrid part.py` | [Replace the Third TCO Section](../python/replace_tco_third_section.py) | Added; Includes subfolders |
| `second part three.py` | [Pad the Second TCO Section](../python/pad_tco_sequence_number.py) | Added; Includes subfolders |
| `strip before 63.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip before space p space.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip before TS.py` | [Trim Before a Filename Marker](../python/trim_before_filename_marker.py) | Combined variation; Selected folder only |
| `strip ending.py` | [Remove a Trailing Filename Suffix](../python/remove_filename_suffix.py) | Added; Selected folder only |
| `suffix.py` | [Append a Filename Suffix](../python/append_filename_suffix.py) | Added; Selected folder only |
| `take away leading text.py` | [Find and Replace Filename Text](../python/find_replace_filenames.py) | Combined variation; Includes subfolders by default |
| `take away tco add 0000 and add -.py` | [Clean TCO Prefix, Spaces and Third Section](../python/normalize_tco_filename.py) | Combined variation; Selected folder only |
| `to the right of comma.py` | [Keep Text Before a Comma and Add a Revision](../python/trim_after_comma_add_revision.py) | Added; Selected folder only |
| `years.py` | [Expand a Two-Digit TCO Year](../python/expand_tco_year.py) | Added; Includes subfolders |

## Clarified behavior and corrections

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
