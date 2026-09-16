r"""Append a TCO Investigation Note.

Originally used for Traffic Control Order (TCO) file cleanup.
Selected folder only.
Run: py .\append_tco_note.py
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# FOLDER_PATH: paste the folder you want to process.
# Keep the r and quotation marks; do not end with a backslash.
# Review the other marked settings for this cleanup job.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
NOTE_TEMPLATE = "this TCO {filename} is either missing or has been rescinded. Need further investigation."
# Keep {filename} where the name should appear; other text is editable.
RECURSIVE = False
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
        if not NOTE_TEMPLATE.strip():
            raise ValueError("NOTE_TEMPLATE cannot be empty.")
        try:
            NOTE_TEMPLATE.format(filename="example.txt")
        except (KeyError, IndexError) as error:
            raise ValueError("Use only {filename} as a placeholder in NOTE_TEMPLATE.") from error
    except (OSError, ValueError) as error:
        counts["errors"] += 1
        print(f"Error: {error}")
    else:
        for path in iter_files(folder, counts):
            try:
                if path.suffix.lower() != ".txt":
                    counts["skipped"] += 1
                    continue
                note = NOTE_TEMPLATE.format(filename=path.name).encode("utf-8")
                # Binary mode preserves the original bytes and line endings.
                with path.open("r+b") as file:
                    existing = file.read()
                    if note in existing:
                        counts["skipped"] += 1
                        continue
                    separator = b"\n" if existing and not existing.endswith((b"\n", b"\r")) else b""
                    file.seek(0, os.SEEK_END)
                    file.write(separator + note + b"\n")
                counts["changed"] += 1
                print(f"Appended note: {path}")
            except (OSError, UnicodeError, ValueError) as error:
                counts["errors"] += 1
                print(f"Error processing '{path}': {error}")
    print(f"Summary: {counts['changed']} changed, {counts['skipped']} skipped, "
          f"{counts['errors']} errors.")
    return counts


if __name__ == "__main__":
    result = process_folder(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)

