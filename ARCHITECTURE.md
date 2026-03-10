# SecureExam Chain Architecture

## Architecture Pattern

Microservice architecture with strict separation of concerns:

- Frontend for user interaction and wallet-mediated actions
- Backend for orchestration, persistence, and blockchain bridge logic
- AI service for inference workloads
- Smart contracts for tamper-resistant audit and role enforcement

## Authoritative Network and Identity Rules

- Blockchain RPC: Ganache (`http://127.0.0.1:7545`, chain ID `1337`)
- Wallet provider: MetaMask only
- Identity lifecycle: owner/admin enrollment on-chain, then user registration on-chain
- Access control: role checks in Solidity (`Student`, `Admin`, `Invigilator`, `Validator`)

## Component Responsibilities

## 1) Frontend (`frontend/`)

- Connects MetaMask and switches to Ganache network
- Drives role-based UI routing after on-chain identity lookup
- Captures webcam frames, audio chunks, and short frame sequences
- Displays live AI risk score and session integrity indicators

## 2) Backend (`backend/`)

- Exposes analysis endpoints:
- `POST /analyze-frame`
- `POST /analyze-audio`
- `POST /analyze-sequence`
- Persists fraud telemetry in SQLite
- Logs high-risk events to `FraudLog.sol`
- Exposes health and read endpoints for dashboards and verification

## 3) AI Service (`ai_service/`)

- `POST /analyze`: frame-level analysis (CNN + CV indicators)
- `POST /analyze_audio`: audio anomaly analysis
- `POST /analyze_sequence`: temporal action analysis
- Combines indicators using weighted fraud scoring to produce:
- `fraud_score` (0-1)
- `composite_score` (0-100)
- `risk_label`

## 4) Blockchain (`blockchain/`)

- `ExamSystem.sol`:
- Enrollment and registration
- Role-based exam management
- Exam submission and fraud history records

- `FraudLog.sol`:
- Privacy-preserving hashed fraud evidence
- Immutable event hash verification
- On-chain model version tracking

## Data and Audit Strategy

- On-chain: hashes, scores, timestamps, role-governed state transitions
- Off-chain (SQLite): operational metadata for dashboards and analysis
- Design goal: preserve privacy while ensuring verifiable evidence integrity
