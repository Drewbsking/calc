"""Verify the actual PDF navigation and the repeatable stamping operation."""

from io import BytesIO
from pathlib import Path
import sys
import unittest
from urllib.parse import urlsplit

from pypdf import PageObject, PdfReader, PdfWriter
from pypdf.generic import NameObject

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import link_cert_maps as navigation


class CertificationNavigationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = ROOT / "certMap"
        cls.sheets = {
            sheet: PdfReader(cls.folder / navigation.filename(sheet))
            for row in navigation.GRID for sheet in row
        }
        cls.book = PdfReader(cls.folder / navigation.BOOK)

    def links(self, page):
        return {
            annotation.get_object()["/NM"].removeprefix(navigation.ANNOTATION_PREFIX): annotation.get_object()
            for annotation in page.get("/Annots", [])
            if str(annotation.get_object().get("/NM", "")).startswith(navigation.ANNOTATION_PREFIX)
        }

    def navigation_text(self, page):
        # Read the saved navigation form without parsing millions of vector
        # drawing commands from the original maps.
        form = page["/Resources"]["/XObject"][navigation.FORM]
        text_page = PageObject.create_blank_page(width=1296, height=1728)
        text_page[NameObject("/Contents")] = form
        text_page[NameObject("/Resources")] = form["/Resources"]
        return text_page.extract_text()

    def test_holly_example(self):
        self.assertEqual(navigation.neighbors("Holly"), {
            "north": None, "east": "Groveland", "south": "Rose", "west": None,
        })
        page = self.sheets["Holly"].pages[0]
        text = self.navigation_text(page)
        for label in ("NORTH: N/A (county boundary)", "WEST: N/A (county boundary)",
                      "SOUTH: Rose Twp.", "EAST: Groveland Twp."):
            self.assertIn(label, text)
        self.assertEqual(set(self.links(page)), {"east", "south"})

    def test_every_sheet_links_to_existing_reciprocal_neighbors(self):
        opposite = {"north": "south", "east": "west", "south": "north", "west": "east"}
        total = 0
        for sheet, reader in self.sheets.items():
            with self.subTest(sheet=sheet):
                self.assertEqual(len(reader.pages), 1)
                page = reader.pages[0]
                self.assertEqual(page[navigation.SHEET], sheet)
                links = self.links(page)
                expected = {d: n for d, n in navigation.neighbors(sheet).items() if n}
                self.assertEqual(set(links), set(expected))
                for direction, neighbor in expected.items():
                    self.assertEqual(links[direction]["/A"]["/S"], "/URI")
                    self.assertEqual(links[direction]["/A"]["/URI"],
                                     "https://calc.rcocwiki.org/certMap/viewer.html?file=" + navigation.filename(neighbor))
                    self.assertTrue((self.folder / navigation.filename(neighbor)).is_file())
                    self.assertEqual(navigation.neighbors(neighbor)[opposite[direction]], sheet)
                self.assertEqual(self.navigation_text(page).count("N/A (county boundary)"), 4 - len(links))
                total += len(links)
        self.assertEqual(total, 80)

    def test_link_rectangles_stay_in_the_correct_blank_margins(self):
        for sheet, reader in self.sheets.items():
            for direction, link in self.links(reader.pages[0]).items():
                with self.subTest(sheet=sheet, direction=direction):
                    x0, y0, x1, y1 = link["/Rect"]
                    self.assertTrue(0 <= x0 < x1 <= 1296 and 0 <= y0 < y1 <= 1728)
                    self.assertTrue({"north": y0 > 1602, "south": y1 < 126,
                                     "west": x1 < 54, "east": x0 > 1242}[direction])

    def test_county_book_links_jump_to_the_matching_sheet(self):
        self.assertEqual(len(self.book.pages), 27)
        for page in self.book.pages[:2]:
            self.assertNotIn(navigation.MARKER, page)
            self.assertEqual(self.links(page), {})
        count = 0
        for page in self.book.pages[2:]:
            sheet = page[navigation.SHEET]
            links = self.links(page)
            expected = {d: n for d, n in navigation.neighbors(sheet).items() if n}
            self.assertEqual(set(links), set(expected))
            for direction, neighbor in expected.items():
                with self.subTest(sheet=sheet, direction=direction):
                    self.assertNotIn("/A", links[direction])
                    self.assertEqual(links[direction]["/Dest"][0].get_object()[navigation.SHEET], neighbor)
            count += len(links)
        self.assertEqual(count, 80)

    def test_rerunning_preserves_the_map_and_does_not_duplicate_navigation(self):
        for sheet in ("Holly", "Waterford"):
            with self.subTest(sheet=sheet):
                original = self.sheets[sheet].pages[0]
                writer = PdfWriter(clone_from=self.sheets[sheet])
                navigation.add_navigation(writer, 0, sheet, base_url="https://example.org/certMap/")
                navigation.add_navigation(writer, 0, sheet, base_url="https://example.org/certMap/")
                output = BytesIO()
                writer.write(output)
                rebuilt = PdfReader(BytesIO(output.getvalue())).pages[0]
                self.assertEqual(rebuilt.get_contents().get_data(), original.get_contents().get_data())
                self.assertEqual(self.navigation_text(rebuilt), self.navigation_text(original))
                self.assertEqual(len(rebuilt["/Annots"]), len(original["/Annots"]))
                self.assertEqual(set(self.links(rebuilt)), set(self.links(original)))

    def test_downloaded_sheet_links_use_absolute_server_urls(self):
        writer = PdfWriter(clone_from=self.sheets["Springfield"])
        navigation.add_navigation(writer, 0, "Springfield", base_url="https://example.org/maps/certMap")
        output = BytesIO()
        writer.write(output)
        page = PdfReader(BytesIO(output.getvalue())).pages[0]
        for direction, link in self.links(page).items():
            neighbor = navigation.neighbors("Springfield")[direction]
            self.assertEqual(link["/A"]["/URI"],
                             f"https://example.org/maps/certMap/viewer.html?file={navigation.filename(neighbor)}")
            self.assertEqual(urlsplit(link["/A"]["/URI"]).scheme, "https")
        self.assertEqual(self.links(page)["east"]["/A"]["/URI"],
                         "https://example.org/maps/certMap/viewer.html?file=Independence-24-CW.pdf")

    def test_server_url_is_required_and_must_be_absolute(self):
        for value in ("certMap/", "file:///C:/Downloads/", "https:///certMap/",
                      "https://example.org/certMap/?query=1", "https://example.org/certMap/#section"):
            with self.subTest(url=value), self.assertRaises(ValueError):
                navigation.validate_base_url(value)
        with self.assertRaises(ValueError):
            navigation.add_navigation(PdfWriter(clone_from=self.sheets["Holly"]), 0, "Holly", base_url=None)


if __name__ == "__main__":
    unittest.main()
