"""
action_model.py — Phase 4: Temporal Sequence Action Recognition
────────────────────────────────────────────────────────────────
Primary detector: Fast OpenCV optical-flow motion analysis (< 50ms for 16 frames).
This replaces the MobileNetV2+LSTM inference which takes 10–25 seconds on CPU
and causes the /analyze-sequence endpoint to always timeout.

The CNN+LSTM architecture is still defined below (for thesis documentation),
but is NOT called during live inference — only the fast motion detector is used.
"""
import numpy as np
import cv2

# ── Constants ─────────────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 16   # expected number of frames per sequence
FRAME_HEIGHT    = 224
FRAME_WIDTH     = 224
CHANNELS        = 3

# Motion thresholds (tuned empirically)
# A student sitting still has very low inter-frame difference.
# Leaning over, looking at notes, or passing something shows high motion.
MOTION_LOW_THRESHOLD  = 3.0    # mean pixel diff below this = still
MOTION_HIGH_THRESHOLD = 18.0   # mean pixel diff above this = suspicious action


# ── Fast motion-based sequence analyser ───────────────────────────────────────
def _fast_motion_score(frames: list) -> dict:
    """
    Calculates frame-to-frame optical difference as a proxy for suspicious
    body movement. Uses grayscale absolute difference — very fast on CPU.

    Returns action_score in [0, 1]:
      0.0–0.3  → normal seated stillness
      0.3–0.6  → mild head/hand movement
      0.6–1.0  → high movement (leaning, looking at notes, passing items)
    """
    if len(frames) < 2:
        return {"action_score": 0.0, "status": "too_few_frames"}

    diffs = []
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY).astype(np.float32)

    for frame in frames[1:]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
        diff = np.mean(np.abs(gray - prev_gray))
        diffs.append(diff)
        prev_gray = gray

    mean_diff = float(np.mean(diffs))
    peak_diff = float(np.max(diffs))

    # Normalise to [0, 1] using the tuned thresholds
    score = float(np.clip(
        (mean_diff - MOTION_LOW_THRESHOLD) / (MOTION_HIGH_THRESHOLD - MOTION_LOW_THRESHOLD),
        0.0, 1.0
    ))

    # If there's a brief spike of high motion (single frame anomaly), boost score
    if peak_diff > MOTION_HIGH_THRESHOLD * 1.5:
        score = min(1.0, score + 0.25)

    return {
        "action_score": round(score, 3),
        "mean_motion":  round(mean_diff, 2),
        "peak_motion":  round(peak_diff, 2),
        "status":       "success"
    }


# ── Keras model definition (thesis documentation only — not used in inference) ──
def build_action_model():
    """
    Defines the CNN+LSTM architecture for PhD thesis documentation.
    NOT called during live inference (too slow on CPU without GPU).
    Only instantiated on startup for model.summary() / architecture diagram.
    """
    try:
        import tensorflow as tf
        from tensorflow.keras import layers

        base_cnn = tf.keras.applications.MobileNetV2(
            input_shape=(FRAME_HEIGHT, FRAME_WIDTH, CHANNELS),
            include_top=False,
            weights='imagenet',
            pooling='avg'
        )
        base_cnn.trainable = False

        action_model = tf.keras.Sequential([
            layers.Input(shape=(SEQUENCE_LENGTH, FRAME_HEIGHT, FRAME_WIDTH, CHANNELS)),
            layers.TimeDistributed(base_cnn, name='mobilenet_feature_extractor'),
            layers.LSTM(128, return_sequences=False, dropout=0.3, name='lstm_temporal'),
            layers.Dense(64, activation='relu', name='fc_1'),
            layers.Dropout(0.4, name='fc_dropout'),
            layers.Dense(1,  activation='sigmoid', name='output_action_score')
        ], name='ExamFraud_CNN_LSTM_V1')

        action_model.compile(
            optimizer=tf.keras.optimizers.Adam(1e-4),
            loss='binary_crossentropy',
            metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
        )
        return action_model
    except Exception as e:
        print(f"⚠ Action model architecture build failed (non-critical): {e}")
        return None


# ── Public API ─────────────────────────────────────────────────────────────────
def analyze_sequence(frames: list, model=None) -> dict:
    """
    Main entry point for sequence-based action analysis.

    Always uses the fast motion detector (< 50ms).
    The `model` parameter is accepted for API compatibility but not used
    so inference never times out.
    """
    if len(frames) != SEQUENCE_LENGTH:
        return {
            "action_score": 0.0,
            "status": f"expected {SEQUENCE_LENGTH} frames, got {len(frames)}"
        }
    return _fast_motion_score(frames)


if __name__ == "__main__":
    print("Action Model module loaded. Fast motion detector active.")
    print("Building CNN+LSTM architecture graph (for thesis only)...")
    m = build_action_model()
    if m:
        m.summary()
