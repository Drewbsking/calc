r"""Replace spaces with hyphens in PDF and Word document filenames.

Run from Windows Terminal: py .\replace_spaces_in_filenames.py
Renames files directly in the selected folder; does not process subfolders.
Uses Python's standard library only. Document contents stay the same.
"""

# =====================================================
# CHANGE ONLY THE FOLDER PATH BELOW.
# Replace the example with the folder you want to process.
# Keep the r and quotation marks.
# Do not end the path with a backslash.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
# No other code changes are needed.

import os


def replace_spaces_in_pdf_filenames(folder_path):
    """Process one folder and return changed, skipped, and error counts."""
    counts = {"changed": 0, "skipped": 0, "errors": 0}
    try:
        if not os.fspath(folder_path).strip() or os.fspath(folder_path) == r"C:\CHANGE_ME\YourFolder":
            raise ValueError("Set FOLDER_PATH near the top of this script to your folder.")
        if not os.path.isdir(folder_path):
            raise ValueError(f"Folder not found or unavailable: {folder_path}")
        with os.scandir(folder_path) as entries:
            files = sorted(entries, key=lambda entry: entry.name.casefold())
    except (OSError, ValueError) as error:
        print(f"Error: {error}")
        counts["errors"] += 1
    else:
        for entry in files:
            try:
                if (entry.is_symlink() or not entry.is_file(follow_symlinks=False)
                        or os.path.splitext(entry.name)[1].lower() not in (".pdf", ".docx")):
                    counts["skipped"] += 1
                    continue
                new_filename = entry.name.replace(" ", "-")
                if new_filename == entry.name:
                    counts["skipped"] += 1
                    continue
                new_path = os.path.join(folder_path, new_filename)
                # lexists also detects a broken symbolic link at the destination.
                if os.path.lexists(new_path):
                    counts["skipped"] += 1
                    print(f"Skipped '{entry.name}': Destination already exists: '{new_filename}'")
                    continue
                os.rename(entry.path, new_path)
                counts["changed"] += 1
                print(f"Renamed: '{entry.name}' to '{new_filename}'")
            except OSError as error:
                counts["errors"] += 1
                print(f"Error processing '{entry.name}': {error}")

    print(f"Summary: {counts['changed']} changed, {counts['skipped']} skipped, "
          f"{counts['errors']} errors.")
    return counts


if __name__ == "__main__":
    result = replace_spaces_in_pdf_filenames(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)
