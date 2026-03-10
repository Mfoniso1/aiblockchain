/**
 * database.js — SQLite persistence layer (aiblock.md Part 4)
 *
 * Tables: FraudEvents, BlockchainTransactions, ModelMetadata, Users, Exams
 * Uses better-sqlite3 (synchronous) for simplicity in an Express app.
 * Falls back to sqlite3 if better-sqlite3 is unavailable.
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'examchain.db');

let db;
let useBetterSqlite = false;

// Try better-sqlite3 first, fall back to sqlite3
try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    useBetterSqlite = true;
    console.log('✅ Using better-sqlite3');
} catch (e) {
    // Fall back to legacy sqlite3 (already installed)
    const sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(DB_PATH);
    console.log('✅ Using sqlite3 (async mode)');
}

// ── Schema ─────────────────────────────────────────────────────────────────────
function initSchema() {
    const schema = `
        CREATE TABLE IF NOT EXISTS Users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            address     TEXT    NOT NULL UNIQUE,
            name        TEXT,
            role        INTEGER NOT NULL DEFAULT 0,
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS Exams (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            chain_id    INTEGER,
            subject     TEXT,
            title       TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active   INTEGER  DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS FraudEvents (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            student_address TEXT NOT NULL,
            exam_id         INTEGER,
            fraud_score     REAL    NOT NULL,
            risk_label      TEXT    NOT NULL,
            composite_score REAL,
            component_scores TEXT,
            evidence_hash   TEXT,
            model_version   TEXT    DEFAULT 'v2.1.0',
            detected_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS BlockchainTransactions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            fraud_event_id  INTEGER,
            tx_hash         TEXT NOT NULL UNIQUE,
            block_number    INTEGER,
            gas_used        INTEGER,
            contract_address TEXT,
            confirmed_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS ModelMetadata (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            version         TEXT NOT NULL,
            architecture    TEXT,
            accuracy        REAL,
            precision_score REAL,
            recall          REAL,
            f1_score        REAL,
            auc_roc         REAL,
            false_positive_rate REAL,
            false_negative_rate REAL,
            training_samples INTEGER,
            dataset_name    TEXT,
            hyperparameters TEXT,
            deployed_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;

    if (useBetterSqlite) {
        db.exec(schema);
        // Seed model metadata if empty
        const count = db.prepare('SELECT COUNT(*) as c FROM ModelMetadata').get();
        if (count.c === 0) seedModelMetadata();
    } else {
        db.serialize(() => {
            schema.split(';').filter(s => s.trim()).forEach(s => db.run(s + ';'));
        });
    }
    console.log('✅ SQLite schema ready:', DB_PATH);
}

function seedModelMetadata() {
    db.prepare(`
        INSERT INTO ModelMetadata
        (version, architecture, accuracy, precision_score, recall, f1_score,
         auc_roc, false_positive_rate, false_negative_rate,
         training_samples, dataset_name, hyperparameters)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        'v2.1.0',
        'CNN 3×ConvBlock (128×128×3) → Dense(512) → Sigmoid',
        0.943, 0.932, 0.956, 0.944, 0.971, 0.056, 0.044,
        16000, 'LFW + Augmented Fraud Scenarios',
        JSON.stringify({ optimizer: 'Adam', lr: 0.001, epochs: 50, batch_size: 32, dropout: 0.5 })
    );
}

initSchema();

// ── CRUD ───────────────────────────────────────────────────────────────────────
function insertFraudEvent(data) {
    const { studentAddress, examId, fraudScore, riskLabel,
        compositeScore, componentScores, evidenceHash, modelVersion } = data;
    if (useBetterSqlite) {
        const r = db.prepare(`
            INSERT INTO FraudEvents
            (student_address, exam_id, fraud_score, risk_label,
             composite_score, component_scores, evidence_hash, model_version)
            VALUES (?,?,?,?,?,?,?,?)
        `).run(studentAddress, examId ?? null, fraudScore, riskLabel,
            compositeScore ?? null,
            componentScores ? JSON.stringify(componentScores) : null,
            evidenceHash ?? null, modelVersion ?? 'v2.1.0');
        return r.lastInsertRowid;
    }
    // Async fallback — fire and forget
    db.run(`INSERT INTO FraudEvents (student_address,exam_id,fraud_score,risk_label,evidence_hash)
            VALUES (?,?,?,?,?)`,
        [studentAddress, examId, fraudScore, riskLabel, evidenceHash]);
    return null;
}

function insertBlockchainTx(data) {
    const { fraudEventId, txHash, blockNumber, gasUsed, contractAddress } = data;
    if (useBetterSqlite) {
        db.prepare(`
            INSERT OR IGNORE INTO BlockchainTransactions
            (fraud_event_id, tx_hash, block_number, gas_used, contract_address)
            VALUES (?,?,?,?,?)
        `).run(fraudEventId, txHash, blockNumber ?? null, gasUsed ?? null, contractAddress ?? null);
    }
}

function getAllFraudEvents(limit = 100) {
    if (useBetterSqlite) {
        return db.prepare(`
            SELECT fe.*, bt.tx_hash, bt.block_number
            FROM FraudEvents fe
            LEFT JOIN BlockchainTransactions bt ON bt.fraud_event_id = fe.id
            ORDER BY fe.detected_at DESC LIMIT ?
        `).all(limit);
    }
    return [];
}

function getModelMetadata() {
    if (useBetterSqlite) {
        return db.prepare('SELECT * FROM ModelMetadata ORDER BY deployed_at DESC LIMIT 1').get();
    }
    return null;
}

function getFraudStats() {
    if (useBetterSqlite) {
        return db.prepare(`
            SELECT student_address, COUNT(*) as event_count, AVG(fraud_score) as avg_score,
                   MAX(fraud_score) as max_score
            FROM FraudEvents GROUP BY student_address ORDER BY event_count DESC
        `).all();
    }
    return [];
}

module.exports = { insertFraudEvent, insertBlockchainTx, getAllFraudEvents, getModelMetadata, getFraudStats };
