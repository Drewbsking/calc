"""Verify transcription integration without downloading a model or reading personal recordings."""

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


def load_transcriber():
    spec = importlib.util.spec_from_file_location("transcribe_audio", ROOT / "python/transcribe_audio.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TRANSCRIBER = load_transcriber()


class TranscribeAudioTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="transcribe-audio-test-")
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.source = self.folder / "Meeting.wav"
        self.source.write_bytes(b"original recording")
        self.destination = self.folder / "Meeting_transcription.txt"
        self.model = mock.Mock()
        self.model.transcribe.return_value = {"text": "  Caf\u00e9 meeting notes. \n"}
        self.whisper = types.ModuleType("whisper")
        self.whisper.available_models = mock.Mock(return_value=["base", "tiny", "small"])
        self.whisper.load_model = mock.Mock(return_value=self.model)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(mock.patch.dict(sys.modules, {"whisper": self.whisper}))
        self.ffmpeg = self.stack.enter_context(mock.patch.object(TRANSCRIBER.shutil, "which", return_value="ffmpeg"))
        self.output = io.StringIO()
        self.stack.enter_context(contextlib.redirect_stdout(self.output))

    def test_default_model_saves_utf8_transcript_beside_unchanged_recording(self):
        self.assertEqual(TRANSCRIBER.transcribe_audio(self.source), self.destination)
        self.assertEqual(self.destination.read_bytes(), "Caf\u00e9 meeting notes.\n".encode("utf-8"))
        self.assertEqual(self.source.read_bytes(), b"original recording")
        self.whisper.load_model.assert_called_once_with("base", device="cpu")
        self.model.transcribe.assert_called_once_with(
            str(self.source), language=None, task="transcribe", fp16=False)
        self.assertIn("Caf\u00e9 meeting notes.", self.output.getvalue())

    def test_custom_output_model_and_language(self):
        destination = self.folder / "Reviewed transcript.TXT"
        self.assertEqual(TRANSCRIBER.transcribe_audio(self.source, destination, "small", "en"), destination)
        self.assertFalse(self.destination.exists())
        self.whisper.load_model.assert_called_once_with("small", device="cpu")
        self.assertEqual(self.model.transcribe.call_args.kwargs["language"], "en")

    def test_existing_output_and_input_as_output_never_load_model(self):
        self.destination.write_bytes(b"existing transcript")
        with self.assertRaisesRegex(FileExistsError, "Output already exists"):
            TRANSCRIBER.transcribe_audio(self.source)
        with self.assertRaisesRegex(ValueError, "different file"):
            TRANSCRIBER.transcribe_audio(self.source, self.source)
        self.assertEqual(self.destination.read_bytes(), b"existing transcript")
        self.assertEqual(self.source.read_bytes(), b"original recording")
        self.whisper.load_model.assert_not_called()

    def test_output_created_during_transcription_is_not_replaced(self):
        def transcribe(*args, **kwargs):
            self.destination.write_bytes(b"created elsewhere")
            return {"text": "New transcript"}

        self.model.transcribe.side_effect = transcribe
        with self.assertRaises(FileExistsError):
            TRANSCRIBER.transcribe_audio(self.source)
        self.assertEqual(self.destination.read_bytes(), b"created elsewhere")

    def test_invalid_paths_and_symbolic_links_are_rejected_before_loading(self):
        for source in ("", r"C:\CHANGE_ME\Meeting.wav", self.folder / "missing.wav", self.folder):
            with self.subTest(source=source), self.assertRaises(ValueError):
                TRANSCRIBER.transcribe_audio(source)
        with mock.patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaisesRegex(ValueError, "not an ordinary file"):
                TRANSCRIBER.transcribe_audio(self.source)
        for destination in (self.folder / "output.docx", self.folder / "missing" / "output.txt"):
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                TRANSCRIBER.transcribe_audio(self.source, destination)
        self.whisper.load_model.assert_not_called()

    def test_missing_ffmpeg_or_whisper_gives_setup_instructions(self):
        self.ffmpeg.return_value = None
        with self.assertRaisesRegex(RuntimeError, "ffmpeg -version"):
            TRANSCRIBER.transcribe_audio(self.source)
        self.ffmpeg.return_value = "ffmpeg"
        with mock.patch.dict(sys.modules, {"whisper": None}):
            with self.assertRaisesRegex(RuntimeError, "py -m pip install openai-whisper"):
                TRANSCRIBER.transcribe_audio(self.source)
        with mock.patch.dict(sys.modules, {"whisper": types.ModuleType("whisper")}):
            with self.assertRaisesRegex(RuntimeError, "unrelated whisper package"):
                TRANSCRIBER.transcribe_audio(self.source)
        self.whisper.load_model.assert_not_called()
        self.assertFalse(self.destination.exists())

    def test_invalid_model_and_failed_model_download_create_no_transcript(self):
        with self.assertRaisesRegex(ValueError, "MODEL_NAME"):
            TRANSCRIBER.transcribe_audio(self.source, model_name="invalid")
        self.whisper.load_model.assert_not_called()
        self.whisper.load_model.side_effect = OSError("model download failed")
        with self.assertRaisesRegex(RuntimeError, "model download failed"):
            TRANSCRIBER.transcribe_audio(self.source)
        self.assertFalse(self.destination.exists())

    def test_failed_or_empty_transcription_creates_no_output(self):
        self.model.transcribe.side_effect = RuntimeError("could not decode audio")
        with self.assertRaisesRegex(RuntimeError, "could not decode audio"):
            TRANSCRIBER.transcribe_audio(self.source)
        self.model.transcribe.side_effect = None
        for result in ({"text": " \n "}, {}):
            with self.subTest(result=result):
                self.model.transcribe.return_value = result
                with self.assertRaisesRegex(ValueError, "No speech"):
                    TRANSCRIBER.transcribe_audio(self.source)
        self.assertFalse(self.destination.exists())

    def test_cancelled_transcription_creates_no_output(self):
        self.model.transcribe.side_effect = KeyboardInterrupt()
        with mock.patch.object(TRANSCRIBER, "AUDIO_FILE_PATH", str(self.source)):
            self.assertEqual(TRANSCRIBER.main(), 1)
        self.assertIn("Transcription cancelled", self.output.getvalue())
        self.assertFalse(self.destination.exists())

    def test_write_failure_and_interruption_remove_partial_transcript(self):
        real_open = Path.open
        for error in (OSError("disk full"), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__):
                def broken_open(path, *args, **kwargs):
                    file = real_open(path, *args, **kwargs)
                    wrapper = mock.MagicMock(wraps=file)
                    wrapper.__enter__.return_value = wrapper
                    wrapper.__exit__.side_effect = lambda *args: file.close()
                    wrapper.flush.side_effect = error
                    return wrapper

                with mock.patch.object(Path, "open", broken_open), self.assertRaises(type(error)):
                    TRANSCRIBER.transcribe_audio(self.source)
                self.assertFalse(self.destination.exists())
                self.assertEqual(self.source.read_bytes(), b"original recording")

    def test_importing_has_no_model_or_file_side_effects(self):
        with mock.patch.object(Path, "open") as open_file:
            load_transcriber()
        open_file.assert_not_called()
        self.whisper.load_model.assert_not_called()
        self.model.transcribe.assert_not_called()


if __name__ == "__main__":
    unittest.main()
