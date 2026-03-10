// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FraudLog
 * @author PhD Research System — aiblock.md Part 2
 *
 * @notice Immutable fraud event logger for online examination monitoring.
 *
 * Key design decisions (for viva defense):
 *  - Raw video is NEVER stored on-chain; only keccak256 event hashes.
 *  - Role-based access: only the authorised backend address can log events.
 *  - Model version is tracked on-chain for full reproducibility.
 *  - Gas-optimised: bytes32 used for all hashes instead of string.
 *  - verifyEvent() allows any auditor to confirm a hash exists without
 *    revealing the underlying data (tamper-proof integrity check).
 */
contract FraudLog {

    // ── Access Control ────────────────────────────────────────────────────────
    address public owner;          // contract deployer (admin)
    address public authorisedLogger; // only this address may call logFraudEvent

    // ── Model Versioning ─────────────────────────────────────────────────────
    string public currentModelVersion;
    uint256 public modelUpdatedAt;

    // ── Data Structures ──────────────────────────────────────────────────────
    struct FraudEvent {
        bytes32 studentHash;   // keccak256( studentID ) — no PII on-chain
        uint256 fraudScore;    // 0–100 composite risk score
        bytes32 eventHash;     // keccak256( studentID + timestamp + score )
        uint256 timestamp;     // block.timestamp
        string  modelVersion;  // version of the AI model that produced the score
        bool    exists;        // sentinel for verifyEvent()
    }

    // Lookup by event hash (for verifyEvent)
    mapping(bytes32 => FraudEvent) private _eventByHash;

    // All events per student hash (for getFraudEvents)
    mapping(bytes32 => bytes32[]) private _studentEvents;

    // All event hashes (for admin enumeration)
    bytes32[] public allEventHashes;

    // ── Events ────────────────────────────────────────────────────────────────
    /**
     * @dev Emitted whenever a fraud event is logged.
     *      Indexed fields allow cheap off-chain log filtering.
     */
    event FraudLogged(
        bytes32 indexed studentHash,
        uint256 fraudScore,
        bytes32 indexed eventHash,
        uint256 timestamp,
        string  modelVersion
    );

    /**
     * @dev Emitted when the authorised backend updates the model version.
     */
    event ModelUpdated(
        string  newVersion,
        address updatedBy,
        uint256 updatedAt
    );

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "FraudLog: caller is not owner");
        _;
    }

    modifier onlyLogger() {
        require(msg.sender == authorisedLogger, "FraudLog: caller is not authorised logger");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _logger, string memory _initialVersion) {
        owner             = msg.sender;
        authorisedLogger  = _logger;
        currentModelVersion = _initialVersion;
        modelUpdatedAt    = block.timestamp;
    }

    // ── Write Functions ───────────────────────────────────────────────────────

    /**
     * @notice Log a new fraud event on-chain.
     * @dev    Only the authorised backend address may call this.
     *         Privacy: studentID is never stored; only its keccak256 hash.
     *
     * @param studentHash  keccak256 of the student identifier (off-chain)
     * @param fraudScore   Composite risk score 0–100
     * @param eventHash    keccak256 of (studentID + timestamp + score) — integrity anchor
     */
    function logFraudEvent(
        bytes32 studentHash,
        uint256 fraudScore,
        bytes32 eventHash
    ) external onlyLogger {
        require(fraudScore <= 100, "FraudLog: score must be 0-100");
        require(!_eventByHash[eventHash].exists, "FraudLog: duplicate event hash");

        FraudEvent memory fe = FraudEvent({
            studentHash:  studentHash,
            fraudScore:   fraudScore,
            eventHash:    eventHash,
            timestamp:    block.timestamp,
            modelVersion: currentModelVersion,
            exists:       true
        });

        _eventByHash[eventHash]           = fe;
        _studentEvents[studentHash].push(eventHash);
        allEventHashes.push(eventHash);

        emit FraudLogged(studentHash, fraudScore, eventHash, block.timestamp, currentModelVersion);
    }

    /**
     * @notice Update the AI model version tracked on-chain.
     * @dev    Only the authorised logger (backend) may call this.
     *         Emits ModelUpdated for audit trail.
     */
    function updateModelVersion(string calldata newVersion) external onlyLogger {
        require(bytes(newVersion).length > 0, "FraudLog: empty version string");
        currentModelVersion = newVersion;
        modelUpdatedAt      = block.timestamp;
        emit ModelUpdated(newVersion, msg.sender, block.timestamp);
    }

    // ── Read Functions ────────────────────────────────────────────────────────

    /**
     * @notice Retrieve all fraud event hashes associated with a student.
     * @param  studentHash  keccak256 of the student identifier
     * @return Array of eventHash bytes32 values
     */
    function getFraudEvents(bytes32 studentHash) external view returns (bytes32[] memory) {
        return _studentEvents[studentHash];
    }

    /**
     * @notice Verify whether an event hash has been recorded on-chain.
     * @dev    Allows auditors to confirm integrity without exposing raw data.
     *
     * @param  eventHash  The keccak256 hash to look up
     * @return verified   true if the hash exists on-chain
     * @return fraudScore The fraud score for this event (0 if not found)
     * @return timestamp  Block timestamp when the event was logged
     * @return version    Model version at time of logging
     */
    function verifyEvent(bytes32 eventHash)
        external
        view
        returns (
            bool    verified,
            uint256 fraudScore,
            uint256 timestamp,
            string  memory version
        )
    {
        FraudEvent memory fe = _eventByHash[eventHash];
        if (!fe.exists) {
            return (false, 0, 0, "");
        }
        return (true, fe.fraudScore, fe.timestamp, fe.modelVersion);
    }

    /**
     * @notice Get full details of a specific fraud event.
     * @param  eventHash  The keccak256 event hash to look up
     */
    function getEventDetails(bytes32 eventHash)
        external
        view
        returns (FraudEvent memory)
    {
        require(_eventByHash[eventHash].exists, "FraudLog: event not found");
        return _eventByHash[eventHash];
    }

    /**
     * @notice Total number of fraud events logged across all students.
     */
    function totalEvents() external view returns (uint256) {
        return allEventHashes.length;
    }

    // ── Admin Functions ───────────────────────────────────────────────────────

    /**
     * @notice Transfer logger authority to a new backend address.
     * @dev    Only owner can do this. Useful if backend wallet rotates.
     */
    function setAuthorisedLogger(address _newLogger) external onlyOwner {
        require(_newLogger != address(0), "FraudLog: zero address");
        authorisedLogger = _newLogger;
    }
}
