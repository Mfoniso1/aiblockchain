import { useState } from 'react';
import Landing from './components/Landing';
import ExamSession from './components/ExamSession';
import AdminDashboard from './components/AdminDashboard';
import StudentDashboard from './components/StudentDashboard';
import InvigilatorDashboard from './components/InvigilatorDashboard';
import ResearcherPanel from './components/ResearcherPanel';
import { ShieldCheck, LogOut } from 'lucide-react';

const ROLE_LABELS = {
  0: { label: 'Student', icon: '🎓', color: 'text-blue-400' },
  1: { label: 'Administrator', icon: '🧑‍💼', color: 'text-purple-400' },
  2: { label: 'Invigilator', icon: '👁️', color: 'text-teal-400' },
  3: { label: 'Validator', icon: '🔗', color: 'text-indigo-400' },
};

// Map each role to its home view
const ROLE_HOME = { 0: 'student-dash', 1: 'admin-dash', 2: 'invigilator-dash', 3: 'researcher' };

function App() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);
  const [currentExam, setCurrentExam] = useState(null);

  const handleLogin = (userInfo) => {
    setUser(userInfo);
    setView(ROLE_HOME[userInfo.role] ?? 'student-dash');
  };

  const handleLogout = () => {
    setUser(null);
    setView('landing');
    window.location.reload();
  };

  const goHome = () => {
    if (!user) return;
    setView(ROLE_HOME[user.role] ?? 'student-dash');
  };

  const startExam = (exam) => {
    setCurrentExam(exam);
    setView('exam-session');
  };

  if (view === 'landing') return <Landing onLogin={handleLogin} />;

  const roleInfo = ROLE_LABELS[user?.role] ?? ROLE_LABELS[0];

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans">

      {/* ── HEADER ── */}
      <header className="bg-[#0d1535] border-b border-slate-800 px-6 py-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={goHome}>
          <ShieldCheck className="w-7 h-7 text-blue-400" />
          <div>
            <span className="font-black text-white text-sm tracking-tight">SecureExam</span>
            <span className="text-blue-400 font-black text-sm"> Chain</span>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-4">
            {/* Nav tabs — role-aware */}
            <nav className="flex items-center gap-1 text-xs overflow-x-auto max-w-[48vw]">
              {user.role === 1 && (
                <button onClick={() => setView('admin-dash')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${view === 'admin-dash' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                  Dashboard
                </button>
              )}
              {user.role === 0 && (
                <button onClick={() => setView('student-dash')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${view === 'student-dash' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                  My Exams
                </button>
              )}
              {user.role === 2 && (
                <button onClick={() => setView('invigilator-dash')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${view === 'invigilator-dash' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                  Control Room
                </button>
              )}
              {user.role === 3 && (
                <button onClick={() => setView('researcher')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${view === 'researcher' ? 'bg-indigo-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                  Research Panel
                </button>
              )}
            </nav>

            {/* User pill */}
            <div className="flex items-center gap-2.5 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
              <div className="w-8 h-8 bg-blue-900/60 border border-blue-700/40 rounded-full flex items-center justify-center text-sm">
                {user.name?.charAt(0) ?? '?'}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-bold text-white leading-none">{user.name}</p>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${roleInfo.color}`}>{roleInfo.icon} {roleInfo.label}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                  {user.address?.slice(0, 6)}...{user.address?.slice(-4)}
                </p>
              </div>
            </div>

            <button onClick={handleLogout} title="Disconnect"
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main>
        {view === 'admin-dash' && user?.role === 1 && <AdminDashboard signer={user.signer} />}
        {view === 'student-dash' && user?.role === 0 && <StudentDashboard signer={user.signer} onStartExam={startExam} />}
        {view === 'invigilator-dash' && user?.role === 2 && <InvigilatorDashboard signer={user.signer} user={user} />}
        {view === 'researcher' && user?.role === 3 && <ResearcherPanel signer={user.signer} user={user} />}
        {view === 'exam-session' && (
          <ExamSession
            studentAddress={user?.address}
            signer={user?.signer}
            examData={currentExam}
            onFinish={() => setView(ROLE_HOME[user?.role] ?? 'student-dash')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
