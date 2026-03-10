# AI Blockchain Exam Proctoring System — Full Issue Narration

> **Purpose**: This document is a hand-off narration for another AI model. It describes the complete project architecture and every persistent/recurring issue the developer has raised across multiple conversations. Read this in full before attempting any fix.

---

## 1. System Architecture Overview

This is a **PhD research project**: a real-time AI-powered exam proctoring web app backed by an Ethereum blockchain. It runs 4 services simultaneously on the developer's Windows machine:

| Service | Technology | Port |
|---|---|---|
| **AI Service** | Python FastAPI + TensorFlow/OpenCV | `8000` |
| **Backend** | Node.js Express (proxy + blockchain bridge) | `5000` |
| **Frontend** | React + Vite (Tailwind CSS) | `5173` |
| **Blockchain** | Ganache (local Ethereum) + Hardhat + Solidity | `7545` |

### Data Flow (Critical)
```
Browser (Student Exam Page)
  ↓ POST /analyze-frame  (form-data: JPEG frame + studentID)
Backend (Node :5000)  [PROXY]
  ↓ POST /analyze  (form-data: file=frame.jpg)
AI Service (FastAPI :8000)
  ↓ Returns: { fraud_score, composite_score, risk_label, confidence, indicators, ... }
Backend
  ↓ Inserts to SQLite, optionally sends blockchain tx to FraudLog.sol (Ganache :7545)
  ↓ Returns full result to browser
Browser
  ↓ Updates webcam overlay canvas + risk score panel + detection indicators in real time
```

### Frontend Components
- **`ExamSession.jsx`** — top-level exam page; renders the left question panel and the right AI Monitoring panel. Holds state: `currentFraudScore`, `currentRiskLabel`, `indicators`, `aiConfidence`.
- **`WebcamCapture.jsx`** — child component embedded in the right panel. Hosts the `<Webcam>` element, `<canvas>` overlay, captures frames every 2 seconds, and calls `onAnalysis(score, label, indicators, confidence)` to notify its parent.
- Other components: `AdminDashboard.jsx`, `InvigilatorDashboard.jsx`, `StudentDashboard.jsx`, `Landing.jsx`, `ResearcherPanel.jsx`.

---

## 2. AI Service (`ai_service/main.py`) — Issues & Details

### What it does
FastAPI server running on **port 8000**. On startup it loads:
1. `exam_fraud_model.h5` — a trained CNN (TF/Keras) for fraud classification
2. OpenCV Haar Cascades for face detection
3. MediaPipe face landmarker (`face_landmarker.task`) for gaze tracking (Phase 1)
4. YOLOv8 (`yolov8n.pt`) for object detection — phones, books, extra persons (Phase 2)
5. VGGish audio analyzer (Phase 3)
6. CNN+LSTM temporal action model (Phase 4)

### Key endpoint
`POST /analyze` — accepts `file` (JPEG image UploadFile). Returns:
```json
{
  "fraud_score": 0.0–1.0,
  "composite_score": 0–100,
  "risk_label": "Low|Moderate|High",
  "confidence": 0.0–1.0,
  "indicators": {
    "face_detected": bool,
    "multiple_faces": bool,
    "face_count": int,
    "gaze_ok": bool,
    "head_pose_ok": bool,
    "eyes_visible": bool,
    "face_bbox": { "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 },
    "gaze_direction": "center|left|right|unknown",
    "gaze_off_seconds": float,
    "detected_objects": [{ "class": str, "confidence": float }],
    "object_threat_score": float
  },
  "component_scores": {...},
  "cnn_raw": float,
  "latency_ms": float,
  "status": "cnn+opencv|rule_based+opencv"
}
```

### Recurring AI Service Issues

**Issue A — Port confusion / URL mismatch (MOST CRITICAL, MOST REPEATED)**
- The AI service runs on **port 8000** but the frontend (`WebcamCapture.jsx`) directly POSTs to **`http://localhost:5000/analyze-frame`** (the Node backend).
- The Node backend then proxies to `http://localhost:8000/analyze`.
- **The frontend must NEVER call port 8000 directly.** If someone accidentally changes the frontend to call 8000, it hits the wrong endpoint format. The AI service at `/analyze` only accepts `file=` (UploadFile), not `frame=`. Any mismatch = 422 Unprocessable Entity.
- Current correct flow: Frontend → 5000/analyze-frame → 8000/analyze ✅

**Issue B — Audio endpoint name mismatch**
- AI service exposes: `POST /analyze_audio` (underscore)
- Frontend (`WebcamCapture.jsx` line 214): posts to `http://localhost:5000/analyze-audio` (hyphen) → Node backend
- Node backend (`server.js` line 301): proxies to `http://localhost:8000/analyze_audio` (underscore)
- The mismatch is at the Express layer — frontend uses hyphens (`/analyze-audio`) and Express uses hyphens too, but the backend-to-AI proxy correctly uses underscore. **This chain works as designed**, but was a source of confusion in past debugging.

**Issue C — Sequence endpoint mismatch (broken)**
- AI service exposes: `POST /analyze_sequence` (underscore)
- Node backend calls: `http://localhost:8000/analyze_sequence` ✅
- But the Node route is: `app.post('/analyze-sequence', ...)` (hyphen) → proxies with correct underscore. OK.
- **Real problem**: The AI service `POST /analyze_sequence` accepts `files: list[UploadFile]` as a FastAPI form param, but the Node backend builds FormData and appends blobs as `'files'`. This works ONLY if multer on the Node side handles array uploads correctly.

**Issue D — Action model is architecture-only (no weights)**
The Phase 4 action model is initialized via `build_action_model()` but **has no trained weights**. Predictions will be near-random. This is known, acknowledged as a demo/thesis limitation, but `/analyze-sequence` will still return `action_score` values.

**Issue E — AI service startup slowness**
Loading the 202MB CNN `.h5` model + YOLOv8 + MediaPipe on a Windows laptop takes 15–30 seconds. If the frontend starts immediately, the first several frames will get `ECONNREFUSED` or timeout, triggering the "Offline" state.

---

## 3. Backend (`backend/server.js`) — Issues & Details

### What it does
Express.js server on **port 5000**. Acts as:
1. Proxy between frontend and AI service
2. SQLite persistence (fraud events, blockchain tx records)
3. Blockchain bridge — signs and sends `logFraudEvent()` transactions to FraudLog.sol when `fraud_score > 0.60`
4. Serves exam/fraud data to Admin and Invigilator dashboards

### Recurring Backend Issues

**Issue F — Signer unavailable (very common)**
```js
const accounts = await provider.listAccounts();
signer = await provider.getSigner(0);
```
This relies on Ganache running at `http://127.0.0.1:7545`. If Ganache is not started **before** the backend, `signer` is `null`, and all `logToBlockchain()` calls return `null`. The frontend then shows `blockchain: { logged: false }` — fraud events are NOT committed to chain even at high risk. The developer frequently forgets to start Ganache first, causing all blockchain logging to silently fail.

**Issue G — Fallback mode mimics real AI (misleading UI)**
When the AI service (port 8000) is unreachable, `server.js` uses a **random number fallback** (lines 213–230):
```js
const rand = Math.random();
let fraud_score;
if (rand < 0.70) fraud_score = Math.random() * 0.35;  // Low
else if (rand < 0.88) fraud_score = 0.40 + Math.random() * 0.29;  // Moderate
else fraud_score = 0.71 + Math.random() * 0.28;  // High
```
This is **critical**: When the AI service is down, the backend still returns `indicators: null` and random scores. The frontend currently maps `null` indicators to fall back on `currentFraudScore`-based guesses. This means the **UI shows non-zero fake risk scores even when nothing is running**, which has confused the developer multiple times into thinking the system was working.

**Issue H — `indicators: null` propagation**
When `aiData.indicators` is `null` (fallback or AI error), the backend returns `indicators: null`. In `WebcamCapture.jsx`, `setLiveInfo(null)` is called, and all indicator displays show `'--'`. In `ExamSession.jsx`, the parent receives `null` for `inds`, so the derived booleans (lines 98–104) fall back to composite-score guesses, which are wrong and misleading.

**Issue I — Blockchain tx wait blocking response**
`logToBlockchain()` calls `await tx.wait()` (confirmed on-chain). On Ganache this takes ~2 seconds but in practice can hit Ganache's auto-mining lag. The entire `/analyze-frame` response is held until the blockchain tx confirms. If Ganache is slow, the frontend 8-second timeout fires → frame is treated as `Offline`.

---

## 4. Frontend (`WebcamCapture.jsx` + `ExamSession.jsx`) — Issues & Details

### Webcam-Specific Issues

**Issue J — Webcam feed not appearing / blank**
The `<Webcam>` component from `react-webcam` requires browser permission. If the user has not granted camera access, or if another app is locking the camera, `onUserMediaError` fires. The `webcamReady` state stays `false`, so `setInterval(capture, 2000)` never starts. The UI shows a blank rectangle with no error message visible to the user (the error only appears in the tiny debug bar text `ERR: Camera: ...` at the bottom of the component).

**Issue K — Canvas overlay not rendering bounding box**
The `<canvas>` element overlays the webcam view using `position: absolute; inset: 0`. The `drawOverlay()` function is called with `indicators?.face_bbox` from the AI response. If the AI service is offline or `indicators` is null, `bbox` is `null` and the canvas shows `"NO FACE DETECTED"` text. **The bounding box only appears when:**
1. The AI service is running
2. `face_detected: true` in the response
3. `face_bbox` is a valid `{x,y,w,h}` object from OpenCV

**Most common reason the bounding box never shows**: the AI service is offline, so `indicators` is always `null`.

**Issue L — Real-time UI not updating (root cause)**
This is the core complaint, repeated across every conversation. The chain of failures:

1. AI service not running → `fetch('http://localhost:5000/analyze-frame')` catches `ECONNREFUSED` or timeout
2. `setRiskLevel('Offline')` + `setLiveInfo(null)` → all indicators show `'--'`
3. `onAnalysis(0, 'Offline', null, null)` → parent `ExamSession.jsx` sets `currentFraudScore=0`, `currentRiskLabel='Offline'`, `indicators=null`
4. Detection indicators panel shows all items as `'OFFLINE'` → looks frozen/dead
5. The developer sees this as "the UI is not updating" but the real cause is the AI service is not responding

**But there is also a genuine update freeze issue**: if the AI service IS running but slow (>2s per frame), the `setInterval` fires again before the previous `fetch` resolves. Since `fetch` is async and there's no lock/guard, multiple parallel requests can pile up. The UI appears to only update sporadically.

**Issue M — `onAnalysis` callback stale closure**
In `WebcamCapture.jsx`, `capture` is a `useCallback` with dependencies `[studentId, examId, onAnalysis, onFraudLog, drawOverlay]`. If `ExamSession.jsx` re-renders and passes a new `onAnalysis` reference, the interval closure may briefly hold a stale version. This is a React stale-closure issue that causes the parent's state to not update for one frame cycle.

**Issue N — Risk score display discrepancy**
`WebcamCapture.jsx` has its own internal `score` state (displayed in the camera overlay as `AI: 45%`). `ExamSession.jsx` has its own `currentFraudScore` (displayed in the side panel). Both are set from the same AI response, but the child updates its local state AND calls `onAnalysis` to update the parent. If `onAnalysis` is called with the wrong value, the two panels show different numbers. Historical bug: `composite_score` (0–100) vs `fraud_score` (0–1) were mixed. This was fixed but the code still has both paths as fallback:
```js
const displayScore = composite_score ?? Math.round(parseFloat(fraud_score) * 100);
```

**Issue O — Audio alert not visible to student**
The `audioAlert` state in `WebcamCapture.jsx` shows a red `"🎙 VOICE DETECTED"` badge over the webcam. This only fires if:
1. Microphone permission is granted
2. The 5-second audio chunk returns `audio_alert: true` from the backend
3. The VGGish model in the AI service actually detects speech

In practice, VGGish often fails to load on Windows (missing `librosa`, `soundfile`, or `tensorflow_hub` dependencies), so `analyze_audio_segment()` returns `status: "error"`, the backend returns 503, and the `audioAlert` state never becomes true. The developer has complained that audio alerts are never shown.

**Issue P — Action alert not visible**
Same pattern: `actionAlert` only becomes `true` if the sequence endpoint returns `action_score > 0.60`. Since the action model has no trained weights (Issue D), the score is random and rarely crosses 0.60.

---

## 5. Blockchain (`blockchain/`) — Issues & Details

### Contracts
- **`ExamSystem.sol`** — manages exam creation, student enrollment, exam submission, `getFraudHistory()`
- **`FraudLog.sol`** — separate contract for privacy-preserving fraud logging using keccak256 hashing, `verifyEvent()`, `getFraudEvents()`

### Recurring Blockchain Issues

**Issue Q — Ganache not started = everything silently fails**
The entire blockchain layer requires Ganache running on port 7545. If it's not started:
- Backend signer is `null` → no blockchain fraud logging
- Frontend `signer` (from MetaMask) fails to connect → `submitExam()` fails silently
- The UI still shows "VERIFIED" in the Blockchain Status panel (hardcoded, not dynamic)

**Issue R — "VERIFIED" status is always hardcoded**
In `ExamSession.jsx` (line 343–345):
```jsx
<span className="text-green-400 font-bold flex items-center gap-1">
    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> VERIFIED
</span>
```
This is hardcoded. Even if blockchain is completely offline, the panel says "● VERIFIED". This is misleading — it should be dynamic based on the actual connection status.

**Issue S — MetaMask not connected = exam submission fails silently**
`handleSubmit()` in `ExamSession.jsx` has this pattern:
```js
if (signer) {
    const tx = await contract.submitExam(examId, finalScore);
    ...
} catch (err) { console.error('Blockchain submitExam failed:', err.message); }
```
The catch block only logs to console. The student sees the exam as "Submitted" even if the blockchain transaction failed. No UI error is shown.

**Issue T — Gas costs too high for exam creation**
The Admin creates exams by storing full JSON question data as a string on-chain. This was previously identified as causing very high gas fees on Ganache. A fix was planned (IPFS or calldata optimization) but may not have been fully applied.

---

## 6. Summary of What Must Be Fixed for the Live Student Exam UI

The user's core complaints ("webcam not showing", "UI info not updating in real-time") trace to this exact failure chain:

```
Step 1: Ganache → must be started first
Step 2: AI Service (port 8000) → must be started and fully loaded before the exam
Step 3: Backend (port 5000) → must be started after AI service
Step 4: Frontend (port 5173) → browser opens, MetaMask connects

If ANY of steps 1-3 are missing, the student exam page UI will appear frozen/offline.
```

### Priority Fixes Needed

| # | Issue | Severity | Fix |
|---|---|---|---|
| 1 | UI shows "Offline" when AI service is down with no guidance | 🔴 High | Show startup status + retry button |
| 2 | Bounding box never appears | 🔴 High | Only fixable if AI service is running |
| 3 | `indicators: null` causes wrong indicator states | 🔴 High | Better `null` handling in `ExamSession.jsx` |
| 4 | "VERIFIED" blockchain status is hardcoded | 🟠 Medium | Make dynamic via `/health` endpoint polling |
| 5 | Concurrent frame requests pile up | 🟠 Medium | Add `isFetchingRef` guard in `capture()` |
| 6 | Audio/action alerts never fire | 🟡 Low | Dependency issues with VGGish on Windows |
| 7 | Exam submission failure is silent | 🟡 Low | Show blockchain tx error in UI |

---

## 7. Running the System (Correct Order)

```powershell
# Terminal 1 — Start Ganache (must be first)
# (Open Ganache desktop app manually on port 7545)

# Terminal 2 — Start AI Service
cd C:\Users\DELL\Downloads\aiblockchain\ai_service
.\venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Wait for: "✅ CNN Model loaded" + "✅ Phase 4 Temporal Action Model architectural graph defined."

# Terminal 3 — Start Backend
cd C:\Users\DELL\Downloads\aiblockchain\backend
node server.js
# Wait for: "✅ Blockchain signer ready: 0x..."

# Terminal 4 — Start Frontend
cd C:\Users\DELL\Downloads\aiblockchain\frontend
npm run dev
# Open http://localhost:5173, connect MetaMask to Ganache (chainId 1337, RPC http://127.0.0.1:7545)
```

---

## 8. File Map (Key Files)

| File | Purpose |
|---|---|
| `ai_service/main.py` | FastAPI AI service, all ML inference |
| `ai_service/fraud_scorer.py` | Weighted composite fraud score calculator |
| `ai_service/gaze_tracker.py` | MediaPipe gaze tracking (Phase 1) |
| `ai_service/object_detector.py` | YOLOv8 object detection (Phase 2) |
| `ai_service/audio_analyzer.py` | VGGish audio analysis (Phase 3) |
| `ai_service/action_model.py` | CNN+LSTM temporal model (Phase 4) |
| `backend/server.js` | Express proxy + SQLite + blockchain bridge |
| `backend/database.js` | SQLite schema + CRUD |
| `frontend/src/components/WebcamCapture.jsx` | Webcam + canvas overlay + frame capture |
| `frontend/src/components/ExamSession.jsx` | Student exam UI + monitoring panel |
| `blockchain/contracts/ExamSystem.sol` | Exam management contract |
| `blockchain/contracts/FraudLog.sol` | Privacy-preserving fraud log contract |
| `contract_config.json` | Deployed contract addresses |
