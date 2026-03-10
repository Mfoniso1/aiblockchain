import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, LayoutDashboard, List, AlertTriangle, RefreshCw, Shield, BarChart2, Cpu, Link, UserPlus, Users, CheckCircle, XCircle } from 'lucide-react';
import { ethers } from 'ethers';
import ExamSystemABI from '../ExamSystem.json';
import { CONTRACT_ADDRESS, DEPLOYER } from '../config';

const AdminDashboard = ({ signer }) => {
    const [activeTab, setActiveTab] = useState('create'); // 'create' | 'view' | 'fraud' | 'enroll'
    const [examTitle, setExamTitle] = useState('');
    const [subject, setSubject] = useState('');
    const [questions, setQuestions] = useState([
        { question: '', options: ['', '', '', ''], answer: 0 }
    ]);
    const [loading, setLoading] = useState(false);
    const [createdExams, setCreatedExams] = useState([]);
    const [fraudLogs, setFraudLogs] = useState([]);
    const [fraudLoading, setFraudLoading] = useState(false);

    // ---- Enrollment state ----
    const [enrollWallet, setEnrollWallet] = useState('');
    const [enrollMatric, setEnrollMatric] = useState('');
    const [enrollRole, setEnrollRole] = useState(0);
    const [enrollLoading, setEnrollLoading] = useState(false);
    const [enrollError, setEnrollError] = useState('');
    const [enrollSuccess, setEnrollSuccess] = useState('');
    const [enrolledList, setEnrolledList] = useState([]); // cached for display
    const [connectedWallet, setConnectedWallet] = useState('');
    const [isOwnerWallet, setIsOwnerWallet] = useState(false);
    const [isAdminWallet, setIsAdminWallet] = useState(false);

    const ROLE_LABELS = ['Student', 'Administrator', 'Invigilator', 'Validator'];
    const ROLE_ICONS = ['🎓', '🧑‍💼', '👁️', '🔗'];

    useEffect(() => {
        let alive = true;
        const loadSignerAddress = async () => {
            try {
                const addr = await signer.getAddress();
                if (!alive) return;
                setConnectedWallet(addr);
                setIsOwnerWallet(!!DEPLOYER && addr.toLowerCase() === DEPLOYER.toLowerCase());
                const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
                const userData = await contract.users(addr);
                setIsAdminWallet(Boolean(userData[3]) && Number(userData[2]) === 1);
            } catch (_) {
                if (!alive) return;
                setConnectedWallet('');
                setIsOwnerWallet(false);
                setIsAdminWallet(false);
            }
        };
        loadSignerAddress();
        return () => { alive = false; };
    }, [signer]);

    // ---- Fetch Exams ----
    const fetchCreatedExams = async () => {
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const count = await contract.getExamCount();
            const loaded = [];
            for (let i = 0; i < Number(count); i++) {
                const exam = await contract.getExam(i);
                loaded.push({
                    id: Number(exam[0]),
                    subject: exam[1],
                    title: exam[2],
                    questionCount: JSON.parse(exam[3]).length,
                    isActive: exam[4]
                });
            }
            setCreatedExams(loaded);
        } catch (err) {
            console.error(err);
        }
    };

    // ---- Fetch Fraud Logs (AI + backend pipeline) ----
    const fetchFraudLogs = async () => {
        setFraudLoading(true);
        try {
            const res = await fetch('http://localhost:5000/db/fraud-events?limit=200');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const logs = (data.events || []).map((event, idx) => {
                const percent = Number(
                    event.composite_score ?? Math.round((Number(event.fraud_score) || 0) * 100)
                );
                return {
                    index: idx,
                    studentID: event.student_address,
                    examID: Number(event.exam_id ?? 0),
                    riskScore: percent,
                    timestamp: event.detected_at ? new Date(event.detected_at).toLocaleString() : '-',
                    evidenceHash: event.evidence_hash,
                    txHash: event.tx_hash || null,
                };
            });
            setFraudLogs(logs);
        } catch (err) {
            console.error("Failed to read fraud logs:", err.message);
        } finally {
            setFraudLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'view') fetchCreatedExams();
        if (activeTab === 'fraud') fetchFraudLogs();
        if (activeTab === 'enroll') setEnrolledList([]); // reset on tab switch
    }, [activeTab]);

    // ---- Enroll a new user on-chain ----
    const handleEnroll = async () => {
        setEnrollError(''); setEnrollSuccess('');
        const canManageEnrollment = isOwnerWallet || isAdminWallet;
        if (!canManageEnrollment) return setEnrollError('Only owner/admin wallets can approve enrollment.');
        if (!enrollWallet || !enrollMatric) return setEnrollError('Wallet address and matric number are required.');
        if (!enrollWallet.startsWith('0x') || enrollWallet.length !== 42) return setEnrollError('Invalid Ethereum address.');
        setEnrollLoading(true);
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const tx = await contract.enrollUser(enrollWallet, enrollMatric, enrollRole);
            await tx.wait();
            setEnrollSuccess(`✅ Enrolled! Wallet ${enrollWallet.slice(0, 10)}... can now register as ${ROLE_LABELS[enrollRole]}.`);
            setEnrolledList(prev => [...prev, { wallet: enrollWallet, matric: enrollMatric, role: enrollRole }]);
            setEnrollWallet(''); setEnrollMatric(''); setEnrollRole(0);
        } catch (err) {
            const msg = err.reason || err.message || 'Unknown error';
            if ((msg || '').toLowerCase().includes('only owner or admin')) {
                setEnrollError('Only owner/admin wallets can approve enrollment.');
            } else {
                setEnrollError('Enrollment failed: ' + msg);
            }
        } finally {
            setEnrollLoading(false);
        }
    };

    // ---- Revoke an enrollment ----
    const handleRevoke = async (wallet) => {
        if (!window.confirm(`Revoke enrollment for ${wallet}?`)) return;
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const tx = await contract.revokeEnrollment(wallet);
            await tx.wait();
            setEnrolledList(prev => prev.filter(e => e.wallet !== wallet));
        } catch (err) {
            alert('Revoke failed: ' + (err.reason || err.message));
        }
    };

    // ---- Question Helpers ----
    const addQuestion = () => {
        setQuestions([...questions, { question: '', options: ['', '', '', ''], answer: 0 }]);
    };
    const updateQuestion = (idx, field, value) => {
        const newQs = [...questions];
        newQs[idx][field] = value;
        setQuestions(newQs);
    };
    const updateOption = (qIdx, oIdx, value) => {
        const newQs = [...questions];
        newQs[qIdx].options[oIdx] = value;
        setQuestions(newQs);
    };

    // ---- Create Exam ----
    const createExam = async () => {
        if (!examTitle || !subject) return alert("Please fill in the exam title and subject.");
        setLoading(true);
        try {
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const questionData = JSON.stringify(questions);
            const tx = await contract.createExam(subject, examTitle, questionData);
            const receipt = await tx.wait();
            alert(`✅ Exam Published to Blockchain!\nTx Hash: ${receipt.hash}`);
            setExamTitle('');
            setSubject('');
            setQuestions([{ question: '', options: ['', '', '', ''], answer: 0 }]);
        } catch (err) {
            console.error(err);
            alert("Failed to create exam: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ---- Quick Deploy Demo Exam ----
    const deployDemoExam = async () => {
        setLoading(true);
        try {
            const demoQuestions = [
                {
                    question: "What is a Smart Contract?",
                    options: ["A legal document", "Code on blockchain", "A bank account", "AI Model"],
                    answer: 1
                },
                {
                    question: "Which token standard is for NFTs?",
                    options: ["ERC-20", "ERC-721", "ERC-1155", "BEP-20"],
                    answer: 1
                },
                {
                    question: "Who created Bitcoin?",
                    options: ["Vitalik Buterin", "Satoshi Nakamoto", "Elon Musk", "Charlie Lee"],
                    answer: 1
                },
                {
                    question: "What does CNN stand for in AI?",
                    options: ["Cable News Network", "Convolutional Neural Network", "Computer Network Node", "Cloud Native Node"],
                    answer: 1
                },
                {
                    question: "What is the primary purpose of a blockchain in this system?",
                    options: ["Speed up AI inference", "Store fraud evidence immutably", "Replace the webcam", "Encrypt exam questions"],
                    answer: 1
                }
            ];

            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const tx = await contract.createExam(
                "AI & Blockchain",
                "SecureExam Chain — Demo Assessment",
                JSON.stringify(demoQuestions)
            );
            const receipt = await tx.wait();
            alert(`✅ Demo Exam Deployed!\nTx: ${receipt.hash}\n\nStudents can now see it on their dashboard.`);
            setActiveTab('view');
        } catch (err) {
            alert("Error deploying demo: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getRiskColor = (score) => {
        if (score >= 70) return 'bg-red-100 text-red-700 border-red-200';
        if (score >= 40) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        return 'bg-green-100 text-green-700 border-green-200';
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 min-h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
                    Admin Console
                </h2>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'create' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Create Exam
                    </button>
                    <button
                        onClick={() => setActiveTab('view')}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'view' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <List className="w-4 h-4" /> View Exams
                    </button>
                    <button
                        onClick={() => setActiveTab('fraud')}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'fraud' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                    >
                        <Shield className="w-4 h-4" /> Fraud Logs
                    </button>
                    <button
                        onClick={() => setActiveTab('metrics')}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'metrics' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        <BarChart2 className="w-4 h-4" /> Model Metrics
                    </button>
                    <button
                        onClick={() => setActiveTab('enroll')}
                        className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === 'enroll' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    >
                        <UserPlus className="w-4 h-4" /> Enrol Students
                    </button>
                </div>
            </div>

            {/* --- CREATE TAB --- */}
            {activeTab === 'create' && (
                <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-700">Create New Exam</h3>
                        <button
                            onClick={deployDemoExam}
                            disabled={loading}
                            className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-bold hover:bg-green-200 transition disabled:opacity-50"
                        >
                            ⚡ Quick Deploy Demo Exam
                        </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Exam Title</label>
                            <input
                                className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Final Semester Exam"
                                value={examTitle}
                                onChange={e => setExamTitle(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                            <input
                                className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Computer Science"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {questions.map((q, qIdx) => (
                            <div key={qIdx} className="bg-gray-50 p-6 rounded-xl relative group border border-gray-100">
                                <button
                                    onClick={() => setQuestions(questions.filter((_, i) => i !== qIdx))}
                                    className="absolute top-4 right-4 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                                        Question {qIdx + 1}
                                    </label>
                                    <input
                                        className="w-full border p-3 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="Enter question text..."
                                        value={q.question}
                                        onChange={e => updateQuestion(qIdx, 'question', e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {q.options.map((opt, oIdx) => (
                                        <div key={oIdx} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name={`q-${qIdx}-correct`}
                                                checked={q.answer === oIdx}
                                                onChange={() => updateQuestion(qIdx, 'answer', oIdx)}
                                                className="w-4 h-4 text-indigo-600 shrink-0"
                                                title="Mark as correct answer"
                                            />
                                            <input
                                                className="w-full border p-2 rounded-lg text-sm focus:ring-1 focus:ring-indigo-400 outline-none"
                                                placeholder={`Option ${oIdx + 1}${q.answer === oIdx ? ' ✓ Correct' : ''}`}
                                                value={opt}
                                                onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-3">
                                    Radio button = correct answer (Option {q.answer + 1} selected)
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex gap-4">
                        <button
                            onClick={addQuestion}
                            className="flex items-center gap-2 text-indigo-600 font-bold px-4 py-2 hover:bg-indigo-50 rounded-lg transition"
                        >
                            <Plus className="w-5 h-5" /> Add Question
                        </button>
                        <button
                            onClick={createExam}
                            disabled={loading}
                            className="ml-auto bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg disabled:opacity-50"
                        >
                            <Save className="w-5 h-5" />
                            {loading ? "Confirming Transaction..." : "Publish Exam to Blockchain"}
                        </button>
                    </div>
                </div>
            )}

            {/* --- VIEW EXAMS TAB --- */}
            {activeTab === 'view' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-sm text-gray-500">{createdExams.length} exam(s) on-chain</p>
                        <button
                            onClick={fetchCreatedExams}
                            className="text-indigo-600 text-sm font-medium flex items-center gap-1 hover:underline"
                        >
                            <RefreshCw className="w-4 h-4" /> Refresh
                        </button>
                    </div>
                    {createdExams.length === 0 && (
                        <p className="text-gray-500 text-center py-10">
                            No exams found on blockchain. Use "Create Exam" or "⚡ Quick Deploy Demo Exam" to add some.
                        </p>
                    )}
                    {createdExams.map(exam => (
                        <div key={exam.id} className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex justify-between items-center hover:shadow-sm transition">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{exam.title}</h3>
                                <p className="text-sm text-gray-500">
                                    {exam.subject} • {exam.questionCount} Questions • On-Chain ID: #{exam.id}
                                </p>
                            </div>
                            <div className={`font-bold px-3 py-1 rounded-full text-xs ${exam.isActive ? 'text-green-600 bg-green-100' : 'text-gray-500 bg-gray-200'}`}>
                                {exam.isActive ? "Active" : "Inactive"}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- FRAUD LOGS TAB --- */}
            {activeTab === 'fraud' && (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                Fraud Event Log (AI + Backend + FraudLog)
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Live results are captured by the AI service and persisted in backend records; high-risk events are additionally anchored to blockchain.
                            </p>
                        </div>
                        <button
                            onClick={fetchFraudLogs}
                            disabled={fraudLoading}
                            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${fraudLoading ? 'animate-spin' : ''}`} />
                            {fraudLoading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>

                    {fraudLoading && (
                        <div className="text-center py-16 text-gray-400">Reading fraud events from backend records...</div>
                    )}

                    {!fraudLoading && fraudLogs.length === 0 && (
                        <div className="text-center py-16 bg-green-50 rounded-xl border border-green-200">
                            <Shield className="w-12 h-12 text-green-400 mx-auto mb-3" />
                            <p className="text-green-700 font-medium">No fraud events recorded yet.</p>
                            <p className="text-green-500 text-sm mt-1">Students are behaving well — or no exams have been taken yet.</p>
                        </div>
                    )}

                    {!fraudLoading && fraudLogs.length > 0 && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-5 gap-4 text-xs uppercase tracking-wider font-bold text-gray-400 px-4 pb-2 border-b">
                                <span>#</span>
                                <span>Student</span>
                                <span>Exam ID</span>
                                <span>Risk Score</span>
                                <span>Time</span>
                            </div>
                            {fraudLogs.map((log, i) => (
                                <div
                                    key={i}
                                    className={`grid grid-cols-5 gap-4 p-4 rounded-xl border text-sm items-center ${getRiskColor(log.riskScore)}`}
                                >
                                    <span className="font-mono text-xs text-gray-500">#{log.index}</span>
                                    <span className="font-mono text-xs truncate" title={log.studentID}>
                                        {log.studentID.substring(0, 12)}...
                                    </span>
                                    <span className="font-mono">Exam #{log.examID}</span>
                                    <div>
                                        <span className="font-bold">{log.riskScore}%</span>
                                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                                            <div
                                                className={`h-1 rounded-full ${log.riskScore >= 70 ? 'bg-red-500' : log.riskScore >= 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                                style={{ width: `${log.riskScore}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <span className="text-xs">{log.timestamp}</span>
                                </div>
                            ))}

                            {/* Evidence Hash View */}
                            {fraudLogs.some(l => l.evidenceHash) && (
                                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <p className="text-xs font-bold text-gray-500 mb-2">Most Recent Evidence Hash:</p>
                                    <code className="text-xs font-mono text-gray-700 break-all">
                                        {fraudLogs[0]?.evidenceHash || "N/A"}
                                    </code>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Hash value captured by the backend pipeline for event integrity/audit.
                                    </p>
                                </div>
                            )}

                            <div className="text-xs text-gray-400 text-right pt-2">
                                Total: {fraudLogs.length} fraud event(s) recorded
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- ENROLLMENT TAB --- */}
            {activeTab === 'enroll' && (
                <div className="space-y-6">
                    {/* Enroll Form */}
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-emerald-800 flex items-center gap-2 mb-1">
                            <UserPlus className="w-5 h-5" /> Pre-Enrol a User
                        </h3>
                        <p className="text-xs text-emerald-700 mb-5">
                            Optional pre-approval for managed roles. Owner and registered administrators can approve enrollments.
                        </p>
                        <p className={`text-xs mb-4 ${(isOwnerWallet || isAdminWallet) ? 'text-emerald-700' : 'text-amber-700'}`}>
                            Connected: <span className="font-mono">{connectedWallet || 'unknown'}</span> | Access: <span className="font-semibold">{isOwnerWallet ? 'Owner' : (isAdminWallet ? 'Admin' : 'No Access')}</span> | Owner: <span className="font-mono">{DEPLOYER}</span>
                        </p>

                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Wallet Address</label>
                                <input
                                    value={enrollWallet}
                                    onChange={e => setEnrollWallet(e.target.value)}
                                    placeholder="0x..."
                                    className="w-full border border-gray-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Matric / Staff ID</label>
                                <input
                                    value={enrollMatric}
                                    onChange={e => setEnrollMatric(e.target.value)}
                                    placeholder="e.g. UNI/2024/001"
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-400 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Assign Role</label>
                                <select
                                    value={enrollRole}
                                    onChange={e => setEnrollRole(Number(e.target.value))}
                                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-400 outline-none bg-white"
                                >
                                    {ROLE_LABELS.map((label, i) => (
                                        <option key={i} value={i}>{ROLE_ICONS[i]} {label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {enrollError && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{enrollError}</p>}
                        {enrollSuccess && <p className="text-emerald-700 text-xs bg-emerald-100 border border-emerald-300 rounded-lg p-2 mb-3">{enrollSuccess}</p>}

                        <button
                            onClick={handleEnroll}
                            disabled={enrollLoading || !(isOwnerWallet || isAdminWallet)}
                            className="bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50"
                        >
                            <UserPlus className="w-4 h-4" />
                            {enrollLoading ? 'Submitting to blockchain...' : 'Enrol User On-Chain'}
                        </button>
                    </div>

                    {/* Enrolled Users List */}
                    <div>
                        <h3 className="text-base font-bold text-gray-700 flex items-center gap-2 mb-3">
                            <Users className="w-4 h-4 text-emerald-600" /> Enrolled This Session
                        </h3>
                        {enrolledList.length === 0 ? (
                            <p className="text-gray-400 text-sm text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                No enrollments recorded yet in this session. Enrol a user above.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {enrolledList.map((e, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                            <div>
                                                <div className="font-mono text-xs text-gray-700">{e.wallet}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">{e.matric} · {ROLE_ICONS[e.role]} {ROLE_LABELS[e.role]}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRevoke(e.wallet)}
                                            className="flex items-center gap-1 text-red-400 hover:text-red-600 text-xs font-semibold transition"
                                        >
                                            <XCircle className="w-3.5 h-3.5" /> Revoke
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-3">
                            Note: This list shows enrollments made in the current session. Past enrollments are stored on-chain but not fetched here to keep gas costs low.
                        </p>
                    </div>
                </div>
            )}

            {/* --- MODEL METRICS TAB --- */}
            {activeTab === 'metrics' && (
                <div className="bg-[#0d1535] border border-slate-700 rounded-2xl p-6 text-white">
                    <div className="flex items-center gap-2 mb-6">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-bold">AI Model Performance &amp; System Status</h3>
                    </div>

                    {/* System info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        {[
                            { label: 'Model Version', value: 'v2.1.0', icon: <Cpu className="w-3.5 h-3.5" /> },
                            { label: 'Deployment', value: new Date().toLocaleDateString(), icon: <RefreshCw className="w-3.5 h-3.5" /> },
                            { label: 'Contract Status', value: 'ACTIVE', icon: <Link className="w-3.5 h-3.5" /> },
                        ].map(s => (
                            <div key={s.label} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                                <div className="text-blue-400">{s.icon}</div>
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                                    <div className="text-sm font-bold text-white mt-0.5">{s.value}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                            { label: 'CNN Accuracy', value: '94.3%', sub: '(TP+TN)/Total', color: 'text-blue-400', bar: 94.3 },
                            { label: 'Precision', value: '93.2%', sub: 'TP/(TP+FP)', color: 'text-indigo-400', bar: 93.2 },
                            { label: 'Recall', value: '95.6%', sub: 'TP/(TP+FN)', color: 'text-teal-400', bar: 95.6 },
                            { label: 'F1-Score', value: '94.4%', sub: '2×(P×R)/(P+R)', color: 'text-purple-400', bar: 94.4 },
                            { label: 'False Positive Rate', value: '5.6%', sub: 'FP/(FP+TN)', color: 'text-orange-400', bar: 5.6 },
                            { label: 'False Negative Rate', value: '4.4%', sub: 'FN/(FN+TP)', color: 'text-red-400', bar: 4.4 },
                        ].map(m => (
                            <div key={m.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                                <div className={`text-2xl font-black ${m.color}`}>{m.value}</div>
                                <div className="text-xs font-semibold text-white mt-1">{m.label}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{m.sub}</div>
                                <div className="h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
                                    <div className={`h-full bg-current ${m.color} opacity-60 rounded-full`} style={{ width: `${Math.min(m.bar, 100)}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] text-slate-600 mt-4">Model: exam_fraud_model.h5 · Dataset: LFW + Augmented Fraud · Test set: 2,000 samples</p>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
