r"""Convert a pay-item CSV to a MediaWiki table.

Required CSV headers: PayItemCode, Units, Description, AUP.
Run from Windows Terminal: py .\csv_to_mediawiki.py
Uses Python's standard library only. The source CSV is never changed.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# CSV_FILE_PATH: paste the full path to your input CSV file.
# Keep the r and quotation marks.
# =====================================================
CSV_FILE_PATH = r"C:\CHANGE_ME\pay_items.csv"
OUTPUT_FILE_PATH = ""  # Blank: create MediaWiki_Table.txt beside the CSV.
CSV_ENCODING = "utf-8-sig"  # Reads CSV UTF-8 exports, with or without a BOM.
# For another output location, use r"C:\Work\My_Wiki_Table.txt".
# No code changes are needed below this line.

import csv
import html
import os
from pathlib import Path


COLUMNS = ("PayItemCode", "Units", "Description", "AUP")


def escape_cell(value):
    """Keep literal CSV text from introducing MediaWiki table or template markup."""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    text = html.escape(text, quote=False)
    for character, entity in (("[", "&#91;"), ("]", "&#93;"), ("{", "&#123;"),
                              ("}", "&#125;"), ("'", "&#39;")):
        text = text.replace(character, entity)
    return text.replace("|", "<nowiki>|</nowiki>").replace("\n", "<br />")


def convert_to_mediawiki_table(rows):
    """Render dictionaries as the original four-column table, preserving text values."""
    lines = ['{| class="wikitable"', "! " + " !! ".join(COLUMNS)]
    for row in rows:
        lines.extend(("|-", "| " + " || ".join(escape_cell(row[column]) for column in COLUMNS)))
    lines.append("|}")
    return "\n".join(lines)


def load_and_convert_csv(file_path, encoding=CSV_ENCODING):
    """Read and validate the entire CSV before creating any output file."""
    if not str(file_path).strip() or str(file_path) == r"C:\CHANGE_ME\pay_items.csv":
        raise ValueError("Set CSV_FILE_PATH in the settings box to your input CSV file.")
    source = Path(file_path)
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"CSV file not found or not an ordinary file: {source}")
    with source.open("r", encoding=encoding, newline="") as file:
        reader = csv.DictReader(file, strict=True)
        if reader.fieldnames is None:
            raise ValueError("The CSV is empty. Add a header row: " + ", ".join(COLUMNS))
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("The CSV has duplicate column headers. Each header must be unique.")
        missing = [column for column in COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError("Missing required CSV columns: " + ", ".join(missing))
        rows = []
        for row in reader:
            if None in row:
                raise ValueError(f"CSV line {reader.line_num} has more values than the header row.")
            if not any(value and value.strip() for value in row.values()):
                continue
            if any(value is None for value in row.values()):
                raise ValueError(f"CSV line {reader.line_num} has fewer values than the header row.")
            rows.append(row)
    return convert_to_mediawiki_table(rows)


def convert_csv_file(file_path, output_file_path="", encoding=CSV_ENCODING):
    """Create a new text file containing the table; never replace an existing file."""
    table = load_and_convert_csv(file_path, encoding)
    source = Path(file_path)
    destination = Path(output_file_path) if output_file_path else source.with_name("MediaWiki_Table.txt")
    if destination.resolve() == source.resolve():
        raise ValueError("The output must be a different file from the input CSV.")
    if os.path.lexists(destination):
        raise FileExistsError(f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH.")
    try:
        with destination.open("x", encoding="utf-8", newline="\n") as output:
            output.write(table)
    except FileExistsError as error:
        raise FileExistsError(
            f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH."
        ) from error
    return destination


def main():
    try:
        destination = convert_csv_file(CSV_FILE_PATH, OUTPUT_FILE_PATH, CSV_ENCODING)
    except (OSError, UnicodeError, csv.Error, ValueError, LookupError) as error:
        print(f"Error: {error}")
        return 1
    print(f"MediaWiki table saved to: {destination.resolve()}")
    print("Open the text file and paste its contents into a wiki page's source editor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
