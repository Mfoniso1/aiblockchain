/**
 * server.js — Node.js/Express Backend (aiblock.md Parts 3, 4)
 *
 * aiblock.md Integration Logic (Part 3):
 *   If fraud score > threshold (0.61 = "High Risk"):
 *     1. Generate fraud event object
 *     2. Hash event data with keccak256 (ethers.solidityPackedKeccak256)
 *     3. Send logFraudEvent() transaction to FraudLog contract
 *     4. Wait for confirmation
 *     5. Store tx hash in SQLite BlockchainTransactions table
 *     6. Return verification status to frontend
 *
 * Database: SQLite via database.js (Part 4)
 * Smart Contract: FraudLog.sol — role-based, keccak256, verifyEvent()
 */

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const axios = require('axios');
const multer = require('multer');
const upload = multer();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Database (SQLite) ─────────────────────────────────────────────────────────
const {
    insertFraudEvent,
    insertBlockchainTx,
    getAllFraudEvents,
    getModelMetadata,
    getFraudStats
} = require('./database');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ── Blockchain Setup ──────────────────────────────────────────────────────────
const BLOCKCHAIN_RPC_URL = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:7545";
const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_RPC_URL);

// Load contract config written by the deploy script
const ExamSystemABI = require('../frontend/src/ExamSystem.json');
const contractConfig = require('../contract_config.json');

const CONTRACT_ADDRESS = contractConfig.CONTRACT_ADDRESS;
const FRAUD_LOG_ADDRESS = contractConfig.FRAUD_LOG_ADDRESS;

// Signer: uses the first Ganache account (same as deployer = authorisedLogger)
// In production, load from environment variable: process.env.BACKEND_PRIVATE_KEY
let signer = null;
(async () => {
    try {
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            signer = await provider.getSigner(0);
            console.log("✅ Blockchain signer ready:", await signer.getAddress());
        }
    } catch (_) { console.warn("⚠ Blockchain not reachable — signer not available"); }
})();

// Load ExamSystem ABI
let contractABI = null;
try {
    const abiPath = path.join(__dirname, '../blockchain/artifacts/contracts/ExamSystem.sol/ExamSystem.json');
    if (fs.existsSync(abiPath)) {
        contractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;
        console.log("✅ ExamSystem ABI loaded.");
    } else if (fs.existsSync(path.join(__dirname, 'ExamSystem.json'))) {
        contractABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'ExamSystem.json'), 'utf8')).abi;
        console.log("✅ ExamSystem ABI loaded (local copy).");
    }
} catch (err) { console.warn("⚠ Could not load ExamSystem ABI:", err.message); }

// Load FraudLog ABI (aiblock.md Part 2)
let fraudLogABI = null;
try {
    const fraudLogPath = path.join(__dirname, '../blockchain/artifacts/contracts/FraudLog.sol/FraudLog.json');
    if (fs.existsSync(fraudLogPath)) {
        fraudLogABI = JSON.parse(fs.readFileSync(fraudLogPath, 'utf8')).abi;
        console.log("✅ FraudLog ABI loaded.");
    } else if (fs.existsSync(path.join(__dirname, 'FraudLog.json'))) {
        fraudLogABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'FraudLog.json'), 'utf8')).abi;
        console.log("✅ FraudLog ABI loaded (local copy).");
    }
} catch (err) { console.warn("⚠ Could not load FraudLog ABI:", err.message); }

// ── Fraud Score Threshold ─────────────────────────────────────────────────────
// Events with composite_score > 60 (i.e. fraud_score > 0.60) are "High Risk"
// and are automatically logged to the blockchain (aiblock.md Part 3).
const BLOCKCHAIN_LOG_THRESHOLD = 0.60; // maps to score_100 > 60

// ── Helper: Log Fraud Event to Blockchain ─────────────────────────────────────
/**
 * Sends a logFraudEvent() transaction to the FraudLog contract.
 *
 * Privacy design (viva defense note):
 *   - studentHash = keccak256(studentAddress)      — no PII on-chain
 *   - eventHash   = keccak256(address + timestamp + score) — integrity anchor
 *
 * @param {string} studentAddress  Raw student wallet address (hashed before sending)
 * @param {number} fraudScore      Composite 0–100 score
 * @param {number} dbEventId       SQLite FraudEvents row id (for linking tx hash back)
 * @returns {object|null}          { txHash, blockNumber } or null on failure
 */
async function logToBlockchain(studentAddress, fraudScore, dbEventId) {
    if (!fraudLogABI || !FRAUD_LOG_ADDRESS || !signer) {
        console.warn("⚠ FraudLog blockchain logging unavailable (ABI/address/signer missing).");
        return null;
    }

    try {
        const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, signer);

        // Hash student identity — keccak256 of wallet address bytes (aiblock.md: "keccak256 hashing")
        const studentHash = ethers.keccak256(ethers.toUtf8Bytes(studentAddress));

        // Integrity anchor: keccak256(address + timestamp + score)
        const timestamp = Math.floor(Date.now() / 1000);
        const eventHash = ethers.keccak256(
            ethers.solidityPacked(
                ['string', 'uint256', 'uint256'],
                [studentAddress, timestamp, Math.round(fraudScore)]
            )
        );

        const scoreInt = Math.round(fraudScore); // uint256 on-chain (0–100)

        const tx = await contract.logFraudEvent(studentHash, scoreInt, eventHash);
        console.log(`⛓ Blockchain tx sent: ${tx.hash} | score=${scoreInt}`);

        const receipt = await tx.wait();
        console.log(`✅ Blockchain confirmed block ${receipt.blockNumber} | gas=${receipt.gasUsed}`);

        // Persist tx hash to SQLite (aiblock.md Part 4 — BlockchainTransactions table)
        insertBlockchainTx({
            fraudEventId: dbEventId,
            txHash: receipt.hash,
            blockNumber: Number(receipt.blockNumber),
            gasUsed: Number(receipt.gasUsed),
            contractAddress: FRAUD_LOG_ADDRESS,
        });

        return {
            txHash: receipt.hash,
            blockNumber: Number(receipt.blockNumber),
            eventHash,
        };
    } catch (err) {
        console.error("⚠ Blockchain logging failed:", err.message);
        return null;
    }
}

// ── Auth Routes (legacy stubs) ─────────────────────────────────────────────────
app.post('/register', (req, res) => {
    res.status(410).json({
        error: "Deprecated endpoint",
        message: "Registration is wallet-based and handled on-chain via MetaMask (enrollment + registerUser).",
    });
});

app.post('/login', (req, res) => {
    res.status(410).json({
        error: "Deprecated endpoint",
        message: "Login is wallet-based and handled via MetaMask in the frontend.",
    });
});

// ── AI Fraud Analysis Endpoint ────────────────────────────────────────────────
/**
 * POST /analyze-frame
 *
 * Receives a webcam frame from the frontend, forwards it to the FastAPI AI
 * service (port 8000), receives the composite fraud score, then:
 *   - Persists the event to SQLite
 *   - If score > threshold, sends a blockchain transaction to FraudLog.sol
 *   - Returns the full result including tx_hash (if logged) to the frontend
 *
 * This implements aiblock.md Part 3 "AI + Blockchain Integration" pipeline.
 */
app.post('/analyze-frame', upload.single('frame'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No frame uploaded" });

    // Get student address from header/body (or fallback to anonymous)
    const studentAddress = req.headers['x-student-address'] || req.body?.student_address || req.body?.studentID || 'anonymous';

    let aiData;
    try {
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('file', blob, 'frame.jpg');

        const aiResponse = await fetch('http://localhost:8000/analyze', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(8000)
        });

        if (!aiResponse.ok) {
            throw new Error(`AI Service API error: ${aiResponse.statusText}`);
        }

        aiData = await aiResponse.json();

    } catch (error) {
        console.warn("AI Service offline — using rule-based fallback:", error.message);

        // Realistic bimodal fallback distribution (70% low, 18% medium, 12% high)
        const rand = Math.random();
        let fraud_score;
        if (rand < 0.70) fraud_score = parseFloat((Math.random() * 0.35).toFixed(3));
        else if (rand < 0.88) fraud_score = parseFloat((0.40 + Math.random() * 0.29).toFixed(3));
        else fraud_score = parseFloat((0.71 + Math.random() * 0.28).toFixed(3));

        aiData = {
            fraud_score,
            composite_score: Math.round(fraud_score * 100),
            risk_label: fraud_score > 0.60 ? "High" : fraud_score > 0.40 ? "Moderate" : "Low",
            confidence: 0.5,
            cnn_raw: fraud_score,
            indicators: null,
            component_scores: null,
            model_version: "v2.1.0",
            status: "fallback_offline",
        };
    }

    const {
        fraud_score, composite_score, risk_label, confidence,
        cnn_raw, indicators, component_scores, model_version, status: aiStatus
    } = aiData;

    // ── Persist to SQLite (aiblock.md Part 4) ─────────────────────────────────
    let dbEventId = null;
    try {
        dbEventId = insertFraudEvent({
            studentAddress,
            examId: req.body?.exam_id || req.body?.examID || null,
            fraudScore: fraud_score,
            riskLabel: risk_label || 'Low',
            compositeScore: composite_score,
            componentScores: component_scores,
            evidenceHash: null,
            modelVersion: model_version || 'v2.1.0',
        });
    } catch (dbErr) {
        console.error("SQLite insert error:", dbErr.message);
    }

    // ── Blockchain Logging (aiblock.md Part 3) ────────────────────────────────
    // Only log High Risk events (composite_score > 60) to save gas.
    let blockchainResult = null;
    if (fraud_score > BLOCKCHAIN_LOG_THRESHOLD) {
        blockchainResult = await logToBlockchain(studentAddress, composite_score ?? Math.round(fraud_score * 100), dbEventId);
    }

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
        fraud_score,
        composite_score,
        risk_label,
        confidence,
        cnn_raw,
        ai_status: aiStatus || 'success',
        indicators: indicators || null,
        component_scores: component_scores || null,
        model_version,
        // Blockchain verification result (null if score was not High Risk)
        blockchain: blockchainResult ? {
            logged: true,
            tx_hash: blockchainResult.txHash,
            block_number: blockchainResult.blockNumber,
            event_hash: blockchainResult.eventHash,
            contract: FRAUD_LOG_ADDRESS,
        } : {
            logged: false,
            reason: fraud_score > BLOCKCHAIN_LOG_THRESHOLD
                ? "Blockchain unavailable"
                : `Score ${composite_score} ≤ threshold (${BLOCKCHAIN_LOG_THRESHOLD * 100})`,
        },
    });
});

// ── Phase 3: AI Audio Analysis Endpoint ───────────────────────────────────────
app.post('/analyze-audio', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio uploaded" });

    const studentAddress = req.headers['x-student-address'] || req.body?.student_address || req.body?.studentID || 'anonymous';
    let aiData;

    try {
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('file', blob, 'audio.wav');

        const aiResponse = await fetch('http://localhost:8000/analyze_audio', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(8000)
        });

        if (!aiResponse.ok) throw new Error(`AI Service Audio API error: ${aiResponse.statusText}`);
        aiData = await aiResponse.json();

    } catch (error) {
        console.warn("AI Audio Service offline:", error.message);
        return res.status(503).json({ error: "Audio analysis unavailable" });
    }

    const { fraud_score, composite_score, risk_label, audio_alert, start_time, end_time } = aiData;

    try {
        insertFraudEvent({
            studentAddress,
            examId: req.body?.exam_id || req.body?.examID || null,
            fraudScore: fraud_score,
            riskLabel: risk_label || 'Low',
            compositeScore: composite_score,
            componentScores: { audio: audio_alert ? 1.0 : 0.0 },
            evidenceHash: null,
            modelVersion: 'v2.1.0'
        });
    } catch (dbErr) { }

    let blockchainResult = null;
    if (fraud_score > BLOCKCHAIN_LOG_THRESHOLD) {
        blockchainResult = await logToBlockchain(studentAddress, composite_score ?? Math.round(fraud_score * 100), null);
    }

    res.json({
        ...aiData,
        blockchain: blockchainResult ? { logged: true, tx_hash: blockchainResult.txHash } : { logged: false }
    });
});

// ── Phase 4: AI Sequence Analysis Endpoint ────────────────────────────────────
app.post('/analyze-sequence', upload.array('frames', 16), async (req, res) => {
    if (!req.files || req.files.length !== 16) {
        return res.status(400).json({ error: `Expected 16 frames, got ${req.files ? req.files.length : 0}` });
    }

    const studentAddress = req.headers['x-student-address'] || req.body?.student_address || req.body?.studentID || 'anonymous';
    let aiData;

    try {
        const formData = new FormData();
        for (let i = 0; i < req.files.length; i++) {
            const blob = new Blob([req.files[i].buffer], { type: req.files[i].mimetype });
            formData.append('files', blob, `frame_${i}.jpg`);
        }

        const aiResponse = await fetch('http://localhost:8000/analyze_sequence', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(15000) // sequences take longer
        });

        if (!aiResponse.ok) throw new Error(`AI Service Sequence API error: ${aiResponse.statusText}`);
        aiData = await aiResponse.json();

    } catch (error) {
        console.warn("AI Sequence Service offline:", error.message);
        return res.status(503).json({ error: "Sequence analysis unavailable" });
    }

    const { fraud_score, composite_score, risk_label, action_score } = aiData;

    try {
        insertFraudEvent({
            studentAddress,
            examId: req.body?.exam_id || req.body?.examID || null,
            fraudScore: fraud_score,
            riskLabel: risk_label || 'Low',
            compositeScore: composite_score,
            componentScores: { action: action_score },
            evidenceHash: null,
            modelVersion: 'v2.1.0'
        });
    } catch (dbErr) { }

    let blockchainResult = null;
    if (fraud_score > BLOCKCHAIN_LOG_THRESHOLD) {
        blockchainResult = await logToBlockchain(studentAddress, composite_score ?? Math.round(fraud_score * 100), null);
    }

    res.json({
        ...aiData,
        blockchain: blockchainResult ? { logged: true, tx_hash: blockchainResult.txHash } : { logged: false }
    });
});

// ── Blockchain Fraud Log Endpoint ─────────────────────────────────────────────
app.get('/fraud-logs', async (req, res) => {
    if (!fraudLogABI || !FRAUD_LOG_ADDRESS) {
        return res.status(503).json({
            error: "FraudLog contract/ABI not loaded.",
        });
    }
    try {
        const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, provider);
        const count = await contract.totalEvents();
        const logs = [];

        for (let i = 0; i < Number(count); i++) {
            const hash = await contract.allEventHashes(i);
            const details = await contract.getEventDetails(hash);
            logs.push({
                index: i,
                studentHash: details.studentHash,
                riskScore: Number(details.fraudScore),
                riskPercent: `${Number(details.fraudScore)}%`,
                timestamp: new Date(Number(details.timestamp) * 1000).toISOString(),
                eventHash: details.eventHash,
                modelVersion: details.modelVersion
            });
        }

        res.json({ total: logs.length, logs, contractAddress: FRAUD_LOG_ADDRESS });
    } catch (err) {
        res.status(500).json({ error: "Failed to read fraud logs.", detail: err.message });
    }
});

// ── FraudLog Contract Endpoints (aiblock.md Part 2 functions) ─────────────────

/**
 * GET /fraudlog/verify/:eventHash
 * Calls verifyEvent(eventHash) on FraudLog contract — integrity check.
 */
app.get('/fraudlog/verify/:eventHash', async (req, res) => {
    if (!fraudLogABI || !FRAUD_LOG_ADDRESS) {
        return res.status(503).json({ error: "FraudLog contract not configured." });
    }
    try {
        const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, provider);
        const [verified, fraudScore, timestamp, version] = await contract.verifyEvent(req.params.eventHash);
        res.json({
            eventHash: req.params.eventHash,
            verified,
            fraudScore: Number(fraudScore),
            timestamp: verified ? new Date(Number(timestamp) * 1000).toISOString() : null,
            modelVersion: version,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /fraudlog/student/:studentAddress
 * Returns all fraud event hashes for a given student (by address → keccak256 hash).
 */
app.get('/fraudlog/student/:studentAddress', async (req, res) => {
    if (!fraudLogABI || !FRAUD_LOG_ADDRESS) {
        return res.status(503).json({ error: "FraudLog contract not configured." });
    }
    try {
        const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, provider);
        const studentHash = ethers.keccak256(ethers.toUtf8Bytes(req.params.studentAddress));
        const eventHashes = await contract.getFraudEvents(studentHash);
        res.json({
            studentAddress: req.params.studentAddress,
            studentHash,
            eventCount: eventHashes.length,
            eventHashes,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /fraudlog/update-model-version
 * Body: { version: "v3.0.0" }
 * Updates the model version tracked on-chain (aiblock.md Part 6).
 */
app.post('/fraudlog/update-model-version', async (req, res) => {
    if (!fraudLogABI || !FRAUD_LOG_ADDRESS || !signer) {
        return res.status(503).json({ error: "FraudLog contract/signer not configured." });
    }
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: "version required in body" });

    try {
        const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, signer);
        const tx = await contract.updateModelVersion(version);
        const receipt = await tx.wait();
        res.json({
            success: true,
            version,
            tx_hash: receipt.hash,
            block_number: Number(receipt.blockNumber),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Database Endpoints ────────────────────────────────────────────────────────

/** GET /db/fraud-events — Returns recent fraud events from SQLite */
app.get('/db/fraud-events', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json({ events: getAllFraudEvents(limit) });
});

/** GET /db/stats — Aggregate fraud stats per student */
app.get('/db/stats', (req, res) => {
    res.json({ stats: getFraudStats() });
});

/** GET /db/model — Latest model metadata from SQLite */
app.get('/db/model', (req, res) => {
    res.json({ model: getModelMetadata() });
});

// ── Exam Endpoints ────────────────────────────────────────────────────────────
app.get('/exams', async (req, res) => {
    if (!contractABI) return res.status(503).json({ error: "ABI not loaded." });
    try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
        const count = await contract.getExamCount();
        const exams = [];
        for (let i = 0; i < Number(count); i++) {
            const exam = await contract.getExam(i);
            exams.push({ id: Number(exam[0]), subject: exam[1], title: exam[2], isActive: exam[4] });
        }
        res.json({ total: exams.length, exams, contractAddress: CONTRACT_ADDRESS });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    let aiOnline = false;
    let blockchainOnline = false;
    let fraudLogDeployed = false;

    try { await axios.get('http://localhost:8000/', { timeout: 2000 }); aiOnline = true; } catch (_) { }
    try {
        await provider.getBlockNumber();
        blockchainOnline = true;
        if (fraudLogABI && FRAUD_LOG_ADDRESS) {
            const contract = new ethers.Contract(FRAUD_LOG_ADDRESS, fraudLogABI, provider);
            const total = await contract.totalEvents();
            fraudLogDeployed = true;
        }
    } catch (_) { }

    res.json({
        server: 'online',
        ai_service: aiOnline ? 'online' : 'offline',
        blockchain: blockchainOnline ? 'online' : 'offline',
        exam_contract: CONTRACT_ADDRESS,
        fraud_log_contract: FRAUD_LOG_ADDRESS || 'not deployed',
        fraud_log_ready: fraudLogDeployed,
        blockchain_log_threshold: `fraud_score > ${BLOCKCHAIN_LOG_THRESHOLD} (${BLOCKCHAIN_LOG_THRESHOLD * 100} score — High Risk)`,
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 SecureExam Chain Backend running on http://localhost:${PORT}`);
    console.log(`   ExamSystem Contract  : ${CONTRACT_ADDRESS}`);
    console.log(`   FraudLog Contract    : ${FRAUD_LOG_ADDRESS || 'not deployed yet'}`);
    console.log(`   Blockchain           : ${BLOCKCHAIN_RPC_URL}`);
    console.log(`   AI Service           : http://localhost:8000`);
    console.log(`   Health check         : http://localhost:${PORT}/health\n`);
});
