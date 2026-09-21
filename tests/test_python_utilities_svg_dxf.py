"""Verify batch conversion and file protection with simulated Inkscape exports."""

import contextlib
import csv
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("batch_svg_to_dxf", ROOT / "python/batch_svg_to_dxf.py")
CONVERTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONVERTER)
DXF = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"


class SVGToDXFTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="svg-dxf-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.root = self.folder / "SVG files"
        self.root.mkdir()
        self.source = self.root / "Stop sign.svg"
        self.source.write_bytes(b'<svg xmlns="http://www.w3.org/2000/svg"/>')
        self.executable = self.folder / "inkscape.exe"
        self.executable.write_bytes(b"test executable placeholder")
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.process = self.stack.enter_context(mock.patch.object(CONVERTER.subprocess, "run", side_effect=self.export))
        self.output = io.StringIO()
        self.stack.enter_context(contextlib.redirect_stdout(self.output))

    def export(self, command, **kwargs):
        Path(command[-1]).write_bytes(DXF)
        return subprocess.CompletedProcess(command, 0, "", "")

    def run_batch(self, **kwargs):
        return CONVERTER.convert_folder(self.root, str(self.executable), **kwargs)

    def test_recursive_conversion_handles_uppercase_extensions_and_preserves_inputs(self):
        nested = self.root / "Signs"
        nested.mkdir()
        second = nested / "Yield.SVG"
        second.write_bytes(b"another SVG")
        (nested / "ignore.png").write_bytes(b"image")
        original = self.source.read_bytes()
        results = self.run_batch()
        self.assertEqual(len(results), 2)
        self.assertTrue(all(row["status"] == "ok" for row in results))
        self.assertEqual(self.source.with_suffix(".dxf").read_bytes(), DXF)
        self.assertEqual(second.with_suffix(".dxf").read_bytes(), DXF)
        self.assertFalse((nested / "ignore.dxf").exists())
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(second.read_bytes(), b"another SVG")
        with (self.root / "conversion_report.csv").open(encoding="utf-8", newline="") as file:
            rows = list(csv.DictReader(file))
        self.assertEqual(len(rows), 2)
        self.assertEqual(set(rows[0]), {"svg", "dxf", "status", "seconds", "message"})
        self.assertIn("Summary: 2 converted", self.output.getvalue())

    def test_mirrored_output_preserves_subfolders_and_report_location(self):
        nested = self.root / "Signs"
        nested.mkdir()
        (nested / "Yield.svg").write_bytes(b"SVG")
        mirror = self.folder / "CAD files"
        self.run_batch(output_folder=mirror)
        self.assertEqual((mirror / "Stop sign.dxf").read_bytes(), DXF)
        self.assertEqual((mirror / "Signs/Yield.dxf").read_bytes(), DXF)
        self.assertTrue((mirror / "conversion_report.csv").exists())
        self.assertFalse(self.source.with_suffix(".dxf").exists())

    def test_repeat_run_skips_dxf_and_creates_new_report(self):
        self.run_batch()
        old_report = (self.root / "conversion_report.csv").read_bytes()
        self.process.reset_mock()
        results = self.run_batch()
        self.assertEqual(results[0]["status"], "skipped")
        self.process.assert_not_called()
        self.assertEqual((self.root / "conversion_report.csv").read_bytes(), old_report)
        self.assertTrue((self.root / "conversion_report_2.csv").is_file())

    def test_overwrite_only_replaces_existing_dxf_after_successful_export(self):
        target = self.source.with_suffix(".dxf")
        target.write_bytes(b"keep old DXF")
        self.process.side_effect = lambda command, **kwargs: subprocess.CompletedProcess(command, 1, "", "bad SVG")
        result = self.run_batch(overwrite=True)[0]
        self.assertEqual(result["status"], "error")
        self.assertEqual(target.read_bytes(), b"keep old DXF")
        self.process.side_effect = self.export
        self.assertEqual(self.run_batch(overwrite=True)[0]["status"], "ok")
        self.assertEqual(target.read_bytes(), DXF)

    def test_timeout_empty_and_missing_exports_leave_no_dxf_or_temp_folder(self):
        failures = [
            subprocess.TimeoutExpired("inkscape", 120),
            lambda command, **kwargs: subprocess.CompletedProcess(command, 0, "", ""),
            lambda command, **kwargs: (Path(command[-1]).touch() or subprocess.CompletedProcess(command, 0, "", "")),
        ]
        for failure in failures:
            with self.subTest(failure=failure):
                self.process.side_effect = failure
                result = self.run_batch()[0]
                self.assertEqual(result["status"], "error")
                self.assertFalse(self.source.with_suffix(".dxf").exists())
                self.assertEqual(list(self.root.glob(".svg-to-dxf-*")), [])

    def test_one_failed_export_does_not_stop_other_files(self):
        (self.root / "Good.svg").write_bytes(b"SVG")

        def export(command, **kwargs):
            if command[1] == str(self.source.resolve()):
                raise OSError("failed to start Inkscape")
            return self.export(command, **kwargs)

        self.process.side_effect = export
        results = self.run_batch()
        self.assertCountEqual([row["status"] for row in results], ["ok", "error"])
        self.assertEqual((self.root / "Good.dxf").read_bytes(), DXF)

    def test_racing_destination_is_preserved_when_overwrite_is_disabled(self):
        destination = self.source.with_suffix(".dxf")

        def export(command, **kwargs):
            destination.write_bytes(b"created elsewhere")
            return self.export(command, **kwargs)

        self.process.side_effect = export
        self.assertEqual(self.run_batch()[0]["status"], "skipped")
        self.assertEqual(destination.read_bytes(), b"created elsewhere")

    def test_explicit_existing_report_is_not_overwritten_and_no_conversion_starts(self):
        report = self.folder / "report.csv"
        report.write_bytes(b"previous report")
        with self.assertRaisesRegex(FileExistsError, "Report already exists"):
            self.run_batch(report_path=report)
        self.assertEqual(report.read_bytes(), b"previous report")
        self.process.assert_not_called()
        with self.assertRaisesRegex(ValueError, "end in .csv"):
            self.run_batch(report_path=self.source)

    def test_links_and_junctions_are_excluded_from_input_and_output(self):
        linked_folder = self.root / "Junction"
        linked_folder.mkdir()
        (linked_folder / "Linked.svg").touch()
        linked_file = self.root / "Shortcut.svg"
        linked_file.touch()
        with mock.patch.object(CONVERTER, "is_link", side_effect=lambda path: path in (linked_folder, linked_file)):
            self.assertEqual(CONVERTER.collect_svgs(self.root), [self.source])
        mirror = self.folder / "LinkedOutput"
        with mock.patch.object(CONVERTER, "is_link", side_effect=lambda path: path == mirror):
            with self.assertRaisesRegex(ValueError, "symbolic links or junctions"):
                self.run_batch(output_folder=mirror)
        destination = self.source.with_suffix(".dxf")
        with mock.patch.object(CONVERTER, "is_link", side_effect=lambda path: path == destination):
            result = CONVERTER.convert_one(str(self.executable), self.source, destination, overwrite=True)
        self.assertEqual(result["status"], "error")
        self.process.assert_not_called()

    def test_invalid_paths_and_settings_fail_before_output_is_created(self):
        for folder in ("", r"C:\CHANGE_ME\YourFolder", self.source, self.folder / "missing"):
            with self.subTest(folder=folder), self.assertRaises(ValueError):
                CONVERTER.convert_folder(folder)
        for options in ({"workers": 0}, {"workers": 1.5}, {"workers": True}, {"timeout": 0},
                        {"timeout": float("inf")}, {"overwrite": "False"}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.run_batch(**options)
        self.assertEqual(list(self.root.iterdir()), [self.source])
        self.process.assert_not_called()

    def test_missing_inkscape_gives_setup_instructions(self):
        with mock.patch.object(CONVERTER.shutil, "which", return_value=None), \
                mock.patch.object(Path, "is_file", return_value=False):
            with self.assertRaisesRegex(FileNotFoundError, "Install it and set INKSCAPE_PATH"):
                CONVERTER.find_inkscape()
        with self.assertRaises(FileNotFoundError):
            CONVERTER.find_inkscape(str(self.folder))
        self.assertEqual(CONVERTER.find_inkscape(str(self.executable)), str(self.executable.resolve()))

    def test_command_line_options_override_settings_and_failure_returns_nonzero(self):
        report = self.folder / "custom.csv"
        mirror = self.folder / "DXFs"
        options = [str(self.root), "--inkscape", str(self.executable), "--mirror-out", str(mirror),
                   "--report", str(report), "--workers", "1", "--overwrite", "--timeout", "9"]
        self.assertEqual(CONVERTER.main(options), 0)
        self.assertTrue(report.is_file())
        command = self.process.call_args.args[0]
        self.assertEqual(command[1], str(self.source.resolve()))
        self.assertIn("--export-type=dxf", command)
        self.assertEqual(self.process.call_args.kwargs["timeout"], 9)
        self.process.side_effect = subprocess.TimeoutExpired("inkscape", 1)
        self.assertEqual(CONVERTER.main([str(self.root), "--inkscape", str(self.executable)]), 1)


if __name__ == "__main__":
    unittest.main()
