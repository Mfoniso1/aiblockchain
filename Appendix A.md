# Appendix A: Core System Source Code Snippets

This appendix provides key excerpts from the core components of the AI Exam Fraud Detection system, highlighting the blockchain smart contract, the frontend React session component, the backend AI service endpoints, and the weighted scoring logic.

---

## 1. Smart Contract: `ExamSystem.sol`
The core Ethereum smart contract that handles role-based access control, exam creation, result submission, and immutable fraud event logging.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ExamSystem {
    // ── Roles ──────────────────────────────────────────────────────────────────
    enum Role { Student, Admin, Invigilator, Validator }

    // ── Structs ────────────────────────────────────────────────────────────────
    struct FraudEvent {
        string  studentID;
        uint256 examID;
        uint256 riskScore;
        uint256 timestamp;
        string  evidenceHash;
    }

    struct Result {
        address student;
        uint256 examId;
        uint256 score;
        uint256 timestamp;
    }

    // ── State ──────────────────────────────────────────────────────────────────
    FraudEvent[]  public fraudHistory;
    Result[]      public allResults;

    // ── Events ─────────────────────────────────────────────────────────────────
    event FraudLogged    (string studentID, uint256 indexed examID, uint256 riskScore);
    event ExamSubmitted  (address indexed student, uint256 indexed examId, uint256 score);

    // ── Fraud Logging ──────────────────────────────────────────────────────────
    function logFraudEvent(
        string memory _studentID,
        uint256       _examID,
        uint256       _riskScore,
        string memory _evidenceHash
    ) public onlyRegistered {
        fraudHistory.push(FraudEvent({
            studentID:    _studentID,
            examID:       _examID,
            riskScore:    _riskScore,
            timestamp:    block.timestamp,
            evidenceHash: _evidenceHash
        }));
        emit FraudLogged(_studentID, _examID, _riskScore);
    }

    // ── Exam Submission ────────────────────────────────────────────────────────
    function submitExam(uint256 _examId, uint256 _score) public onlyRegistered {
        allResults.push(Result({
            student:   msg.sender,
            examId:    _examId,
            score:     _score,
            timestamp: block.timestamp
        }));
        emit ExamSubmitted(msg.sender, _examId, _score);
    }
}
```

---

## 2. Frontend Session Interface: `ExamSession.jsx`
The React component serving as the student's examination interface, integrating the webcam capture, AI monitoring panel, and blockchain transaction submission.

```jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import WebcamCapture from './WebcamCapture';
import ExamSystemABI from '../ExamSystem.json';
import { CONTRACT_ADDRESS } from '../config';

const ExamSession = ({ studentAddress, signer, examData, onFinish }) => {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(null);
    const [fraudEvents, setFraudEvents] = useState([]);
    
    // AI analysis state bindings
    const [currentFraudScore, setCurrentFraudScore] = useState(0);
    const [currentRiskLabel, setCurrentRiskLabel] = useState('Low');
    const [indicators, setIndicators] = useState(null); 

    const handleAnalysisUpdate = (compositeScore, riskLabel, inds, confidence) => {
        setCurrentFraudScore(compositeScore);   // 0–100 integer
        setCurrentRiskLabel(riskLabel);         // 'Low' | 'Moderate' | 'High'
        if (inds) setIndicators(inds);
    };

    const handleFraudLogged = (fraudScore, hash) => {
        setFraudEvents(prev => [...prev, { score: fraudScore, hash, time: new Date().toLocaleTimeString() }]);
    };

    const handleSubmit = async () => {
        if (submitted) return;
        let correct = 0;
        questions.forEach((q, idx) => { if (answers[idx] === q.answer) correct++; });
        const finalScore = Math.round((correct / questions.length) * 100);
        setScore(finalScore);
        
        try {
            if (signer) {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
                const tx = await contract.submitExam(examData.id, finalScore);
                await tx.wait();
            }
        } catch (err) { console.error('Blockchain submitExam failed:', err.message); }
        setSubmitted(true);
    };

    return (
        <div className="flex flex-1 overflow-hidden">
            {/* ── LEFT: Questions ── */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Checkbox list rendering of questions */}
                <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold">
                    Submit Examination
                </button>
            </div>

            {/* ── RIGHT: AI Monitoring Panel ── */}
            <div className="w-80 shrink-0 bg-[#0d1535] border-l border-slate-800 overflow-y-auto flex flex-col">
                <div className="p-4 border-b border-slate-800">
                    <WebcamCapture 
                        studentId={studentAddress} 
                        examId={examData?.id ?? 0} 
                        signer={signer}
                        onFraudLog={handleFraudLogged} 
                        onAnalysis={handleAnalysisUpdate} 
                    />
                </div>
                {/* Sub-indicators overlay and realtime score */}
                <div className="mx-4 mt-4 border rounded-xl p-4 bg-slate-900/30">
                    <div className="text-3xl font-black mb-2.5 flex items-end gap-2">
                        <span>{Math.round(currentFraudScore)}%</span>
                        <span className="text-slate-600 text-sm font-normal mb-1">risk</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamSession;
```

---

## 3. AI Service Pipeline: `main.py`
The overarching FastAPI backend orchestrating the multi-modal AI pipeline (MediaPipe, YOLOv8, and CNN).

```python
@app.post("/analyze")
async def analyze_frame(
    request: Request,
    file: UploadFile = File(...)
):
    """
    Core inference endpoint — Real-Time Pipeline.
    X-Student-Address isolates gaze-off-screen state from concurrent sessions.
    """
    student_id = request.headers.get("x-student-address", "anonymous")
    gaze_state = get_student_gaze(student_id)
    contents = await file.read()

    # ── OpenCV face analysis & MediaPipe Gaze ─────────────────────────────
    nparr = np.frombuffer(contents, np.uint8)
    bgr   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    cv_ind = analyze_faces(bgr) if bgr is not None else {
        "face_detected": False, "multiple_faces": False, "face_count": 0,
        "gaze_ok": False, "head_pose_ok": False, "eyes_visible": False,
    }
    
    if bgr is not None and cv_ind["face_detected"]:
        gaze_res = analyze_gaze(bgr)
        if gaze_res.get("is_off_screen", False):
            gaze_state["off_screen_frames"] += 1
            
    if bgr is not None:
        obj_res = analyze_objects(bgr)
        cv_ind["detected_objects"] = obj_res.get("detected_objects", [])
        cv_ind["object_threat_score"] = obj_res.get("object_threat_score", 0.0)
        if obj_res.get("person_count", 0) > 1:
            cv_ind["multiple_faces"] = True
            
    cv_ind["gaze_off_seconds"] = round(gaze_state["off_screen_frames"] * 0.2, 1)

    # ── CNN inference ─────────────────────────────────────────────────────
    cnn_score = 0.0
    if model:
        preprocessed, _ = preprocess_image(contents)
        pred = model.predict(preprocessed, verbose=0)
        cnn_score = float(pred[0][0])

    # ── Weighted fraud score ──────────────────────────────────────────────
    fraud_ind = indicators_from_cv(cv_ind, cnn_score)
    score_result = compute_fraud_score(fraud_ind)

    return {
        "fraud_score":       round(score_result.composite_score / 100.0, 4), # 0–1
        "composite_score":   score_result.composite_score, # 0–100 integer mapped
        "risk_label":        score_result.risk_label,
        "confidence":        score_result.confidence,
        "cnn_raw":           round(cnn_score, 4),
        "indicators":        cv_ind,
        "component_scores":  score_result.component_scores,
    }
```

---

## 4. Fraud Scoring Engine: `fraud_scorer.py`
The underlying logic computing the weighted composite fraud score dynamically combining signals such as missing faces, objects seen, off-gaze limits, and audio events.

```python
DEFAULT_WEIGHTS = {
    "face_anomaly":   0.30,  # w1: face absence / multiple faces
    "gaze_deviation": 0.20,  # w2: eye direction off screen
    "head_pose":      0.20,  # w3: yaw / pitch / roll abnormality
    "object_detect":  0.20,  # w4: phone / book / second screen
    "behaviour":      0.05,  # w5: tab switching, rapid movement
    "audio":          0.05,  # w6: speech or whispering
}

@dataclass
class FraudIndicators:
    face_detected:   bool  = True
    multiple_faces:  bool  = False
    gaze_ok:         bool  = True
    gaze_off_seconds: float = 0.0
    object_prob:     float = 0.0
    action_score:    float = 0.0  # Temporal suspicious movement score
    cnn_score:       float = 0.0

def compute_fraud_score(
    indicators: FraudIndicators,
    weights: Optional[dict] = None,
) -> FraudScoreResult:
    w = weights if weights else DEFAULT_WEIGHTS

    # Component penalty 0-1 metrics logic...
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

    return FraudScoreResult(
        composite_score  = score_100,
        risk_label       = label,
        ...
    )
```
