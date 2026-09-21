r"""Convert the text in one PDF into a spoken MP3 using Google Text-to-Speech.

Install once: py -m pip install pypdf gTTS
Run from Windows Terminal: py .\pdf_to_mp3.py
Requires internet access and sends extracted text to Google's speech service.
The source PDF is unchanged. Scanned images require OCR before conversion.
"""

# =====================================================
# CHANGE THE SETTINGS IN THIS BOX.
# PDF_FILE_PATH: paste the full path to your input PDF file.
# Keep the r and quotation marks.
# =====================================================
PDF_FILE_PATH = r"C:\CHANGE_ME\YourDocument.pdf"
OUTPUT_FILE_PATH = ""  # Blank: create <PDF name>.mp3 beside the PDF.
LANGUAGE = "en"  # Language code for the document's text; this does not translate.
SLOW = False  # True uses slower speech.
# Example: PDF_FILE_PATH = r"C:\Work\Atomic Habits.pdf"
# If the example MP3 already exists, choose another OUTPUT_FILE_PATH.
# No code changes are needed below this line.

import os
from pathlib import Path


def _input_path(pdf_path):
    if not str(pdf_path).strip() or str(pdf_path) == r"C:\CHANGE_ME\YourDocument.pdf":
        raise ValueError("Set PDF_FILE_PATH in the settings box to your input PDF file.")
    source = Path(pdf_path)
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"PDF file not found or not an ordinary file: {source}")
    if source.suffix.lower() != ".pdf":
        raise ValueError("The input filename must end in .pdf.")
    return source


def _output_path(mp3_path):
    destination = Path(mp3_path)
    if destination.suffix.lower() != ".mp3":
        raise ValueError("The output filename must end in .mp3.")
    if os.path.lexists(destination):
        raise FileExistsError(f"Output already exists: {destination}. Choose another OUTPUT_FILE_PATH.")
    if not destination.parent.is_dir():
        raise ValueError(f"Output folder not found: {destination.parent}")
    return destination


def pdf_to_text(pdf_path):
    """Extract readable pages in order, retaining a separator between pages."""
    source = _input_path(pdf_path)
    try:
        from pypdf import PdfReader
    except ImportError as error:
        raise RuntimeError("Missing PDF package. Install with: py -m pip install pypdf gTTS") from error

    pages = []
    skipped = 0
    try:
        with source.open("rb") as file:
            reader = PdfReader(file)
            if reader.is_encrypted:
                raise ValueError("This PDF is encrypted. Use an unlocked PDF copy.")
            for page in reader.pages:
                text = (page.extract_text() or "").strip()
                if text:
                    pages.append(text)
                else:
                    skipped += 1
    except Exception as error:
        raise RuntimeError(f"Could not read PDF: {error}") from error
    if not pages:
        raise ValueError("No readable text found. Scanned PDFs need OCR before conversion.")
    if skipped:
        print(f"Skipped {skipped} page(s) without readable text. Scanned pages need OCR.")
    return "\n\n".join(pages)


def text_to_mp3(text, mp3_path, language=LANGUAGE, slow=SLOW):
    """Write a new MP3; preserve existing files and remove incomplete output."""
    if not text.strip():
        raise ValueError("No readable text to convert.")
    destination = _output_path(mp3_path)
    try:
        from gtts import gTTS
    except ImportError as error:
        raise RuntimeError("Missing speech package. Install with: py -m pip install pypdf gTTS") from error
    try:
        speech = gTTS(text=text, lang=language, slow=slow, timeout=60)
    except ValueError as error:
        raise ValueError(f"Check LANGUAGE in the settings box: {error}") from error

    # Exclusive creation also protects against another file appearing during extraction.
    with destination.open("xb") as output:
        try:
            speech.write_to_fp(output)
            if output.tell() == 0:
                raise RuntimeError("The speech service returned no audio.")
            output.flush()
        except BaseException:
            output.close()
            destination.unlink()
            raise
    return destination


def pdf_to_mp3(pdf_path, mp3_path="", language=LANGUAGE, slow=SLOW):
    """Convert one PDF, defaulting to an MP3 with the same name beside it."""
    source = _input_path(pdf_path)
    destination = Path(mp3_path) if mp3_path else source.with_suffix(".mp3")
    if destination.resolve() == source.resolve():
        raise ValueError("The output must be a different file from the input PDF.")
    _output_path(destination)
    print(f"Reading PDF: {source}")
    text = pdf_to_text(source)
    print(f"Converting {len(text):,} characters with Google's speech service. Large PDFs may take a while...")
    try:
        return text_to_mp3(text, destination, language, slow)
    except (OSError, ValueError, RuntimeError):
        raise
    except Exception as error:
        raise RuntimeError(f"Speech conversion failed. Check your internet connection and try again: {error}") from error


def main():
    try:
        destination = pdf_to_mp3(PDF_FILE_PATH, OUTPUT_FILE_PATH, LANGUAGE, SLOW)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Error: {error}")
        return 1
    except KeyboardInterrupt:
        print("Conversion cancelled. Any incomplete MP3 was removed.")
        return 1
    print(f"MP3 saved to: {destination.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
