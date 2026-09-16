r"""Create Missing TCO Number Placeholders.

Originally used for Traffic Control Order (TCO) file cleanup.
Selected folder only.
Run: py .\create_missing_sequence_files.py
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# FOLDER_PATH: paste the folder you want to process.
# Keep the r and quotation marks; do not end with a backslash.
# Review the other marked settings for this cleanup job.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
PRESET = "TP"  # "TP" for turning prohibitions, or "YS" for the YS job.
START_NUMBER = None  # None: lowest existing TP number, or 50 for YS.
END_NUMBER = None  # None: highest existing number.
RECURSIVE = False  # Keep False: one number sequence per selected folder.
# =====================================================
# No code changes are needed below this line.
# =====================================================

import os
from pathlib import Path


def checked_folder(folder_path):
    folder = Path(folder_path)
    if not str(folder_path).strip() or str(folder_path) == r"C:\CHANGE_ME\YourFolder":
        raise ValueError("Set FOLDER_PATH in the settings box near the top of this script.")
    if not folder.is_dir():
        raise ValueError(f"Folder not found or unavailable: {folder_path}")
    return folder


def iter_files(folder, counts):
    """List ordinary files, skipping links and reporting inaccessible entries."""
    try:
        with os.scandir(folder) as scan:
            entries = sorted(scan, key=lambda entry: entry.name.casefold())
    except OSError as error:
        counts["errors"] += 1
        print(f"Error reading folder '{folder}': {error}")
        return
    for entry in entries:
        try:
            if entry.is_symlink() or getattr(os.path, "isjunction", lambda path: False)(entry.path):
                counts["skipped"] += 1
            elif entry.is_dir(follow_symlinks=False):
                if RECURSIVE:
                    yield from iter_files(Path(entry.path), counts)
                else:
                    counts["skipped"] += 1
            elif entry.is_file(follow_symlinks=False):
                yield Path(entry.path)
            else:
                counts["skipped"] += 1
        except OSError as error:
            counts["errors"] += 1
            print(f"Error reading '{entry.path}': {error}")


def check_filename(name):
    if (not name or name in (".", "..") or name.endswith((" ", "."))
            or any(character in name for character in '\\/:*?"<>|\0')):
        raise ValueError(f"Settings produced an invalid filename: {name!r}")


def process_folder(folder_path):
    counts = {"changed": 0, "skipped": 0, "errors": 0}
    try:
        folder = checked_folder(folder_path)
        if PRESET not in ("TP", "YS"):
            raise ValueError('PRESET must be "TP" or "YS".')
        if RECURSIVE:
            raise ValueError("Keep RECURSIVE = False; each folder has its own number sequence.")
        for value in (START_NUMBER, END_NUMBER):
            if value is not None and (not isinstance(value, int) or value < 0):
                raise ValueError("START_NUMBER and END_NUMBER must be nonnegative integers or None.")
        numbers = set()
        for path in iter_files(folder, counts):
            parts = path.stem.split("-")
            if len(parts) > 1 and parts[0].upper() == PRESET and parts[1].isascii() and parts[1].isdigit():
                numbers.add(int(parts[1]))
            counts["skipped"] += 1
        if not numbers and (START_NUMBER is None or END_NUMBER is None):
            print("No matching numbered files found. Set both START_NUMBER and END_NUMBER to create a known range.")
        else:
            start = START_NUMBER if START_NUMBER is not None else (50 if PRESET == "YS" else min(numbers))
            end = END_NUMBER if END_NUMBER is not None else max(numbers)
            if end < start:
                raise ValueError("The end of the range is below its start; check the range settings.")
            for number in range(start, end + 1):
                if number in numbers:
                    continue
                name = f"YS-{number:03d}-.txt" if PRESET == "YS" else f"TP-{number}.txt"
                text = f"The file {name} is missing or the number was never taken." if PRESET == "YS" else ""
                if os.path.lexists(folder / name):
                    counts["skipped"] += 1
                    print(f"Skipped '{name}': Destination already exists.")
                    continue
                try:
                    # Exclusive creation will not overwrite an existing file or link.
                    with (folder / name).open("x", encoding="utf-8") as file:
                        file.write(text)
                    counts["changed"] += 1
                    print(f"Created missing file: {name}")
                except FileExistsError:
                    counts["skipped"] += 1
                    print(f"Skipped '{name}': Destination already exists.")
                except OSError as error:
                    counts["errors"] += 1
                    print(f"Error creating '{name}': {error}")
    except (OSError, ValueError) as error:
        counts["errors"] += 1
        print(f"Error: {error}")
    print(f"Summary: {counts['changed']} changed, {counts['skipped']} skipped, "
          f"{counts['errors']} errors.")
    return counts


if __name__ == "__main__":
    result = process_folder(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)
