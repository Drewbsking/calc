r"""Download SEMCOG UD-10 PDFs for crash IDs in the first column of a CSV.

Run from Windows Terminal: py .\download_ud10_reports.py
Uses Python's standard library and an internet connection; no browser is needed.
The CSV needs a header row, such as Crash_ID. Existing files are never replaced.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# CSV_FILE_PATH: paste the full path to your crash-ID CSV.
# Keep the r and quotation marks.
# =====================================================
CSV_FILE_PATH = r"C:\CHANGE_ME\Crash_IDs_for_2019.csv"
OUTPUT_FOLDER = ""  # Blank: create a UD10_reports folder beside the CSV.
MAX_REPORTS = 0  # 0 processes all unique IDs; use 1 to try the first ID.
DELAY_SECONDS = 1.0  # Pause between requests to SEMCOG.
TIMEOUT_SECONDS = 30  # Network timeout for each report.
# No code changes are needed below this line.

import csv
from http.client import HTTPException
import math
import os
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


REPORT_URL = "https://ud10.semcog.org/ud10?crash_id={}"


def load_crash_ids(csv_path):
    """Validate the entire CSV before downloading; preserve IDs as text and in order."""
    if not str(csv_path).strip() or str(csv_path) == r"C:\CHANGE_ME\Crash_IDs_for_2019.csv":
        raise ValueError("Set CSV_FILE_PATH in the settings box to your crash-ID CSV file.")
    source = Path(csv_path)
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"CSV file not found or not an ordinary file: {source}")
    ids, seen = [], set()
    with source.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file, strict=True)
        header = next(reader, None)
        if not header or not header[0].strip() or header[0].strip().isdigit():
            raise ValueError("The CSV must start with a header row, such as Crash_ID.")
        for row in reader:
            if not row or not row[0].strip():
                continue
            crash_id = row[0].strip()
            if not (crash_id.isascii() and crash_id.isdigit()):
                raise ValueError(f"CSV line {reader.line_num}: crash ID must contain digits only: {crash_id!r}")
            if crash_id not in seen:
                ids.append(crash_id)
                seen.add(crash_id)
    if not ids:
        raise ValueError("The CSV contains no crash IDs beneath its header.")
    return ids


def download_report(crash_id, destination, timeout=TIMEOUT_SECONDS):
    """Save one complete PDF using exclusive creation; remove a failed partial download."""
    if not (crash_id.isascii() and crash_id.isdigit()):
        raise ValueError("Crash ID must contain digits only.")
    destination = Path(destination)
    if os.path.lexists(destination):
        raise FileExistsError(f"Destination already exists: {destination}")
    request = Request(REPORT_URL.format(crash_id), headers={"User-Agent": "UD10ReportDownloader/1.0"})
    with urlopen(request, timeout=timeout) as response:
        prefix = response.read(5)
        if prefix != b"%PDF-":
            raise ValueError("SEMCOG returned a non-PDF response. No report was saved.")
        expected_size = response.headers.get("Content-Length")
        with destination.open("xb") as output:
            try:
                output.write(prefix)
                tail = prefix
                while chunk := response.read(64 * 1024):
                    output.write(chunk)
                    tail = (tail + chunk)[-1024:]
                if expected_size and output.tell() != int(expected_size):
                    raise ValueError("The PDF download was incomplete. Try this crash ID again.")
                if b"%%EOF" not in tail:
                    raise ValueError("The PDF is missing its end marker. Try this crash ID again.")
                output.flush()
            except BaseException:
                output.close()
                destination.unlink()
                raise
    return destination


def download_reports(csv_path, output_folder="", max_reports=MAX_REPORTS,
                     delay=DELAY_SECONDS, timeout=TIMEOUT_SECONDS):
    """Download sequentially, skip existing reports, and summarize per-ID outcomes."""
    crash_ids = load_crash_ids(csv_path)
    if isinstance(max_reports, bool) or not isinstance(max_reports, int) or max_reports < 0:
        raise ValueError("MAX_REPORTS must be 0 (all IDs) or a positive whole number.")
    if not isinstance(delay, (int, float)) or not math.isfinite(delay) or delay < 0:
        raise ValueError("DELAY_SECONDS must be a finite number of zero or more seconds.")
    if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("TIMEOUT_SECONDS must be a finite number greater than zero.")
    if max_reports:
        crash_ids = crash_ids[:max_reports]
    folder = Path(output_folder) if output_folder else Path(csv_path).parent / "UD10_reports"
    if folder.is_symlink() or getattr(folder, "is_junction", lambda: False)():
        raise ValueError("OUTPUT_FOLDER must be an ordinary folder, not a link or junction.")
    folder.mkdir(parents=True, exist_ok=True)
    summary = {"downloaded": 0, "skipped": 0, "errors": 0}
    requested = False
    print(f"Processing {len(crash_ids)} unique crash ID(s). Output: {folder.resolve()}")
    for crash_id in crash_ids:
        destination = folder / f"UD10_{crash_id}.pdf"
        if os.path.lexists(destination):
            print(f"Skipped {crash_id}: destination already exists.")
            summary["skipped"] += 1
            continue
        if requested and delay:
            time.sleep(delay)
        requested = True
        try:
            download_report(crash_id, destination, timeout)
        except FileExistsError:
            print(f"Skipped {crash_id}: destination appeared during the download.")
            summary["skipped"] += 1
        except HTTPError as error:
            print(f"Failed {crash_id}: SEMCOG returned HTTP {error.code}.")
            summary["errors"] += 1
            error.close()
            if error.code in (401, 403, 429):
                print("Stopped: SEMCOG requires access or is limiting requests. Check the service before retrying.")
                break
        except (OSError, ValueError, HTTPException) as error:
            print(f"Failed {crash_id}: {error}")
            summary["errors"] += 1
        else:
            print(f"Downloaded {crash_id}: {destination.name}")
            summary["downloaded"] += 1
    print("Summary: " + ", ".join(f"{count} {label}" for label, count in summary.items()))
    return summary


def main():
    try:
        summary = download_reports(CSV_FILE_PATH, OUTPUT_FOLDER, MAX_REPORTS, DELAY_SECONDS, TIMEOUT_SECONDS)
    except (OSError, ValueError, csv.Error) as error:
        print(f"Error: {error}")
        return 1
    except KeyboardInterrupt:
        print("Download cancelled. Completed PDFs were kept; any incomplete PDF was removed.")
        return 1
    return int(summary["errors"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
