r"""Add a Hyphen After YS or SS.

Originally used for Traffic Control Order (TCO) file cleanup.
Includes subfolders. Matches uppercase YS and SS exactly. Existing destination names are skipped rather than assigned an extra number.
Run: py .\normalize_stop_yield_separator.py
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# FOLDER_PATH: paste the folder you want to process.
# Keep the r and quotation marks; do not end with a backslash.
# Review the other marked settings for this cleanup job.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
RECURSIVE = True  # True includes subfolders; False processes only this folder.
EXTENSIONS = ()  # Empty means all file types.
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
    """Apply this script's rename rule and return a summary."""
    counts = {"changed": 0, "skipped": 0, "errors": 0}
    try:
        folder = checked_folder(folder_path)
        validate_settings()
    except (OSError, ValueError) as error:
        counts["errors"] += 1
        print(f"Error: {error}")
    else:
        for path in iter_files(folder, counts):
            try:
                if EXTENSIONS and path.suffix.lower() not in EXTENSIONS:
                    counts["skipped"] += 1
                    continue
                name = renamed_filename(path.name, path.parent.name)
                if name is None or name == path.name:
                    counts["skipped"] += 1
                    continue
                check_filename(name)
                destination = path.with_name(name)
                if os.path.lexists(destination):
                    counts["skipped"] += 1
                    print(f"Skipped '{path}': Destination already exists: '{name}'")
                    continue
                path.rename(destination)
                counts["changed"] += 1
                print(f"Renamed: '{path}' -> '{destination}'")
            except (OSError, ValueError) as error:
                counts["errors"] += 1
                print(f"Error processing '{path}': {error}")
    print(f"Summary: {counts['changed']} changed, {counts['skipped']} skipped, "
          f"{counts['errors']} errors.")
    return counts


def validate_settings():
    pass


def renamed_filename(filename, parent_name):
    return filename.replace("YS ", "YS-").replace("SS ", "SS-")


if __name__ == "__main__":
    result = process_folder(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)

