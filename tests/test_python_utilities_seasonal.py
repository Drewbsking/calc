"""Check seasonal factor ordering, validation, shared colors, and safe PNG output."""

import contextlib
import importlib.util
import io
import math
from pathlib import Path
import struct
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("seasonal_factor_plots", ROOT / "python/seasonal_factor_plots.py")
PLOTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLOTS)
HEADER = ("YEAR", "MONTH", *PLOTS.DAY_COLUMNS)
HAS_PLOTTING = all(importlib.util.find_spec(name) for name in ("openpyxl", "matplotlib"))


class SeasonalFactorTests(unittest.TestCase):
    def test_month_day_order_year_filter_and_shared_scale(self):
        header = ("MONTH", "SUNFAC", "YEAR", "SATFAC", "FRIFAC", "THURFAC", "WEDFAC", "TUEFAC", "MONFAC")
        matrices, bounds = PLOTS.prepare_factors([
            header,
            ("Dec", 1.7, 2022, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1),
            ("Jan", 1.0, 2021, 1.0, 1.0, 1.0, 1.0, 1.0, 0.5),
            ("Jan", 99, 2020, 99, 99, 99, 99, 99, 99),
        ], 2021, 2022)
        self.assertEqual(list(matrices), [2021, 2022])
        self.assertEqual(matrices[2022][11], [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7])
        self.assertEqual(matrices[2021][0][0], 0.5)
        self.assertTrue(math.isnan(matrices[2021][1][0]))
        self.assertAlmostEqual(bounds[0], 0.3)
        self.assertAlmostEqual(bounds[1], 1.7)

    def test_blanks_are_missing_and_constant_factors_have_usable_scale(self):
        matrices, bounds = PLOTS.prepare_factors([
            HEADER, [None] * 9, (2021, " jan ", None, "", " ", 1, 1, 1, 1),
        ], 2021, 2021)
        self.assertTrue(all(math.isnan(value) for value in matrices[2021][0][:3]))
        self.assertEqual(bounds, (0.99, 1.01))

    def test_bad_columns_duplicates_and_month_names_are_rejected(self):
        cases = [
            ([("YEAR", "MONTH")], "Missing worksheet columns"),
            ([("YEAR", *HEADER)], "must be unique"),
            ([HEADER, (2021, "January", *([1] * 7))], "Jan through Dec"),
            ([HEADER, (2021, "Jan", *([1] * 7)), (2021, "Jan", *([1] * 7))], "Duplicate month"),
        ]
        for rows, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                PLOTS.prepare_factors(rows, 2021, 2021)

    def test_invalid_factors_and_years_are_rejected(self):
        for value in ("bad", "=A1", float("inf"), float("nan"), -1, 0, True):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "positive, finite"):
                PLOTS.prepare_factors([HEADER, (2021, "Jan", value, 1, 1, 1, 1, 1, 1)], 2021, 2021)
        for year in ("bad", 2021.5, None, True, float("inf")):
            with self.subTest(year=year), self.assertRaisesRegex(ValueError, "whole year"):
                PLOTS.prepare_factors([HEADER, (year, "Jan", *([1] * 7))], 2021, 2021)
        for start, end in ((2023, 2021), (2021.5, 2023), (True, 2023), (0, 2023)):
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                PLOTS.check_years(start, end)

    def test_requested_years_require_at_least_one_numeric_factor(self):
        for rows in ([HEADER], [HEADER, (2021, "Jan", *([None] * 7))],
                     [HEADER, (2021, "Jan", *([1] * 7))]):
            with self.subTest(rows=rows), self.assertRaisesRegex(ValueError, "No numeric factors"):
                PLOTS.prepare_factors(rows, 2021, 2022)


class SeasonalOutputTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="seasonal-factor-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "factors.xlsx"
        self.source.write_bytes(b"unchanged workbook")
        self.data = PLOTS.prepare_factors([
            HEADER, (2021, "Jan", *([1] * 7)), (2022, "Jan", *([1.5] * 7)),
        ], 2021, 2022)
        self.figure = mock.Mock()
        self.figure.savefig.side_effect = lambda output, **kwargs: output.write(b"PNG test bytes")
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        self.loader = stack.enter_context(mock.patch.object(PLOTS, "load_factors", return_value=self.data))
        self.renderer = stack.enter_context(mock.patch.object(PLOTS, "make_figure", return_value=self.figure))
        stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def generate(self, **settings):
        return PLOTS.generate_heatmaps(self.source, start_year=2021, end_year=2022, **settings)

    def test_default_output_and_repeat_run_preserve_input_and_existing_images(self):
        outputs = self.generate()
        self.assertEqual([path.name for path in outputs], [
            "heatmap_2021_common_scale.png", "heatmap_2022_common_scale.png"])
        for path in outputs:
            self.assertEqual(path.parent, self.folder / "seasonal_heatmaps")
            self.assertEqual(path.read_bytes(), b"PNG test bytes")
        self.assertEqual(self.source.read_bytes(), b"unchanged workbook")
        self.assertEqual([call.args[2] for call in self.renderer.call_args_list], [self.data[1]] * 2)
        self.renderer.reset_mock()
        with self.assertRaises(FileExistsError):
            self.generate()
        self.renderer.assert_not_called()

    def test_existing_later_year_prevents_any_new_images(self):
        target = self.folder / "charts"
        target.mkdir()
        existing = target / "heatmap_2022_common_scale.png"
        existing.write_bytes(b"keep")
        with self.assertRaises(FileExistsError):
            self.generate(output_folder=target)
        self.assertEqual(list(target.iterdir()), [existing])
        self.assertEqual(existing.read_bytes(), b"keep")
        self.renderer.assert_not_called()

    def test_failed_save_removes_partial_file_and_closes_figure(self):
        def fail(output, **settings):
            output.write(b"partial image")
            raise OSError("simulated write error")
        self.figure.savefig.side_effect = fail
        with self.assertRaisesRegex(OSError, "simulated write error"):
            self.generate()
        self.assertEqual(list((self.folder / "seasonal_heatmaps").iterdir()), [])
        self.figure.clear.assert_called_once()

    def test_exclusive_save_preserves_destination_created_during_render(self):
        target = self.folder / "seasonal_heatmaps" / "heatmap_2021_common_scale.png"
        def race(*args):
            target.write_bytes(b"another process")
            return self.figure
        self.renderer.side_effect = race
        with self.assertRaises(FileExistsError):
            self.generate()
        self.assertEqual(target.read_bytes(), b"another process")
        self.figure.savefig.assert_not_called()

    def test_invalid_paths_settings_and_links_are_rejected_before_reading(self):
        for source in ("", r"C:\CHANGE_ME\Seasonal Factor Table.xlsx", self.folder / "missing.xlsx"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                PLOTS.generate_heatmaps(source)
        for dpi in (0, 1.5, True, 1201):
            with self.subTest(dpi=dpi), self.assertRaisesRegex(ValueError, "DPI"):
                self.generate(dpi=dpi)
        with mock.patch.object(Path, "is_symlink", return_value=True), self.assertRaisesRegex(ValueError, "Symbolic links"):
            self.generate()
        self.loader.assert_not_called()


@unittest.skipUnless(HAS_PLOTTING, "Install openpyxl and matplotlib for real workbook/render checks")
class SeasonalWorkbookTests(unittest.TestCase):
    def test_supplied_workbook_values_match_each_heatmap_cell(self):
        from openpyxl import load_workbook
        source = ROOT / "python/examples/seasonal-factors/Seasonal Factor Table.xlsx"
        matrices, bounds = PLOTS.load_factors(source, PLOTS.SHEET_NAME, 2021, 2023)
        with source.open("rb") as input_file:
            workbook = load_workbook(input_file, read_only=True, data_only=True)
            try:
                rows = iter(workbook[PLOTS.SHEET_NAME].values)
                header = next(rows)
                checked = 0
                for row in rows:
                    record = dict(zip(header, row))
                    if 2021 <= record["YEAR"] <= 2023:
                        month = PLOTS.MONTHS.index(record["MONTH"])
                        self.assertEqual(matrices[record["YEAR"]][month], [record[name] for name in PLOTS.DAY_COLUMNS])
                        checked += 7
                self.assertEqual(checked, 252)
            finally:
                workbook.close()
        self.assertAlmostEqual(sum(bounds), 2)
        with self.assertRaisesRegex(ValueError, "Available sheets"):
            PLOTS.load_factors(source, "missing", 2021, 2023)

    def test_real_png_generation_preserves_workbook(self):
        source = ROOT / "python/examples/seasonal-factors/Seasonal Factor Table.xlsx"
        before = source.read_bytes()
        with tempfile.TemporaryDirectory(prefix="seasonal-png-test-") as folder:
            with contextlib.redirect_stdout(io.StringIO()):
                outputs = PLOTS.generate_heatmaps(source, output_folder=folder, dpi=72)
            self.assertEqual(len(outputs), 3)
            for path in outputs:
                data = path.read_bytes()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", data[16:24]), (720, 504))
        self.assertEqual(source.read_bytes(), before)

    def test_rendered_annotations_use_bold_fonts_and_mark_missing_values(self):
        matrix = [[math.nan] * 7 for _ in range(12)]
        matrix[0] = [0.94, 0.95, 1, 1.05, 1.06, 0.5, math.nan]
        figure = PLOTS.make_figure(2021, matrix, (0.5, 1.5))
        try:
            texts = figure.axes[0].texts
            self.assertEqual([text.get_fontweight() for text in texts[:5]], ["normal", "bold", "bold", "bold", "normal"])
            self.assertEqual(texts[6].get_text(), "—")
            self.assertEqual([text.get_text() for text in figure.axes[0].get_xticklabels()], list(PLOTS.DAY_LABELS))
            self.assertFalse(any("**" in text.get_text() for text in texts))
        finally:
            figure.clear()


if __name__ == "__main__":
    unittest.main()
