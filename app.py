import base64
import io
import uuid
from dataclasses import dataclass
from typing import Dict, List, Tuple

import librosa
import numpy as np
import soundfile as sf
import sympy as sp
from flask import Flask, jsonify, render_template, request
from scipy.signal import fftconvolve, freqz, lfilter, firwin2


@dataclass
class EqualizerBand:
    name: str
    center_freq: float
    q: float = 1.1


@dataclass
class AudioTrack:
    data: np.ndarray
    sample_rate: int


app = Flask(__name__)


EQ_BANDS: List[EqualizerBand] = [
    EqualizerBand("Sub", 60.0, q=0.9),
    EqualizerBand("Bass", 200.0, q=1.0),
    EqualizerBand("Mid", 1000.0, q=1.2),
    EqualizerBand("Presence", 4000.0, q=1.3),
    EqualizerBand("Brilliance", 12000.0, q=1.1),
]
FIR_TAPS = 513
AUDIO_STORE: Dict[str, AudioTrack] = {}


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html", bands=EQ_BANDS)


@app.route("/upload", methods=["POST"])
def upload_audio():
    file = request.files.get("audio")
    if file is None or file.filename == "":
        return jsonify({"error": "No audio file provided."}), 400

    try:
        audio, sr = librosa.load(file.stream, sr=None, mono=False)
    except Exception as exc:  # pragma: no cover - user-supplied audio
        return jsonify({"error": f"Failed to load audio: {exc}"}), 415

    if audio.ndim == 1:
        audio = audio[np.newaxis, :]

    audio = audio.T.astype(np.float32)
    peak = float(np.max(np.abs(audio)))
    if peak > 1.0:
        audio /= peak

    track_id = uuid.uuid4().hex
    AUDIO_STORE[track_id] = AudioTrack(data=audio, sample_rate=int(sr))

    zero_gains = [0.0 for _ in EQ_BANDS]
    frequencies, magnitude_db = compute_frequency_response(zero_gains, int(sr), "IIR")
    original_audio_uri = encode_audio_data_uri(audio, int(sr))

    return jsonify(
        {
            "audioId": track_id,
            "sampleRate": int(sr),
            "frequency": frequencies,
            "magnitude": magnitude_db,
            "originalAudio": original_audio_uri,
            "message": "Audio uploaded successfully.",
        }
    )


@app.route("/process", methods=["POST"])
def process_audio():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Missing JSON payload."}), 400

    audio_id = payload.get("audioId")
    gains = payload.get("gains")
    filter_type = payload.get("filterType", "IIR").upper()

    if audio_id not in AUDIO_STORE:
        return jsonify({"error": "Audio track not found. Upload again."}), 404
    if not isinstance(gains, list) or len(gains) != len(EQ_BANDS):
        return jsonify({"error": "Invalid gain values provided."}), 400
    if filter_type not in {"IIR", "FIR"}:
        return jsonify({"error": "Filter type must be 'IIR' or 'FIR'."}), 400

    track = AUDIO_STORE[audio_id]
    gains_db = [float(g) for g in gains]

    if filter_type == "IIR":
        processed = apply_iir_filters(track.data, gains_db, track.sample_rate)
    else:
        processed = apply_fir_filters(track.data, gains_db, track.sample_rate)

    processed_uri = encode_audio_data_uri(processed, track.sample_rate)
    frequencies, magnitude_db = compute_frequency_response(gains_db, track.sample_rate, filter_type)
    tf_text, tf_latex = compute_transfer_function(gains_db, track.sample_rate, filter_type)

    return jsonify(
        {
            "processedAudio": processed_uri,
            "frequency": frequencies,
            "magnitude": magnitude_db,
            "transferFunction": tf_text,
            "transferFunctionLatex": tf_latex,
            "message": "Equalization applied.",
        }
    )


def apply_iir_filters(audio: np.ndarray, gains_db: List[float], sample_rate: int) -> np.ndarray:
    processed = audio.copy()
    for band, gain_db in zip(EQ_BANDS, gains_db):
        if abs(gain_db) < 1e-3:
            continue
        b, a = design_peaking_eq(band.center_freq, band.q, gain_db, sample_rate)
        processed = lfilter(b, a, processed, axis=0)

    max_amp = float(np.max(np.abs(processed)))
    if max_amp > 1.0:
        processed = processed / max_amp
    return processed.astype(np.float32)


def apply_fir_filters(audio: np.ndarray, gains_db: List[float], sample_rate: int) -> np.ndarray:
    kernel = design_fir_kernel(gains_db, sample_rate)
    processed = np.empty_like(audio)
    for channel in range(audio.shape[1]):
        processed[:, channel] = fftconvolve(audio[:, channel], kernel, mode="same")

    max_amp = float(np.max(np.abs(processed)))
    if max_amp > 1.0:
        processed = processed / max_amp
    return processed.astype(np.float32)


def compute_frequency_response(gains_db: List[float], sample_rate: int, filter_type: str) -> Tuple[List[float], List[float]]:
    frequencies = np.logspace(np.log10(20), np.log10(20000), num=512)
    omega = 2 * np.pi * frequencies / sample_rate

    if filter_type == "IIR":
        response = np.ones_like(frequencies, dtype=np.complex128)
        for band, gain_db in zip(EQ_BANDS, gains_db):
            b, a = design_peaking_eq(band.center_freq, band.q, gain_db, sample_rate)
            _, h = freqz(b, a, worN=omega)
            response *= h
    else:
        kernel = design_fir_kernel(gains_db, sample_rate)
        _, response = freqz(kernel, worN=omega)

    magnitude_db = 20 * np.log10(np.maximum(np.abs(response), 1e-6))
    return frequencies.astype(float).tolist(), magnitude_db.astype(float).tolist()


def compute_transfer_function(gains_db: List[float], sample_rate: int, filter_type: str) -> Tuple[str, str]:
    w = sp.symbols("w")  # w represents z^{-1}
    z = sp.symbols("z")

    H = sp.Integer(1)

    if filter_type == "IIR":
        for band, gain_db in zip(EQ_BANDS, gains_db):
            if abs(gain_db) < 1e-3:
                continue
            b, a = design_peaking_eq(band.center_freq, band.q, gain_db, sample_rate)
            num = polynomial_from_coeffs(b, w)
            den = polynomial_from_coeffs(a, w)
            H *= sp.simplify(num / den)
    else:
        kernel = design_fir_kernel(gains_db, sample_rate)
        num = polynomial_from_coeffs(kernel, w)
        H = sp.simplify(num)

    H_z = sp.simplify(H.subs({w: z ** -1}))
    tf_text = sp.pretty(H_z, use_unicode=False)
    tf_latex = sp.latex(H_z)
    return tf_text, tf_latex


def polynomial_from_coeffs(coeffs: np.ndarray, w_symbol: sp.Symbol) -> sp.Expr:
    terms = []
    for idx, coeff in enumerate(np.atleast_1d(coeffs)):
        if abs(coeff) < 1e-10:
            continue
        terms.append(rounded_float(coeff) * w_symbol ** idx)
    if not terms:
        return sp.Integer(0)
    return sp.Add(*terms)


def rounded_float(value: float, digits: int = 6) -> sp.Float:
    if abs(value) < 10 ** (-digits - 2):
        value = 0.0
    return sp.Float(f"{value:.6g}")


def design_peaking_eq(f0: float, q: float, gain_db: float, sample_rate: int):
    if sample_rate <= 0:
        raise ValueError("Sample rate must be positive.")
    if f0 <= 0 or f0 >= sample_rate / 2:
        return np.array([1.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])
    if abs(gain_db) < 1e-6:
        return np.array([1.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])

    a = 10 ** (gain_db / 40.0)
    omega = 2 * np.pi * f0 / sample_rate
    alpha = np.sin(omega) / (2 * q)
    cos_omega = np.cos(omega)

    b0 = 1 + alpha * a
    b1 = -2 * cos_omega
    b2 = 1 - alpha * a
    a0 = 1 + alpha / a
    a1 = -2 * cos_omega
    a2 = 1 - alpha / a

    b = np.array([b0, b1, b2], dtype=np.float64) / a0
    a_coeffs = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
    return b, a_coeffs


def design_fir_kernel(gains_db: List[float], sample_rate: int) -> np.ndarray:
    gains = np.array(gains_db, dtype=np.float64)
    if np.allclose(gains, 0.0):
        kernel = np.zeros(FIR_TAPS, dtype=np.float64)
        kernel[FIR_TAPS // 2] = 1.0
        return kernel

    magnitudes = 10 ** (gains / 20.0)
    center_freqs = np.array([band.center_freq for band in EQ_BANDS], dtype=np.float64)
    nyquist = sample_rate / 2.0
    center_freqs = np.clip(center_freqs, 1.0, max(1.0, nyquist - 1.0))

    freq_points: List[float] = [0.0]
    gain_points: List[float] = [float(magnitudes[0])]

    for idx, freq in enumerate(center_freqs):
        if idx > 0:
            edge = float(np.sqrt(center_freqs[idx - 1] * freq))
            freq_points.append(edge)
            edge_gain = float((magnitudes[idx - 1] + magnitudes[idx]) / 2.0)
            gain_points.append(edge_gain)
        freq_points.append(float(freq))
        gain_points.append(float(magnitudes[idx]))

    freq_points.append(nyquist)
    gain_points.append(float(magnitudes[-1]))

    freq_points_array = np.clip(np.array(freq_points, dtype=np.float64), 0.0, nyquist)
    gain_points_array = np.array(gain_points, dtype=np.float64)

    valid = np.concatenate(([True], np.diff(freq_points_array) > 1e-6))
    freq_points_array = freq_points_array[valid]
    gain_points_array = gain_points_array[valid]

    kernel = firwin2(FIR_TAPS, freq_points_array, gain_points_array, fs=sample_rate)
    return kernel.astype(np.float64)


def encode_audio_data_uri(audio: np.ndarray, sample_rate: int) -> str:
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, subtype="PCM_16", format="WAV")
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("ascii")
    return f"data:audio/wav;base64,{encoded}"


if __name__ == "__main__":  # pragma: no cover - manual launch
    app.run(debug=True)
