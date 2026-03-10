# SecureExam Chain

PhD research implementation for AI-assisted online exam integrity with blockchain evidence audit.

## Canonical Runtime Policy

- Authentication: MetaMask wallet only
- Blockchain network: Ganache only
- Identity and access: on-chain enrollment + on-chain registration + RBAC
- No backend username/password authentication flow

## System Components

1. `frontend/` (React + Vite)
- Wallet connect and role-aware dashboards
- Exam session UI
- Webcam/audio/sequence capture and monitoring display

2. `backend/` (Node.js + Express)
- API gateway between frontend and AI service
- SQLite persistence for operational analytics
- FraudLog contract write path for high-risk events

3. `ai_service/` (FastAPI + TensorFlow/OpenCV/MediaPipe/YOLO)
- Frame, audio, and sequence analysis
- Weighted fraud scoring and risk classification

4. `blockchain/` (Solidity + Hardhat toolchain targeting Ganache)
- `ExamSystem.sol` for users, enrollment, exams, submissions, fraud history
- `FraudLog.sol` for hashed immutable fraud evidence records

## Authentication Model (PhD-Aligned)

1. Admin pre-enrolls wallet + institutional ID + role on-chain.
2. Candidate connects MetaMask wallet.
3. Candidate registers on-chain with matching institutional ID.
4. Contract enforces role-based permissions for all sensitive actions.

## Fraud Logging Model

- AI service returns `fraud_score` and `composite_score`.
- Backend and frontend treat score above threshold as high-risk.
- Evidence hash and fraud metadata are logged on-chain.
- Readable operational context is retained in SQLite for dashboards.

## Deployment

See `DEPLOYMENT_GUIDE.md` for the authoritative operational steps.
