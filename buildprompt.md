Build a full-stack decentralized web application titled:

“Artificial Intelligence Model for Real-Time Detection of Online Examination Fraud Using Smart Blockchain Technology.”

The system must use the following architecture:

🏗 TECH STACK

Frontend:

React.js

Tailwind CSS

WebRTC (for webcam capture)

Backend:

Node.js + Express

JWT authentication

REST API

Database:

SQLite (file-based database for prototype validation)

AI Module:

Python

FastAPI microservice

TensorFlow or PyTorch

Custom Lightweight CNN model

Blockchain:

Solidity smart contracts

Ganache (local Ethereum blockchain)

Ethers.js integration

📌 SYSTEM REQUIREMENTS
1️⃣ User Roles

Student

Examiner

Admin

2️⃣ AI Fraud Detection Module

Build a lightweight CNN model that:

Takes webcam frames (128x128 RGB)

Detects:

Multiple faces

Face absence

Suspicious head orientation

Outputs:

Fraud probability score (0–1)

Risk classification (Low, Medium, High)

The model must:

Be trained on labeled image dataset

Use train-test split (80/20)

Output performance metrics (accuracy, precision, recall)

3️⃣ Blockchain Smart Contract

Create a Solidity contract:

ExamFraudLogger.sol

Functions:

registerExam()

logFraudEvent(studentID, examID, riskScore, timestamp, hashOfEvidence)

getFraudHistory()

Store:

Hash of AI fraud event

Timestamp

Student ID

Risk score

Do NOT store raw images on blockchain.
Store hash only.

4️⃣ Backend Responsibilities

Store full fraud event in SQLite

Hash event using SHA256

Send hash to blockchain

Store transaction hash in SQLite

5️⃣ Real-Time Pipeline

Webcam captures frame.

Frame sent to AI API.

CNN outputs fraud score.

If score > threshold:

Log event in SQLite

Generate hash

Call smart contract

Display fraud risk in dashboard.

6️⃣ Admin Dashboard

Show:

Fraud score per student

Blockchain transaction hash

Exam integrity index

Fraud heatmap

7️⃣ Security

JWT authentication

Encrypted image transfer

Role-based access control

Data anonymization for stored images

8️⃣ Deliverables

Generate:

Folder structure

CNN model code

Training script

Smart contract code

Backend API

Frontend UI

Deployment guide

System architecture diagram (text format)