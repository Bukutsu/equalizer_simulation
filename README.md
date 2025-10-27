# Equalizer Simulation

Interactive five-band equalizer simulator with a web-based interface. Upload an audio file, tweak EQ bands in the browser, preview the live frequency response, inspect the symbolic Z-transform transfer function, and listen to both the original and processed versions.

![Signal flow diagram](static/images/flow_diagram.png)

## Features
- Five parametric bands spanning 60 Hz to 12 kHz with ±12 dB gain per band.
- Live frequency-response plot that updates as you move the sliders.
- Offline processing of the selected track with either peaking biquad (IIR) or linear-phase FIR filters.
- Play/stop controls for both the original and equalized signals.
- Dark/light theme toggle and localized UI (English/Thai).

## Requirements
Install the Python packages listed in `requirements.txt`. `librosa` relies on system decoders (ffmpeg or GStreamer) for some audio formats such as MP3.

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
```

## Usage
```bash
python app.py
```

1. Open a browser at http://127.0.0.1:5000.
2. Upload an MP3/WAV/FLAC/OGG file.
3. Adjust the EQ sliders (±12 dB per band), choose IIR or FIR processing, and optionally switch theme or language from the toolbar.
4. Click **Apply Equalizer** to update the response curve, inspect the Z-domain transfer function, and preview the processed audio in the browser.

## Notes
- The backend normalizes processed audio to prevent clipping.
- Each processing request returns a fresh render; reapply after slider changes.
- The backend relies on SymPy’s Z-transform utilities to expose the transfer function after each processing run.
- Both FIR and IIR branches mirror the design flow from the original diagram.
