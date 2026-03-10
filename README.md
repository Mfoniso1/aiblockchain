# ExamFraudDetection System

A decentralized full-stack application for detecting online exam fraud using AI and Blockchain.

Authoritative runtime standard:
- MetaMask wallet authentication
- Ganache network deployment
- On-chain enrollment + registration (RBAC)

## Folder Structure

- **`frontend/`**: React.js application with Tailwind CSS. Handles webcam capture and Admin Dashboard.
- **`backend/`**: Node.js Express server with SQLite database. Manages logs and blockchain interaction.
- **`ai_service/`**: Python FastAPI microservice. Contains the CNN model (`cnn_model.py`), training script (`train.py`), and Jupyter Notebook (`AI_Model_Training.ipynb`).
- **`blockchain/`**: Solidity contracts + Hardhat tooling targeting Ganache.

## Quick Start
See `DEPLOYMENT_GUIDE.md` for detailed instructions.
