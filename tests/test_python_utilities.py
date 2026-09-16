"""Exercise the downloadable scripts only against temporary test folders."""

import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_NAMES = ("fill_empty_txt_files", "replace_spaces_in_filenames")


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "python" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FILL = load_script(SCRIPT_NAMES[0])
RENAME = load_script(SCRIPT_NAMES[1])
OPERATIONS = (
    FILL.find_and_modify_empty_txt_files,
    RENAME.replace_spaces_in_pdf_filenames,
)


class PythonUtilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="python-utilities-test-")
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)

    def make_file(self, name, content=b""):
        path = self.folder / name
        path.write_bytes(content)
        return path

    def run_utility(self, operation, folder=None):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = operation(self.folder if folder is None else folder)
        self.assertIn(
            f"Summary: {result['changed']} changed, {result['skipped']} skipped, "
            f"{result['errors']} errors.",
            output.getvalue(),
        )
        return result, output.getvalue()

    def test_txt_changes_only_zero_byte_files_and_is_repeatable(self):
        empty_names = ["Empty.txt", "UPPER.TXT", "Caf\u00e9 at Main.txt"]
        for name in empty_names:
            self.make_file(name)
        untouched = {
            "Populated.txt": b"Existing text\r\n",
            "Spaces.txt": b"  \t",
            "Blank lines.txt": b"\r\n\n",
            "Other.pdf": b"",
        }
        for name, content in untouched.items():
            self.make_file(name, content)
        nested = self.folder / "Subfolder.txt"
        nested.mkdir()
        (nested / "Nested.txt").touch()

        result, output = self.run_utility(OPERATIONS[0])
        self.assertEqual(result, {"changed": 3, "skipped": 5, "errors": 0})
        self.assertIn("Modified empty file: Empty.txt", output)
        for name in empty_names:
            self.assertEqual((self.folder / name).read_bytes(), name.encode("utf-8"))
        for name, content in untouched.items():
            self.assertEqual((self.folder / name).read_bytes(), content)
        self.assertEqual((nested / "Nested.txt").read_bytes(), b"")

        repeated, _ = self.run_utility(OPERATIONS[0])
        self.assertEqual(repeated, {"changed": 0, "skipped": 8, "errors": 0})

    def test_txt_file_that_gains_content_after_scan_is_preserved(self):
        target = self.make_file("Growing.txt")
        original_open = open

        def open_after_update(path, *args, **kwargs):
            if Path(path) == target:
                with original_open(target, "wb") as file:
                    file.write(b"Arrived after scan")
            return original_open(path, *args, **kwargs)

        with mock.patch("builtins.open", side_effect=open_after_update):
            result, _ = self.run_utility(OPERATIONS[0])
        self.assertEqual(result, {"changed": 0, "skipped": 1, "errors": 0})
        self.assertEqual(target.read_bytes(), b"Arrived after scan")

    def test_txt_permission_error_does_not_stop_other_files(self):
        blocked = self.make_file("A locked.txt")
        successful = self.make_file("B writable.txt")
        original_open = open

        def open_with_denied_file(path, *args, **kwargs):
            if Path(path) == blocked:
                raise PermissionError("File is in use")
            return original_open(path, *args, **kwargs)

        with mock.patch("builtins.open", side_effect=open_with_denied_file):
            result, output = self.run_utility(OPERATIONS[0])
        self.assertEqual(result, {"changed": 1, "skipped": 0, "errors": 1})
        self.assertIn("A locked.txt", output)
        self.assertIn("File is in use", output)
        self.assertEqual(blocked.read_bytes(), b"")
        self.assertEqual(successful.read_bytes(), b"B writable.txt")

    def test_rename_extensions_spaces_contents_and_repeat_runs(self):
        originals = {
            "Turning Prohibition.pdf": b"%PDF contents\x00\xff",
            "Meeting Notes.docx": b"PK document\x00\xff",
            "UPPER CASE.PDF": b"uppercase pdf",
            "Mixed Case.DoCx": b"mixed-case docx",
            "Two  Spaces.pdf": b"two spaces",
        }
        for name, content in originals.items():
            self.make_file(name, content)
        for name in ["Already-tidy.pdf", "Read me.txt", "Old Word.doc"]:
            self.make_file(name, b"keep")
        nested = self.folder / "Folder With Spaces.pdf"
        nested.mkdir()
        (nested / "Nested File.pdf").write_bytes(b"nested")

        result, output = self.run_utility(OPERATIONS[1])
        self.assertEqual(result, {"changed": 5, "skipped": 4, "errors": 0})
        self.assertIn("'Meeting Notes.docx' to 'Meeting-Notes.docx'", output)
        for name, content in originals.items():
            self.assertFalse((self.folder / name).exists())
            self.assertEqual((self.folder / name.replace(" ", "-")).read_bytes(), content)
        for name in ["Already-tidy.pdf", "Read me.txt", "Old Word.doc"]:
            self.assertEqual((self.folder / name).read_bytes(), b"keep")
        self.assertEqual((nested / "Nested File.pdf").read_bytes(), b"nested")
        repeated, _ = self.run_utility(OPERATIONS[1])
        self.assertEqual(repeated, {"changed": 0, "skipped": 9, "errors": 0})

    def test_rename_does_not_replace_existing_files_or_directories(self):
        source = self.make_file("Meeting Notes.docx", b"source")
        destination = self.make_file("Meeting-Notes.docx", b"destination")
        other = self.make_file("Other File.pdf", b"other source")
        (self.folder / "Other-File.pdf").mkdir()
        result, output = self.run_utility(OPERATIONS[1])
        self.assertEqual(result, {"changed": 0, "skipped": 4, "errors": 0})
        self.assertEqual(output.count("Destination already exists"), 2)
        self.assertEqual(source.read_bytes(), b"source")
        self.assertEqual(destination.read_bytes(), b"destination")
        self.assertEqual(other.read_bytes(), b"other source")
        self.assertTrue((self.folder / "Other-File.pdf").is_dir())

    def test_rename_permission_error_does_not_stop_other_files(self):
        blocked = self.make_file("A locked.pdf", b"locked")
        self.make_file("B writable.pdf", b"writable")
        original_rename = os.rename

        def rename_with_denied_file(source, destination):
            if Path(source) == blocked:
                raise PermissionError("Permission denied")
            return original_rename(source, destination)

        with mock.patch.object(RENAME.os, "rename", side_effect=rename_with_denied_file):
            result, output = self.run_utility(OPERATIONS[1])
        self.assertEqual(result, {"changed": 1, "skipped": 0, "errors": 1})
        self.assertIn("Error processing 'A locked.pdf'", output)
        self.assertEqual(blocked.read_bytes(), b"locked")
        self.assertEqual((self.folder / "B-writable.pdf").read_bytes(), b"writable")

    def test_symbolic_link_entries_are_skipped_without_following_them(self):
        # A fake directory entry makes this check independent of Windows symlink privileges.
        for operation in OPERATIONS:
            with self.subTest(operation=operation.__name__):
                link = mock.Mock()
                link.name = "Shortcut File.txt" if operation is OPERATIONS[0] else "Shortcut File.pdf"
                link.is_symlink.return_value = True
                link.is_file.side_effect = AssertionError("Must not inspect the link target")
                with mock.patch("os.scandir") as scan:
                    scan.return_value.__enter__.return_value = [link]
                    result, _ = self.run_utility(operation)
                self.assertEqual(result, {"changed": 0, "skipped": 1, "errors": 0})
                link.is_file.assert_not_called()

    def test_missing_file_and_placeholder_paths_fail_clearly(self):
        ordinary_file = self.make_file("Not a folder.txt", b"untouched")
        invalid_paths = [
            ("", "Set FOLDER_PATH"),
            (r"C:\CHANGE_ME\YourFolder", "Set FOLDER_PATH"),
            (self.folder / "Missing", "Folder not found"),
            (ordinary_file, "Folder not found"),
        ]
        for operation in OPERATIONS:
            for folder, expected in invalid_paths:
                with self.subTest(operation=operation.__name__, folder=folder):
                    result, output = self.run_utility(operation, folder)
                    self.assertEqual(result, {"changed": 0, "skipped": 0, "errors": 1})
                    self.assertIn(expected, output)
        self.assertEqual(ordinary_file.read_bytes(), b"untouched")

    def test_folder_listing_error_is_reported_with_summary(self):
        for operation in OPERATIONS:
            with self.subTest(operation=operation.__name__):
                with mock.patch("os.scandir", side_effect=PermissionError("Folder access denied")):
                    result, output = self.run_utility(operation)
                self.assertEqual(result, {"changed": 0, "skipped": 0, "errors": 1})
                self.assertIn("Folder access denied", output)

    def test_empty_folders_succeed(self):
        for operation in OPERATIONS:
            with self.subTest(operation=operation.__name__):
                result, _ = self.run_utility(operation)
                self.assertEqual(result, {"changed": 0, "skipped": 0, "errors": 0})

    def test_imports_do_not_run_or_modify_files(self):
        for name in SCRIPT_NAMES:
            with self.subTest(script=name):
                output = io.StringIO()
                with contextlib.redirect_stdout(output), mock.patch("os.scandir") as scan, \
                        mock.patch("os.rename") as rename, mock.patch("builtins.open") as file_open:
                    load_script(name)
                scan.assert_not_called()
                rename.assert_not_called()
                file_open.assert_not_called()
                self.assertEqual(output.getvalue(), "")

    def test_standalone_scripts_need_only_the_marked_path_edit(self):
        for name in SCRIPT_NAMES:
            with self.subTest(script=name):
                target = self.folder / name
                target.mkdir()
                fixture = target / ("Example File.txt" if name == SCRIPT_NAMES[0] else "Example File.pdf")
                fixture.write_bytes(b"")
                source = (ROOT / "python" / (name + ".py")).read_text(encoding="utf-8")
                self.assertIn("# CHANGE ONLY THE FOLDER PATH BELOW.", source)
                edited = source.replace(
                    'FOLDER_PATH = r"C:\\CHANGE_ME\\YourFolder"',
                    "FOLDER_PATH = " + repr(str(target)),
                    1,
                )
                runner = self.folder / (name + ".py")
                runner.write_text(edited, encoding="utf-8")
                result = subprocess.run(
                    [sys.executable, "-B", str(runner)],
                    cwd=self.folder, capture_output=True, text=True, check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("Summary: 1 changed, 0 skipped, 0 errors.", result.stdout)
                if name == SCRIPT_NAMES[0]:
                    self.assertEqual(fixture.read_bytes(), b"Example File.txt")
                else:
                    self.assertFalse(fixture.exists())
                    self.assertEqual((target / "Example-File.pdf").read_bytes(), b"")

    def test_unedited_downloads_exit_with_an_actionable_message(self):
        for name in SCRIPT_NAMES:
            with self.subTest(script=name):
                result = subprocess.run(
                    [sys.executable, "-B", str(ROOT / "python" / (name + ".py"))],
                    cwd=self.folder, capture_output=True, text=True, check=False,
                )
                self.assertEqual(result.returncode, 1)
                self.assertIn("Set FOLDER_PATH near the top", result.stdout)
                self.assertEqual(result.stderr, "")
        self.assertEqual(list(self.folder.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
