"""Check PDF extraction and safe speech output without installing packages or using Google."""

import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("pdf_to_mp3", ROOT / "python/pdf_to_mp3.py")
CONVERTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONVERTER)


class PDFToMP3Tests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="pdf-to-mp3-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "My Book.pdf"
        self.source.write_bytes(b"input PDF bytes")
        self.reader = mock.Mock(is_encrypted=False)
        self.reader.pages = [mock.Mock(extract_text=mock.Mock(return_value="First page."))]
        self.pdf = types.ModuleType("pypdf")
        self.pdf.PdfReader = mock.Mock(return_value=self.reader)
        self.gtts = types.ModuleType("gtts")
        self.speech = mock.Mock()
        self.speech.write_to_fp.side_effect = lambda output: output.write(b"audio bytes")
        self.gtts.gTTS = mock.Mock(return_value=self.speech)
        self.modules = mock.patch.dict(sys.modules, {"pypdf": self.pdf, "gtts": self.gtts})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.output = io.StringIO()
        self.redirect = contextlib.redirect_stdout(self.output)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def test_extracts_pages_in_order_with_separators_and_skips_empty_pages(self):
        self.reader.pages = [
            mock.Mock(extract_text=mock.Mock(return_value=text))
            for text in (" First page. ", None, " \n ", "Last page.")
        ]
        self.assertEqual(CONVERTER.pdf_to_text(self.source), "First page.\n\nLast page.")
        self.assertIn("Skipped 2 page(s)", self.output.getvalue())
        self.assertTrue(self.pdf.PdfReader.call_args.args[0].closed)

    def test_default_output_and_speech_settings_preserve_pdf(self):
        destination = CONVERTER.pdf_to_mp3(self.source)
        self.assertEqual(destination, self.folder / "My Book.mp3")
        self.assertEqual(destination.read_bytes(), b"audio bytes")
        self.assertEqual(self.source.read_bytes(), b"input PDF bytes")
        self.gtts.gTTS.assert_called_once_with(text="First page.", lang="en", slow=False, timeout=60)
        custom = self.folder / "Different.MP3"
        self.assertEqual(CONVERTER.pdf_to_mp3(self.source, custom, "fr", True), custom)
        self.assertEqual(self.gtts.gTTS.call_args.kwargs["lang"], "fr")
        self.assertTrue(self.gtts.gTTS.call_args.kwargs["slow"])

    def test_existing_output_and_input_as_output_never_reach_speech_service(self):
        destination = self.source.with_suffix(".mp3")
        destination.write_bytes(b"existing recording")
        with self.assertRaisesRegex(FileExistsError, "Output already exists"):
            CONVERTER.pdf_to_mp3(self.source)
        with self.assertRaisesRegex(ValueError, "different file"):
            CONVERTER.pdf_to_mp3(self.source, self.source)
        self.gtts.gTTS.assert_not_called()
        self.pdf.PdfReader.assert_not_called()
        self.assertEqual(destination.read_bytes(), b"existing recording")
        self.assertEqual(self.source.read_bytes(), b"input PDF bytes")

    def test_racing_output_creation_preserves_the_other_file(self):
        destination = self.source.with_suffix(".mp3")

        def speech_created(**kwargs):
            destination.write_bytes(b"created elsewhere")
            return self.speech

        self.gtts.gTTS.side_effect = speech_created
        with self.assertRaises(FileExistsError):
            CONVERTER.pdf_to_mp3(self.source)
        self.speech.write_to_fp.assert_not_called()
        self.assertEqual(destination.read_bytes(), b"created elsewhere")

    def test_network_failure_and_cancellation_remove_partial_output(self):
        destination = self.source.with_suffix(".mp3")
        for error in (Exception("service unavailable"), KeyboardInterrupt(), OSError("disk full")):
            with self.subTest(error=type(error).__name__):
                def fail(output):
                    output.write(b"incomplete audio")
                    raise error

                self.speech.write_to_fp.side_effect = fail
                expected = type(error) if not type(error) is Exception else RuntimeError
                with self.assertRaises(expected):
                    CONVERTER.pdf_to_mp3(self.source)
                self.assertFalse(destination.exists())
                self.assertEqual(self.source.read_bytes(), b"input PDF bytes")

    def test_no_audio_response_is_not_reported_as_success(self):
        self.speech.write_to_fp.side_effect = None
        with self.assertRaisesRegex(RuntimeError, "no audio"):
            CONVERTER.pdf_to_mp3(self.source)
        self.assertFalse(self.source.with_suffix(".mp3").exists())

    def test_scanned_encrypted_and_broken_pdfs_create_no_audio(self):
        self.reader.pages[0].extract_text.return_value = None
        with self.assertRaisesRegex(ValueError, "OCR"):
            CONVERTER.pdf_to_mp3(self.source)
        self.reader.is_encrypted = True
        with self.assertRaisesRegex(RuntimeError, "encrypted"):
            CONVERTER.pdf_to_mp3(self.source)
        self.pdf.PdfReader.side_effect = Exception("invalid PDF header")
        with self.assertRaisesRegex(RuntimeError, "Could not read PDF"):
            CONVERTER.pdf_to_mp3(self.source)
        self.gtts.gTTS.assert_not_called()
        self.assertFalse(self.source.with_suffix(".mp3").exists())

    def test_missing_packages_give_install_instructions(self):
        for name in ("pypdf", "gtts"):
            with self.subTest(package=name), mock.patch.dict(sys.modules, {name: None}):
                with self.assertRaisesRegex(RuntimeError, "py -m pip install pypdf gTTS"):
                    CONVERTER.pdf_to_mp3(self.source)
                self.assertFalse(self.source.with_suffix(".mp3").exists())

    def test_invalid_paths_are_rejected_before_reading_or_sending_text(self):
        for source in ("", r"C:\CHANGE_ME\YourDocument.pdf", self.folder, self.folder / "missing.pdf"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                CONVERTER.pdf_to_mp3(source)
        wrong_type = self.folder / "document.txt"
        wrong_type.write_text("not a PDF")
        with self.assertRaisesRegex(ValueError, "end in .pdf"):
            CONVERTER.pdf_to_mp3(wrong_type)
        with mock.patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaisesRegex(ValueError, "not an ordinary file"):
                CONVERTER.pdf_to_mp3(self.source)
        for destination in (self.folder / "output.wav", self.folder / "missing" / "output.mp3"):
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                CONVERTER.pdf_to_mp3(self.source, destination)
        self.pdf.PdfReader.assert_not_called()
        self.gtts.gTTS.assert_not_called()

    def test_invalid_language_creates_no_output(self):
        self.gtts.gTTS.side_effect = ValueError("Language not supported")
        with self.assertRaisesRegex(ValueError, "Check LANGUAGE"):
            CONVERTER.pdf_to_mp3(self.source, language="unknown")
        self.assertFalse(self.source.with_suffix(".mp3").exists())

    def test_main_reports_service_failure_without_traceback(self):
        self.speech.write_to_fp.side_effect = Exception("service unavailable")
        with mock.patch.object(CONVERTER, "PDF_FILE_PATH", str(self.source)):
            self.assertEqual(CONVERTER.main(), 1)
        self.assertIn("Check your internet connection", self.output.getvalue())
        self.assertNotIn("MP3 saved to", self.output.getvalue())


if __name__ == "__main__":
    unittest.main()
