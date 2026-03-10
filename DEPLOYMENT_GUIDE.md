# Deployment Guide

Authoritative stack for this project:
- Wallet/Auth: **MetaMask only**
- Network: **Ganache only**
- Identity model: **On-chain enrollment + registration (RBAC)**

## Services

Run these 4 services:

1. Ganache RPC node (default `http://127.0.0.1:7545`, chain ID `1337`)
2. Smart-contract deployment (`blockchain/`)
3. Backend API (`backend/`, port `5000`)
4. AI service (`ai_service/`, port `8000`)
5. Frontend (`frontend/`, port `5173`)

## Prerequisites

- Node.js 18+
- Python 3.10+
- MetaMask extension
- Ganache (UI or CLI)

## 1) Start Ganache

Start Ganache and confirm:
- RPC URL: `http://127.0.0.1:7545`
- Chain ID: `1337`

## 2) Deploy Contracts

```powershell
cd blockchain
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network ganache
```

This writes current addresses to:
- `contract_config.json`
- `frontend/src/ExamSystem.json`, `frontend/src/FraudLog.json`
- `backend/ExamSystem.json`, `backend/FraudLog.json`

## 3) Start Backend

```powershell
cd backend
npm install
node server.js
```

Optional RPC override:

```powershell
$env:BLOCKCHAIN_RPC_URL="http://127.0.0.1:7545"
node server.js
```

## 4) Start AI Service

```powershell
cd ai_service
python -m venv venv
.\venv\Scripts\pip.exe install -r requirements.txt
.\venv\Scripts\python.exe main.py
```

## 5) Start Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

## MetaMask Configuration

Add/select network:
- Network Name: `Ganache Local`
- RPC URL: `http://127.0.0.1:7545`
- Chain ID: `1337`
- Currency: `ETH`

Import a Ganache-funded account private key into MetaMask.

## Authentication Model (PhD-aligned)

1. Admin pre-enrolls wallet + matric/staff ID + allowed role on-chain (`enrollUser`).
2. User connects MetaMask wallet.
3. User registers on-chain with matching institutional ID (`registerUser`).
4. Role-based access is enforced by contract role checks.

No backend username/password authentication is used.

## Quick Health Checks

- Backend: `http://localhost:5000/health`
- AI Service: `http://localhost:8000/`
- Frontend: `http://localhost:5173`

