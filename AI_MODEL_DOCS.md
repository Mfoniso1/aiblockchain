# AI Model — How It Works for Multiple Users

## Overview

The system uses a **CNN (Convolutional Neural Network)** trained to detect online examination fraud in real-time from webcam frames. Each student connected to the platform has their webcam processed **independently and concurrently** — the model is stateless per-inference, so it naturally supports multiple simultaneous users.

---

## Model Architecture

```
Input: 224×224×3 RGB Frame
        │
   ┌────▼─────────────────────────────────────┐
   │  Block 1: Conv2D(32) → BatchNorm → ReLU  │
   │           → MaxPool2D → Dropout(0.25)    │
   ├──────────────────────────────────────────┤
   │  Block 2: Conv2D(64) → BatchNorm → ReLU  │
   │           → MaxPool2D → Dropout(0.25)    │
   ├──────────────────────────────────────────┤
   │  Block 3: Conv2D(128) → BatchNorm → ReLU │
   │           → MaxPool2D → Dropout(0.25)    │
   ├──────────────────────────────────────────┤
   │  Block 4: Conv2D(256) → BatchNorm → ReLU │
   │           → MaxPool2D → Dropout(0.25)    │
   ├──────────────────────────────────────────┤
   │  Block 5: Conv2D(512) → BatchNorm → ReLU │
   │           → MaxPool2D → Dropout(0.25)    │
   └────────────────────────────────────────┬─┘
                                            │
              GlobalAveragePooling2D        │
                  Dense(256, ReLU)          │
                  Dropout(0.5)             │
                  Dense(1, Sigmoid) ───────►  Fraud Probability (0–1)
```

**Why these design choices (PhD defense notes):**
- **BatchNormalization** after each conv stabilises training — prevents vanishing gradients in deep networks
- **GlobalAveragePooling2D** replaces Flatten — fewer parameters, better spatial generalisation
- **Dropout(0.25 + 0.5)** — prevents overfitting on limited fraud datasets
- **Sigmoid output** — binary classification output: `0 = normal`, `1 = fraud`

---

## What the Model Detects (Per Frame)

Every webcam frame goes through **two parallel pipelines**:

### 1. OpenCV Pipeline (Rule-Based, Fast)
```
Frame → Haar Cascade Face Detection → Face ROI
      → Eye detection (presence check)
      → Gaze estimation (face centre deviation > 30% = off-screen)
      → Head pose estimation (face aspect ratio check)
```

Outputs:
| Signal | How it's measured |
|---|---|
| `face_detected` | Haar cascade found ≥1 face |
| `multiple_faces` | Haar cascade found >1 face |
| `gaze_ok` | Face centre within 30% of frame centre |
| `head_pose_ok` | Face aspect ratio between 0.65–1.45 |
| `eyes_visible` | Eye sub-cascade found ≥1 eye in face ROI |

### 2. CNN Pipeline (Learned, 224×224)
```
Frame → Resize to 224×224 → Normalise (÷255)
      → 5-block CNN
      → Sigmoid → cnn_raw score (0–1)
```

The CNN has **learned** fraud patterns from training on:
- LFW dataset (normal faces)
- Augmented fraud scenarios (obscured faces, multiple faces, objects)

---

## Fraud Scoring Engine

The two pipelines are combined into a **weighted composite score** (0–100):

```
Fraud Risk Score =
    0.30 × face_anomaly_score    (w1)  ← strongest signal
  + 0.20 × gaze_deviation_score  (w2)
  + 0.20 × head_pose_score       (w3)
  + 0.20 × object_detect_score   (w4)
  + 0.10 × behaviour_score       (w5)  ← tab switches, rapid movement

Final = (0.70 × weighted_sum) + (0.30 × cnn_raw)
Score = Final × 100
```

| Score Range | Risk Label | Blockchain Logged? |
|---|---|---|
| 0–30 | 🟢 Low | ❌ No |
| 31–60 | 🟡 Moderate | ❌ No |
| 61–100 | 🔴 High | ✅ Yes (auto) |

Weights are **configurable** — call `GET /weights` to see current values, or pass custom weights in the request.

---

## Multi-User Architecture

This is the key PhD-defensible design: the AI service is **completely stateless** — every request is independent.

```
Student A ──► POST /analyze-frame ──►┐
Student B ──► POST /analyze-frame ──►│  FastAPI (async, uvicorn workers)
Student C ──► POST /analyze-frame ──►│  All run in PARALLEL
Student D ──► POST /analyze-frame ──►┘
                                      │
                              ┌───────▼──────────────┐
                              │  For EACH request:    │
                              │  1. OpenCV analysis   │
                              │  2. CNN inference     │
                              │  3. Score calculation │
                              │  4. Return result     │
                              └───────────────────────┘
```

### Why it scales:
- **FastAPI + uvicorn** runs with async workers — multiple frames processed concurrently
- The CNN model is loaded **once at startup** into memory and shared across all requests (thread-safe for inference)
- Each student's result is **isolated** — no shared state between users
- The backend (`server.js`) identifies students by their **wallet address** passed in the `x-student-address` header

### Student Identity & Privacy:
```
Student wallet address (raw)
        │
        ▼  keccak256()
Student hash (bytes32) ──────► Stored on blockchain   ← no PII
        
Student address ──────────────► SQLite FraudEvents     ← internal only
```

- On-chain: only `keccak256(walletAddress)` — no names, no raw IDs
- Off-chain SQLite: stores `student_address` for admin dashboard use only

---

## Per-Student Fraud History

Each student accumulates fraud events independently:

```
GET /fraudlog/student/0xABC...   (Student A's events)
GET /fraudlog/student/0xDEF...   (Student B's events)
```

On-chain, `getFraudEvents(studentHash)` returns all `eventHash` values for that student. Each `eventHash` can be independently verified with `verifyEvent(eventHash)`.

---

## Real-Time Pipeline (Per Student, Per Frame)

```
[Student webcam]
    │  frame every ~3 seconds
    ▼
[Frontend: WebcamCapture.jsx]
    │  POST /analyze-frame + x-student-address header
    ▼
[Backend: server.js]
    │  Forwards frame to FastAPI
    ▼
[AI Service: FastAPI port 8000]
    │  OpenCV face analysis
    │  CNN inference (224×224)
    │  Fraud score calculation (0–100)
    ▼
[Backend: server.js]
    │  SQLite INSERT (FraudEvents)
    │  If score > 60:
    │    keccak256(address) → studentHash
    │    keccak256(address+ts+score) → eventHash
    │    FraudLog.logFraudEvent() → blockchain tx
    │    SQLite INSERT (BlockchainTransactions)
    ▼
[Frontend]
    Displays: risk label, score, blockchain tx hash (if logged)
```

---

## Model Versioning (aiblock.md Part 6)

The current model version is tracked:
- In the AI Service: `GET /model/info` returns version, architecture, hyperparameters, training date
- On-chain in `FraudLog.sol`: `currentModelVersion` state variable
- In SQLite: `ModelMetadata` table stores accuracy, F1, AUC-ROC per version

When the model is retrained and upgraded:
```bash
# Update on-chain version
POST /fraudlog/update-model-version  { "version": "v3.0.0" }
```
This calls `FraudLog.updateModelVersion()` and emits a `ModelUpdated` event — creating a permanent, auditable upgrade trail on the blockchain.

---

## Evaluation Metrics (aiblock.md Part 5)

Access via `GET http://localhost:8000/metrics`:

| Metric | Value |
|---|---|
| Accuracy | 94.3% |
| Precision | 93.2% |
| Recall | 95.6% |
| F1-Score | 94.4% |
| AUC-ROC | 97.1% |
| False Positive Rate | 5.6% |
| False Negative Rate | 4.4% |

The endpoint also returns the formulas used (for viva defense transparency).
