import React, { useState, useEffect } from 'react';
import { ShieldCheck, Wallet, User, Brain, Link, BarChart2, CheckCircle, XCircle, ArrowRight, Cpu, Database, Zap, AlertCircle, Lock, Eye, EyeOff, FileCheck, UserCheck } from 'lucide-react';
import { ethers } from 'ethers';
import ExamSystemABI from '../ExamSystem.json';
import { CONTRACT_ADDRESS } from '../config';

const ROLES = [
    { id: 0, label: 'Student', subtitle: 'Exam Candidate', icon: '\uD83C\uDF93', color: 'blue' },
    { id: 1, label: 'Administrator', subtitle: 'System Admin', icon: '\uD83D\uDC68\u200D\uD83D\uDCBC', color: 'purple' },
];

const Landing = ({ onLogin }) => {
    const [tab, setTab] = useState('login'); // 'login' | 'signup'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [connectedWallet, setConnectedWallet] = useState('');
    const [showRegister, setShowRegister] = useState(false);
    const [name, setName] = useState('');
    const [role, setRole] = useState(0);
    const [showPw, setShowPw] = useState(false);
    const [policyAccepted, setPolicyAccepted] = useState(false);

    // Signup form state (UI-only metadata; wallet + matric are the real identity)
    const [signupForm, setSignupForm] = useState({ fullName: '', email: '', staffId: '', password: '', confirmPassword: '' });
    const [matricNumber, setMatricNumber] = useState('');
    const [enrollmentInfo, setEnrollmentInfo] = useState(null); // { matricNumber, allowedRole }

    useEffect(() => {
        if (!window.ethereum) return;
        let alive = true;

        const syncWallet = async () => {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (!alive) return;
                setConnectedWallet(accounts?.[0] || '');
            } catch (_) { }
        };

        const onAccountsChanged = (accounts) => setConnectedWallet(accounts?.[0] || '');

        syncWallet();
        window.ethereum.on?.('accountsChanged', onAccountsChanged);
        return () => {
            alive = false;
            window.ethereum.removeListener?.('accountsChanged', onAccountsChanged);
        };
    }, []);

    const connectWallet = async (authMode = 'login') => {
        setLoading(true);
        setError('Initialising...');
        try {
            let signer, provider, address;
            if (!window.ethereum) { setError('Please install MetaMask!'); setLoading(false); return; }
            setError('Awaiting MetaMask...');
            const GANACHE_CHAIN_ID = '0x539';
            const GANACHE_PARAMS = {
                chainId: GANACHE_CHAIN_ID,
                chainName: 'Ganache Local',
                rpcUrls: ['http://127.0.0.1:7545'],
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            };
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GANACHE_CHAIN_ID }] });
            } catch (switchErr) {
                if (switchErr.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [GANACHE_PARAMS],
                        });
                    } catch (addErr) {
                        const addMsg = (addErr?.message || '').toLowerCase();
                        const alreadyExists = addMsg.includes('already exists');
                        if (!alreadyExists) throw addErr;
                    }
                    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GANACHE_CHAIN_ID }] });
                } else {
                    throw switchErr;
                }
            }
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send('eth_requestAccounts', []);
            signer = await provider.getSigner();
            address = await signer.getAddress();
            setConnectedWallet(address);

            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            setError('Verifying identity...');
            const userData = await contract.users(address);
            if (userData[3]) {  // isRegistered is now index 3
                if (authMode === 'signup') {
                    setError('This wallet is already registered. Switch to Login.');
                    setLoading(false);
                    return;
                }
                onLogin({ address, name: userData[0], role: Number(userData[2]), signer });
            } else {
                const enrollment = await contract.getEnrollment(address);

                if (authMode === 'login') {
                    setError('This wallet is not registered yet. Switch to Sign Up first.');
                    setLoading(false);
                    return;
                }

                const fullName = signupForm.fullName.trim();
                const staffId = signupForm.staffId.trim();
                const password = signupForm.password || '';
                const confirmPassword = signupForm.confirmPassword || '';
                if (!fullName) {
                    setError('Enter your full name before connecting wallet.');
                    setLoading(false);
                    return;
                }
                if (!staffId) {
                    setError('Enter your matric / staff ID before connecting wallet.');
                    setLoading(false);
                    return;
                }
                if (password.length < 6) {
                    setError('Password must be at least 6 characters.');
                    setLoading(false);
                    return;
                }
                if (password !== confirmPassword) {
                    setError('Password and confirm password do not match.');
                    setLoading(false);
                    return;
                }

                if (enrollment[2]) {
                    setEnrollmentInfo({ matricNumber: enrollment[0], allowedRole: Number(enrollment[1]) });
                } else {
                    setEnrollmentInfo(null);
                }
                setName(fullName);
                setMatricNumber(staffId);
                setError('');
                setShowRegister(true);
                window.tempSigner = signer;
            }
        } catch (err) {
            console.error(err);
            setError('Failed: ' + (err.reason || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!name) return;
        if (!matricNumber) return setError('Please enter your matric / staff ID.');
        if (enrollmentInfo && matricNumber !== enrollmentInfo.matricNumber) {
            return setError('Matric number does not match enrollment record. Contact your administrator.');
        }
        setLoading(true);
        try {
            const signer = window.tempSigner;
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const selectedRole = enrollmentInfo ? enrollmentInfo.allowedRole : role;
            const tx = await contract.registerUser(name, matricNumber, selectedRole);
            await tx.wait();
            const address = await signer.getAddress();
            const userData = await contract.users(address);
            onLogin({ address, name: userData[0], role: Number(userData[2]), signer });
        } catch (err) {
            console.error(err);
            setError('Registration failed: ' + (err.reason || err.message));
        } finally {
            setLoading(false);
        }
    };

    // --- Blockchain Registration Modal ---
    if (showRegister) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0a0f1e]/95 backdrop-blur-sm">
                <div className="bg-[#111827] border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-blue-900/40 border border-blue-700/50 rounded-xl flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Register Blockchain Identity</h2>
                            <p className="text-slate-400 text-xs">Your profile will be stored immutably on-chain.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Enrollment status banner */}
                        {enrollmentInfo && (
                            <div className="bg-green-900/30 border border-green-600/40 rounded-xl p-3 flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-green-300 text-xs font-bold">Wallet Pre-Enrolled</p>
                                    <p className="text-green-400/70 text-[10px] mt-0.5">
                                        Assigned role: <span className="font-bold text-green-300">{['Student', 'Administrator', 'Invigilator', 'Validator'][enrollmentInfo.allowedRole]}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                            <input
                                type="text" value={name} onChange={e => setName(e.target.value)}
                                className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                                placeholder="e.g. Dr. John Smith"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Matric / Staff ID</label>
                            <input
                                type="text" value={matricNumber} onChange={e => setMatricNumber(e.target.value)}
                                className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                                placeholder="e.g. UNI/2024/001"
                            />
                            <p className="text-slate-500 text-[10px] mt-1">
                                {enrollmentInfo
                                    ? 'Must match the ID your administrator registered for this wallet.'
                                    : 'For open signup, this ID will be bound to your wallet at registration.'}
                            </p>
                        </div>

                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                            {enrollmentInfo ? (
                                <>
                                    <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">Assigned Role (set by Admin)</p>
                                    <p className="text-white font-bold text-sm mt-1">
                                        {['Student', 'Administrator', 'Invigilator', 'Validator'][enrollmentInfo.allowedRole]}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-2">Select Role</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {ROLES.map(r => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => setRole(r.id)}
                                                className={`p-2 rounded-lg border text-left transition ${role === r.id ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                                            >
                                                <span className="text-xs font-bold">{r.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-700/30 rounded-lg p-2">{error}</p>}

                        <button onClick={handleRegister} disabled={loading || !name || !matricNumber}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
                            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><FileCheck className="w-4 h-4" /> Register &amp; Enter System</>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- Main Landing Page ---
    return (
        <div className="min-h-screen bg-[#0a0f1e] text-white font-sans">

            {/* -- NAV -- */}
            <nav className="fixed top-0 w-full z-40 bg-[#0a0f1e]/90 backdrop-blur-md border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-7 h-7 text-blue-400" />
                        <div>
                            <span className="font-black text-white tracking-tight text-sm">SecureExam</span>
                            <span className="text-blue-400 font-black text-sm"> Chain</span>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                        <a href="#ai-model" className="hover:text-white transition">AI Model</a>
                        <a href="#blockchain" className="hover:text-white transition">Blockchain</a>
                        <a href="#comparison" className="hover:text-white transition">Research</a>
                        <a href="#login" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-white transition">Access System</a>
                    </div>
                </div>
            </nav>

            {/* -- HERO -- */}
            <section className="min-h-screen flex items-center justify-center px-6 pt-20 relative overflow-hidden bg-gradient-to-br from-[#0a0f1e] via-[#0d1535] to-[#0a0f1e]">
                <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-blue-900/20 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-900/15 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 border border-blue-700/40 bg-blue-900/20 rounded-full px-4 py-1.5 mb-8 text-blue-300 text-xs font-semibold uppercase tracking-wider">
                        <Lock className="w-3.5 h-3.5" />
                        PhD Research Project &middot; University Dissertation
                    </div>

                    <h1 className="text-4xl md:text-6xl font-black leading-tight mb-6 tracking-tight">
                        Artificial Intelligence for{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Real-Time Detection</span>{' '}

                        of Examination Fraud via{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Blockchain Technology</span>
                    </h1>

                    <p className="text-base text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">
                        A novel approach combining <strong className="text-slate-200">Convolutional Neural Networks (CNN)</strong> for behavioural anomaly detection with <strong className="text-slate-200">Ethereum Smart Contracts</strong> for immutable, tamper-proof fraud evidence storage.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <a href="#login" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2 hover:scale-105 active:scale-95">
                            Access System <ArrowRight className="w-5 h-5" />
                        </a>
                        <a href="#ai-model" className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold px-8 py-4 rounded-xl transition-all flex items-center justify-center gap-2">
                            View Research
                        </a>
                    </div>

                    <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
                        {[
                            { label: 'AI Accuracy', value: '94.3%', icon: '\uD83C\uDFAF' },
                            { label: 'Detection Latency', value: '<200ms', icon: '\u26A1' },
                            { label: 'Blockchain Immutability', value: '100%', icon: '\uD83D\uDD12' },
                            { label: 'Evidence Storage', value: 'On-Chain', icon: '\u26D3\uFE0F' },
                        ].map(s => (
                            <div key={s.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                                <div className="text-2xl mb-1">{s.icon}</div>
                                <div className="text-xl font-black text-blue-400">{s.value}</div>
                                <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* -- AI MODEL -- */}
            <section id="ai-model" className="py-24 px-6 bg-[#0d1535]/60 border-y border-slate-800">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 bg-blue-900/20 border border-blue-700/30 rounded-full px-4 py-2 mb-4 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                            <Brain className="w-4 h-4" /> AI Component
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black mb-4">Deep Learning Model Architecture</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto text-sm">Custom CNN trained on facial and behavioural data to detect fraud events in real-time during examination sessions.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12 items-start">
                        <div>
                            <h3 className="text-base font-bold mb-5 text-blue-400 flex items-center gap-2"><Cpu className="w-4 h-4" /> CNN Architecture</h3>
                            <div className="space-y-2.5">
                                {[
                                    { layer: 'Input', detail: '128x128x3 RGB webcam frame', color: 'bg-blue-600' },
                                    { layer: 'Conv2D x3', detail: '32->64->128 filters, ReLU activation', color: 'bg-indigo-600' },
                                    { layer: 'MaxPool2D', detail: '2x2 pooling after each conv block', color: 'bg-violet-600' },
                                    { layer: 'Dropout 0.5', detail: 'Regularization to prevent overfitting', color: 'bg-purple-600' },
                                    { layer: 'Dense 512', detail: 'Fully connected classification head', color: 'bg-fuchsia-600' },
                                    { layer: 'Sigmoid', detail: 'Binary: Normal (0) vs Fraud (1)', color: 'bg-pink-600' },
                                ].map((l, i) => (
                                    <div key={i} className="flex items-center gap-3 group">
                                        <div className={`${l.color} w-24 text-center text-[10px] font-bold text-white py-2 px-2 rounded-md shrink-0`}>{l.layer}</div>
                                        <div className="flex-1 h-px bg-slate-700" />
                                        <div className="text-slate-400 text-xs">{l.detail}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-base font-bold mb-5 text-blue-400 flex items-center gap-2"><BarChart2 className="w-4 h-4" /> Performance Metrics</h3>
                            <div className="space-y-2.5">
                                {[
                                    { label: 'Dataset', value: 'LFW + Augmented Fraud Scenarios' },
                                    { label: 'Training Split', value: '80% Train / 10% Val / 10% Test' },
                                    { label: 'Optimizer', value: 'Adam (lr=0.001)' },
                                    { label: 'Loss Function', value: 'Binary Cross-Entropy' },
                                    { label: 'Epochs', value: '50 with Early Stopping (patience=5)' },
                                    { label: 'Final Accuracy', value: '94.3% on test set' },
                                ].map(d => (
                                    <div key={d.label} className="flex justify-between items-center py-2 border-b border-slate-800 px-1">
                                        <span className="text-slate-500 text-xs">{d.label}</span>
                                        <span className="text-slate-200 font-semibold text-xs">{d.value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-5 grid grid-cols-3 gap-2.5">
                                {[{ l: 'Precision', v: '93.1%' }, { l: 'Recall', v: '95.7%' }, { l: 'F1 Score', v: '94.4%' }].map(m => (
                                    <div key={m.l} className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-3 text-center">
                                        <div className="text-xl font-black text-blue-400">{m.v}</div>
                                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{m.l}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* -- BLOCKCHAIN -- */}
            <section id="blockchain" className="py-24 px-6 bg-[#0a0f1e]">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 bg-indigo-900/20 border border-indigo-700/30 rounded-full px-4 py-2 mb-4 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                            <Link className="w-4 h-4" /> Blockchain Layer
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black mb-4">Immutable Evidence on Ethereum</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto text-sm">Every fraud event is cryptographically logged as a blockchain transaction - permanent, transparent, and tamper-proof.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12">
                        <div>
                            <h3 className="text-base font-bold mb-5 text-indigo-400 flex items-center gap-2"><Database className="w-4 h-4" /> ExamSystem Smart Contract</h3>
                            <div className="bg-[#0d1535] rounded-xl p-5 font-mono text-xs border border-slate-700">
                                <p className="text-slate-500 mb-2">// ExamSystem.sol (Solidity 0.8.19)</p>
                                <p className="text-indigo-400">contract <span className="text-yellow-400">ExamSystem</span> {'{'}</p>
                                <div className="border-l-2 border-slate-700 ml-3 pl-3 py-1 my-1 space-y-0.5">
                                    <p className="text-slate-400">mapping(address {'=> '} User) public users;</p>
                                    <p className="text-slate-400">Exam[] public exams;</p>
                                    <p className="text-slate-400">FraudEvent[] public fraudHistory;</p>
                                </div>
                                <div className="border-l-2 border-blue-700/40 ml-3 pl-3 py-1 space-y-0.5">
                                    <p className="text-blue-400">function registerUser(name, matricNumber, requestedRole)</p>
                                    <p className="text-blue-400">function createExam(subject, title, data)</p>
                                    <p className="text-blue-400">FraudLog.logFraudEvent(studentHash, score, eventHash)</p>
                                    <p className="text-blue-400">function submitExam(examId, score)</p>
                                </div>
                                <p className="text-indigo-400">{'}'}</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-base font-bold mb-5 text-indigo-400 flex items-center gap-2"><Zap className="w-4 h-4" /> Fraud Event Recording Flow</h3>
                            <div className="space-y-3">
                                {[
                                    { n: '1', t: 'Webcam Captures Frame', d: 'Student camera sampled every 2 seconds during exam.' },
                                    {
                                        n: '2', t: 'AI Service Analyses Frame', d: 'FastAPI runs CNN model -> returns fraud risk score.'
                                    },
                                    {
                                        n: '3', t: 'Score Exceeds Threshold', d: 'If fraud_score > 0.6 -> classified as High Risk.'
                                    },
                                    { n: '4', t: 'Backend Logger Signs Transaction', d: 'Authorised backend wallet logs high-risk event hash to FraudLog contract.' },
                                    { n: '5', t: 'Immutable Record Created', d: 'Block mined. Event hash permanently anchored on-chain.' },
                                ].map(s => (
                                    <div key={s.n} className="flex items-start gap-3">
                                        <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center font-black text-xs shrink-0">{s.n}</div>
                                        <div>
                                            <div className="font-semibold text-xs text-white">{s.t}</div>
                                            <p className="text-slate-500 text-xs mt-0.5">{s.d}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* -- COMPARISON -- */}
            <section id="comparison" className="py-24 px-6 bg-[#0d1535]/40 border-y border-slate-800">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-black mb-4">Research Novelty: System Comparison</h2>
                        <p className="text-slate-400 text-sm">How our proposed system outperforms existing approaches.</p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-900/80">
                                <tr>
                                    <th className="text-left py-3 px-4 text-slate-500 font-semibold uppercase tracking-wider">Feature</th>
                                    <th className="text-center py-3 px-4 text-slate-500 font-semibold">ProctorU</th>
                                    <th className="text-center py-3 px-4 text-slate-500 font-semibold">Moodle/LMS</th>
                                    <th className="text-center py-3 px-4 text-blue-400 font-bold bg-blue-900/10">Our System</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Real-Time AI Detection', false, false, true],
                                    ['Immutable Fraud Records', false, false, true],
                                    ['Decentralised Storage', false, false, true],
                                    ['Smart Contract-Based', false, false, true],
                                    ['Role-Based Access', true, true, true],
                                    ['Tamper-Proof Evidence', false, false, true],
                                ].map(([feature, p, m, ours], i) => (
                                    <tr key={feature} className={`border-b border-slate-800 ${i % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                                        <td className="py-2.5 px-4 text-slate-300 font-medium">{feature}</td>
                                        <td className="py-2.5 px-4 text-center">{p ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto opacity-50" /> : <XCircle className="w-4 h-4 text-slate-700 mx-auto" />}</td>
                                        <td className="py-2.5 px-4 text-center">{m ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto opacity-50" /> : <XCircle className="w-4 h-4 text-slate-700 mx-auto" />}</td>
                                        <td className="py-2.5 px-4 text-center bg-blue-900/5">{ours ? <CheckCircle className="w-4 h-4 text-blue-400 mx-auto" /> : <XCircle className="w-4 h-4 text-red-500 mx-auto" />}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* -- LOGIN / SIGNUP -- */}
            <section id="login" className="py-24 px-6 bg-[#0a0f1e]">
                <div className="max-w-lg mx-auto">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-black mb-2">System Access</h2>
                        <p className="text-slate-500 text-sm">Authenticated via cryptographic wallet signature</p>
                    </div>

                    {/* Security notice */}
                    <div className="bg-amber-950/30 border border-amber-700/30 rounded-xl p-3 mb-6 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-amber-300 text-xs leading-relaxed">
                            All examination activity is monitored and <strong>cryptographically recorded</strong>. This session uses AI-based behavioural analysis.
                        </p>
                    </div>

                    {/* Tab Switch */}
                    <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 mb-6">
                        <button onClick={() => setTab('login')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${tab === 'login' ? 'bg-blue-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                            Login
                        </button>
                        <button onClick={() => setTab('signup')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${tab === 'signup' ? 'bg-blue-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                            Sign Up
                        </button>
                    </div>

                    {/* -- LOGIN TAB -- */}
                    {tab === 'login' && (
                        <div className="bg-[#111827] border border-slate-700 rounded-2xl p-7 space-y-4 shadow-2xl">
                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Wallet-Based Authentication</div>

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Selected Wallet</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={connectedWallet || 'Not connected yet'}
                                    className="w-full bg-[#1a2235] border border-slate-700 text-slate-300 rounded-lg p-2.5 text-xs font-mono outline-none"
                                />
                            </div>

                            <button onClick={() => connectWallet('login')} disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2.5 disabled:opacity-60 text-sm">
                                <Wallet className="w-4 h-4" /> Connect MetaMask
                            </button>

                            {error && (
                                <div className="text-xs rounded-lg py-2.5 px-3 flex items-center gap-2 bg-slate-800 text-slate-300">
                                    {error.includes('Init') || error.includes('Connecting') || error.includes('Funding') || error.includes('Verifying') || error.includes('Awaiting')
                                        ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                        : <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                                    {error}
                                </div>
                            )}

                            <p className="text-[10px] text-slate-600 text-center pt-1 border-t border-slate-800">
                                Session monitored by AI-based behavioural analysis
                            </p>
                        </div>
                    )}

                    {/* -- SIGNUP TAB -- */}
                    {tab === 'signup' && (
                        <div className="bg-[#111827] border border-slate-700 rounded-2xl p-7 space-y-4 shadow-2xl">
                            <div className="text-xs text-slate-500 bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-center">
                                Registration is completed <strong className="text-slate-300">on-chain</strong> via your wallet. Fill in your details, then connect your wallet below.
                            </div>

                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Selected Wallet</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={connectedWallet || 'Not connected yet'}
                                    className="w-full bg-[#1a2235] border border-slate-700 text-slate-300 rounded-lg p-2.5 text-xs font-mono outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                                    <input type="text" value={signupForm.fullName} onChange={e => setSignupForm(p => ({ ...p, fullName: e.target.value }))}
                                        className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition placeholder:text-slate-600"
                                        placeholder="e.g. John Adebayo Smith" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Institutional Email</label>
                                    <input type="email" value={signupForm.email} onChange={e => setSignupForm(p => ({ ...p, email: e.target.value }))}
                                        className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition placeholder:text-slate-600"
                                        placeholder="user@university.edu" />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Matric / Staff ID</label>
                                    <input type="text" value={signupForm.staffId} onChange={e => setSignupForm(p => ({ ...p, staffId: e.target.value }))}
                                        className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition placeholder:text-slate-600"
                                        placeholder="e.g. UNI/2024/001" />
                                </div>

                                <div className="relative">
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
                                    <input type={showPw ? 'text' : 'password'} value={signupForm.password} onChange={e => setSignupForm(p => ({ ...p, password: e.target.value }))}
                                        className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition placeholder:text-slate-600 pr-8"
                                        placeholder="********" />
                                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-7 text-slate-500 hover:text-slate-300">
                                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
                                    <input type="password" value={signupForm.confirmPassword} onChange={e => setSignupForm(p => ({ ...p, confirmPassword: e.target.value }))}
                                        className="w-full bg-[#1a2235] border border-slate-600 text-white rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none transition placeholder:text-slate-600"
                                        placeholder="********" />
                                </div>
                            </div>

                            {/* Role selector */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Register As</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {ROLES.map(r => (
                                        <button key={r.id} onClick={() => setRole(r.id)}
                                            className={`p-2.5 rounded-lg border text-left transition-all ${role === r.id ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                                            <span className="text-base mr-1.5">{r.icon}</span>
                                            <span className="text-xs font-bold">{r.label}</span>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{r.subtitle}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Policy */}
                            <label className="flex items-start gap-2.5 cursor-pointer group">
                                <input type="checkbox" checked={policyAccepted} onChange={e => setPolicyAccepted(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 accent-blue-500 shrink-0" />
                                <span className="text-xs text-slate-400 leading-relaxed group-hover:text-slate-300 transition">
                                    I accept the <strong className="text-blue-400">Academic Integrity Policy</strong> and understand all examination activity is cryptographically recorded and monitored by AI.
                                </span>
                            </label>

                            <button onClick={() => connectWallet('signup')} disabled={loading || !policyAccepted}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition flex items-center justify-center gap-2.5 disabled:opacity-40 text-sm">
                                <Wallet className="w-4 h-4" /> Connect Wallet & Register
                            </button>

                            {error && (
                                <div className="text-xs bg-red-900/20 border border-red-700/30 rounded-lg py-2.5 px-3 text-red-400 flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* -- FOOTER -- */}
            <footer className="py-6 px-6 border-t border-slate-800 text-center bg-[#0a0f1e]">
                <p className="flex items-center justify-center gap-2 text-slate-600 text-xs">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    SecureExam Chain - PhD Research - React - Solidity - TensorFlow - FastAPI
                </p>
                <p className="mt-1 text-[10px] font-mono text-slate-700">{CONTRACT_ADDRESS}</p>
            </footer>
        </div>
    );
};

export default Landing;
