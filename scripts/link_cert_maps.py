"""Add neighboring-sheet navigation to the 2024 certification PDFs.

Run from any directory: py -3.13 scripts/link_cert_maps.py
Dependencies: pypdf, reportlab. Existing navigation is replaced on reruns.
Standalone links open the live browser viewer even when a PDF is downloaded. Use
--base-url to change the published directory containing the township PDFs.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote, urlsplit

from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from pypdf.generic import (
    ArrayObject, DecodedStreamObject, DictionaryObject, NameObject,
    NumberObject, TextStringObject,
)
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
BOOK = "2024 Countywide Cert.pdf"
MAP_BASE_URL = "https://calc.rcocwiki.org/certMap/"
# North to south, west to east. These are the original township SHEET areas,
# including the cities/villages within them, as shown on the local county map.
GRID = (
    ("Holly", "Groveland", "Brandon", "Oxford", "Addison"),
    ("Rose", "Springfield", "Independence", "Orion", "Oakland"),
    ("Highland", "Whitelake", "Waterford", "Pontiac", "Rochester"),
    ("Milford", "Commerce", "WBloomfield", "Bloomfield", "Troy"),
    ("Lyon", "Novi", "Farmington", "Southfield", "RoyalOak"),
)
LABELS = {
    "Whitelake": "White Lake Twp.", "WBloomfield": "West Bloomfield Twp.",
    "RoyalOak": "Royal Oak Twp.", "Pontiac": "Pontiac / Auburn Hills",
    "Rochester": "Rochester Hills", "Farmington": "Farmington Hills",
    "Novi": "Novi", "Southfield": "Southfield", "Troy": "Troy",
}
DIRECTIONS = {"north": (-1, 0), "east": (0, 1), "south": (1, 0), "west": (0, -1)}
FORM = NameObject("/CertMapNavigation")
MARKER = NameObject("/CertMapNavigationVersion")
SHEET = NameObject("/CertMapSheet")
ANNOTATION_PREFIX = "cert-map-neighbor-"


def filename(sheet):
    return f"{sheet}-24-CW.pdf"


def viewer_url(sheet, base_url=MAP_BASE_URL):
    return validate_base_url(base_url) + "viewer.html?file=" + quote(filename(sheet))


def validate_base_url(value):
    parts = urlsplit(value)
    if (parts.scheme not in ("https", "http") or not parts.netloc
            or parts.query or parts.fragment or parts.username or parts.password):
        raise ValueError("Use an absolute HTTP(S) URL for the published PDF directory")
    return value.rstrip("/") + "/"


def neighbors(sheet):
    row, col = next((r, c) for r, cells in enumerate(GRID)
                    for c, name in enumerate(cells) if name == sheet)
    return {
        direction: GRID[row + dr][col + dc]
        if 0 <= row + dr < len(GRID) and 0 <= col + dc < len(GRID[0]) else None
        for direction, (dr, dc) in DIRECTIONS.items()
    }


def make_overlay(sheet, width, height):
    """Draw within the existing 54pt side and 126pt top/bottom margins."""
    stream = BytesIO()
    canvas = Canvas(stream, pagesize=(width, height), invariant=1)
    placements = {
        "north": (width / 2, height - 63, 0),
        "east": (width - 27, height / 2, -90),
        "south": (width / 2, 63, 0),
        "west": (27, height / 2, 90),
    }
    links = []
    for direction, neighbor in neighbors(sheet).items():
        label = LABELS.get(neighbor, f"{neighbor} Twp.") if neighbor else "N/A (county boundary)"
        text = f"{direction.upper()}: {label}"
        box_width = stringWidth(text, "Helvetica-Bold", 18) + 32
        x, y, angle = placements[direction]
        canvas.saveState()
        canvas.translate(x, y)
        canvas.rotate(angle)
        canvas.setFillColor(HexColor("#eff6ff" if neighbor else "#f1f5f9"))
        canvas.setStrokeColor(HexColor("#93b5df" if neighbor else "#cbd5e1"))
        canvas.setLineWidth(0.75)
        canvas.roundRect(-box_width / 2, -16, box_width, 32, 5, fill=1, stroke=1)
        canvas.setFillColor(HexColor("#0b5ed7" if neighbor else "#64748b"))
        canvas.setStrokeColor(HexColor("#0b5ed7"))
        canvas.setFont("Helvetica-Bold", 18)
        canvas.drawCentredString(0, -6, text)
        if neighbor:
            canvas.line(-box_width / 2 + 16, -9, box_width / 2 - 16, -9)
            rect = ((x - 16, y - box_width / 2, x + 16, y + box_width / 2)
                    if angle else (x - box_width / 2, y - 16, x + box_width / 2, y + 16))
            links.append((direction, neighbor, rect, label))
        canvas.restoreState()
    canvas.showPage()
    canvas.save()
    return PdfReader(BytesIO(stream.getvalue())).pages[0], links


def add_navigation(writer, page_index, sheet, book_pages=None, *, base_url=MAP_BASE_URL):
    if book_pages is None:
        if base_url is None:
            raise ValueError("A published PDF directory URL is required for standalone sheets")
        base_url = validate_base_url(base_url)
    page = writer.pages[page_index]
    if tuple(page.mediabox) != (0, 0, 1296, 1728) or page.rotation:
        raise ValueError(f"Unexpected page geometry for {sheet}; review margins first")
    overlay, links = make_overlay(sheet, 1296, 1728)
    form = DecodedStreamObject()
    form.set_data(overlay.get_contents().get_data())
    form.update({
        NameObject("/Type"): NameObject("/XObject"),
        NameObject("/Subtype"): NameObject("/Form"),
        NameObject("/BBox"): ArrayObject(overlay.mediabox),
        NameObject("/Resources"): overlay["/Resources"].clone(writer),
    })
    # A separate form keeps the original vector map streams intact. Replacing
    # the named form on reruns updates labels without stacking another overlay.
    resources = DictionaryObject(page["/Resources"])
    xobjects = DictionaryObject(resources.get("/XObject", DictionaryObject()).get_object())
    xobjects[FORM] = writer._add_object(form.flate_encode())
    resources[NameObject("/XObject")] = xobjects
    page[NameObject("/Resources")] = resources
    if MARKER not in page:
        prefix, suffix = DecodedStreamObject(), DecodedStreamObject()
        prefix.set_data(b"q\n")
        suffix.set_data(b"\nQ\nq /CertMapNavigation Do Q\n")
        original = page.raw_get("/Contents")
        originals = list(original.get_object()) if isinstance(original.get_object(), ArrayObject) else [original]
        page[NameObject("/Contents")] = ArrayObject([
            writer._add_object(prefix), *originals, writer._add_object(suffix),
        ])
    page[MARKER] = NumberObject(1)
    page[SHEET] = TextStringObject(sheet)
    page[NameObject("/Annots")] = ArrayObject([
        annotation for annotation in page.get("/Annots", [])
        if not str(annotation.get_object().get("/NM", "")).startswith(ANNOTATION_PREFIX)
    ])
    for direction, neighbor, rect, label in links:
        target = ({"target_page_index": book_pages[neighbor]} if book_pages is not None
                  else {"url": viewer_url(neighbor, base_url)})
        annotation = Link(rect=rect, **target)
        annotation[NameObject("/NM")] = TextStringObject(ANNOTATION_PREFIX + direction)
        annotation[NameObject("/Contents")] = TextStringObject(f"Open {label} certification map ({direction})")
        added = writer.add_annotation(page_index, annotation)
        if book_pages is not None:
            # Local explicit destinations use page references, not the numeric
            # page indices accepted by some readers for remote destinations.
            added["/Dest"][0] = writer.pages[book_pages[neighbor]].indirect_reference


def build(folder, base_url=MAP_BASE_URL):
    base_url = validate_base_url(base_url)
    sheets = [sheet for row in GRID for sheet in row]
    readers = {sheet: PdfReader(folder / filename(sheet)) for sheet in sheets}
    if any(len(reader.pages) != 1 for reader in readers.values()):
        raise ValueError("Expected one page per township sheet")
    book = PdfReader(folder / BOOK)
    hashes = {sha256(reader.pages[0].get_contents().get_data()).digest(): sheet
              for sheet, reader in readers.items()}
    book_pages = {}
    for index, page in enumerate(book.pages):
        sheet = page.get(SHEET) or hashes.get(sha256(page.get_contents().get_data()).digest())
        if sheet in readers:
            if sheet in book_pages:
                raise ValueError(f"Duplicate county-book sheet: {sheet}")
            book_pages[sheet] = index
    if set(book_pages) != set(sheets):
        raise ValueError("County-book pages do not match the township sheets")
    # Stage the entire set before replacing any repository PDFs.
    with TemporaryDirectory(prefix="cert-map-links-") as temporary:
        staging = Path(temporary)
        for sheet, reader in readers.items():
            writer = PdfWriter(clone_from=reader)
            add_navigation(writer, 0, sheet, base_url=base_url)
            writer.write(staging / filename(sheet))
        writer = PdfWriter(clone_from=book)
        for sheet, index in book_pages.items():
            add_navigation(writer, index, sheet, book_pages)
        writer.write(staging / BOOK)
        for path in staging.iterdir():
            (folder / path.name).write_bytes(path.read_bytes())
    print(f"Updated {len(sheets)} township sheets and the county book in {folder}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, default=ROOT / "certMap")
    parser.add_argument("--base-url", default=MAP_BASE_URL,
                        help="Published directory containing the township PDFs, including certMap/")
    arguments = parser.parse_args()
    build(arguments.folder.resolve(), arguments.base_url)
