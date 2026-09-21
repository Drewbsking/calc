r"""Batch-convert SVG files, including subfolders, to DXF with installed Inkscape.

Run: py .\batch_svg_to_dxf.py
Or pass a folder and options: py .\batch_svg_to_dxf.py "C:\Work\SVGs" --workers 2
Uses Python's standard library. Install Inkscape separately; SVGs are unchanged.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# FOLDER_PATH: paste the folder containing your SVG files.
# Keep the r and quotation marks.
# =====================================================
FOLDER_PATH = r"C:\CHANGE_ME\YourFolder"
INKSCAPE_PATH = ""  # Blank: find Inkscape on PATH or in common Windows locations.
OUTPUT_FOLDER = ""  # Blank: DXFs beside SVGs. Otherwise mirror subfolders here.
REPORT_FILE_PATH = ""  # Blank: a new conversion_report.csv (or numbered copy).
WORKERS = 2  # Maximum simultaneous Inkscape conversions.
OVERWRITE = False  # True replaces existing DXFs only after successful conversion.
TIMEOUT_SECONDS = 120  # Maximum time for each Inkscape conversion.
# No code changes are needed below this line.

import argparse
import csv
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


def is_link(path):
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def ensure_folder(folder):
    if any(is_link(path) for path in (folder, *folder.parents)):
        raise ValueError(f"Output folder must not use symbolic links or junctions: {folder}")
    folder.mkdir(parents=True, exist_ok=True)


def find_inkscape(inkscape_path=""):
    if inkscape_path:
        executable = Path(inkscape_path)
        if executable.is_file():
            return str(executable.resolve())
        raise FileNotFoundError(f"Inkscape executable not found: {inkscape_path}")
    executable = shutil.which("inkscape")
    if executable:
        return executable
    for candidate in (
        r"C:\Program Files\Inkscape\bin\inkscape.com",
        r"C:\Program Files\Inkscape\bin\inkscape.exe",
        r"C:\Program Files\Inkscape\inkscape.exe",
        r"C:\Program Files (x86)\Inkscape\inkscape.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    raise FileNotFoundError("Inkscape was not found. Install it and set INKSCAPE_PATH, "
                            "or pass --inkscape with the full executable path.")


def collect_svgs(root):
    def failed(error):
        raise error

    paths = []
    for folder, directories, files in os.walk(root, followlinks=False, onerror=failed):
        directories[:] = sorted(name for name in directories if not is_link(Path(folder) / name))
        for name in sorted(files):
            path = Path(folder) / name
            if path.suffix.lower() == ".svg" and not is_link(path) and path.is_file():
                paths.append(path)
    return paths


def convert_one(inkscape_exe, svg_path, out_path, overwrite=False, timeout=TIMEOUT_SECONDS):
    """Export to a temporary file so failed exports cannot damage an existing DXF."""
    start = time.monotonic()
    svg_path = Path(svg_path)
    out_path = Path(out_path).with_suffix(".dxf")
    result = {"svg": str(svg_path), "dxf": str(out_path), "status": "error", "seconds": 0.0, "message": ""}
    try:
        if is_link(svg_path) or not svg_path.is_file():
            raise ValueError("Input is not an ordinary SVG file.")
        if is_link(out_path):
            raise ValueError("Output is a symbolic link or junction; it will not be replaced.")
        if os.path.lexists(out_path) and not overwrite:
            result.update(status="skipped", message="Destination exists; enable OVERWRITE to replace DXFs.")
            return result
        ensure_folder(out_path.parent)
        with tempfile.TemporaryDirectory(prefix=".svg-to-dxf-", dir=out_path.parent) as working:
            temporary = Path(working) / "export.dxf"
            process = subprocess.run(
                [inkscape_exe, str(svg_path.resolve()), "--export-type=dxf", "-o", str(temporary.resolve())],
                capture_output=True, text=True, errors="replace", timeout=timeout,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            message = (process.stderr or process.stdout).strip()
            if process.returncode != 0:
                raise ValueError(message or f"Inkscape exited with code {process.returncode}.")
            if not temporary.is_file() or temporary.stat().st_size == 0:
                raise ValueError(message or "Inkscape did not create a nonempty DXF. Check its DXF export support.")
            if overwrite:
                if is_link(out_path):
                    raise ValueError("Output became a symbolic link or junction; it will not be replaced.")
                os.replace(temporary, out_path)
            else:
                with out_path.open("xb") as output:
                    try:
                        with temporary.open("rb") as source:
                            shutil.copyfileobj(source, output)
                        output.flush()
                    except BaseException:
                        output.close()
                        out_path.unlink()
                        raise
            result.update(status="ok", message=message)
    except FileExistsError:
        result.update(status="skipped", message="Destination appeared during conversion; preserved.")
    except subprocess.TimeoutExpired:
        result["message"] = f"Inkscape exceeded {timeout} seconds. Increase TIMEOUT_SECONDS if needed."
    except (OSError, ValueError) as error:
        result["message"] = str(error)
    finally:
        result["seconds"] = round(time.monotonic() - start, 3)
    return result


def open_report(folder, report_path):
    """Preserve earlier reports, using numbered names when no explicit path is given."""
    destination = Path(report_path) if report_path else folder / "conversion_report.csv"
    if destination.suffix.lower() != ".csv":
        raise ValueError("REPORT_FILE_PATH must end in .csv.")
    ensure_folder(destination.parent)
    number = 1
    while True:
        try:
            return destination, destination.open("x", newline="", encoding="utf-8")
        except FileExistsError:
            if report_path:
                raise FileExistsError(f"Report already exists: {destination}. Choose another REPORT_FILE_PATH.")
            number += 1
            destination = folder / f"conversion_report_{number}.csv"


def convert_folder(folder_path, inkscape_path="", output_folder="", report_path="",
                   workers=WORKERS, overwrite=OVERWRITE, timeout=TIMEOUT_SECONDS):
    if not str(folder_path).strip() or str(folder_path) == r"C:\CHANGE_ME\YourFolder":
        raise ValueError("Set FOLDER_PATH in the settings box, or pass your SVG folder on the command line.")
    root = Path(folder_path)
    if is_link(root) or not root.is_dir():
        raise ValueError(f"Folder not found or not an ordinary folder: {root}")
    root = root.resolve()
    if isinstance(workers, bool) or not isinstance(workers, int) or workers < 1:
        raise ValueError("WORKERS must be a positive whole number.")
    if not isinstance(timeout, (int, float)) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("TIMEOUT_SECONDS must be a finite number greater than zero.")
    if not isinstance(overwrite, bool):
        raise ValueError("OVERWRITE must be True or False.")
    mirror = Path(output_folder).absolute() if output_folder else None
    if mirror and any(is_link(path) for path in (mirror, *mirror.parents)):
        raise ValueError("OUTPUT_FOLDER must not use symbolic links or junctions.")
    paths = collect_svgs(root)
    if not paths:
        print("No SVG files found. Summary: 0 converted, 0 skipped, 0 errors.")
        return []
    executable = find_inkscape(inkscape_path)
    report, stream = open_report(mirror or root, report_path)
    results = []
    print(f"Found {len(paths)} SVG file(s), including subfolders. Using {workers} worker(s).")
    with stream:
        writer = csv.DictWriter(stream, fieldnames=["svg", "dxf", "status", "seconds", "message"])
        writer.writeheader()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(convert_one, executable, source,
                                   (mirror / source.relative_to(root) if mirror else source).with_suffix(".dxf"),
                                   overwrite, timeout) for source in paths]
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                writer.writerow(result)
                stream.flush()
                print(f"[{result['status'].upper()}] {result['svg']} -> {result['dxf']}")
                if result["message"]:
                    print(f"  {result['message']}")
    print(f"Summary: {sum(row['status'] == 'ok' for row in results)} converted, "
          f"{sum(row['status'] == 'skipped' for row in results)} skipped, "
          f"{sum(row['status'] == 'error' for row in results)} errors.")
    print(f"Report: {report.resolve()}")
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description="Convert SVGs, including subfolders, to DXF using Inkscape.")
    parser.add_argument("root", nargs="?", default=FOLDER_PATH, help="SVG folder; defaults to FOLDER_PATH.")
    parser.add_argument("--inkscape", default=INKSCAPE_PATH, help="Full path to Inkscape's executable.")
    parser.add_argument("--mirror-out", default=OUTPUT_FOLDER, help="Separate output folder, preserving subfolders.")
    parser.add_argument("--report", default=REPORT_FILE_PATH, help="New CSV report path; existing reports are not replaced.")
    parser.add_argument("--workers", type=int, default=WORKERS, help="Parallel conversions (default: 2).")
    parser.add_argument("--overwrite", action="store_true", default=OVERWRITE, help="Replace existing DXFs after successful conversion.")
    parser.add_argument("--timeout", type=float, default=TIMEOUT_SECONDS, help="Maximum seconds per conversion.")
    args = parser.parse_args(argv)
    try:
        results = convert_folder(args.root, args.inkscape, args.mirror_out, args.report, args.workers, args.overwrite, args.timeout)
    except (OSError, ValueError) as error:
        print(f"Error: {error}")
        return 1
    return int(any(row["status"] == "error" for row in results))


if __name__ == "__main__":
    raise SystemExit(main())
