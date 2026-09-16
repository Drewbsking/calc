"""CSV-to-MediaWiki regression and file-handling checks using temporary inputs."""

import contextlib
import csv
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "python" / "csv_to_mediawiki.py"


def load_converter():
    spec = importlib.util.spec_from_file_location("csv_to_mediawiki", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONVERTER = load_converter()


class CsvToMediaWikiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="csv-to-wiki-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "pay_items.csv"

    def write_csv(self, rows, headers=CONVERTER.COLUMNS, encoding="utf-8"):
        with self.source.open("w", encoding=encoding, newline="") as output:
            writer = csv.writer(output)
            writer.writerow(headers)
            writer.writerows(rows)
        return self.source

    def test_matches_all_230_rows_of_the_supplied_legacy_output(self):
        expected = (ROOT / "tests" / "fixtures" / "csv_to_mediawiki_legacy.txt").read_text(encoding="utf-8")
        rows = [line[2:].split(" || ") for line in expected.splitlines() if line.startswith("| ")]
        self.assertEqual(len(rows), 230)
        self.assertTrue(all(len(row) == 4 for row in rows))
        self.write_csv(rows)
        self.assertEqual(CONVERTER.load_and_convert_csv(self.source), expected)
        self.assertEqual(CONVERTER.convert_csv_file(self.source).read_text(encoding="utf-8"), expected)

    def test_bom_reordered_headers_quotes_unicode_and_numeric_formatting(self):
        self.write_csv(
            [["Ea", 'Caf\u00e9, "North"', "12.50", "0012345", "ignored"],
             ["", "", "", "0000000", ""]],
            headers=[" Units ", "Description", "AUP", "PayItemCode", "Extra"],
            encoding="utf-8-sig",
        )
        original = self.source.read_bytes()
        result = CONVERTER.convert_csv_file(self.source)
        self.assertEqual(result, self.folder / "MediaWiki_Table.txt")
        text = result.read_text(encoding="utf-8")
        self.assertIn('| 0012345 || Ea || Caf\u00e9, "North" || 12.50', text)
        self.assertIn("| 0000000 ||  ||  || ", text)
        self.assertNotIn("ignored", text)
        self.assertEqual(self.source.read_bytes(), original)

    def test_literal_wiki_characters_and_multiline_cells_do_not_break_the_table(self):
        self.write_csv([["1", "Ea", "First|second\r\n<x> & {{template}} [[link]] ''text''", "0"]])
        text = CONVERTER.load_and_convert_csv(self.source)
        self.assertIn("First<nowiki>|</nowiki>second<br />&lt;x&gt; &amp;", text)
        self.assertIn("&#123;&#123;template&#125;&#125;", text)
        self.assertIn("&#91;&#91;link&#93;&#93;", text)
        self.assertIn("&#39;&#39;text&#39;&#39;", text)
        self.assertEqual(text.count("\n|-\n"), 1)

    def test_missing_duplicate_or_empty_headers_are_actionable_and_create_no_output(self):
        for contents, message in [
            ("", "CSV is empty"),
            ("Code,Units,Description,AUP\n1,Ea,Item,2\n", "Missing required CSV columns: PayItemCode"),
            ("PayItemCode,Units,Description,AUP,AUP\n1,Ea,Item,2,2\n", "duplicate column headers"),
        ]:
            with self.subTest(contents=contents):
                self.source.write_text(contents, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    CONVERTER.convert_csv_file(self.source)
                self.assertFalse((self.folder / "MediaWiki_Table.txt").exists())

    def test_malformed_rows_never_leave_partial_output(self):
        header = "PayItemCode,Units,Description,AUP\n"
        for row in ("1,Ea,Item,2,extra\n", "1,Ea,Item\n", '1,Ea,"Unclosed,2\n'):
            with self.subTest(row=row):
                self.source.write_text(header + "0,Ea,Valid first row,1\n" + row, encoding="utf-8")
                with self.assertRaises((ValueError, csv.Error)):
                    CONVERTER.convert_csv_file(self.source)
                self.assertFalse((self.folder / "MediaWiki_Table.txt").exists())

    def test_existing_output_and_source_file_cannot_be_overwritten(self):
        self.write_csv([["1", "Ea", "Item", "2"]])
        original = self.source.read_bytes()
        destination = self.folder / "MediaWiki_Table.txt"
        destination.write_bytes(b"existing notes")
        with self.assertRaisesRegex(FileExistsError, "Output already exists"):
            CONVERTER.convert_csv_file(self.source)
        self.assertEqual(destination.read_bytes(), b"existing notes")
        with self.assertRaisesRegex(ValueError, "different file"):
            CONVERTER.convert_csv_file(self.source, self.source)
        self.assertEqual(self.source.read_bytes(), original)
        other = self.folder / "Second_Table.txt"
        self.assertEqual(CONVERTER.convert_csv_file(self.source, other), other)
        self.assertTrue(other.is_file())

    def test_header_only_and_blank_rows_produce_an_empty_table(self):
        self.source.write_text("PayItemCode,Units,Description,AUP\n\n,,,\n", encoding="utf-8")
        self.assertEqual(
            CONVERTER.load_and_convert_csv(self.source),
            '{| class="wikitable"\n! PayItemCode !! Units !! Description !! AUP\n|}',
        )

    def test_invalid_input_paths_and_encoding_errors_are_reported_without_output(self):
        for path in ("", r"C:\CHANGE_ME\pay_items.csv", self.folder / "missing.csv", self.folder):
            with self.subTest(path=path), self.assertRaises(ValueError):
                CONVERTER.convert_csv_file(path)
        self.source.write_bytes(b"PayItemCode,Units,Description,AUP\n1,Ea,\xff,2\n")
        with self.assertRaises(UnicodeError):
            CONVERTER.convert_csv_file(self.source)
        self.assertFalse((self.folder / "MediaWiki_Table.txt").exists())
        with mock.patch.multiple(CONVERTER, CSV_FILE_PATH=str(self.source), CSV_ENCODING="unknown-encoding"):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = CONVERTER.main()
            self.assertEqual(result, 1)
            self.assertIn("Error:", output.getvalue())

    def test_import_has_no_file_operations_or_prompts(self):
        output = io.StringIO()
        with mock.patch.object(Path, "open") as opened, mock.patch("builtins.input") as prompted, \
                contextlib.redirect_stdout(output):
            load_converter()
        opened.assert_not_called()
        prompted.assert_not_called()
        self.assertEqual(output.getvalue(), "")

    def test_user_only_needs_to_edit_the_marked_csv_path(self):
        data_folder = self.folder / "data"
        data_folder.mkdir()
        self.source = data_folder / "pay_items.csv"
        self.write_csv([["0012345", "Ea", "Example, item", "12.50"]])
        script_text = SCRIPT.read_text(encoding="utf-8")
        script_text = script_text.replace(
            'CSV_FILE_PATH = r"C:\\CHANGE_ME\\pay_items.csv"',
            "CSV_FILE_PATH = " + repr(str(self.source)),
            1,
        )
        runner = self.folder / "downloaded_converter.py"
        runner.write_text(script_text, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, "-B", str(runner)], cwd=self.folder,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("MediaWiki table saved to:", result.stdout)
        self.assertIn("0012345 || Ea || Example, item || 12.50",
                      (data_folder / "MediaWiki_Table.txt").read_text(encoding="utf-8"))
        self.assertFalse((self.folder / "MediaWiki_Table.txt").exists())


if __name__ == "__main__":
    unittest.main()
