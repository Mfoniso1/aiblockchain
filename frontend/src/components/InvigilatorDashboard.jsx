import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Eye, AlertTriangle, Activity, Users, Flag, Lock,
    FileText, Camera, TrendingUp, ChevronRight, X, Clock, CheckCircle, RefreshCw
} from 'lucide-react';

/**
 * InvigilatorDashboard — real-time student monitoring
 *
 * Data source: GET http://localhost:5000/db/fraud-events (SQLite — live polling every 5s)
 * Groups fraud events by student_address to build per-student risk cards.
 * Falls back to empty state (no fake data).
 */

const RISK_CONFIG = {
    Low: { label: 'LOW RISK', bg: 'bg-green-900/30', border: 'border-green-700/40', text: 'text-green-400', bar: 'bg-green-500' },
    Moderate: { label: 'MODERATE', bg: 'bg-yellow-900/30', border: 'border-yellow-700/40', text: 'text-yellow-400', bar: 'bg-yellow-500' },
    High: { label: 'HIGH RISK', bg: 'bg-red-900/30', border: 'border-red-700/40', text: 'text-red-400', bar: 'bg-red-500' },
    fallback: { label: 'UNKNOWN', bg: 'bg-slate-800/30', border: 'border-slate-700/40', text: 'text-slate-400', bar: 'bg-slate-500' },
};

/** Aggregate flat fraud event rows into per-student summary objects */
function buildStudentMap(events) {
    const map = {};
    for (const e of events) {
        const addr = e.student_address || 'unknown';
        if (!map[addr]) {
            map[addr] = {
                id: addr,
                name: addr.slice(0, 6) + '...' + addr.slice(-4),
                events: 0,
                maxScore: 0,
                latestRisk: 'Low',
                latestAt: null,
                history: [],
                status: 'active',
            };
        }
        const s = map[addr];
        s.events++;
        const score = Math.round((e.fraud_score ?? 0) * 100);
        if (score > s.maxScore) s.maxScore = score;
        s.latestRisk = e.risk_label || 'Low';
        s.latestAt = e.detected_at;
        s.history.push({ score, time: e.detected_at });
    }
    return Object.values(map);
}

/** Mini SVG sparkline from a student's score history */
function Sparkline({ history, risk }) {
    const pts = history.slice(-20).map(h => h.score);
    if (pts.length < 2) return <div className="h-14 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-center text-[10px] text-slate-600">No data</div>;
    const max = Math.max(...pts, 1);
    const W = 180, H = 60;
    const points = pts.map((y, x) =>
        `${(x / (pts.length - 1)) * W},${H - (y / max) * (H - 4) - 2}`
    ).join(' ');
    const color = risk === 'High' ? '#ef4444' : risk === 'Moderate' ? '#eab308' : '#22c55e';
    return (
        <div className="bg-slate-900 rounded-lg p-2 border border-slate-800">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14">
                <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" />
                <text x="1" y="9" fill="#64748b" fontSize="7">High Risk</text>
                <text x="1" y={H - 2} fill="#64748b" fontSize="7">Safe</text>
            </svg>
        </div>
    );
}

const InvigilatorDashboard = ({ signer, user }) => {
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [flagged, setFlagged] = useState(new Set());
    const [frozen, setFrozen] = useState(new Set());
    const [reportMsg, setReportMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(null);

    // ── Fetch real fraud events from backend (SQLite) ──────────────────────────
    const fetchData = useCallback(async () => {
        try {
            const res = await axios.get('http://localhost:5000/db/fraud-events?limit=200', { timeout: 5000 });
            const events = res.data?.events ?? [];
            const built = buildStudentMap(events);
            setStudents(built);
            setLastRefresh(new Date());
        } catch (e) {
            console.warn('Could not fetch fraud events:', e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch + poll every 5 s
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const totalAlerts = students.reduce((a, s) => a + s.events, 0);
    const highRisk = students.filter(s => s.latestRisk === 'High').length;

    const handleFlag = (id) => setFlagged(f => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const handleFreeze = (id) => setFrozen(f => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const handleReport = (student) => {
        const report = [
            'INCIDENT REPORT', '================',
            `Student Wallet : ${student.id}`,
            `Fraud Events   : ${student.events}`,
            `Max Risk Score : ${student.maxScore}%`,
            `Latest Risk    : ${student.latestRisk}`,
            `Last Detected  : ${student.latestAt ?? 'N/A'}`,
            `Generated      : ${new Date().toLocaleString()}`,
            '',
            'This report is based on live blockchain + AI monitoring data.',
        ].join('\n');
        const blob = new Blob([report], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `incident_${student.id.slice(0, 10)}.txt`;
        a.click();
        setReportMsg(`Report generated for ${student.name}`);
        setTimeout(() => setReportMsg(''), 3000);
    };

    return (
        <div className="min-h-screen bg-[#0a0f1e] p-6">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <Camera className="w-5 h-5 text-teal-400" />
                    <h1 className="text-xl font-black text-white">Invigilator Control Room</h1>
                    <div className="flex items-center gap-1.5 ml-3 bg-green-900/30 border border-green-700/30 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-green-400 text-[10px] font-bold uppercase tracking-wider">Live Monitoring</span>
                    </div>
                    <button onClick={fetchData} className="ml-auto text-slate-500 hover:text-teal-400 transition p-1.5 rounded-lg hover:bg-teal-900/20">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
                <p className="text-slate-500 text-xs">
                    Real-time oversight — data from AI proctoring engine &amp; SQLite.
                    {lastRefresh && <span className="ml-2 text-slate-600">Last refreshed: {lastRefresh.toLocaleTimeString()}</span>}
                </p>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Students Seen', value: students.length, icon: <Users className="w-4 h-4" />, color: 'text-blue-400' },
                    { label: 'Total Alerts', value: totalAlerts, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400' },
                    { label: 'High Risk', value: highRisk, icon: <Activity className="w-4 h-4" />, color: 'text-orange-400' },
                    { label: 'Flagged', value: flagged.size, icon: <Flag className="w-4 h-4" />, color: 'text-yellow-400' },
                ].map(s => (
                    <div key={s.label} className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                        <div className={`${s.color} opacity-70`}>{s.icon}</div>
                        <div>
                            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {reportMsg && (
                <div className="mb-4 bg-teal-900/30 border border-teal-700/40 rounded-lg px-4 py-2.5 text-teal-300 text-xs flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5" /> {reportMsg}
                </div>
            )}

            {/* Loading / empty */}
            {loading && (
                <div className="text-center py-20 text-slate-500 text-sm">
                    <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    Fetching live monitoring data...
                </div>
            )}
            {!loading && students.length === 0 && (
                <div className="text-center py-20 bg-[#111827] border border-dashed border-slate-700 rounded-2xl">
                    <Activity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm font-medium">No proctoring events yet.</p>
                    <p className="text-slate-600 text-xs mt-1">Data appears here as students sit exams and the AI service flags events.</p>
                </div>
            )}

            {/* Main grid */}
            {!loading && students.length > 0 && (
                <div className="flex gap-6">
                    {/* Student Cards */}
                    <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start`}>
                        {students.map((s) => {
                            const risk = s.latestRisk in RISK_CONFIG ? s.latestRisk : 'Low';
                            const cfg = RISK_CONFIG[risk];
                            const isFlagged = flagged.has(s.id);
                            const isFrozen = frozen.has(s.id);
                            return (
                                <div key={s.id} onClick={() => setSelected(s)}
                                    className={`bg-[#111827] border-2 rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01] ${cfg.border} ${risk === 'High' ? 'shadow-lg shadow-red-900/20' : ''} ${selected?.id === s.id ? 'ring-2 ring-teal-500' : ''}`}>

                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="font-bold text-white text-sm flex items-center gap-1.5">
                                                {isFlagged && <Flag className="w-3 h-3 text-orange-400" />}
                                                {isFrozen && <Lock className="w-3 h-3 text-blue-400" />}
                                                {s.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.latestAt ? new Date(s.latestAt).toLocaleTimeString() : '—'}</div>
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                                            {cfg.label}
                                        </span>
                                    </div>

                                    {/* Fraud score bar */}
                                    <div className="mb-2">
                                        <div className="flex justify-between text-[10px] mb-1">
                                            <span className="text-slate-500">Max Fraud Risk Score</span>
                                            <span className={`font-bold ${cfg.text}`}>{s.maxScore}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className={`h-full ${cfg.bar} transition-all duration-1000 rounded-full`} style={{ width: `${s.maxScore}%` }} />
                                        </div>
                                    </div>

                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">Fraud events: <span className={s.events > 0 ? 'text-red-400 font-bold' : 'text-slate-600'}>{s.events}</span></span>
                                        <ChevronRight className="w-3 h-3 text-slate-600" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detail Panel */}
                    {selected && (() => {
                        const risk = selected.latestRisk in RISK_CONFIG ? selected.latestRisk : 'Low';
                        const cfg = RISK_CONFIG[risk];
                        return (
                            <div className="w-80 shrink-0 bg-[#111827] border border-slate-800 rounded-xl p-5 self-start sticky top-20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-white text-sm">{selected.name}</h3>
                                    <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white transition">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mb-4 break-all">{selected.id}</div>

                                {/* Behavioural Sparkline */}
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-xs font-semibold text-slate-300">Risk Score History</span>
                                    </div>
                                    <Sparkline history={selected.history} risk={risk} />
                                </div>

                                {/* Fraud events log */}
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        <span className="text-xs font-semibold text-slate-300">Events ({selected.events})</span>
                                    </div>
                                    <div className="space-y-1 max-h-36 overflow-y-auto">
                                        {selected.events === 0 ? (
                                            <div className="text-[10px] text-green-400 bg-green-900/20 border border-green-800/30 rounded p-2 text-center">No fraud events</div>
                                        ) : (
                                            selected.history.slice().reverse().map((h, i) => (
                                                <div key={i} className="flex items-center justify-between bg-red-900/20 border border-red-800/30 rounded p-2 text-[10px]">
                                                    <span className={`font-bold ${h.score >= 60 ? 'text-red-400' : 'text-yellow-400'}`}>{h.score}% risk</span>
                                                    <span className="text-slate-500 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {h.time ? new Date(h.time).toLocaleTimeString() : '—'}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Blockchain note */}
                                <div className="mb-4 bg-indigo-900/20 border border-indigo-700/30 rounded-lg p-3 text-[10px]">
                                    <div className="font-bold text-indigo-300 uppercase tracking-wider mb-1">Blockchain Integrity</div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">High-risk events auto-logged:</span>
                                        <span className="text-green-400 font-bold flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> ON-CHAIN</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2">
                                    <button onClick={() => handleFlag(selected.id)}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition ${flagged.has(selected.id) ? 'bg-orange-900/50 border border-orange-600 text-orange-300' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-orange-600 hover:text-orange-400'}`}>
                                        <Flag className="w-3.5 h-3.5" /> {flagged.has(selected.id) ? 'Unflag Student' : 'Flag Student'}
                                    </button>
                                    <button onClick={() => handleFreeze(selected.id)}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition ${frozen.has(selected.id) ? 'bg-blue-900/50 border border-blue-600 text-blue-300' : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-blue-600 hover:text-blue-400'}`}>
                                        <Lock className="w-3.5 h-3.5" /> {frozen.has(selected.id) ? 'Unfreeze Session' : 'Freeze Session'}
                                    </button>
                                    <button onClick={() => handleReport(selected)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-900/50 transition">
                                        <FileText className="w-3.5 h-3.5" /> Generate Incident Report
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

export default InvigilatorDashboard;
