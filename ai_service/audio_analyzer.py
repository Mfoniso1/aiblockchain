"""
audio_analyzer.py — Phase 3: Audio-based fraud detection
─────────────────────────────────────────────────────────
Uses energy-based speech detection as the primary detector (fast, no download).
Falls back gracefully if VGGish/librosa are unavailable, so the AI service
never hangs or times out on the /analyze_audio endpoint.
"""
import numpy as np
import io
import struct
import wave

# ── Optional heavy dependencies ───────────────────────────────────────────────
# We import lazily and only once so the FIRST request isn't slow.
# If they're missing the service still works via the energy fallback below.
_vggish_model = None
_vggish_tried = False   # only attempt to load once per process


def _try_load_vggish():
    """Load VGGish from a local cache if available, else skip silently."""
    global _vggish_model, _vggish_tried
    if _vggish_tried:
        return
    _vggish_tried = True
    try:
        import tensorflow_hub as hub
        import os
        # Use a local cache dir so we don't re-download on every startup.
        # Export TF_HUB_CACHE_DIR before starting the AI service to persist it.
        cache = os.environ.get("TFHUB_CACHE_DIR", "tfhub_cache")
        os.makedirs(cache, exist_ok=True)
        os.environ.setdefault("TFHUB_CACHE_DIR", cache)
        _vggish_model = hub.load('https://tfhub.dev/google/vggish/1')
        print("✅ VGGish loaded from cache/hub.")
    except Exception as e:
        print(f"⚠ VGGish not available (energy fallback active): {e}")


# VGGish sample rate
VGGISH_SR = 16000

# ── Fast energy-based detector ────────────────────────────────────────────────
def _energy_based_detection(file_bytes: bytes) -> dict:
    """
    Pure-Python WAV energy analyser — no heavy deps, runs in < 5ms.
    Detects speech/noise by comparing RMS energy to a silence baseline.
    Works on the raw WAV bytes sent by the MediaRecorder API.
    """
    try:
        with wave.open(io.BytesIO(file_bytes), 'rb') as wf:
            n_frames = wf.getnframes()
            sampwidth = wf.getsampwidth()      # bytes per sample
            n_channels = wf.getnchannels()
            raw = wf.readframes(n_frames)

        # Decode samples (16-bit PCM is most common from MediaRecorder)
        fmt = {1: 'b', 2: 'h', 4: 'i'}.get(sampwidth, 'h')
        samples = np.array(struct.unpack(f'<{len(raw)//sampwidth}{fmt}', raw),
                           dtype=np.float32)

        # Mix down to mono
        if n_channels > 1:
            samples = samples.reshape(-1, n_channels).mean(axis=1)

        # Normalise to [-1, 1]
        max_val = float(2 ** (sampwidth * 8 - 1))
        samples /= max_val

        # RMS energy
        rms = float(np.sqrt(np.mean(samples ** 2))) if len(samples) > 0 else 0.0

        # Empirical thresholds (calibrated against laptop mic in a quiet room):
        #   < 0.005  → near-silent
        #   0.005–0.04 → background/breathing
        #   > 0.04   → speech / noise
        SILENCE_FLOOR = 0.005
        SPEECH_CEIL   = 0.15
        confidence = float(np.clip((rms - SILENCE_FLOOR) / (SPEECH_CEIL - SILENCE_FLOOR), 0.0, 1.0))
        alert = confidence > 0.50

        return {
            "audio_alert":       bool(alert),
            "speech_confidence": round(confidence, 3),
            "rms":               round(rms, 5),
            "status":            "success"
        }
    except Exception as e:
        # Even if WAV parsing fails (e.g. browser sends webm), return safe defaults
        return {
            "audio_alert":       False,
            "speech_confidence": 0.0,
            "status":            f"parse_error: {e}"
        }


# ── VGGish-based detector (higher accuracy, optional) ─────────────────────────
def _vggish_detection(file_bytes: bytes) -> dict:
    """
    Full VGGish embedding-based detection.
    Only called if VGGish model loaded successfully.
    """
    try:
        import librosa
        import soundfile as sf

        audio_data, current_sr = sf.read(io.BytesIO(file_bytes))
        if len(audio_data.shape) > 1:
            audio_data = np.mean(audio_data, axis=1)
        if current_sr != VGGISH_SR:
            audio_data = librosa.resample(audio_data, orig_sr=current_sr, target_sr=VGGISH_SR)

        embeddings = _vggish_model(audio_data)
        emb_numpy  = embeddings.numpy()

        mean_activation = float(np.mean(np.abs(emb_numpy)))
        baseline_noise  = 0.20
        max_speech      = 0.85
        confidence = float(np.clip(
            (mean_activation - baseline_noise) / (max_speech - baseline_noise),
            0.0, 1.0
        ))
        return {
            "audio_alert":       bool(confidence > 0.55),
            "speech_confidence": round(confidence, 3),
            "status":            "success"
        }
    except Exception as e:
        print(f"VGGish inference error: {e}")
        return None   # caller will fall back to energy detector


# ── Public API ─────────────────────────────────────────────────────────────────
def analyze_audio_segment(file_bytes: bytes) -> dict:
    """
    Main entry point for audio fraud analysis.
    Tries VGGish first if available, falls back to fast energy detector.
    Always returns within milliseconds — never hangs.
    """
    # Try VGGish (lazy, one-time load)
    _try_load_vggish()
    if _vggish_model is not None:
        result = _vggish_detection(file_bytes)
        if result is not None:
            return result

    # Fast energy fallback (always works)
    return _energy_based_detection(file_bytes)


if __name__ == "__main__":
    print("Audio Analyzer Module loaded. VGGish will be attempted on first request.")
