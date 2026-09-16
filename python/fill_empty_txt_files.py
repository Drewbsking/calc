r"""Put each empty TXT file's own filename into its body.

Run from Windows Terminal: py .\fill_empty_txt_files.py
Changes files directly in the selected folder; does not process subfolders.
Uses Python's standard library only.
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


def find_and_modify_empty_txt_files(directory):
    """Process one folder and return changed, skipped, and error counts."""
    counts = {"changed": 0, "skipped": 0, "errors": 0}
    try:
        if not os.fspath(directory).strip() or os.fspath(directory) == r"C:\CHANGE_ME\YourFolder":
            raise ValueError("Set FOLDER_PATH near the top of this script to your folder.")
        if not os.path.isdir(directory):
            raise ValueError(f"Folder not found or unavailable: {directory}")
        with os.scandir(directory) as entries:
            files = sorted(entries, key=lambda entry: entry.name.casefold())
    except (OSError, ValueError) as error:
        print(f"Error: {error}")
        counts["errors"] += 1
    else:
        for entry in files:
            try:
                if (entry.is_symlink() or not entry.is_file(follow_symlinks=False)
                        or not entry.name.lower().endswith(".txt")
                        or entry.stat(follow_symlinks=False).st_size != 0):
                    counts["skipped"] += 1
                    continue
                # Recheck the open file without truncating it, in case it changed.
                with open(entry.path, "r+b") as file:
                    if os.fstat(file.fileno()).st_size != 0:
                        counts["skipped"] += 1
                        continue
                    file.write(entry.name.encode("utf-8"))
                counts["changed"] += 1
                print(f"Modified empty file: {entry.name}")
            except (OSError, UnicodeError) as error:
                counts["errors"] += 1
                print(f"Error processing '{entry.name}': {error}")

    print(f"Summary: {counts['changed']} changed, {counts['skipped']} skipped, "
          f"{counts['errors']} errors.")
    return counts


if __name__ == "__main__":
    result = find_and_modify_empty_txt_files(FOLDER_PATH)
    raise SystemExit(1 if result["errors"] else 0)
