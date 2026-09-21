r"""Transcribe one local audio file to a new UTF-8 text file with Whisper.

Install once: py -m pip install openai-whisper
Also install FFmpeg and make sure `ffmpeg -version` works in your terminal.
Run from Windows Terminal: py .\transcribe_audio.py
The first use of each model downloads it; transcription runs on your computer.
The audio is unchanged and existing transcripts are never overwritten.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# AUDIO_FILE_PATH: paste the full path to your recording.
# Keep the r and quotation marks.
# =====================================================
AUDIO_FILE_PATH = r"C:\CHANGE_ME\Meeting.wav"
OUTPUT_FILE_PATH = ""  # Blank: create <audio name>_transcription.txt beside the audio.
MODEL_NAME = "base"  # Original model; "tiny" is faster, "small" uses more resources.
LANGUAGE = ""  # Blank detects the language; use "en" for known English audio.
# No code changes are needed below this line.

import os
from pathlib import Path
import shutil


def transcribe_audio(audio_path, output_path="", model_name=MODEL_NAME, language=LANGUAGE):
    """Run Whisper on the CPU and save a new transcript without changing the audio."""
    if not str(audio_path).strip() or str(audio_path) == r"C:\CHANGE_ME\Meeting.wav":
        raise ValueError("Set AUDIO_FILE_PATH in the settings box to your recording.")
    source = Path(audio_path)
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"Audio file not found or not an ordinary file: {source}")
    destination = Path(output_path) if output_path else source.with_name(source.stem + "_transcription.txt")
    if destination.resolve() == source.resolve():
        raise ValueError("The output must be a different file from the input audio.")
    if destination.suffix.lower() != ".txt":
        raise ValueError("The output filename must end in .txt.")
    if os.path.lexists(destination):
        raise FileExistsError(f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH.")
    if not destination.parent.is_dir():
        raise ValueError(f"Output folder not found: {destination.parent}")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg was not found. Install FFmpeg, add its bin folder to PATH, "
                           "and reopen the terminal. Check with: ffmpeg -version")
    try:
        import whisper
    except ImportError as error:
        raise RuntimeError("Whisper could not be imported. Install with: py -m pip install openai-whisper. "
                           f"Details: {error}") from error
    if not callable(getattr(whisper, "load_model", None)) or not callable(getattr(whisper, "available_models", None)):
        raise RuntimeError("Install the openai-whisper package, not the unrelated whisper package.")
    if model_name not in whisper.available_models():
        raise ValueError("Set MODEL_NAME to a Whisper model name, such as 'base', 'tiny', or 'small'.")

    print(f"Loading Whisper model '{model_name}' on the CPU. First use downloads the model...")
    try:
        model = whisper.load_model(model_name, device="cpu")
        print(f"Transcribing: {source}. Long recordings may take a while...")
        result = model.transcribe(str(source), language=language or None, task="transcribe", fp16=False)
    except Exception as error:
        raise RuntimeError(f"Could not transcribe audio: {error}") from error
    text = result.get("text", "").strip()
    if not text:
        raise ValueError("No speech was transcribed. Check that the recording contains audible speech.")

    # Exclusive creation also protects a transcript created while Whisper was running.
    with destination.open("x", encoding="utf-8", newline="\n") as output:
        try:
            output.write(text + "\n")
            output.flush()
        except BaseException:
            output.close()
            destination.unlink()
            raise
    print("\n--- TRANSCRIPTION START ---\n")
    print(text)
    print("\n--- TRANSCRIPTION END ---\n")
    return destination


def main():
    try:
        destination = transcribe_audio(AUDIO_FILE_PATH, OUTPUT_FILE_PATH, MODEL_NAME, LANGUAGE)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Error: {error}")
        return 1
    except KeyboardInterrupt:
        print("Transcription cancelled. Any incomplete transcript was removed.")
        return 1
    print(f"Transcript saved to: {destination.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
