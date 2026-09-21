"""Test catalog downloads against temporary data and preserve the original-script mapping."""

import ast
import contextlib
from html.parser import HTMLParser
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = sorted((ROOT / "python").glob("*.py"))
FILE_INPUT_SETTINGS = {
    "csv_to_mediawiki": "CSV_FILE_PATH",
    "clean_wrapped_data": "INPUT_FILE_PATH",
}


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "python" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULES = {
    path.stem: load(path.stem) for path in DOWNLOADS
    if path.stem not in ("fill_empty_txt_files", "replace_spaces_in_filenames")
    and path.stem not in FILE_INPUT_SETTINGS
}
RENAME_CASES = [
    ("normalize_stop_yield_separator", "YS 050-1200-2024.pdf", "YS-050-1200-2024.pdf", {}),
    ("pad_tco_sequence_number", "YS-7-1200-2024.PDF", "YS-007-1200-2024.PDF", {}),
    ("append_folder_to_tco_filename", "YS-050-1200-2024.pdf", "YS-050-1200-2024-R0-Oak Estates.pdf", {}),
    ("move_filename_token_to_end", "TP-NLT-123.pdf", "TP-123-NLT.pdf", {}),
    ("append_filename_suffix", "TP-123.pdf", "TP-123-NTORH.pdf", {}),
    ("remove_filename_suffix", "TP-123-NLT.TXT", "TP-123.TXT", {}),
    ("trim_before_filename_marker", "Scan TS 123.pdf", "TS 123.pdf", {}),
    ("find_replace_filenames", "TCO TS 123.pdf", "TS 123.pdf", {}),
    ("normalize_tco_filename", "TCO TS 007 12 2024.pdf", "TS-007-1200-2024.pdf", {}),
    ("replace_tco_third_section", "YS-050-1200-2024.pdf", "YS-050-2500-2024.pdf",
     {"REPLACEMENT": "2500", "MATCH_TEXT": ("0", "25")}),
    ("expand_tco_year", "YS-050-1200-24.pdf", "YS-050-1200-2024.pdf", {"YEAR_CUTOFF": 25}),
    ("trim_after_comma_add_revision", "TS-007-1200-2024, scan.pdf", "TS-007-1200-2024-R0.pdf", {}),
]


class CatalogTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="tco-catalog-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def run_tool(self, module, folder, settings=None, answer="yes"):
        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            if settings:
                stack.enter_context(mock.patch.multiple(module, **settings))
            stack.enter_context(mock.patch("builtins.input", return_value=answer))
            stack.enter_context(contextlib.redirect_stdout(output))
            result = module.process_folder(folder)
        self.assertIn("Summary:", output.getvalue())
        return result, output.getvalue()

    def case_folder(self, name):
        folder = self.root / name / "Oak Estates"
        folder.mkdir(parents=True)
        return folder

    def test_all_rename_examples_preserve_bytes_and_repeat_runs(self):
        for name, before, after, settings in RENAME_CASES:
            with self.subTest(utility=name):
                folder = self.case_folder(name)
                (folder / before).write_bytes(b"Original bytes\x00\xff\r\n")
                result, _ = self.run_tool(MODULES[name], folder, settings)
                self.assertEqual(result, {"changed": 1, "skipped": 0, "errors": 0})
                self.assertFalse((folder / before).exists())
                self.assertEqual((folder / after).read_bytes(), b"Original bytes\x00\xff\r\n")
                again, _ = self.run_tool(MODULES[name], folder, settings)
                self.assertEqual(again["changed"], 0)
                self.assertEqual(again["errors"], 0)
                self.assertEqual(list(folder.iterdir()), [folder / after])

    def test_all_renamers_skip_existing_destinations(self):
        for name, before, after, settings in RENAME_CASES:
            with self.subTest(utility=name):
                folder = self.case_folder(name)
                (folder / before).write_bytes(b"original")
                (folder / after).write_bytes(b"destination")
                result, output = self.run_tool(MODULES[name], folder, settings)
                self.assertEqual(result["changed"], 0)
                self.assertIn("Destination already exists", output)
                self.assertEqual((folder / before).read_bytes(), b"original")
                self.assertEqual((folder / after).read_bytes(), b"destination")

    def test_default_subfolder_scope_for_every_renamer(self):
        for name, before, after, settings in RENAME_CASES:
            with self.subTest(utility=name):
                selected = self.root / name
                nested = selected / "Oak Estates"
                nested.mkdir(parents=True)
                (nested / before).write_bytes(b"nested")
                module = MODULES[name]
                result, _ = self.run_tool(module, selected, settings)
                self.assertEqual(result["changed"], int(module.RECURSIVE))
                self.assertEqual((nested / (after if module.RECURSIVE else before)).read_bytes(), b"nested")

    def test_all_three_trim_marker_presets(self):
        module = MODULES["trim_before_filename_marker"]
        for marker, before, after in [
            ("63", "Copy 63-123.pdf", "63-123.pdf"),
            ("TS ", "Old TS 123.pdf", "TS 123.pdf"),
            (" P ", "Oak P 123.pdf", "P 123.pdf"),
        ]:
            with self.subTest(marker=marker), mock.patch.object(module, "MARKER", marker):
                self.assertEqual(module.renamed_filename(before, "Folder"), after)
                self.assertEqual(module.renamed_filename("Unmatched.pdf", "Folder"), "Unmatched.pdf")

    def test_normalization_steps_are_independent_and_numbers_are_validated(self):
        module = MODULES["normalize_tco_filename"]
        self.assertEqual(module.renamed_filename("TCO TS 007 1200 2024.pdf", "Folder"), "TS-007-1200-2024.pdf")
        with mock.patch.multiple(module, REMOVE_TCO_PREFIX=False, REPLACE_SPACES=False):
            self.assertEqual(module.renamed_filename("TS-007-12-2024.pdf", "Folder"), "TS-007-1200-2024.pdf")
        self.assertEqual(module.renamed_filename("TS-007-AB-2024.pdf", "Folder"), "TS-007-AB-2024.pdf")

    def test_historical_rules_require_explicit_settings(self):
        for name in ("replace_tco_third_section", "expand_tco_year"):
            with self.subTest(utility=name):
                folder = self.case_folder(name)
                source = folder / "YS-050-1200-25.pdf"
                source.write_bytes(b"keep")
                result, output = self.run_tool(MODULES[name], folder)
                self.assertEqual(result["changed"], 0)
                self.assertEqual(result["errors"], 1)
                self.assertEqual(list(folder.iterdir()), [source])
                self.assertRegex(output, "MATCH_TEXT|REPLACEMENT|YEAR_CUTOFF")

    def test_year_century_boundaries_and_nonnumeric_sections(self):
        module = MODULES["expand_tco_year"]
        with mock.patch.object(module, "YEAR_CUTOFF", 25):
            for value, expected in [("00", "2000"), ("24", "2024"), ("25", "1925"),
                                    ("99", "1999"), ("AB", "AB"), ("2024", "2024")]:
                self.assertEqual(module.renamed_filename("YS-001-1200-" + value + ".jpg", "Folder"),
                                 "YS-001-1200-" + expected + ".jpg")
        with mock.patch.object(module, "YEAR_CUTOFF", 27):
            self.assertEqual(module.renamed_filename("YS-001-1200-26.jpg", "Folder"), "YS-001-1200-2026.jpg")

    def test_third_section_rule_is_substring_matching(self):
        module = MODULES["replace_tco_third_section"]
        with mock.patch.multiple(module, REPLACEMENT="2500", MATCH_TEXT=("0", "25")):
            for value, expected in [("10", "2500"), ("1256", "2500"), ("37", "37")]:
                self.assertEqual(module.renamed_filename("YS-001-" + value + "-2024.pdf", "Folder"),
                                 "YS-001-" + expected + "-2024.pdf")

    def test_tokens_suffixes_and_existing_revisions(self):
        move = MODULES["move_filename_token_to_end"]
        remove = MODULES["remove_filename_suffix"]
        self.assertEqual(move.renamed_filename("TP-NLTnotes-123.pdf", "Folder"), "TP-NLTnotes-123.pdf")
        self.assertEqual(remove.renamed_filename("TP-NLT-123-NLT.txt", "Folder"), "TP-NLT-123.txt")
        self.assertEqual(remove.renamed_filename("TP-NLT-123.txt", "Folder"), "TP-NLT-123.txt")
        folder = MODULES["append_folder_to_tco_filename"]
        self.assertEqual(folder.renamed_filename("YS-050-1200-2024-R1.pdf", "Oak-Estates"),
                         "YS-050-1200-2024-R1-Oak-Estates.pdf")
        self.assertEqual(folder.renamed_filename("YS-050-1200-2024-R1-Oak-Estates.pdf", "Oak-Estates"),
                         "YS-050-1200-2024-R1-Oak-Estates.pdf")
        self.assertEqual(MODULES["trim_after_comma_add_revision"].renamed_filename("TS-123-R0, copy.pdf", "Folder"),
                         "TS-123-R0.pdf")

    def test_find_replace_can_be_cancelled_and_can_change_extensions(self):
        module = MODULES["find_replace_filenames"]
        source = self.root / "TCO File.pdf"
        source.write_bytes(b"keep")
        result, output = self.run_tool(module, self.root, answer="no")
        self.assertIn("Planned:", output)
        self.assertIn("Cancelled", output)
        self.assertEqual(result["changed"], 0)
        self.assertTrue(source.exists())
        result, _ = self.run_tool(module, self.root, {"FIND_TEXT": ".pdf", "REPLACE_WITH": ".txt"})
        self.assertEqual(result["changed"], 1)
        self.assertEqual((self.root / "TCO File.txt").read_bytes(), b"keep")

    def test_invalid_replacement_cannot_move_a_file_outside_its_folder(self):
        module = MODULES["find_replace_filenames"]
        source = self.root / "TCO File.pdf"
        source.write_bytes(b"keep")
        result, output = self.run_tool(module, self.root, {"REPLACE_WITH": "../elsewhere/"})
        self.assertEqual(result["errors"], 1)
        self.assertEqual(result["changed"], 0)
        self.assertIn("invalid filename", output)
        self.assertEqual(list(self.root.iterdir()), [source])

    def test_rename_error_does_not_stop_later_files(self):
        module = MODULES["append_filename_suffix"]
        blocked = self.root / "A.pdf"
        blocked.write_bytes(b"blocked")
        (self.root / "B.pdf").write_bytes(b"allowed")
        real_rename = Path.rename

        def rename(source, destination):
            if source == blocked:
                raise PermissionError("locked for test")
            return real_rename(source, destination)

        with mock.patch.object(Path, "rename", rename):
            result, output = self.run_tool(module, self.root)
        self.assertEqual(result["changed"], 1)
        self.assertEqual(result["errors"], 1)
        self.assertIn("locked for test", output)
        self.assertEqual(blocked.read_bytes(), b"blocked")
        self.assertEqual((self.root / "B-NTORH.pdf").read_bytes(), b"allowed")

    def test_appended_note_preserves_existing_bytes_and_is_repeatable(self):
        module = MODULES["append_tco_note"]
        originals = {"A.txt": b"Old text", "B.TXT": b"Old\r\n", "C.txt": b"", "D.txt": b"\xff"}
        for name, content in originals.items():
            (self.root / name).write_bytes(content)
        result, _ = self.run_tool(module, self.root)
        self.assertEqual(result["changed"], 4)
        for name, content in originals.items():
            note = module.NOTE_TEMPLATE.format(filename=name).encode("utf-8")
            separator = b"\n" if content and not content.endswith((b"\n", b"\r")) else b""
            self.assertEqual((self.root / name).read_bytes(), content + separator + note + b"\n")
        again, _ = self.run_tool(module, self.root)
        self.assertEqual(again["changed"], 0)
        self.assertEqual(again["skipped"], 4)

    def test_tp_sequence_fills_only_observed_gaps_and_is_repeatable(self):
        module = MODULES["create_missing_sequence_files"]
        (self.root / "TP-10.pdf").write_bytes(b"ten")
        (self.root / "TP-12.txt").write_bytes(b"twelve")
        nested = self.root / "Nested"
        nested.mkdir()
        (nested / "TP-99.pdf").write_bytes(b"nested")
        result, _ = self.run_tool(module, self.root)
        self.assertEqual(result["changed"], 1)
        self.assertEqual((self.root / "TP-11.txt").read_bytes(), b"")
        self.assertFalse((self.root / "TP-13.txt").exists())
        self.assertEqual((self.root / "TP-12.txt").read_bytes(), b"twelve")
        again, _ = self.run_tool(module, self.root)
        self.assertEqual(again["changed"], 0)

    def test_ys_sequence_preserves_original_padding_suffix_and_note(self):
        module = MODULES["create_missing_sequence_files"]
        (self.root / "YS-050-1200.pdf").touch()
        (self.root / "YS-052-1200.pdf").touch()
        result, _ = self.run_tool(module, self.root, {"PRESET": "YS"})
        self.assertEqual(result["changed"], 1)
        self.assertEqual((self.root / "YS-051-.txt").read_text(),
                         "The file YS-051-.txt is missing or the number was never taken.")
        self.assertFalse((self.root / "YS-049-.txt").exists())

    def test_empty_sequence_needs_an_explicit_range_and_respects_conflicts(self):
        module = MODULES["create_missing_sequence_files"]
        result, output = self.run_tool(module, self.root)
        self.assertEqual(result["changed"], 0)
        self.assertIn("Set both START_NUMBER and END_NUMBER", output)
        (self.root / "TP-5.txt").mkdir()
        result, output = self.run_tool(module, self.root, {"START_NUMBER": 5, "END_NUMBER": 6})
        self.assertEqual(result["changed"], 1)
        self.assertIn("Destination already exists", output)
        self.assertTrue((self.root / "TP-5.txt").is_dir())
        self.assertEqual((self.root / "TP-6.txt").read_bytes(), b"")

    def test_reports_only_report_and_leave_files_and_folders_intact(self):
        (self.root / "Empty").mkdir()
        nested = self.root / "Parent" / "EmptyChild"
        nested.mkdir(parents=True)
        missing = self.root / "Scan 123.pdf"
        missing.write_bytes(b"scan")
        matched = self.root / "Oak P 123.pdf"
        matched.write_bytes(b"parking")
        result, output = self.run_tool(MODULES["find_empty_folders"], self.root)
        self.assertEqual(result["found"], 2)
        self.assertIn(str(nested), output)
        self.assertNotIn("Empty folder: " + str(nested.parent) + "\n", output)
        result, output = self.run_tool(MODULES["report_missing_filename_marker"], self.root)
        self.assertEqual(result["found"], 1)
        self.assertIn(str(missing), output)
        self.assertNotIn(str(matched), output)
        self.assertEqual(missing.read_bytes(), b"scan")
        self.assertEqual(matched.read_bytes(), b"parking")
        self.assertTrue(nested.is_dir())

    def test_new_downloads_reject_invalid_paths_and_import_without_work(self):
        for name, module in MODULES.items():
            with self.subTest(utility=name):
                result, output = self.run_tool(module, self.root / "missing")
                self.assertEqual(result["errors"], 1)
                self.assertIn("Folder not found", output)
                with mock.patch("os.scandir") as scan, mock.patch("os.rename") as rename, \
                        mock.patch("builtins.input") as prompt:
                    load(name)
                scan.assert_not_called()
                rename.assert_not_called()
                prompt.assert_not_called()

    def test_all_new_downloads_skip_symbolic_links_without_following_them(self):
        for name, module in MODULES.items():
            with self.subTest(utility=name):
                link = mock.Mock()
                link.name = "Shortcut.pdf"
                link.is_symlink.return_value = True
                settings = {}
                if name == "replace_tco_third_section":
                    settings = {"REPLACEMENT": "2500", "MATCH_TEXT": ("0",)}
                elif name == "expand_tco_year":
                    settings = {"YEAR_CUTOFF": 25}
                with mock.patch("os.scandir") as scan:
                    scan.return_value.__enter__.return_value = [link]
                    result, _ = self.run_tool(module, self.root, settings)
                self.assertEqual(result.get("changed", 0), 0)
                self.assertEqual(result.get("found", 0), 0)
                link.is_file.assert_not_called()
                link.is_dir.assert_not_called()

    def test_all_downloads_exit_clearly_with_an_unedited_path(self):
        for path in DOWNLOADS:
            with self.subTest(script=path.name):
                process = subprocess.run([sys.executable, "-B", str(path)], cwd=self.root,
                                         capture_output=True, text=True, check=False)
                self.assertEqual(process.returncode, 1, process.stderr)
                setting = FILE_INPUT_SETTINGS.get(path.stem, "FOLDER_PATH")
                self.assertIn("Set " + setting, process.stdout)
                self.assertEqual(process.stderr, "")
        self.assertEqual(list(self.root.iterdir()), [])


class CatalogHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.downloads = [], [], []
        self.settings = {}
        self.current_download = None
        self.in_settings = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        for key in ("href", "src"):
            if key in attrs:
                self.links.append(attrs[key])
        if "data-download" in attrs:
            self.current_download = attrs["href"]
            self.downloads.append(attrs)
        if "data-settings" in attrs:
            self.in_settings = True
            self.settings[self.current_download] = ""

    def handle_data(self, data):
        if self.in_settings:
            self.settings[self.current_download] += data

    def handle_endtag(self, tag):
        if tag == "pre":
            self.in_settings = False


class CatalogPageTests(unittest.TestCase):
    def test_all_downloads_are_listed_and_links_and_displayed_settings_match(self):
        page = CatalogHTML()
        page.feed((ROOT / "pythonUtilities.html").read_text(encoding="utf-8"))
        self.assertEqual(len(page.ids), len(set(page.ids)))
        self.assertEqual(len(page.downloads), 20)
        self.assertEqual({item["download"] for item in page.downloads}, {path.name for path in DOWNLOADS})
        for link in page.links:
            if link.startswith("#"):
                self.assertIn(link[1:], page.ids)
            elif not link.startswith("https://"):
                self.assertTrue((ROOT / link).is_file(), link)
        for item in page.downloads:
            with self.subTest(script=item["download"]):
                self.assertEqual(item["download"], Path(item["href"]).name)
                actual = ast.parse((ROOT / item["href"]).read_text(encoding="utf-8"))
                assignments = {
                    node.targets[0].id: ast.dump(node.value) for node in actual.body
                    if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
                }
                for node in ast.parse(page.settings[item["href"]]).body:
                    if isinstance(node, ast.Assign):
                        self.assertEqual(ast.dump(node.value), assignments[node.targets[0].id])

    def test_review_maps_all_original_scripts_to_current_downloads(self):
        review = (ROOT / "docs/python-utilities-review.md").read_text(encoding="utf-8")
        rows = [line.split("|") for line in review.splitlines() if line.startswith("| " + chr(96))]
        originals = {row[1].strip().strip(chr(96)) for row in rows}
        replacements = {row[2].split("](../python/", 1)[1].split(")", 1)[0] for row in rows}
        self.assertEqual(len(rows), 25)
        self.assertEqual(len(originals), 25)
        self.assertEqual(replacements, {path.name for path in DOWNLOADS})


if __name__ == "__main__":
    unittest.main()
