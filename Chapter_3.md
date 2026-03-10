# CHAPTER 3: METHODOLOGY AND SYSTEM ARCHITECTURE

## 3.1 Introduction

This chapter meticulously delineates the methodological paradigm, architectural design, software engineering lifecycle, and mathematical frameworks employed in the conception, development, and rigorous evaluation of the proposed `SecureExam Chain` hybrid system. The core objective of this research is the fusion of high-precision, multi-modal Artificial Intelligence (combining Convolutional Neural Networks, YOLOv8, MediaPipe, VGGish, and LSTM architectures) for real-time behavioral fraud classification with the absolute cryptographic immutability of Distributed Ledger Technology (Ethereum Smart Contracts). Consequently, the methodology adopted must necessarily bridge the disciplines of advanced computer vision and audio data science, along with decentralized Web3 software engineering.

The chapter is structurally subdivided into several critical phases: the selection of the software development methodology, a comprehensive breakdown of the integrated system architecture, the explicit mathematical design of the deep learning CNN pipeline (including data preprocessing, augmentation, tensor manipulation, and gradient descent optimization), the cryptographic engineering of the Solidity smart contracts, the localized Ethereum blockchain network configuration (via Truffle/Hardhat and Ganache), and the full-stack asynchronous integration via Node.js and React.

## 3.2 Research Methodology

The methodological foundation guiding the software lifecycle of this hybrid system is the Object-Oriented Analysis and Design Methodology (OOADM), heavily augmented with principles drawn from Agile Software Development and iterative Machine Learning Operations (MLOps). 

OOADM was specifically chosen due to its inherent capacity to model highly complex, real-world systems as interacting clusters of encapsulated objects. In the context of `SecureExam Chain`, these objects manifest distinctly as the `StudentClient` (React Webcam interface), the `InferenceEngine` (Python FastAPI CNN model), the `ConsensusGateway` (Node.js/Ethers.js backend), and the `ImmutableLedger` (Deployed Solidity Smart Contracts). 
The Agile overlay ensured that the system was built iteratively. Initial sprints focused entirely on establishing a baseline 3-block CNN for simple face detection. Subsequent iterations exponentially increased the model's depth (to 5 sequential blocks) and introduced complex behavioral classification (gaze deviation, head pose vectors). Concurrently, the blockchain layer was developed iteratively, transitioning from basic data storage contracts to sophisticated, Role-Based Access Control (RBAC) schemas utilizing `keccak256` hashing for gas optimization.

## 3.3 Proposed System Architecture

The architectural topology of the `SecureExam Chain` system is a sophisticated, decentralized, n-tier framework designed specifically for parallel, asynchronous, and ultra-low-latency execution. It is fundamentally segregated into four distinct interconnected operational layers: the Presentation/Client Layer, the API Gateway/Backend Layer, the AI Inference Layer, and the Blockchain Consensus Layer.

### 3.3.1 Layer 1: Presentation / Client Layer (React.js)
The client interface is constructed utilizing React.js, specifically leveraging the `react-webcam` library for continuous MediaStream API access. The primary responsibility of this layer is totally asynchronous frame capture. During an active examination session, the client discretely captures standardized JPEG frames from the user's active webcam at a rigorously controlled interval of exactly 2000 milliseconds (0.5 Frames Per Second). 
This specific interval is a mathematically calculated optimal equilibrium point. It provides sufficient temporal density to detect fleeting behavioral anomalies (e.g., a sudden rapid glance off-screen) while preventing the catastrophic network congestion and frontend memory leaks that completely plague synchronous 30 FPS raw video streaming solutions. The frames are encapsulated as binary Blob Data and transmitted via asynchronous HTTP POST requests to the backend Gateway.

### 3.3.2 Layer 2: Core API Gateway Layer (Node.js & Express)
Operating as the central nervous system of the architecture, the backend is engineered utilizing asynchronous Node.js and the Express framework. Its responsibilities are manifold:
1.  **Session Management & Authentication:** Verifying JSON Web Tokens (JWT) to ensure only registered, currently scheduled candidates can inject images into the inference pipeline.
2.  **Payload Orchestration:** Receiving the high-volume incoming HTTP Multipart Form Data (the webcam blobs) and immediately proxying them over a high-speed internal local loopback (localhost) to the Python inference engine to avoid Node.js single-thread blocking.
3.  **Threshold Logic Execution:** Evaluating the floating-point `fraud_score` tensor returned by the AI Layer against institutional tolerance thresholds.
4.  **Web3 Consensus Bridging:** Crucially, integrating the `ethers.js` library. If a frame violates the predefined critical fraud threshold ($\theta_{critical} \ge 0.60$), the Node backend autonomously signs exactly a hexadecimal Web3 transaction utilizing a secure environmental private key, mathematically binding the event hash to the candidate's Ethereum wallet address, and broadcasting it to the Ganache ledger.

### 3.3.3 Layer 3: Deep AI Inference Layer (Python & FastAPI)
This layer contains the core mathematical intelligence. It is constructed as an isolated deterministic microservice utilizing the Python FastAPI framework, inherently chosen for its unmatched speed powered by Starlette and Pydantic asynchronous capabilities.
Upon receiving a frame array via memory, the system executes two distinct, parallel computer vision sub-routines:
1.  **Classical Deterministic Heuristics (OpenCV):** The frame is subjected to customized Haar Cascade Classifiers to explicitly calculate raw bounding boxes for the primary face and secondary background faces. This acts as a rapid, computationally inexpensive pre-filter and fallback mechanism.
2.  **Multi-Modal Stochastic Inference (CNN, YOLOv8, MediaPipe, VGGish, LSTM):** The visual and auditory streams undergo terminal preprocessing. The webcam tensor is processed by the structural 5-block CNN for baseline anomaly detection, MediaPipe for microscopic iris gaze tracking, YOLOv8 for unauthorized object detection (e.g., phones, secondary screens), and a CNN-LSTM sequence model for temporal validation. In parallel, the MediaRecorder audio buffer is analyzed by VGGish for acoustic anomalies. These diverse outputs are aggregated and weighted by a unified fraud scoring engine to yield a definitive scalar probability score predicting the immediate presence of complex behavioral fraud.

### 3.3.4 Layer 4: Blockchain Consensus Layer (Ethereum/Ganache/Hardhat)
To utterly eradicate the Single Point of Failure (SPOF) vulnerabilities that cripple legacy centralized proctoring databases, the system delegates all ultimate evidentiary logging to a localized Ethereum test network simulation running via the Truffle/Hardhat environment interfacing directly with a Ganache programmatic node.
The system interacts specifically with a custom-compiled Solidity Smart Contract (`FraudLog.sol`). This contract acts as an immutable, globally deterministic, append-only ledger. When a transaction is successfully mined, a cryptographic receipt is generated containing block numbers, un-forgeable timestamps, and gas consumption metrics, which is then asynchronously returned to the frontend dashboard for candidate verification.

### 3.3.5 Concrete Codebase Implementation (Microservices Architecture)

To bridge the theoretical layers into a functional, scalable industrial application, the codebase is structurally partitioned into four isolated microservices. This decoupling ensures that computationally intensive AI workloads do not block the asynchronous event loop of the web gateway.

#### 3.3.5.1 `ai_service/` (The Intelligence Engine - Layer 3)
**Language:** Python (FastAPI, TensorFlow, OpenCV) | **Port:** `8000`
This repository contains the core deterministic and stochastic intelligence of the system.
*   `main.py`: The FastAPI server exposing high-throughput endpoints (`/analyze`, `/analyze_audio`, `/analyze_sequence`).
*   `fraud_scorer.py`: The weighted rule engine assembling outputs from CNN, YOLOv8, MediaPipe, and VGGish into a unified 0-100% composite threat score.
*   `cnn_model.py` & `action_model.py`: Definitions for the spatial CNN and temporal LSTM architectures.
*   `object_detector.py`, `gaze_tracker.py`, `audio_analyzer.py`: The newly integrated multi-modal subroutines.
*   `AI_Proctoring_Model_Upgrade.ipynb`: The exhaustive Jupyter Notebook containing data-science training curves and model statistical analysis.

#### 3.3.5.2 `blockchain/` (The Immutable Ledger - Layer 4)
**Language:** Solidity, JavaScript (Hardhat) | **Port:** `8545` (Ganache Local Node)
This module encapsulates the Ethereum smart contracts acting as the academic audit trail.
*   `contracts/ExamSystem.sol` & `FraudLog.sol`: Smart contracts managing Role-Based Access Control and Keccak-256 event hashing.
*   `scripts/deploy.js`: The Hardhat automation script establishing the local Ganache network and dynamically writing contract addresses.

#### 3.3.5.3 `backend/` (The API Gateway - Layer 2)
**Language:** JavaScript (Node.js, Express, Ethers.js) | **Port:** `5000`
The traditional web gateway acting as the orchestrator between the user, the AI inference engine, and the blockchain.
*   `server.js`: Intercepts multi-modal Blob data, proxies it to the Python AI service, evaluates the returned threat score against an institutional threshold, and autonomously signs Ethereum transactions via `ethers.js` if the threshold is breached.
*   `database.js`: Manages localized lightweight SQLite storage for rapid, non-cryptographic metadata retrieval.

#### 3.3.5.4 `frontend/` (The Presentation Client - Layer 1)
**Language:** JavaScript (React, Vite, Tailwind CSS) | **Port:** `5173`
The web application delivering the proctoring interface to students and the oversight dashboards to administrators.
*   `WebcamCapture.jsx`: The critical asynchronous hook secretly accessing the `MediaStream API` to harvest frames, spatial objects, and audio without blocking the DOM thread.
*   `ExamSession.jsx`: The examination interface dynamically displaying AI threat telemetry.
*   `InvigilatorDashboard.jsx` & `ResearcherPanel.jsx`: Human-in-the-loop oversight panels parsing the blockchain logs and plotting confusion matrices.

## 3.4 Multi-Modal AI Engine Engineering (CNN, YOLOv8, MediaPipe, VGGish, LSTM)

The cornerstone of the highly robust diagnostic accuracy reported in this thesis is the architectural integration, mathematical design, rigorous tuning, and stochastic training of the unified multi-modal AI engine (combining the base CNN, YOLOv8, MediaPipe, VGGish, and LSTM subroutines).

### 3.4.1 Dataset Acquisition and Augmentation
Deep neural networks are fundamentally data-hungry algorithms; their capacity for complex generalization is strictly bounded by the variance, volume, and quality of their training manifold. 
The foundation dataset utilized was derived from academic facial repositories, significantly weighted by the widely utilized *Labeled Faces in the Wild (LFW)* dataset for baseline facial normalization. However, to explicitly model "cheating," synthetic augmentation was aggressively deployed. Using OpenCV geometric transformations, the base images were subjected to stochastic rotational sheer (-25° to +25° yaw and pitch emulation), severe lighting gradient modifications to simulate poor bedroom lighting environments, and the synthetic injection of secondary bounding-box artifacts to simulate unauthorized digital devices (mobile phones) held near the jawline.
This rigorous augmentation vastly expanded the training manifold, resulting in a balanced dataset of precisely labeled tensors, strictly separated into a 70% Training, 20% Validation, and 10% Independent Test Split configuration.

### 3.4.2 CNN Topological Architecture and Tensor Flow
The custom neural network architecture constitutes a Deep Sequential Keras model containing precisely interleaved mathematical layers. The architecture is defined as follows:

1.  **Input Tensor Layer:** Accepts incoming multi-dimensional arrays representing RGB pixel intensities normalized to the domain $X_{norm} \in \mathbb{R}^{128 \times 128 \times 3}$.
2.  **Convolutional Blocks (Blocks 1-3):** 
    Each block consists of a 2D Convolutional (Conv2D) operation. Utilizing a moving $3 \times 3$ kernel matrix $K$, the network computes the dot product across the input tensor traversing with a defined stride. 
    Mathematically, the fundamental 2D discrete convolution operation without bias is expressed as:
    
    $$ S(i, j) = (I * K)(i, j) = \sum_{m}\sum_{n} I(i-m, j-n) K(m, n) $$
    
    Where $I$ is the two-dimensional image tensor, and $K$ is the two-dimensional kernel filter. Each Conv2D layer is immediately followed by a Rectified Linear Unit (ReLU) activation function, defined mathematically as $f(x) = \max(0, x)$. This introduces critical non-linearity, enabling the network to map highly complex topological decision boundaries. Following activation, a $2 \times 2$ Max Pooling operation is executed to forcefully down-sample the spatial footprint, selecting only the highest magnitude pixel intensity within the regional window to preserve the most prominent edge features while radically reducing parameters.
3.  **Dense Flattening and Dropout Regularization:** 
    Upon exiting the final convolutional block, the deep $3D$ tensor feature maps are mathematically flattened into a massive singular 1D vector array. To prevent catastrophic overfitting—wherein the neural network simply memorizes the specific training images rather than learning generalized rules—a heavy Dropout layer is introduced. Specifically, a hyperparameter of $0.5$ is utilized, meaning that during every single forward pass of the training phase, 50% of the dense neuron weights are randomly, stochastically zeroed out. This mathematically forces the network to develop highly redundant, generalized internal representations of the visual features.
4.  **Terminal Classification Layer:** 
    The final classification decision is rendered by a singular, fully connected (Dense) neuron. This neuron uniquely utilizes a Sigmoid activation function to constrain its unbounded numerical output strictly into the standard probability domain boundary $[0, 1]$.
    The Sigmoid mathematical function is rigorously defined as:
    
    $$ \sigma(x) = \frac{1}{1 + e^{-x}} $$
    
    The resulting output scalar, explicitly $P(Fraud \mid Image)$, represents the model's calculated statistical confidence that the current processed image matrix contains visual behaviors correlating with academic cheating.

### 3.4.3 Optimization Calculus and Loss Functions
The neural network was stochastically trained by minimizing a specific objective loss function. Given that the core objective is a classic binary classification problem (Fraud vs. Authentic), the mathematical function exclusively selected for optimization was Binary Cross-Entropy (BCE) Loss. 
BCE rigorously quantifies the divergence between two probability distributions: the true labels $y \in \{0, 1\}$ and the network's bounded exponential predictions $p \in [0, 1]$.
The discrete Binary Cross-Entropy function is mathematically represented as:

$$ L(y, p) = -\frac{1}{N} \sum_{i=1}^{N} \left[ y_i \log(p_i) + (1 - y_i) \log(1 - p_i) \right] $$

Where $N$ denotes the total number of tensor samples in the training batch, $y_i$ is the actual ground truth label, and $p_i$ is the specific continuous probability predicted by the final Sigmoid neuron.
To systematically minimize this highly complex, multi-dimensional loss topography, the widely respected Adam (Adaptive Moment Estimation) optimizer algorithm was utilized. Adam computes individual adaptive learning rates for radically different network parameters by utilizing exponentially moving averages of the gradient sequences (the first moment) and the squared gradient sequences (the second uncentered moment), allowing for incredibly rapid, stable convergence even on highly noisy facial image manifolds.

## 3.5 Ethereum Smart Contract Cryptographic Engineering

The blockchain consensus layer ensures the absolute irrefutability and eternal security of the academic evidence logs. This was accomplished by engineering custom Ethereum Smart Contracts in the Turing-complete Solidity programming language (version `^0.8.x`).

### 3.5.1 Contract State Variables and Structures
The core contract, explicitly named `FraudLog.sol`, is architected around the highly optimized `FraudEvent` user-defined data `struct`. 

```solidity
struct FraudEvent {
    bytes32 studentHash;
    uint256 fraudScore;
    uint256 timestamp;
    bytes32 eventHash;
}
```

To strictly conform to the General Data Protection Regulation (GDPR) and institutional privacy mandates, Absolutely Zero Personally Identifiable Information (PII), raw photographic video data, or plaintext student names are ever recorded onto the Ethereum blockchain. Instead, the mathematical concept of deterministic one-way cryptographic hashing is aggressively employed.
The `studentHash` is algorithmically generated by passing the precise student university ID string through the Keccak-256 (SHA-3 family) cryptographic algorithm. Similarly, the `eventHash` constitutes a secondary Keccak-256 hash specifically binding the AI fraud score, the exact microsecond timestamp, and the student's unique digital signature.
This specific cryptographic design absolutely ensures undeniable data provenance. The institution can eternally prove mathematically that a specific fraud event inherently belongs to a specific student ID via hash collision detection, but a public external observer viewing the raw immutable blockchain blocks can glean absolutely zero information about the specific student's actual physical identity.

### 3.5.2 State Mutability and Access Control (RBAC)
The fundamental `logFraudEvent` state-modifying function is tightly wrapped in a bespoke Solidity modifier function styled `onlyLogger`. This implements strict Role-Based Access Control (RBAC). During the initial deployment initialization of the smart contract (`constructor()`), the explicitly configured Ethereum wallet address of the secure Node.js backend infrastructure is permanently hardcoded mapped as the singular `authorisedLogger`.
Therefore, attempting to forge, alter, or inject a fraudulent logging transaction from an external, unauthorized Ethereum wallet simply mathematically fails at the very first EVM execution step, preventing systemic ledger poisoning attacks. 

## 3.6 Performance Evaluation Metrics Calculation Framework

The ultimate viability, statistical validity, and academic rigor of the proposed `SecureExam Chain` framework must be definitively proven utilizing standardized, universally recognized machine learning quantitative classification metrics acting upon the completely independent, unseen 10% Test Data split.

The core metrics heavily rely on the analysis of the resultant algorithmic Confusion Matrix, which mathematically categorizes predictions into four absolute discrete integers:
*   **True Positives (TP):** The model correctly flagged an actual fraudulent image.
*   **True Negatives (TN):** The model correctly ignored an authentic, non-cheating image.
*   **False Positives (FP):** Type I Error. The model catastrophically flagged an innocent student as cheating. (Mitigating this metric is the absolute highest priority in educational environments to prevent false accusations).
*   **False Negatives (FN):** Type II Error. The model failed entirely to detect a genuine instance of algorithmic cheating.

From the raw topological integer sums of these four critical quadrants, the following overarching statistical metrics are derived:

**1. Statistical Model Accuracy:**
The general mathematical ratio of absolutely correct predictions to total aggregate predictions.
$$ \text{Accuracy} = \frac{TP + TN}{TP + TN + FP + FN} $$

**2. Precision Index (Positive Predictive Value):**
Critically evaluates the model's reliability strictly when it flags fraud. High precision explicitly means very low false accusations.
$$ \text{Precision} = \frac{TP}{TP + FP} $$

**3. Recall / Sensitivity (True Positive Rate):**
Evaluates the model's absolute thoroughness in capturing existing fraud.
$$ \text{Recall} = \frac{TP}{TP + FN} $$

**4. F1-Score Harmonic Mean:**
The sophisticated, balanced harmonic mean between Precision and Recall. Unlike simple arithmetic means, the F1 score heavily penalizes massive disparities between precision and recall, providing the most accurate holistic measure of complex binary classification success on imbalanced class distributions.
$$ \text{F1-Score} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}} $$

**5. System Latency Measurement:**
Inference latency ($T_{infer}$) is tracked continuously via internal python `time.perf_counter()` nanosecond APIs to empirically prove that the mathematical forward propagation execution time consistently remains strictly beneath the human perceptible delay boundary definition: $\mu(T_{infer}) \le 200\text{ms}$.

## 3.7 Conclusion

The meticulously mathematical, multi-layered architectural methodology presented within this comprehensive chapter establishes a fully verifiable, reproducible, and robust software engineering pipeline. By explicitly defining the precise CNN topological tensor manipulations, identifying standard mathematical loss optimization (Cross-Entropy/Adam), constructing cryptographic privacy-preserving architectures (Keccak256), and explicitly codifying the necessary mathematical classification evaluation metrics, this framework establishes a mathematically undeniable foundation. This foundation serves to absolutely validate and interpret the empirical data results which will be extensively presented and statistically analyzed in the subsequent analytical chapters.
