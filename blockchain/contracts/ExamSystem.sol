// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ExamSystem {

    // ── Roles ──────────────────────────────────────────────────────────────────
    enum Role { Student, Admin, Invigilator, Validator }

    // ── Structs ────────────────────────────────────────────────────────────────
    struct User {
        string  name;
        string  matricNumber;   // institutional ID bound at enrollment
        Role    role;
        bool    isRegistered;
        address walletAddress;
    }

    struct Enrollment {
        string  matricNumber;   // matric/staff ID pre-approved by admin
        Role    allowedRole;
        bool    isEnrolled;
    }

    struct Exam {
        uint256 id;
        string  subject;
        string  title;
        string  questionData;   // JSON string
        address creator;
        bool    isActive;
    }

    struct FraudEvent {
        string  studentID;
        uint256 examID;
        uint256 riskScore;
        uint256 timestamp;
        string  evidenceHash;
    }

    struct Result {
        address student;
        uint256 examId;
        uint256 score;
        uint256 timestamp;
    }

    // ── State ──────────────────────────────────────────────────────────────────
    address public contractOwner;

    mapping(address => User)       public users;
    mapping(address => Enrollment) public enrollments;
    mapping(string  => address)    public matricToWallet; // prevent duplicate matric numbers

    Exam[]        public exams;
    FraudEvent[]  public fraudHistory;
    Result[]      public allResults;

    // ── Events ─────────────────────────────────────────────────────────────────
    event UserEnrolled   (address indexed wallet, string matricNumber, Role role);
    event EnrollmentRevoked(address indexed wallet);
    event UserRegistered (address indexed wallet, string name, Role role);
    event ExamCreated    (uint256 indexed examId, string title, address creator);
    event FraudLogged    (string studentID, uint256 indexed examID, uint256 riskScore);
    event ExamSubmitted  (address indexed student, uint256 indexed examId, uint256 score);

    // ── Custom Errors (saves gas vs string-based require) ──────────────────────
    error OnlyOwnerAllowed();
    error OnlyAdminAllowed();
    error OnlyOwnerOrAdminAllowed();
    error UserNotRegistered();
    error InvalidWalletAddress();
    error AlreadyEnrolled();
    error MatricAlreadyInUse();
    error MatricRequired();
    error NameRequired();
    error CannotRevokeRegisteredUser();
    error NotEnrolled();
    error MatricClashOrUnenrolled();
    error EnrollmentMatricMismatch();
    error InvalidSelfSignupRole();
    error ExamDoesNotExist();

    // ── Constructor ────────────────────────────────────────────────────────────
    constructor() {
        contractOwner = msg.sender;
        // Auto-enroll the deployer as Admin so they can bootstrap the system
        enrollments[msg.sender] = Enrollment({
            matricNumber: "ADMIN-001",
            allowedRole:  Role.Admin,
            isEnrolled:   true
        });
        matricToWallet["ADMIN-001"] = msg.sender;
    }

    // ── Modifiers ──────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != contractOwner) revert OnlyOwnerAllowed();
        _;
    }

    modifier onlyAdmin() {
        if (!users[msg.sender].isRegistered || users[msg.sender].role != Role.Admin) revert OnlyAdminAllowed();
        _;
    }

    modifier onlyOwnerOrAdmin() {
        bool isOwner = msg.sender == contractOwner;
        bool isRegisteredAdmin = users[msg.sender].isRegistered && users[msg.sender].role == Role.Admin;
        if (!isOwner && !isRegisteredAdmin) revert OnlyOwnerOrAdminAllowed();
        _;
    }

    modifier onlyRegistered() {
        if (!users[msg.sender].isRegistered) revert UserNotRegistered();
        _;
    }

    // ── Enrollment Management (Owner or Registered Admin) ────────────────────────────────────

    /**
     * @dev Pre-approve a wallet address so it can register.
     *      Can be called by contract owner or a registered Admin.
     * @param _wallet      The student/staff wallet address
     * @param _matricNumber Their institutional matric/staff ID
     * @param _role        The role they are allowed to register as
     */
    function enrollUser(
        address _wallet,
        string  calldata _matricNumber,
        Role    _role
    ) external onlyOwnerOrAdmin {
        if (_wallet == address(0)) revert InvalidWalletAddress();
        if (enrollments[_wallet].isEnrolled) revert AlreadyEnrolled();
        if (matricToWallet[_matricNumber] != address(0)) revert MatricAlreadyInUse();
        if (bytes(_matricNumber).length == 0) revert MatricRequired();

        enrollments[_wallet] = Enrollment({
            matricNumber: _matricNumber,
            allowedRole:  _role,
            isEnrolled:   true
        });
        matricToWallet[_matricNumber] = _wallet;

        emit UserEnrolled(_wallet, _matricNumber, _role);
    }

    /**
     * @dev Revoke enrollment for a wallet (owner/admin). Cannot revoke already-registered users.
     */
    function revokeEnrollment(address _wallet) external onlyOwnerOrAdmin {
        if (!enrollments[_wallet].isEnrolled) revert NotEnrolled();
        if (users[_wallet].isRegistered) revert CannotRevokeRegisteredUser();

        string memory matric = enrollments[_wallet].matricNumber;
        delete matricToWallet[matric];
        delete enrollments[_wallet];

        emit EnrollmentRevoked(_wallet);
    }

    /**
     * @dev Read enrollment record for a wallet address.
     */
    function getEnrollment(address _wallet)
        public view
        returns (string memory matricNumber, Role allowedRole, bool isEnrolled)
    {
        Enrollment memory e = enrollments[_wallet];
        return (e.matricNumber, e.allowedRole, e.isEnrolled);
    }

    // ── User Registration ──────────────────────────────────────────────────────

    /**
     * @dev Register a user.
     *      - If wallet is pre-enrolled, matric must match enrollment and role is admin-assigned.
     *      - If wallet is not pre-enrolled, user can self-register as Student or Admin.
     * @param _name         Display name
     * @param _matricNumber Institutional matric/staff ID
     * @param _requestedRole Requested role for open self-signup
     */
    function registerUser(string calldata _name, string calldata _matricNumber, Role _requestedRole) external {
        Enrollment memory enrollment = enrollments[msg.sender];
        if (users[msg.sender].isRegistered) revert AlreadyEnrolled();
        if (bytes(_name).length == 0) revert NameRequired();
        if (bytes(_matricNumber).length == 0) revert MatricRequired();
        if (matricToWallet[_matricNumber] != address(0) && matricToWallet[_matricNumber] != msg.sender) {
            revert MatricClashOrUnenrolled();
        }

        Role assignedRole;
        if (enrollment.isEnrolled) {
            if (keccak256(bytes(enrollment.matricNumber)) != keccak256(bytes(_matricNumber))) {
                revert EnrollmentMatricMismatch();
            }
            assignedRole = enrollment.allowedRole;
        } else {
            if (_requestedRole != Role.Student && _requestedRole != Role.Admin) {
                revert InvalidSelfSignupRole();
            }
            assignedRole = _requestedRole;
        }

        users[msg.sender] = User({
            name:          _name,
            matricNumber:  _matricNumber,
            role:          assignedRole,
            isRegistered:  true,
            walletAddress: msg.sender
        });
        matricToWallet[_matricNumber] = msg.sender;

        emit UserRegistered(msg.sender, _name, assignedRole);
    }

    function getUser(address _addr)
        public view
        returns (string memory name, string memory matricNumber, Role role, bool isRegistered)
    {
        User memory u = users[_addr];
        return (u.name, u.matricNumber, u.role, u.isRegistered);
    }

    // ── Exam Management ────────────────────────────────────────────────────────
    function createExam(
        string calldata _subject,
        string calldata _title,
        string calldata _questionData
    ) external onlyAdmin {
        uint256 newId = exams.length;
        exams.push(Exam(newId, _subject, _title, _questionData, msg.sender, true));
        emit ExamCreated(newId, _title, msg.sender);
    }

    function getExam(uint256 _examId)
        external view
        returns (uint256, string memory, string memory, string memory, bool)
    {
        if (_examId >= exams.length) revert ExamDoesNotExist();
        Exam memory e = exams[_examId];
        return (e.id, e.subject, e.title, e.questionData, e.isActive);
    }

    function getExamCount() public view returns (uint256) {
        return exams.length;
    }

    // ── Fraud Logging ──────────────────────────────────────────────────────────
    function logFraudEvent(
        string calldata _studentID,
        uint256       _examID,
        uint256       _riskScore,
        string calldata _evidenceHash
    ) external onlyRegistered {
        fraudHistory.push(FraudEvent({
            studentID:    _studentID,
            examID:       _examID,
            riskScore:    _riskScore,
            timestamp:    block.timestamp,
            evidenceHash: _evidenceHash
        }));
        emit FraudLogged(_studentID, _examID, _riskScore);
    }

    function getFraudHistory() public view returns (FraudEvent[] memory) {
        return fraudHistory;
    }

    // ── Exam Submission ────────────────────────────────────────────────────────
    function submitExam(uint256 _examId, uint256 _score) public onlyRegistered {
        allResults.push(Result({
            student:   msg.sender,
            examId:    _examId,
            score:     _score,
            timestamp: block.timestamp
        }));
        emit ExamSubmitted(msg.sender, _examId, _score);
    }
}
