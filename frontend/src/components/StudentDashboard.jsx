import React, { useState, useEffect } from 'react';
import { Play, Book, Search, Clock } from 'lucide-react';
import { ethers } from 'ethers';
import ExamSystemABI from '../ExamSystem.json';
import { CONTRACT_ADDRESS } from '../config';

const StudentDashboard = ({ signer, onStartExam }) => {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchExams();
    }, [signer]);

    const fetchExams = async () => {
        try {
            if (!signer) return; // Wait for signer
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ExamSystemABI.abi, signer);
            const count = await contract.getExamCount();

            const loadedExams = [];
            // Fetch latest 5 exams
            for (let i = 0; i < Number(count); i++) {
                const exam = await contract.getExam(i);
                // exam structure: [id, subject, title, questionData, isActive]
                loadedExams.push({
                    id: Number(exam[0]),
                    subject: exam[1],
                    title: exam[2],
                    questionData: exam[3],
                    isActive: exam[4]
                });
            }
            setExams(loadedExams);
        } catch (err) {
            console.error("Failed to fetch exams", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-[calc(100vh-100px)] p-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome back, Student</h1>
                    <p className="text-gray-500">Ready to prove your skills? Select an active exam below.</p>
                </header>

                <div className="flex gap-4 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                        <input
                            className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Search exams by subject..."
                        />
                    </div>
                    <button className="bg-white border border-gray-200 px-6 rounded-xl font-medium text-gray-600 hover:bg-gray-50">
                        Filter
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-gray-400">Loading exams from blockchain...</div>
                ) : exams.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Book className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-500">No exams available yet.</h3>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {exams.map((exam) => (
                            <div key={exam.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition group text-left">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                        {exam.subject}
                                    </span>
                                    {exam.isActive && (
                                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            Live
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-indigo-600 transition">
                                    {exam.title}
                                </h3>

                                <div className="flex items-center gap-4 text-sm text-gray-500 mb-8">
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" /> 45 Mins
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Book className="w-4 h-4" /> {JSON.parse(exam.questionData).length} Questions
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <button
                                        onClick={() => onStartExam(exam)}
                                        className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 group-hover:bg-indigo-600 transition"
                                    >
                                        Start Exam <Play className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentDashboard;
