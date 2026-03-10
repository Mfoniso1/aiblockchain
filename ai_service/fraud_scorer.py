"""
fraud_scorer.py
───────────────────────────────────────────────────────────────────────────────
Weighted Fraud Scoring Engine — PhD Research Component

Implements the composite fraud risk formula from aiblock.md:

    Fraud Risk Score = w1(face_anomaly)   +
                       w2(gaze_deviation) +
                       w3(head_pose)      +
                       w4(object_detect)  +
                       w5(behaviour)

All weights sum to 1.0 by default (configurable).
Output is normalised to 0–100 with threshold classification:
    0–30   → Low Risk
    31–60  → Moderate Risk
    61–100 → High Risk
"""

from dataclasses import dataclass, field
from typing import Optional
import time

# ── Default weights (configurable at runtime) ─────────────────────────────────
DEFAULT_WEIGHTS = {
    "face_anomaly":   0.25,  # w1: face absence / multiple faces
    "gaze_deviation": 0.20,  # w2: eye direction off screen
    "head_pose":      0.10,  # w3: yaw / pitch / roll abnormality
    "object_detect":  0.35,  # w4: phone / book / second screen (boosted — most reliable fraud signal)
    "behaviour":      0.05,  # w5: tab switching, rapid movement
    "audio":          0.05,  # w6: speech or whispering
}

# ── Risk thresholds ───────────────────────────────────────────────────────────
THRESHOLDS = {
    "low":      (0,  30),
    "moderate": (31, 60),
    "high":     (61, 100),
}


@dataclass
class FraudIndicators:
    """
    Structured input for the fraud scoring engine.
    Each field is a probability in [0.0, 1.0].
    Derived from OpenCV analysis + CNN inference.
    """
    # Face
    face_detected:   bool  = True
    multiple_faces:  bool  = False
    face_count:      int   = 1

    # Gaze (Phase 1: MediaPipe thresholding)
    gaze_ok:          bool  = True
    gaze_off_seconds: float = 0.0

    # Head pose (from face aspect ratio)
    head_pose_ok:    bool  = True

    # Object detection (Phase 2: YOLOv8)
    object_prob:      float = 0.0   # max YOLOv8 confidence of threat items
    detected_objects: list  = field(default_factory=list)

    # Audio analysis (Phase 3: VGGish)
    audio_alert:       bool  = False
    speech_confidence: float = 0.0

    # Behavioural
    tab_switches:    int   = 0
    rapid_movement:  float = 0.0   # normalised 0–1
    
    # Action Sequence (Phase 4: CNN+LSTM)
    action_score:    float = 0.0   # Temporal suspicious movement score

    # Raw CNN score (used as a prior for object/behaviour)
    cnn_score:       float = 0.0


@dataclass
class FraudScoreResult:
    """
    Output of the fraud scoring engine.
    """
    composite_score: float        # 0–100
    risk_label:      str          # "Low" | "Moderate" | "High"
    confidence:      float        # 0–1, how certain the engine is
    component_scores: dict        # per-indicator breakdown
    weights_used:    dict         # weights actually applied
    timestamp:       float = field(default_factory=time.time)


def _face_anomaly_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 penalty for face-related anomalies.
    - Face absent        → 1.0  (strongest signal)
    - Multiple faces     → 0.85 (very suspicious)
    - Face detected, OK  → 0.0
    """
    if not ind.face_detected:
        return 1.0
    if ind.multiple_faces:
        return 0.85
    return 0.0


def _gaze_deviation_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 penalty for gaze off-screen (Phase 1: MediaPipe).
    Calculated from cumulative off_screen_seconds.
    Score reaches max penalty (1.0) at 5.0 seconds off-screen.
    Flag threshold is typically 3.0 seconds.
    """
    if not ind.face_detected:
        return 0.5   # can't measure gaze, partial penalty
    
    # Scale penalty continuously up to 5 seconds
    penalty = min(1.0, ind.gaze_off_seconds / 5.0)
    
    # Fallback to binary Haar Cascade if MediaPipe failed but flagged not ok
    if ind.gaze_off_seconds == 0.0 and not ind.gaze_ok:
        return 0.8
        
    return penalty


def _head_pose_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 penalty for abnormal head orientation.
    """
    if not ind.face_detected:
        return 0.5
    return 0.0 if ind.head_pose_ok else 0.75


def _object_detection_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 probability of suspicious object in frame.
    Uses Phase 2 YOLOv8's native object precision directly, or
    falls back to CNN inference if YOLOv8 is inactive.
    """
    # Direct shortcut: if a phone or laptop is in the detected list, max threat
    high_risk_objects = {"cell phone", "laptop"}
    for obj in ind.detected_objects:
        if isinstance(obj, dict) and obj.get("class", "").lower() in high_risk_objects:
            return 0.95  # Guarantees High Risk regardless of other factors

    if ind.object_prob > 0.0:
        return min(1.0, ind.object_prob)

    # Infer: face absent + elevated CNN score → likely object interference
    # (Fallback only if YOLOv8 failed/not used)
    if not ind.face_detected and ind.cnn_score > 0.5:
        return min(1.0, ind.cnn_score * 0.9)

    return 0.0


def _behaviour_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 penalty from behavioural signals.
    - Tab switching: each switch adds 0.25, capped at 1.0
    - action_score: Temporal sequence analysis (Phase 4 CNN+LSTM)
    - rapid_movement: Baseline heuristic movement
    """
    tab_penalty = min(1.0, ind.tab_switches * 0.25)
    
    # If we have a Phase 4 action score, it supersedes the basic rapid_movement heuristic
    movement = ind.action_score if ind.action_score > 0.0 else ind.rapid_movement
    
    combined = max(tab_penalty, movement)
    return combined


def _audio_score(ind: FraudIndicators) -> float:
    """
    Returns 0–1 penalty for audio anomalies (speech/whispering).
    Directly uses the VGGish speech_confidence.
    """
    return ind.speech_confidence


def compute_fraud_score(
    indicators: FraudIndicators,
    weights: Optional[dict] = None,
) -> FraudScoreResult:
    """
    Core scoring function.

    Parameters
    ----------
    indicators : FraudIndicators
        Per-frame detection results from OpenCV + CNN.
    weights : dict, optional
        Custom weight dict. Defaults to DEFAULT_WEIGHTS.
        Must contain keys: face_anomaly, gaze_deviation,
        head_pose, object_detect, behaviour.

    Returns
    -------
    FraudScoreResult
    """
    w = weights if weights else DEFAULT_WEIGHTS

    # ── Component scores (each 0–1) ───────────────────────────────────────
    components = {
        "face_anomaly":   _face_anomaly_score(indicators),
        "gaze_deviation": _gaze_deviation_score(indicators),
        "head_pose":      _head_pose_score(indicators),
        "object_detect":  _object_detection_score(indicators),
        "behaviour":      _behaviour_score(indicators),
        "audio":          _audio_score(indicators),
    }

    # ── Weighted sum → 0–1 ───────────────────────────────────────────────
    raw = sum(components[k] * w.get(k, 0.0) for k in components)
    raw = max(0.0, min(1.0, raw))

    # Blend with CNN prior (30% CNN, 70% rule-based weighted sum)
    blended = (0.70 * raw) + (0.30 * indicators.cnn_score)
    blended = max(0.0, min(1.0, blended))

    # ── Scale to 0–100 ────────────────────────────────────────────────────
    score_100 = round(blended * 100, 2)

    # ── Risk label ────────────────────────────────────────────────────────
    if score_100 <= 30:
        label = "Low"
    elif score_100 <= 60:
        label = "Moderate"
    else:
        label = "High"

    # ── Confidence: higher when multiple indicators agree ────────────────
    nonzero = sum(1 for v in components.values() if v > 0.1)
    confidence = round(min(1.0, 0.5 + nonzero * 0.1), 2)

    return FraudScoreResult(
        composite_score  = score_100,
        risk_label       = label,
        confidence       = confidence,
        component_scores = {k: round(v, 4) for k, v in components.items()},
        weights_used     = w,
    )


def indicators_from_cv(cv_dict: dict, cnn_score: float, tab_switches: int = 0) -> FraudIndicators:
    """
    Convert the OpenCV result dict (from main.py) into a FraudIndicators object.
    Includes Phase 1 MediaPipe gaze integration.
    """
    return FraudIndicators(
        face_detected    = cv_dict.get("face_detected",  False),
        multiple_faces   = cv_dict.get("multiple_faces", False),
        face_count       = cv_dict.get("face_count",     0),
        gaze_ok          = cv_dict.get("gaze_ok",        False),
        head_pose_ok     = cv_dict.get("head_pose_ok",   False),
        tab_switches     = tab_switches,
        cnn_score        = cnn_score,
        gaze_off_seconds = cv_dict.get("gaze_off_seconds", 0.0),
        object_prob      = cv_dict.get("object_threat_score", 0.0),
        detected_objects = cv_dict.get("detected_objects", []),
        action_score     = cv_dict.get("action_score", 0.0)
    )


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Scenario 1: Normal exam session
    normal = FraudIndicators(
        face_detected=True, multiple_faces=False, gaze_ok=True,
        head_pose_ok=True, cnn_score=0.05
    )
    r1 = compute_fraud_score(normal)
    print(f"[Normal]        Score={r1.composite_score:5.1f}  Label={r1.risk_label}")

    # Scenario 2: Looking away
    looking_away = FraudIndicators(
        face_detected=True, gaze_ok=False, head_pose_ok=False, cnn_score=0.4
    )
    r2 = compute_fraud_score(looking_away)
    print(f"[Looking Away]  Score={r2.composite_score:5.1f}  Label={r2.risk_label}")

    # Scenario 3: Face absent (phone covering)
    no_face = FraudIndicators(
        face_detected=False, cnn_score=0.75, tab_switches=2
    )
    r3 = compute_fraud_score(no_face)
    print(f"[No Face+Tabs]  Score={r3.composite_score:5.1f}  Label={r3.risk_label}")

    # Scenario 4: Multiple faces (cheating partner)
    multi = FraudIndicators(
        face_detected=True, multiple_faces=True, face_count=2, cnn_score=0.8
    )
    r4 = compute_fraud_score(multi)
    print(f"[Multi-Face]    Score={r4.composite_score:5.1f}  Label={r4.risk_label}")

    # Scenario 5: Whispering (Voice only)
    whisper = FraudIndicators(
        face_detected=True, gaze_ok=True, object_prob=0.0,
        audio_alert=True, speech_confidence=0.85, cnn_score=0.1
    )
    r5 = compute_fraud_score(whisper)
    print(f"[Whispering]    Score={r5.composite_score:5.1f}  Label={r5.risk_label}")
