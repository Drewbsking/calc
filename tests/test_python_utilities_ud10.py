"""Verify crash-ID parsing and PDF downloads with simulated SEMCOG responses."""

import contextlib
from http.client import IncompleteRead
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("download_ud10_reports", ROOT / "python/download_ud10_reports.py")
DOWNLOADER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DOWNLOADER)
PDF = b"%PDF-1.4\nTest report\n%%EOF\n"


def response(body=PDF, content_length=None):
    stream = io.BytesIO(body)
    stream.headers = {"Content-Length": str(len(body) if content_length is None else content_length)}
    return stream


class UD10DownloadTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="ud10-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "Crash IDs.csv"
        self.source.write_text("Crash_ID\n1652746\n1914109\n", encoding="utf-8")
        self.output_folder = self.folder / "UD10_reports"
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.network = self.stack.enter_context(mock.patch.object(DOWNLOADER, "urlopen", side_effect=lambda *a, **k: response()))
        self.sleep = self.stack.enter_context(mock.patch.object(DOWNLOADER.time, "sleep"))
        self.output = io.StringIO()
        self.stack.enter_context(contextlib.redirect_stdout(self.output))

    def test_reads_bom_first_column_blanks_duplicates_and_leading_zeros(self):
        self.source.write_text('\ufeffCrash_ID,Notes\n00123,"Oak, Main"\n\n,blank\n456,Other\n 00123 ,duplicate\n', encoding="utf-8")
        self.assertEqual(DOWNLOADER.load_crash_ids(self.source), ["00123", "456"])
        self.network.assert_not_called()

    def test_supplied_csv_contains_547_unique_valid_ids(self):
        ids = DOWNLOADER.load_crash_ids(ROOT / "python/examples/ud10/Crash_IDs_for_2019.csv")
        self.assertEqual(len(ids), 547)
        self.assertEqual(ids[:3], ["1652746", "1914109", "1664156"])
        self.assertEqual(len(ids), len(set(ids)))

    def test_rejects_bad_ids_and_missing_headers_before_any_download(self):
        for text in ("", "1652746\n1914109\n", "Crash_ID\n", "Crash_ID\n123\n../../file\n",
                     "Crash_ID\n123.0\n", "Crash_ID\n\u0661\u0662\u0663\n", 'Crash_ID\n"unclosed'):
            with self.subTest(text=text):
                self.source.write_text(text, encoding="utf-8")
                with self.assertRaises((ValueError, DOWNLOADER.csv.Error)):
                    DOWNLOADER.download_reports(self.source)
                self.assertFalse(self.output_folder.exists())
        self.network.assert_not_called()

    def test_downloads_expected_filenames_and_keeps_csv_unchanged(self):
        original = self.source.read_bytes()
        summary = DOWNLOADER.download_reports(self.source)
        self.assertEqual(summary, {"downloaded": 2, "skipped": 0, "errors": 0})
        for crash_id in ("1652746", "1914109"):
            self.assertEqual((self.output_folder / f"UD10_{crash_id}.pdf").read_bytes(), PDF)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(self.network.call_args_list[0].args[0].full_url,
                         "https://ud10.semcog.org/ud10?crash_id=1652746")
        self.sleep.assert_called_once_with(1.0)
        self.assertIn("Summary: 2 downloaded, 0 skipped, 0 errors", self.output.getvalue())

    def test_existing_reports_are_skipped_without_network_or_sleep(self):
        self.output_folder.mkdir()
        for crash_id in ("1652746", "1914109"):
            (self.output_folder / f"UD10_{crash_id}.pdf").write_bytes(b"existing bytes")
        summary = DOWNLOADER.download_reports(self.source)
        self.assertEqual(summary, {"downloaded": 0, "skipped": 2, "errors": 0})
        self.network.assert_not_called()
        self.sleep.assert_not_called()
        self.assertEqual((self.output_folder / "UD10_1652746.pdf").read_bytes(), b"existing bytes")

    def test_custom_output_limit_and_timeout(self):
        custom = self.folder / "Reports" / "2019"
        summary = DOWNLOADER.download_reports(self.source, custom, max_reports=1, delay=0, timeout=8)
        self.assertEqual(summary["downloaded"], 1)
        self.assertEqual(list(custom.iterdir()), [custom / "UD10_1652746.pdf"])
        self.assertEqual(self.network.call_args.kwargs["timeout"], 8)
        self.sleep.assert_not_called()

    def test_non_pdf_and_truncated_responses_never_leave_output(self):
        for body, length in ((b"<html>Login required</html>", None), (b"%PDF-1.4\ntruncated", None), (PDF, len(PDF) + 100)):
            with self.subTest(body=body, length=length):
                self.network.side_effect = lambda *a, **k: response(body, length)
                summary = DOWNLOADER.download_reports(self.source, max_reports=1)
                self.assertEqual(summary["errors"], 1)
                self.assertEqual(list(self.output_folder.iterdir()), [])

    def test_interrupted_read_removes_partial_pdf_and_continues(self):
        broken = response()
        real_read = broken.read
        broken.read = mock.Mock(side_effect=[real_read(5), IncompleteRead(b"partial", 100)])
        self.network.side_effect = [broken, response()]
        summary = DOWNLOADER.download_reports(self.source)
        self.assertEqual(summary, {"downloaded": 1, "skipped": 0, "errors": 1})
        self.assertFalse((self.output_folder / "UD10_1652746.pdf").exists())
        self.assertEqual((self.output_folder / "UD10_1914109.pdf").read_bytes(), PDF)

    def test_cancel_removes_partial_file_and_main_reports_cancellation(self):
        cancelled = response()
        cancelled.read = mock.Mock(side_effect=[b"%PDF-", KeyboardInterrupt()])
        self.network.side_effect = [cancelled]
        with mock.patch.object(DOWNLOADER, "CSV_FILE_PATH", str(self.source)):
            self.assertEqual(DOWNLOADER.main(), 1)
        self.assertEqual(list(self.output_folder.iterdir()), [])
        self.assertIn("Download cancelled", self.output.getvalue())

    def test_http_access_errors_and_rate_limits_stop_further_requests(self):
        for status in (401, 403, 429):
            with self.subTest(status=status):
                self.network.reset_mock()
                self.network.side_effect = HTTPError("https://ud10.semcog.org/ud10", status, "unavailable", {}, None)
                summary = DOWNLOADER.download_reports(self.source)
                self.assertEqual(summary, {"downloaded": 0, "skipped": 0, "errors": 1})
                self.assertEqual(self.network.call_count, 1)
                self.assertIn("Stopped:", self.output.getvalue())

    def test_missing_report_and_timeout_continue_to_next_id(self):
        for failure in (HTTPError("https://ud10.semcog.org/ud10", 404, "not found", {}, None), TimeoutError("timed out")):
            with self.subTest(failure=failure):
                self.network.side_effect = [failure, response()]
                summary = DOWNLOADER.download_reports(self.source)
                self.assertEqual(summary, {"downloaded": 1, "skipped": 0, "errors": 1})
                (self.output_folder / "UD10_1914109.pdf").unlink()

    def test_racing_file_is_preserved_by_exclusive_creation(self):
        destination = self.output_folder / "UD10_1652746.pdf"

        def fetched(*args, **kwargs):
            destination.write_bytes(b"created elsewhere")
            return response()

        self.network.side_effect = fetched
        summary = DOWNLOADER.download_reports(self.source, max_reports=1)
        self.assertEqual(summary, {"downloaded": 0, "skipped": 1, "errors": 0})
        self.assertEqual(destination.read_bytes(), b"created elsewhere")

    def test_invalid_paths_and_settings_do_not_make_requests(self):
        for source in ("", r"C:\CHANGE_ME\Crash_IDs_for_2019.csv", self.folder / "missing.csv", self.folder):
            with self.subTest(source=source), self.assertRaises(ValueError):
                DOWNLOADER.download_reports(source)
        with mock.patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaises(ValueError):
                DOWNLOADER.download_reports(self.source)
        for settings in ({"max_reports": -1}, {"max_reports": 1.5}, {"delay": -1},
                         {"delay": float("nan")}, {"timeout": 0}, {"timeout": float("inf")}):
            with self.subTest(settings=settings), self.assertRaises(ValueError):
                DOWNLOADER.download_reports(self.source, **settings)
        self.assertFalse(self.output_folder.exists())
        self.network.assert_not_called()


if __name__ == "__main__":
    unittest.main()
