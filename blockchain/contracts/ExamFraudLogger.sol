// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ExamFraudLogger {
    struct FraudEvent {
        string studentID;
        string examID;
        uint256 riskScore; // Scaled by 100 (e.g., 95 = 0.95)
        uint256 timestamp;
        string evidenceHash; // IPFS or local hash
    }

    FraudEvent[] public fraudHistory;
    
    event FraudLogged(string studentID, string examID, uint256 riskScore, string evidenceHash);

    function logFraudEvent(
        string memory _studentID,
        string memory _examID,
        uint256 _riskScore,
        string memory _evidenceHash
    ) public {
        FraudEvent memory newEvent = FraudEvent({
            studentID: _studentID,
            examID: _examID,
            riskScore: _riskScore,
            timestamp: block.timestamp,
            evidenceHash: _evidenceHash
        });

        fraudHistory.push(newEvent);
        emit FraudLogged(_studentID, _examID, _riskScore, _evidenceHash);
    }

    function getFraudHistory() public view returns (FraudEvent[] memory) {
        return fraudHistory;
    }

    function getFraudCount() public view returns (uint256) {
        return fraudHistory.length;
    }
}
