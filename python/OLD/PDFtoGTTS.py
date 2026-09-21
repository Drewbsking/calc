import PyPDF2
from gtts import gTTS
import os
from tkinter import Tk
from tkinter.filedialog import askopenfilename, asksaveasfilename

def pdf_to_text(pdf_path):
    pdf_reader = PyPDF2.PdfReader(pdf_path)
    text = ""
    for page_num in range(len(pdf_reader.pages)):
        page = pdf_reader.pages[page_num]
        text += page.extract_text()
    return text

def text_to_mp3(text, mp3_path):
    tts = gTTS(text=text, lang='en')
    tts.save(mp3_path)

def pdf_to_mp3(pdf_path, mp3_path):
    text = pdf_to_text(pdf_path)
    text_to_mp3(text, mp3_path)

if __name__ == "__main__":
    # Hide the root Tkinter window
    Tk().withdraw()

    # Ask for the PDF file location
    pdf_path = askopenfilename(title="Select PDF File", filetypes=[("PDF Files", "*.pdf")])
    if not pdf_path:
        print("No PDF file selected. Exiting...")
        exit()

    # Ask for the MP3 file save location
    mp3_path = asksaveasfilename(title="Save MP3 File As", defaultextension=".mp3", filetypes=[("MP3 Files", "*.mp3")])
    if not mp3_path:
        print("No save location selected. Exiting...")
        exit()

    # Convert PDF to MP3
    pdf_to_mp3(pdf_path, mp3_path)
    print(f"MP3 file has been created at {mp3_path}")
