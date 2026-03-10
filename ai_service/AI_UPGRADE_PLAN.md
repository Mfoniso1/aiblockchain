# AI Proctoring System — Multi-Modal Upgrade Plan
*PhD Research Project — Saved: 2026-02-24*

## Background

The current system uses a custom CNN (`exam_fraud_model.h5`) combined with OpenCV Haar Cascades. This plan upgrades it to a **four-component multi-modal architecture**:

| Component | Current | Upgraded To |
|---|---|---|
| Object Detection | ❌ None (CNN score only) | ✅ YOLOv8n |
| Gaze Tracking | ⚠️ Binary `eyes_visible` | ✅ MediaPipe iris landmarks + 3-second timer |
| Action Recognition | ❌ None | ✅ CNN + LSTM (16-frame sequences) |
| Audio Analysis | ❌ None | ✅ VGGish (Google pre-trained) |

All new components feed into the existing **weighted fraud scoring engine** (`fraud_scorer.py`).

---

## Phase 1 — MediaPipe Gaze Tracking (Low effort, High value)

**New file:** `gaze_tracker.py`

- MediaPipe Face Mesh (478 landmarks)
- Extract iris centre coordinates (landmarks 468–471, 473–476)
- Compute normalised iris position relative to eye corners
- Return `gaze_direction` (center/left/right/up/down)
- Return `off_screen` bool and `off_screen_seconds` float
- **Threshold:** Flag if gaze off-screen cumulative > 3 seconds

**Files modified:**
- `requirements.txt` → add `mediapipe>=0.10.9`
- `main.py` → import and call `gaze_tracker`
- `fraud_scorer.py` → add `gaze_off_seconds` field, update `_gaze_deviation_score()`

---

## Phase 2 — YOLOv8 Object Detection (Medium effort)

**New file:** `object_detector.py`

- Load `yolov8n.pt` (nano model — ~6MB, fastest)
- Detect suspicious COCO classes:
  - `cell phone` (class 67)
  - `book` (class 73 — reference material)
  - `laptop` (class 63 — second screen)
  - `person` (class 0, count > 1 — second person)
- Return `detected_objects` list with class + confidence
- Return `object_threat_score` float (0–1)

**Files modified:**
- `requirements.txt` → add `ultralytics>=8.0.0`
- `main.py` → import and call `object_detector`, update response schema
- `fraud_scorer.py` → `object_prob` field now uses real YOLOv8 confidence

---

## Phase 3 — Audio Analysis with VGGish (Medium effort)

**New file:** `audio_analyzer.py`

- Load VGGish from TensorFlow Hub (pre-trained, no fine-tuning needed)
- Accept raw PCM bytes or WAV file every 5 seconds
- Compute 128-dim audio embeddings → voice activity detection
- Classify: `silent`, `speech_detected`, `whisper_detected`
- Return `speech_confidence` float and `audio_alert` boolean
- Threshold: flag if speech confidence > 0.55

**New endpoint:** `POST /analyze_audio`  
**Files modified:**
- `requirements.txt` → add `tensorflow-hub>=0.16.0`, `librosa>=0.10.0`, `soundfile>=0.12.0`
- `main.py` → `/analyze_audio` endpoint
- `fraud_scorer.py` → add `audio_alert` field + `_audio_score()` function + rebalance weights

---

## Phase 4 — CNN + LSTM Action Recognition (High effort — PhD defense)

**New file:** `action_model.py`

- **Architecture:** MobileNetV2 (frozen ImageNet weights) → 128-unit LSTM → Dense(64) → Sigmoid
- Input: 16 consecutive frames (each 224×224×3) — ~0.5 second window at 30fps
- Output: `action_score` float (0–1) — suspicious movement probability
- Detects: leaning over, hand gestures, covering webcam

**New endpoint:** `POST /analyze_sequence`  
**Files modified:**
- `cnn_model.py` → add `build_lstm_action_model()` function
- `main.py` → `/analyze_sequence` endpoint
- `fraud_scorer.py` → `action_score` field used in `behaviour` component

---

## Updated Fraud Scoring Weights

```
w1 face_anomaly   = 0.30  # Unchanged
w2 gaze_deviation = 0.20  # Now uses continuous gaze_off_seconds
w3 head_pose      = 0.20  # Unchanged
w4 object_detect  = 0.20  # Now uses real YOLOv8 confidence
w5 behaviour      = 0.05  # Reduced to make room for audio
w6 audio          = 0.05  # NEW — VGGish speech detection
```

Fraud Risk Score formula:
```
Score = Σ(wᵢ × componentᵢ) × 0.70 + CNN_raw × 0.30  →  scaled 0–100
```

---

## PhD Jupyter Notebook — `AI_Proctoring_Model_Upgrade.ipynb`

| Section | Content |
|---|---|
| 1 — Introduction | Research problem, cheating threat model, system architecture |
| 2 — Baseline CNN | Load `exam_fraud_model.h5`, metrics, confusion matrix |
| 3 — MediaPipe Gaze | Iris landmark demo, gaze scoring, 3-second rule |
| 4 — YOLOv8 Objects | Inference demo, COCO class filtering, mAP |
| 5 — VGGish Audio | Embedding generation, VAD demo, ROC curve |
| 6 — CNN+LSTM Actions | Architecture, training, accuracy/loss curves |
| 7 — Fraud Scoring Engine | Formula derivation, weight sensitivity analysis |
| 8 — Comparative Eval | Before/After detection coverage table |
| 9 — Conclusion | Research contributions, future directions |

---

## Files Created / Modified Summary

| Action | File |
|---|---|
| NEW | `ai_service/gaze_tracker.py` |
| NEW | `ai_service/object_detector.py` |
| NEW | `ai_service/audio_analyzer.py` |
| NEW | `ai_service/action_model.py` |
| NEW | `ai_service/AI_Proctoring_Model_Upgrade.ipynb` |
| NEW | `ai_service/test_upgrade.py` |
| MODIFY | `ai_service/main.py` |
| MODIFY | `ai_service/fraud_scorer.py` |
| MODIFY | `ai_service/cnn_model.py` |
| MODIFY | `ai_service/requirements.txt` |

---

## Verification Plan

```bash
# 1. Install new dependencies
pip install mediapipe ultralytics tensorflow-hub librosa soundfile

# 2. Run unit tests
cd ai_service
python -m pytest test_upgrade.py -v

# 3. Start AI service
uvicorn main:app --port 8000 --reload

# 4. Run Jupyter notebook (all cells)
jupyter nbconvert --to notebook --execute AI_Proctoring_Model_Upgrade.ipynb
```
