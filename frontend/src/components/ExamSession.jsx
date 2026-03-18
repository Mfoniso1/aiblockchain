import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { CheckCircle, Timer, AlertCircle, Link, Activity, ShieldCheck, Eye, AlertTriangle, Monitor, User, Smartphone, ToggleLeft } from 'lucide-react';
import ExamSystemABI from '../ExamSystem.json';
import WebcamCapture from './WebcamCapture';
import { CONTRACT_ADDRESS } from '../config';

const ExamSession = ({ studentAddress, signer, examData, onFinish }) => {
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [fraudEvents, setFraudEvents] = useState([]);
    const [malpracticeReasons, setMalpracticeReasons] = useState([]); // running list of violation types
    const [timeLeft, setTimeLeft] = useState(45 * 60);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [currentFraudScore, setCurrentFraudScore] = useState(0);
    const [currentRiskLabel, setCurrentRiskLabel] = useState('Low');
    const [aiConfidence, setAiConfidence] = useState(null);
    const [indicators, setIndicators] = useState(null);
    const [sessionHash] = useState(() => ethers.id(Date.now().toString() + (studentAddress ?? 'guest')).substring(0, 42));
    const [lastTxHash, setLastTxHash] = useState('—');
    const [tabSwitches, setTabSwitches] = useState(0);

    // Track tab switches
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) setTabSwitches(t => t + 1);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const questions = useMemo(() => {
        if (examData?.questionData) {
            try {
                const parsed = JSON.parse(examData.questionData);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch { }
        }
        return [
            { question: 'What is a Smart Contract?', options: ['A legal document', 'Code on blockchain', 'A bank account', 'AI Model'], answer: 1 },
            { question: 'Which token standard is used for NFTs?', options: ['ERC-20', 'ERC-721', 'ERC-1155', 'BEP-20'], answer: 1 },
            { question: 'Who created Bitcoin?', options: ['Vitalik Buterin', 'Satoshi Nakamoto', 'Elon Musk', 'Charlie Lee'], answer: 1 },
            { question: 'What consensus mechanism does Ethereum use?', options: ['Proof of Work', 'Proof of Stake', 'Delegated PoS', 'Proof of Authority'], answer: 1 },
        ];
    }, [examData]);

    useEffect(() => {
        if (submitted) return;
        const timer = setInterval(() => {
            setTimeLeft(t => { if (t <= 1) { clearInterval(timer); handleSubmit(); return 0; } return t - 1; });
        }, 1000);
        return () => clearInterval(timer);
    }, [submitted]);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleSelect = (qIdx, optionIdx) => setAnswers(prev => ({ ...prev, [qIdx]: optionIdx }));

    // Build a human-readable list of reasons from live indicators
    const buildReasons = useCallback((inds, score, label, tabs) => {
        const reasons = [];
        if (inds) {
            if (!inds.face_detected) reasons.push('😶 No face detected');
            if (inds.multiple_faces) reasons.push(`👥 Multiple faces (${inds.face_count})`);
            if (!inds.gaze_ok) reasons.push('👀 Gaze off-screen');
            if (!inds.head_pose_ok) reasons.push('↩️ Head turned away');
            const phone = (inds.detected_objects || []).find(o => o.class === 'cell phone');
            if (phone) reasons.push(`📱 Phone detected (${Math.round(phone.confidence * 100)}%)`);
            const laptop = (inds.detected_objects || []).find(o => o.class === 'laptop');
            if (laptop) reasons.push(`💻 Laptop detected (${Math.round(laptop.confidence * 100)}%)`);
            const book = (inds.detected_objects || []).find(o => o.class === 'book');
            if (book) reasons.push('📖 Reference material visible');
            if ((inds.gaze_off_seconds || 0) > 3) reasons.push(`⏱ ${inds.gaze_off_seconds}s prolonged gaze away`);
        }
        if (tabs > 0) reasons.push(`🔀 Tab switched ${tabs} time${tabs > 1 ? 's' : ''}`);
        if (reasons.length === 0 && label === 'High') reasons.push('⚠ Suspicious behaviour detected');
        return reasons;
    }, []);

    const handleFraudLogged = useCallback((fraudScore, hash) => {
        setIndicators(currentInds => {
            // Snapshot the reason at the moment the event fires
            setFraudEvents(prev => [...prev, {
                score: fraudScore,
                hash,
                time: new Date().toLocaleTimeString(),
                reasons: buildReasons(currentInds, fraudScore * 100, 'High', tabSwitches)
            }]);
            return currentInds; // don't change indicators, just read it
        });
        setLastTxHash(hash ? (hash.substring(0, 20) + '...') : '—');
    }, [buildReasons, tabSwitches]);

    const handleAnalysisUpdate = useCallback((compositeScore, riskLabel, inds, confidence) => {
        setCurrentFraudScore(compositeScore);
        setCurrentRiskLabel(riskLabel);
        if (inds) {
            setIndicators(inds);
            // Accumulate unique malpractice reason tags throughout the session
            if (riskLabel === 'High') {
                const newReasons = [];
                if (!inds.face_detected) newReasons.push('No face detected');
                if (inds.multiple_faces) newReasons.push('Multiple faces');
                if (!inds.gaze_ok) newReasons.push('Gaze off-screen');
                if (!inds.head_pose_ok) newReasons.push('Head turned');
                const hasPhone = (inds.detected_objects || []).some(o => o.class === 'cell phone');
                if (hasPhone) newReasons.push('Phone detected');
                const hasLaptop = (inds.detected_objects || []).some(o => o.class === 'laptop');
                if (hasLaptop) newReasons.push('Laptop detected');
                if (newReasons.length > 0)
                    setMalpracticeReasons(prev => [...new Set([...prev, ...newReasons])]);
            }
        }
        if (confidence != null) setAiConfidence(Math.round(confidence * 100));
    }, []); // no deps — only uses setState setters which are always stable

    const handleSubmit = async () => {
        if (submitting || submitted) return;
        setSubmitting(true);
        let correct = 0;
        questions.forEach((q, idx) => { if (answers[idx] === q.answer) correct++; });
        const finalScore = Math.round((correct / questions.length) * 100);
        setScore(finalScore);
        try {
            if (signer) {
                const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
                const examId = examData?.id !== undefined ? Number(examData.id) : 0;
                const tx = await contract.submitExam(examId, finalScore);
                const receipt = await tx.wait();
                setTxHash(receipt.hash);
            }
        } catch (err) { console.error('Blockchain submitExam failed:', err.message); }
        setSubmitting(false);
        setSubmitted(true);
    };

    // Sub-indicators derived from real OpenCV data (use composite score as fallback)
    const faceDetected = indicators ? indicators.face_detected : currentFraudScore < 60;
    const multiplefaces = indicators ? indicators.multiple_faces : currentFraudScore > 75;
    const gazeOk = indicators ? indicators.gaze_ok : currentFraudScore < 50;
    const headPoseOk = indicators ? indicators.head_pose_ok : currentFraudScore < 65;
    const objectDetected = indicators
        ? (!indicators.face_detected && indicators.cnn_raw > 0.5)
        : currentFraudScore > 80;

    const riskColor = currentRiskLabel === 'High' ? 'text-red-400' : currentRiskLabel === 'Moderate' ? 'text-yellow-400' : currentRiskLabel === 'Offline' ? 'text-slate-500' : 'text-green-400';
    const riskBg = currentRiskLabel === 'High' ? 'bg-red-900/30 border-red-700/40' : currentRiskLabel === 'Moderate' ? 'bg-yellow-900/30 border-yellow-700/40' : currentRiskLabel === 'Offline' ? 'bg-slate-900/30 border-slate-700/40' : 'bg-green-900/30 border-green-700/40';
    const riskBar = currentRiskLabel === 'High' ? 'bg-red-500' : currentRiskLabel === 'Moderate' ? 'bg-yellow-500' : currentRiskLabel === 'Offline' ? 'bg-slate-500' : 'bg-green-500';

    // ── Results Screen ────────────────────────────────────────────────────────────
    if (submitted) {
        return (
            <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-6">
                <div className="bg-[#111827] border border-slate-700 p-10 rounded-2xl text-center max-w-lg w-full shadow-2xl">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-5" />
                    <h2 className="text-2xl font-black text-white mb-2">Examination Complete</h2>
                    <p className="text-slate-500 text-sm mb-6">Your answers and monitoring log have been committed to the Ethereum blockchain.</p>

                    <div className={`text-6xl font-black mb-6 ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {score}%
                    </div>

                    {txHash && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4 text-left">
                            <div className="flex items-center gap-2 mb-2">
                                <Link className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-xs font-bold text-slate-300">Blockchain Receipt</span>
                            </div>
                            <p className="text-[10px] font-mono text-slate-500 break-all">{txHash}</p>
                        </div>
                    )}

                    {/* ── Malpractice Verdict ── */}
                    {fraudEvents.length > 0 ? (
                        <div className="mb-4 text-left space-y-3">

                            {/* Verdict banner */}
                            <div className="bg-red-900/30 border border-red-600/50 rounded-xl p-4 flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                                <div>
                                    <p className="text-sm font-black text-red-400 uppercase tracking-wide">⚠ Flagged for Malpractice</p>
                                    <p className="text-[10px] text-red-400/70 mt-0.5">
                                        {fraudEvents.length} high-risk event{fraudEvents.length > 1 ? 's' : ''} cryptographically recorded on the Ethereum blockchain.
                                    </p>
                                </div>
                            </div>

                            {/* Unique violation types seen this session */}
                            {malpracticeReasons.length > 0 && (
                                <div className="bg-orange-900/20 border border-orange-700/30 rounded-xl p-3">
                                    <p className="text-[10px] font-bold text-orange-300 uppercase tracking-wider mb-2">Violations Detected</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {malpracticeReasons.map((r, i) => (
                                            <span key={i} className="text-[10px] bg-orange-900/40 border border-orange-700/40 text-orange-300 rounded-full px-2 py-0.5 font-mono">
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Per-event on-chain log with reasons */}
                            <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Link className="w-3 h-3" /> On-Chain Event Log
                                </p>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {fraudEvents.map((e, i) => (
                                        <div key={i} className="bg-black/30 rounded-lg p-2 border border-red-900/30">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-mono text-red-400 font-bold">
                                                    Risk: {(e.score * 100).toFixed(0)}%
                                                </span>
                                                <span className="text-[10px] text-slate-500">{e.time}</span>
                                            </div>
                                            {e.reasons && e.reasons.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mb-1">
                                                    {e.reasons.map((r, ri) => (
                                                        <span key={ri} className="text-[9px] text-orange-300 bg-orange-900/20 rounded px-1.5 py-0.5">{r}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {e.hash && (
                                                <p className="text-[9px] font-mono text-slate-600 truncate">⛓ {e.hash.substring(0, 28)}...</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-xs text-green-400">No malpractice detected. Session was clean.</span>
                        </div>
                    )}

                    <button onClick={onFinish} className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // ── Exam Screen ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
            {/* Exam top bar */}
            <div className="bg-[#0d1535] border-b border-slate-800 px-6 py-3 flex items-center justify-between">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{examData?.subject || 'Computer Science'}</p>
                    <h2 className="font-bold text-white text-sm">{examData?.title || 'Blockchain Fundamentals'}</h2>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 font-mono font-bold text-sm px-4 py-2 rounded-xl border ${timeLeft < 300 ? 'bg-red-900/40 border-red-700 text-red-400 animate-pulse' : 'bg-[#111827] border-slate-700 text-blue-400'}`}>
                        <Timer className="w-4 h-4" /> {formatTime(timeLeft)}
                    </div>
                    <div className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                        {Object.keys(answers).length}/{questions.length} answered
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">

                {/* ── LEFT: Questions ── */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Display only the active question */}
                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-white mb-4">
                                <span className="text-slate-500 mr-2">Question {currentQuestionIndex + 1} of {questions.length}</span>
                            </h3>
                            <h3 className="text-base font-semibold text-white mb-6">
                                {questions[currentQuestionIndex]?.question}
                            </h3>
                            <div className="space-y-2.5">
                                {questions[currentQuestionIndex]?.options.map((opt, optIdx) => (
                                    <label key={optIdx}
                                        className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${answers[currentQuestionIndex] === optIdx
                                            ? 'border-blue-500 bg-blue-900/20 shadow-sm shadow-blue-900/30'
                                            : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'}`}>
                                        <input type="radio" name={`q-${currentQuestionIndex}`} className="hidden"
                                            checked={answers[currentQuestionIndex] === optIdx} onChange={() => handleSelect(currentQuestionIndex, optIdx)} />
                                        <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center shrink-0 ${answers[currentQuestionIndex] === optIdx ? 'border-blue-500 bg-blue-500' : 'border-slate-600'}`}>
                                            {answers[currentQuestionIndex] === optIdx && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </div>
                                        <span className="text-sm text-slate-300">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Pagination & Submit Navigation */}
                        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex items-center justify-between">
                            <button
                                onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                                disabled={currentQuestionIndex === 0}
                                className="text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 font-bold px-4 py-2 text-sm transition"
                            >
                                ← Previous
                            </button>

                            {currentQuestionIndex < questions.length - 1 ? (
                                <button
                                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                                    className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl font-bold text-sm transition flex items-center gap-2"
                                >
                                    Next Question →
                                </button>
                            ) : (
                                <button onClick={handleSubmit} disabled={submitting}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center gap-2">
                                    {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Committing...</> : 'Submit Examination'}
                                </button>
                            )}
                        </div>

                        {currentQuestionIndex === questions.length - 1 && Object.keys(answers).length < questions.length && (
                            <div className="text-xs text-yellow-400 text-right mt-2 pr-2">
                                ⚠ {questions.length - Object.keys(answers).length} question(s) unanswered
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: AI Monitoring Panel ── */}
                <div className="w-80 shrink-0 bg-[#0d1535] border-l border-slate-800 overflow-y-auto flex flex-col">

                    {/* Webcam */}
                    <div className="p-4 border-b border-slate-800 sticky top-0 z-10 bg-[#0d1535]">
                        <WebcamCapture studentId={studentAddress} examId={examData?.id ?? 0} signer={signer}
                            onFraudLog={handleFraudLogged} onAnalysis={handleAnalysisUpdate} />
                    </div>

                    {/* Risk Score */}
                    <div className={`mx-4 mt-4 border rounded-xl p-4 ${riskBg}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                                <Activity className="w-3 h-3" /> Fraud Risk Score
                            </span>
                            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${riskBg} border ${riskBg} ${riskColor}`}>
                                {currentRiskLabel}
                            </span>
                        </div>
                        <div className="text-3xl font-black mb-2.5 flex items-end gap-2">
                            {/* currentFraudScore is now 0–100 */}
                            <span className={riskColor}>{currentFraudScore.toFixed ? Math.round(currentFraudScore) : currentFraudScore}%</span>
                            <span className="text-slate-600 text-sm font-normal mb-1">risk</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${riskBar} transition-all duration-700 rounded-full`}
                                style={{ width: `${Math.min(100, Math.max(0, currentFraudScore))}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1.5 text-right">
                            AI Confidence: <span className="text-blue-400 font-bold">
                                {aiConfidence != null ? `${aiConfidence}%` : '—'}
                            </span>
                            {indicators?.gaze_off_seconds > 0 && (
                                <span className="ml-2 text-orange-400">⏱ {indicators.gaze_off_seconds}s off-screen</span>
                            )}
                        </div>
                    </div>

                    {/* Sub-indicators */}
                    <div className="p-4 space-y-2">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Detection Indicators</div>

                        {[
                            {
                                icon: <User className="w-3 h-3" />,
                                label: 'Face Detected',
                                ok: indicators ? indicators.face_detected : currentRiskLabel !== 'Offline' && currentFraudScore < 60,
                                good: indicators ? `DETECTED (${indicators.face_count})` : 'DETECTED',
                                bad: 'NOT DETECTED'
                            },
                            {
                                icon: <Eye className="w-3 h-3" />,
                                label: 'Multiple Faces',
                                ok: indicators ? !indicators.multiple_faces : currentRiskLabel !== 'Offline' && currentFraudScore <= 75,
                                good: 'NONE',
                                bad: indicators ? `${indicators.face_count} FACES` : 'ALERT'
                            },
                            {
                                icon: <Eye className="w-3 h-3" />,
                                label: 'Eye Gaze Direction',
                                ok: indicators ? indicators.gaze_ok : currentRiskLabel !== 'Offline' && currentFraudScore < 50,
                                good: 'ON SCREEN',
                                bad: 'DEVIATING'
                            },
                            {
                                icon: <Monitor className="w-3 h-3" />,
                                label: 'Head Pose',
                                ok: indicators ? indicators.head_pose_ok : currentRiskLabel !== 'Offline' && currentFraudScore < 65,
                                good: 'FORWARD',
                                bad: 'TURNED'
                            },
                            {
                                icon: <Smartphone className="w-3 h-3" />,
                                label: 'Foreign Objects',
                                ok: indicators
                                    ? (indicators.face_detected && !indicators.multiple_faces)
                                    : currentRiskLabel !== 'Offline' && currentFraudScore <= 80,
                                good: 'NONE',
                                bad: 'DETECTED'
                            },
                            {
                                icon: <ToggleLeft className="w-3 h-3" />,
                                label: 'Tab Switching',
                                ok: tabSwitches === 0,
                                good: '0 switches',
                                bad: `${tabSwitches} switch${tabSwitches > 1 ? 'es' : ''}`
                            },
                        ].map((item, i) => (
                            <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[10px] ${currentRiskLabel === 'Offline' ? 'bg-slate-900/20 border-slate-700/30' : item.ok ? 'bg-green-900/10 border-green-800/30' : 'bg-red-900/20 border-red-700/30'}`}>
                                <span className={`flex items-center gap-1.5 ${currentRiskLabel === 'Offline' ? 'text-slate-500' : item.ok ? 'text-slate-400' : 'text-red-400 font-semibold'}`}>
                                    <span className={currentRiskLabel === 'Offline' ? 'text-slate-600' : item.ok ? 'text-slate-600' : 'text-red-400'}>{item.icon}</span>
                                    {item.label}
                                </span>
                                <span className={`font-bold uppercase ${currentRiskLabel === 'Offline' ? 'text-slate-500' : item.ok ? 'text-green-400' : 'text-red-400'}`}>
                                    {currentRiskLabel === 'Offline' ? 'OFFLINE' : item.ok ? item.good : item.bad}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Blockchain Status */}
                    <div className="mx-4 mb-4 bg-indigo-900/20 border border-indigo-700/30 rounded-xl p-3">
                        <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Link className="w-3 h-3" /> Blockchain Status
                        </div>
                        <div className="space-y-1.5 text-[10px]">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Session Hash</span>
                                <span className="font-mono text-slate-400">{sessionHash.substring(0, 12)}...</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Contract</span>
                                <span className="font-mono text-slate-400">{CONTRACT_ADDRESS.substring(0, 10)}...</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Last Tx</span>
                                <span className="font-mono text-slate-400 truncate max-w-[100px]">{lastTxHash}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Integrity</span>
                                <span className="text-green-400 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> VERIFIED
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Network</span>
                                <span className="text-blue-400 font-bold">Ganache Local</span>
                            </div>
                        </div>
                        <p className="text-[9px] text-indigo-400/70 mt-2 leading-relaxed">
                            Your exam activity is cryptographically recorded to prevent tampering.
                        </p>
                    </div>

                    {/* On-chain fraud log */}
                    {fraudEvents.length > 0 && (
                        <div className="mx-4 mb-4 bg-red-900/20 border border-red-700/30 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-red-400 mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3" /> On-Chain Events ({fraudEvents.length})
                            </p>
                            <div className="space-y-1 max-h-28 overflow-y-auto">
                                {fraudEvents.slice().reverse().map((e, i) => (
                                    <div key={i} className="flex justify-between text-[10px] font-mono bg-black/30 rounded p-1.5">
                                        <span className="text-red-400">{(e.score * 100).toFixed(0)}% risk</span>
                                        <span className="text-slate-500">{e.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExamSession;
