r"""Join wrapped data lines using the original clean_data.py record rule.

A line containing any comma starts a new record. Following lines without a
comma are appended with ", ". Blank lines are ignored and outer whitespace
is trimmed. Use only for data that follows this specific layout.
Run from Windows Terminal: py .\clean_wrapped_data.py
The input file is never changed. No extra packages or file dialogs are needed.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# INPUT_FILE_PATH: paste the full path to your CSV or text file.
# Keep the r and quotation marks.
# =====================================================
INPUT_FILE_PATH = r"C:\CHANGE_ME\wrapped_data.csv"
OUTPUT_FILE_PATH = ""  # Blank: create <input name>_cleaned.csv beside the input.
INPUT_ENCODING = "utf-8-sig"  # Reads UTF-8 text with or without a BOM.
# Optional output example: r"C:\Work\cleaned_data.csv"
# No code changes are needed below this line.

import os
from pathlib import Path


def clean_data(content):
    """Trim and join records; reject continuation text before the first record."""
    records = []
    current = None
    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        if "," in line:
            if current is not None:
                records.append(current)
            current = line
        elif current is None:
            raise ValueError(
                f"Line {line_number} has text before the first comma-containing record. "
                "Check that this input follows the required record layout."
            )
        else:
            current += ", " + line
    if current is not None:
        records.append(current)
    return "\n".join(records)


def clean_file(input_file_path, output_file_path="", encoding=INPUT_ENCODING):
    """Create a new cleaned file after validating the entire input."""
    if not str(input_file_path).strip() or str(input_file_path) == r"C:\CHANGE_ME\wrapped_data.csv":
        raise ValueError("Set INPUT_FILE_PATH in the settings box to your CSV or text file.")
    source = Path(input_file_path)
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"Input file not found or not an ordinary file: {source}")
    cleaned = clean_data(source.read_text(encoding=encoding))
    if not cleaned:
        raise ValueError("The input contains no records. No output file was created.")
    destination = Path(output_file_path) if output_file_path else source.with_name(source.stem + "_cleaned.csv")
    if destination.resolve() == source.resolve():
        raise ValueError("The output must be a different file from the input.")
    if os.path.lexists(destination):
        raise FileExistsError(f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH.")
    try:
        with destination.open("x", encoding="utf-8", newline="\n") as output:
            output.write(cleaned)
    except FileExistsError as error:
        raise FileExistsError(
            f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH."
        ) from error
    return destination


def main():
    try:
        destination = clean_file(INPUT_FILE_PATH, OUTPUT_FILE_PATH, INPUT_ENCODING)
    except (OSError, UnicodeError, ValueError, LookupError) as error:
        print(f"Error: {error}")
        return 1
    print(f"Cleaned data saved to: {destination.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
