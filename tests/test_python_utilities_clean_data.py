"""Verify wrapped-record cleanup using temporary input and output files."""

import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "python" / "clean_wrapped_data.py"


def load_cleaner():
    spec = importlib.util.spec_from_file_location("clean_wrapped_data", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CLEANER = load_cleaner()


class WrappedDataTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="wrapped-data-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "records.txt"

    def test_comma_lines_start_records_and_continuations_use_comma_space(self):
        content = "  0001, Main  Street  \n Northbound \n Active \n0002, Caf\u00e9 Road\n12.50"
        expected = "0001, Main  Street, Northbound, Active\n0002, Caf\u00e9 Road, 12.50"
        self.assertEqual(CLEANER.clean_data(content), expected)

    def test_blank_lines_and_final_newlines_never_add_delimiters(self):
        for ending in ("", "\n", "\r\n", "\r"):
            with self.subTest(ending=ending):
                content = "\n \t\n1001, Main Street\r\n\nNorthbound\n\n1002, Oak Road" + ending
                self.assertEqual(
                    CLEANER.clean_data(content),
                    "1001, Main Street, Northbound\n1002, Oak Road",
                )

    def test_quoted_commas_still_start_new_records_as_documented(self):
        content = '001, Main Street\nNorthbound\n"Continued, description"\nDetail'
        self.assertEqual(
            CLEANER.clean_data(content),
            '001, Main Street, Northbound\n"Continued, description", Detail',
        )

    def test_already_joined_records_are_unchanged_on_a_second_pass(self):
        content = "001, Main Street\nNorthbound\n002, Oak Road\nSouthbound"
        cleaned = CLEANER.clean_data(content)
        self.assertEqual(CLEANER.clean_data(cleaned), cleaned)

    def test_text_before_first_record_reports_line_number_without_output(self):
        self.source.write_text("\n  Orphan continuation\n001, Main Street\n", encoding="utf-8")
        original = self.source.read_bytes()
        with self.assertRaisesRegex(ValueError, "Line 2 has text before"):
            CLEANER.clean_file(self.source)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertFalse((self.folder / "records_cleaned.csv").exists())

    def test_empty_input_creates_no_output(self):
        for content in ("", " \n\r\n\t"):
            with self.subTest(content=content):
                self.assertEqual(CLEANER.clean_data(content), "")
                self.source.write_text(content, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "input contains no records"):
                    CLEANER.clean_file(self.source)
                self.assertFalse((self.folder / "records_cleaned.csv").exists())

    def test_default_output_supports_utf8_bom_and_preserves_source_bytes(self):
        original = b"\xef\xbb\xbf001, Main Street\r\nNorthbound\r\n"
        self.source.write_bytes(original)
        destination = CLEANER.clean_file(self.source)
        self.assertEqual(destination, self.folder / "records_cleaned.csv")
        self.assertEqual(destination.read_bytes(), b"001, Main Street, Northbound")
        self.assertEqual(self.source.read_bytes(), original)

    def test_existing_outputs_and_input_cannot_be_overwritten(self):
        self.source.write_text("001, Main Street\nNorthbound", encoding="utf-8")
        original = self.source.read_bytes()
        destination = self.folder / "custom.csv"
        destination.write_bytes(b"keep these contents")
        with self.assertRaisesRegex(FileExistsError, "Output already exists"):
            CLEANER.clean_file(self.source, destination)
        self.assertEqual(destination.read_bytes(), b"keep these contents")
        with self.assertRaisesRegex(ValueError, "different file"):
            CLEANER.clean_file(self.source, self.source)
        self.assertEqual(self.source.read_bytes(), original)
        new_output = self.folder / "new.csv"
        self.assertEqual(CLEANER.clean_file(self.source, new_output), new_output)
        self.assertEqual(new_output.read_text(), "001, Main Street, Northbound")

    def test_invalid_input_paths_and_links_are_rejected(self):
        for source in ("", r"C:\CHANGE_ME\wrapped_data.csv", self.folder / "missing.csv", self.folder):
            with self.subTest(source=source), self.assertRaises(ValueError):
                CLEANER.clean_file(source)
        self.source.write_text("001, Main Street", encoding="utf-8")
        with mock.patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaisesRegex(ValueError, "not an ordinary file"):
                CLEANER.clean_file(self.source)
        self.assertFalse((self.folder / "records_cleaned.csv").exists())

    def test_encoding_and_write_errors_are_reported_without_changing_input(self):
        self.source.write_bytes(b"001, Main Street\n\xff")
        with self.assertRaises(UnicodeError):
            CLEANER.clean_file(self.source)
        self.assertFalse((self.folder / "records_cleaned.csv").exists())
        self.source.write_text("001, Main Street\nNorthbound", encoding="utf-8")
        original = self.source.read_bytes()
        with mock.patch.multiple(
            CLEANER, INPUT_FILE_PATH=str(self.source), OUTPUT_FILE_PATH=str(self.folder / "missing" / "out.csv")
        ):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(CLEANER.main(), 1)
            self.assertIn("Error:", output.getvalue())
        self.assertEqual(self.source.read_bytes(), original)
        self.assertFalse((self.folder / "missing").exists())

    def test_import_does_not_open_files_or_prompt(self):
        output = io.StringIO()
        with mock.patch.object(Path, "open") as opened, mock.patch("builtins.input") as prompted, \
                contextlib.redirect_stdout(output):
            load_cleaner()
        opened.assert_not_called()
        prompted.assert_not_called()
        self.assertEqual(output.getvalue(), "")

    def test_editing_the_marked_input_path_is_enough_to_run_the_script(self):
        data_folder = self.folder / "data"
        data_folder.mkdir()
        source = data_folder / "wrapped.csv"
        source.write_text("001, Main Street\nNorthbound\n", encoding="utf-8")
        script = SCRIPT.read_text(encoding="utf-8").replace(
            'INPUT_FILE_PATH = r"C:\\CHANGE_ME\\wrapped_data.csv"',
            "INPUT_FILE_PATH = " + repr(str(source)),
            1,
        )
        runner = self.folder / "downloaded_cleaner.py"
        runner.write_text(script, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, "-B", str(runner)], cwd=self.folder,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Cleaned data saved to:", result.stdout)
        self.assertEqual(
            (data_folder / "wrapped_cleaned.csv").read_text(encoding="utf-8"),
            "001, Main Street, Northbound",
        )
        self.assertFalse((self.folder / "wrapped_cleaned.csv").exists())


if __name__ == "__main__":
    unittest.main()
