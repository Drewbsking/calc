r"""Find Empty Folders.

Originally used for Traffic Control Order (TCO) file cleanup.
Includes subfolders · Report only.
Run: py .\find_empty_folders.py
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# FOLDER_PATH: paste the folder you want to process.
# Keep the r and quotation marks; do not end with a backslash.
# Review the other marked settings for this cleanup job.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
RECURSIVE = True  # True checks subfolders too; False checks only FOLDER_PATH.
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


def process_folder(folder_path):
    counts = {"found": 0, "skipped": 0, "errors": 0}

    def visit(folder):
        try:
            with os.scandir(folder) as scan:
                entries = sorted(scan, key=lambda entry: entry.name.casefold())
            if not entries:
                counts["found"] += 1
                print(f"Empty folder: {folder}")
            elif RECURSIVE:
                for entry in entries:
                    try:
                        if entry.is_symlink() or getattr(os.path, "isjunction", lambda path: False)(entry.path):
                            counts["skipped"] += 1
                        elif entry.is_dir(follow_symlinks=False):
                            visit(Path(entry.path))
                    except OSError as error:
                        counts["errors"] += 1
                        print(f"Error reading '{entry.path}': {error}")
        except OSError as error:
            counts["errors"] += 1
            print(f"Error reading folder '{folder}': {error}")

    try:
        folder = checked_folder(folder_path)
    except (OSError, ValueError) as error:
        counts["errors"] += 1
        print(f"Error: {error}")
    else:
        visit(folder)
    print(f"Summary: {counts['found']} empty folders found, {counts['skipped']} links skipped, "
          f"{counts['errors']} errors. No folders were deleted.")
    return counts


if __name__ == "__main__":
    result = process_folder(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)

