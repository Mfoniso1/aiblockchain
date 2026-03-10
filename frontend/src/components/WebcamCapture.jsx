import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { AlertCircle, CheckCircle, Shield, Mic, MicOff, Eye, EyeOff, Activity } from 'lucide-react';

/**
 * Props:
 *  studentId   - wallet address
 *  examId      - on-chain exam ID
 *  onFraudLog  - callback(fraudScore, txHash) when backend logs to FraudLog
 *  onAnalysis  - callback(fraudScore, riskLabel, indicators, confidence) called every frame
 */
const WebcamCapture = ({ studentId, examId, onFraudLog, onAnalysis }) => {
    const webcamRef = useRef(null);
    const canvasRef = useRef(null);
    const [riskLevel, setRiskLevel] = useState('Low');
    const [score, setScore] = useState(0);
    const [fraudCount, setFraudCount] = useState(0);
    const [blockchainStatus, setBlockchainStatus] = useState(null);
    const [lastTxHash, setLastTxHash] = useState(null);
    const [audioAlert, setAudioAlert] = useState(false);
    const [actionAlert, setActionAlert] = useState(false);
    const [micActive, setMicActive] = useState(false);
    const [liveInfo, setLiveInfo] = useState(null);
    const [frameCount, setFrameCount] = useState(0);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [lastError, setLastError] = useState(null);
    const [webcamReady, setWebcamReady] = useState(false); // true only after onUserMedia fires
    const mediaRecorderRef = useRef(null);
    const sequenceBufferRef = useRef([]);
    const isFetchingRef = useRef(false); // guard: only one frame request in-flight at a time


    // ── Draw face bounding box on canvas overlay ──────────────────────────────
    const drawOverlay = useCallback((bbox, indicators, riskLvl) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Use displayed size; fall back to the video element's intrinsic size on
        // first render when the canvas hasn't been laid out yet (offsetWidth === 0).
        let W = canvas.offsetWidth;
        let H = canvas.offsetHeight;
        if (!W || !H) {
            const video = webcamRef.current?.video;
            W = video?.videoWidth || 640;
            H = video?.videoHeight || 480;
        }
        if (!W || !H) return;

        // Only resize backing store if needed (avoid clearing on every frame)
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        const boxColor = riskLvl === 'High' ? '#ef4444'
            : riskLvl === 'Moderate' ? '#f59e0b'
                : '#22c55e';

        if (bbox) {
            const x = bbox.x * W;
            const y = bbox.y * H;
            const bw = bbox.w * W;
            const bh = bbox.h * H;

            // Draw bounding box
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x, y, bw, bh);

            // Corner accents
            const cs = 12;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + bw - cs, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + cs); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y + bh - cs); ctx.lineTo(x, y + bh); ctx.lineTo(x + cs, y + bh); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + bw - cs, y + bh); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw, y + bh - cs); ctx.stroke();

            // Label above box
            const gazeDir = indicators?.gaze_direction || 'center';
            const label = `FACE: ${gazeDir.toUpperCase()}`;
            ctx.fillStyle = boxColor;
            ctx.font = 'bold 11px monospace';
            const labelY = y - 5 < 12 ? y + bh + 14 : y - 5;
            ctx.fillText(label, x, labelY);
        } else {
            // No face — show warning label
            ctx.fillStyle = '#ef444488';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('NO FACE DETECTED', 8, 20);
        }

        // Detected objects labels at top of frame
        const objs = indicators?.detected_objects || [];
        objs.forEach((obj, i) => {
            const objLabel = `\u26a0 ${obj.class.toUpperCase()} (${Math.round((obj.confidence || 0) * 100)}%)`;
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(objLabel, 8, H - 8 - i * 18);
        });
    }, []);


    // ── Frame capture + AI analysis ──────────────────────────────────────────
    const capture = useCallback(async () => {
        // Skip this tick if a previous request is still in-flight.
        // This prevents parallel requests from piling up when the AI service is slow.
        if (isFetchingRef.current) return;
        if (!webcamRef.current) return;
        isFetchingRef.current = true;
        const videoEl = webcamRef.current.video;
        // Relaxed readiness check to accommodate different browsers
        if (!videoEl || videoEl.readyState < 2) {
            isFetchingRef.current = false; // release lock so next tick can try again
            return;
        }

        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) { isFetchingRef.current = false; setLastError('Screenshot returned null'); return; }

        setFrameCount(n => n + 1);

        // Use native fetch (more reliable than axios for FormData blobs)
        const blob = await (await fetch(imageSrc)).blob();
        const formData = new FormData();
        formData.append('frame', blob, 'frame.jpg');
        formData.append('studentID', studentId || 'student_1');
        formData.append('student_address', studentId || 'student_1');
        formData.append('examID', String(examId ?? 'exam_demo'));
        formData.append('exam_id', String(examId ?? 'exam_demo'));

        try {
            const res = await fetch('http://localhost:5000/analyze-frame', {
                method: 'POST',
                body: formData,
                headers: { 'x-student-address': studentId || 'anonymous' },
                signal: AbortSignal.timeout(8000),
            });
            const data = await res.json();

            const { fraud_score, composite_score, risk_label, confidence, indicators, blockchain } = data;

            const normLabel = risk_label === 'High' ? 'High'
                : (risk_label === 'Moderate' || risk_label === 'Medium') ? 'Moderate' : 'Low';

            const displayScore = composite_score ?? Math.round(parseFloat(fraud_score) * 100);

            setScore(displayScore);
            setRiskLevel(normLabel);
            setLiveInfo(indicators);
            setLastUpdate(new Date().toLocaleTimeString());
            setLastError(null);

            drawOverlay(indicators?.face_bbox ?? null, indicators, normLabel);

            if (onAnalysis) onAnalysis(displayScore, normLabel, indicators || null, confidence ?? null);

            if (normLabel === 'High') {
                setBlockchainStatus('logging');
                if (blockchain?.logged && blockchain?.tx_hash) {
                    setLastTxHash(blockchain.tx_hash);
                    setBlockchainStatus('logged');
                    setFraudCount(prev => prev + 1);
                    if (onFraudLog) onFraudLog(parseFloat(fraud_score), blockchain.tx_hash);
                    setTimeout(() => setBlockchainStatus(null), 4000);
                } else {
                    setBlockchainStatus('error');
                    setTimeout(() => setBlockchainStatus(null), 3000);
                }
            }
        } catch (err) {
            const msg = err.name === 'TimeoutError' ? 'Request timed out' : (err.message || 'Network error');
            setLastError(msg);
            setRiskLevel('Offline');
            setScore(0);
            setLiveInfo(null);
            if (onAnalysis) onAnalysis(0, 'Offline', null, null);
        } finally {
            isFetchingRef.current = false; // always release the lock
        }
    }, [studentId, examId, onAnalysis, onFraudLog, drawOverlay]);

    // ── Sequence Analysis (Phase 4) ──────────────────────────────────────────
    const captureSequenceFrame = useCallback(async () => {
        if (!webcamRef.current) return;
        const imageSrc = webcamRef.current.getScreenshot();
        if (!imageSrc) return;
        const blob = await (await fetch(imageSrc)).blob();
        sequenceBufferRef.current.push(blob);

        if (sequenceBufferRef.current.length === 16) {
            const framesToSend = [...sequenceBufferRef.current];
            sequenceBufferRef.current = [];
            const formData = new FormData();
            formData.append('studentID', studentId || 'student_1');
            formData.append('student_address', studentId || 'student_1');
            formData.append('examID', String(examId ?? 'exam_demo'));
            framesToSend.forEach((f) => formData.append('frames', f, 'frame.jpg'));
            try {
                const res = await axios.post('http://localhost:5000/analyze-sequence', formData, {
                    headers: { 'x-student-address': studentId || 'anonymous' }
                });
                if (res.data.action_score > 0.60) {
                    setActionAlert(true);
                    setTimeout(() => setActionAlert(false), 5000);
                }
            } catch (e) { }
        }
    }, [studentId, examId]);

    // ── Audio Analysis (Phase 3) ──────────────────────────────────────────────
    useEffect(() => {
        let stream;
        const startAudioRecording = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setMicActive(true);
                const mediaRecorder = new MediaRecorder(stream);
                mediaRecorderRef.current = mediaRecorder;

                mediaRecorder.ondataavailable = async (e) => {
                    if (e.data.size > 0) {
                        const formData = new FormData();
                        formData.append('audio', e.data, 'audio.wav');
                        formData.append('studentID', studentId || 'student_1');
                        formData.append('student_address', studentId || 'student_1');
                        formData.append('examID', String(examId ?? 'exam_demo'));
                        try {
                            const res = await axios.post('http://localhost:5000/analyze-audio', formData, {
                                headers: { 'x-student-address': studentId || 'anonymous' }
                            });
                            if (res.data.audio_alert) {
                                setAudioAlert(true);
                                setTimeout(() => setAudioAlert(false), 5000);
                            }
                        } catch (err) { }
                    }
                };
                mediaRecorder.start(5000);
            } catch (err) {
                setMicActive(false);
                console.warn('Microphone access denied or unavailable');
            }
        };
        startAudioRecording();
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [studentId, examId]);

    // ── Capture intervals — only start AFTER webcam stream is ready ────────────
    useEffect(() => {
        if (!webcamReady) return;
        const interval = setInterval(capture, 2000);
        return () => clearInterval(interval);
    }, [capture, webcamReady]);

    useEffect(() => {
        if (!webcamReady) return;
        const sequenceInterval = setInterval(captureSequenceFrame, 200);
        return () => clearInterval(sequenceInterval);
    }, [captureSequenceFrame, webcamReady]);

    // ── Colour helpers ────────────────────────────────────────────────────────
    const riskColor = riskLevel === 'High' ? 'text-red-400'
        : riskLevel === 'Moderate' ? 'text-yellow-400'
            : riskLevel === 'Offline' ? 'text-slate-500'
                : 'text-green-400';
    const dotColor = riskLevel === 'High' ? 'bg-red-500 animate-ping'
        : riskLevel === 'Moderate' ? 'bg-yellow-400 animate-pulse'
            : riskLevel === 'Offline' ? 'bg-slate-600'
                : 'bg-green-500 animate-pulse';
    const borderColor = riskLevel === 'High' ? 'border-red-600' : riskLevel === 'Moderate' ? 'border-yellow-600' : 'border-gray-700';

    // ── Indicator row helper ──────────────────────────────────────────────────
    const Indicator = ({ label, ok, value }) => (
        <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500">{label}</span>
            <span className={`font-bold font-mono ${ok ? 'text-green-400' : 'text-red-400'}`}>
                {value ?? (ok ? 'OK' : 'ALERT')}
            </span>
        </div>
    );

    const detectedObjects = liveInfo?.detected_objects || [];

    return (
        <div className={`flex flex-col bg-gray-900 rounded-xl border ${borderColor} overflow-hidden`}>
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                    LIVE CAMERA
                </span>
                <div className="flex items-center gap-2">
                    {/* Mic status */}
                    <span className={`text-xs flex items-center gap-1 ${micActive ? 'text-blue-400' : 'text-slate-600'}`}>
                        {micActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                        <span className="font-mono text-[9px]">{micActive ? 'MIC ON' : 'NO MIC'}</span>
                    </span>
                    <span className={`text-xs font-mono font-bold ${riskColor}`}>
                        {riskLevel === 'High' ? '⚠ HIGH RISK'
                            : riskLevel === 'Moderate' ? '~ MODERATE'
                                : riskLevel === 'Offline' ? '⚠ OFFLINE'
                                    : '✓ SAFE'}
                    </span>
                </div>
            </div>

            {/* ── Webcam + Canvas overlay ─────────────────────── */}
            <div className="relative">
                <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    width={640}
                    height={480}
                    className="block w-full"
                    videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
                    onUserMedia={() => setWebcamReady(true)}
                    onUserMediaError={(err) => setLastError(`Camera: ${err.message || err}`)}

                />
                {/* Canvas for face bounding box */}
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ objectFit: 'cover' }}
                />

                {/* AI score overlay */}
                <div className="absolute bottom-2 left-2 flex flex-col gap-1">
                    <div className="bg-black bg-opacity-75 px-2 py-1 rounded text-xs font-mono text-white border border-gray-700">
                        AI: {riskLevel === 'Offline' ? 'OFFLINE' : `${score}%`}
                    </div>
                    {audioAlert && (
                        <div className="bg-red-600 bg-opacity-95 px-2 py-1 rounded text-xs text-white font-bold animate-pulse border border-red-400">
                            🎙 VOICE DETECTED
                        </div>
                    )}
                    {actionAlert && (
                        <div className="bg-orange-500 bg-opacity-95 px-2 py-1 rounded text-xs text-white font-bold animate-pulse border border-orange-400">
                            ⚡ SUSPICIOUS MOTION
                        </div>
                    )}
                </div>

                {/* High-risk red overlay */}
                {riskLevel === 'High' && (
                    <div className="absolute inset-0 bg-red-900 bg-opacity-30 flex items-center justify-center border-2 border-red-500 pointer-events-none">
                        <AlertCircle className="w-10 h-10 text-red-400 animate-pulse" />
                    </div>
                )}
            </div>

            {/* ── Live Behaviour Panel ────────────────────────── */}
            <div className="px-3 py-2.5 border-t border-gray-700 bg-gray-900/80 space-y-1.5">
                <div className="text-[9px] font-semibold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Real-Time Behaviour Analysis
                </div>

                <Indicator
                    label="Face Detected"
                    ok={liveInfo?.face_detected ?? true}
                    value={liveInfo ? (liveInfo.face_detected ? `YES (${liveInfo.face_count ?? 1})` : 'NOT FOUND') : '--'}
                />
                <Indicator
                    label="Multiple Persons"
                    ok={!liveInfo?.multiple_faces}
                    value={liveInfo ? (liveInfo.multiple_faces ? `YES — ${liveInfo.face_count} faces` : 'NO') : '--'}
                />
                <Indicator
                    label="Gaze Direction"
                    ok={liveInfo?.gaze_ok ?? true}
                    value={liveInfo ? (liveInfo.gaze_direction ? liveInfo.gaze_direction.toUpperCase() : (liveInfo.gaze_ok ? 'CENTER' : 'OFF SCREEN')) : '--'}
                />
                <Indicator
                    label="Head Pose"
                    ok={liveInfo?.head_pose_ok ?? true}
                    value={liveInfo ? (liveInfo.head_pose_ok ? 'NORMAL' : 'IRREGULAR') : '--'}
                />
                <Indicator
                    label="Gaze Off-Screen"
                    ok={(liveInfo?.gaze_off_seconds ?? 0) < 2}
                    value={liveInfo ? `${liveInfo.gaze_off_seconds ?? 0}s` : '--'}
                />

                {/* Audio row */}
                <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500 flex items-center gap-1">
                        {micActive ? <Mic className="w-3 h-3 text-blue-400" /> : <MicOff className="w-3 h-3" />}
                        Audio Monitor
                    </span>
                    <span className={`font-bold font-mono ${audioAlert ? 'text-red-400 animate-pulse' : micActive ? 'text-green-400' : 'text-slate-600'}`}>
                        {audioAlert ? 'VOICE ALERT!' : micActive ? 'LISTENING' : 'NO MIC'}
                    </span>
                </div>

                {/* Detected objects */}
                <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">Detected Objects</span>
                    <span className={`font-bold font-mono ${detectedObjects.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {detectedObjects.length > 0
                            ? detectedObjects.map(o => o.class).join(', ').toUpperCase()
                            : 'NONE'}
                    </span>
                </div>
            </div>

            {/* ── Fraud count + Chain ─────────────────────────── */}
            <div className="px-3 py-2 border-t border-gray-700 grid grid-cols-2 gap-2">
                <div className="text-center">
                    <div className="text-xs text-gray-500">Fraud Events</div>
                    <div className={`text-lg font-black ${fraudCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{fraudCount}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-500 flex items-center justify-center gap-1"><Shield className="w-3 h-3" />Chain</div>
                    <div className="text-xs font-mono text-blue-400">Backend FraudLog</div>
                </div>
            </div>

            {/* ── Blockchain status ───────────────────────────── */}
            {blockchainStatus === 'logging' && (
                <div className="px-3 pb-2 flex items-center gap-2 text-xs text-yellow-300">
                    <div className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                    Logging to blockchain...
                </div>
            )}
            {blockchainStatus === 'logged' && lastTxHash && (
                <div className="px-3 pb-2 flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle className="w-3 h-3 shrink-0" />
                    On-chain: {lastTxHash.substring(0, 14)}...
                </div>
            )}
            {blockchainStatus === 'error' && (
                <div className="px-3 pb-2 text-xs text-red-400">⚠ Blockchain log failed</div>
            )}

            {/* ── Debug status bar ─────────────────────────────── */}
            <div className="px-3 py-1.5 border-t border-slate-800 bg-black/40 flex items-center justify-between">
                <span className="text-[9px] font-mono text-slate-600">
                    frames: <span className={frameCount > 0 ? 'text-green-500' : 'text-red-500'}>{frameCount}</span>
                </span>
                {lastError ? (
                    <span className="text-[9px] font-mono text-red-500 truncate max-w-[160px]" title={lastError}>
                        ERR: {lastError}
                    </span>
                ) : (
                    <span className="text-[9px] font-mono text-slate-600">
                        {lastUpdate ? `last: ${lastUpdate}` : 'waiting...'}
                    </span>
                )}
            </div>
            <p className="text-[9px] text-slate-700 text-center py-1 border-t border-slate-800">
                Session monitored by AI-based behavioural analysis
            </p>
        </div>
    );
};

export default WebcamCapture;
