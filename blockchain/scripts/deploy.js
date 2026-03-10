const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // ── Deploy ExamSystem ────────────────────────────────────────────────────
    const ExamSystem = await hre.ethers.getContractFactory("ExamSystem");
    const examSystem = await ExamSystem.deploy();
    await examSystem.waitForDeployment();
    const address = await examSystem.getAddress();
    console.log("✅ ExamSystem deployed to:", address);

    // ── Deploy FraudLog (aiblock.md Part 2) ──────────────────────────────────
    // The deployer address is passed as the authorised logger.
    // In production, replace with the backend server's wallet address.
    const FraudLog = await hre.ethers.getContractFactory("FraudLog");
    const fraudLog = await FraudLog.deploy(deployer.address, "v2.1.0");
    await fraudLog.waitForDeployment();
    const fraudLogAddress = await fraudLog.getAddress();
    console.log("✅ FraudLog deployed to:", fraudLogAddress);

    // ── Auto-update contract address in all relevant files ──────────────────

    const addressToWrite = address;

    // 1. Write a shared config JSON that the frontend & backend can reference
    const configPath = path.join(__dirname, "../../contract_config.json");
    fs.writeFileSync(configPath, JSON.stringify({
        CONTRACT_ADDRESS: addressToWrite,
        FRAUD_LOG_ADDRESS: fraudLogAddress,
        NETWORK: hre.network.name,
        DEPLOYED_AT: new Date().toISOString(),
        DEPLOYER: deployer.address,
    }, null, 2));
    console.log("✅ contract_config.json updated:", configPath);

    // 2. Update the hardcoded address in frontend components
    const frontendFiles = [
        path.join(__dirname, "../../frontend/src/components/WebcamCapture.jsx"),
        path.join(__dirname, "../../frontend/src/components/ExamSession.jsx"),
        path.join(__dirname, "../../frontend/src/components/StudentDashboard.jsx"),
        path.join(__dirname, "../../frontend/src/components/AdminDashboard.jsx"),
        path.join(__dirname, "../../frontend/src/components/Landing.jsx"),
        path.join(__dirname, "../../frontend/src/components/InvigilatorDashboard.jsx"),
        path.join(__dirname, "../../frontend/src/components/ResearcherPanel.jsx"),
    ];

    const addressRegex = /const CONTRACT_ADDRESS\s*=\s*"0x[a-fA-F0-9]{40}"/g;
    const replacement = `const CONTRACT_ADDRESS = "${addressToWrite}"`;

    let updatedCount = 0;
    for (const filePath of frontendFiles) {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf8");
            if (addressRegex.test(content)) {
                const updated = content.replace(addressRegex, replacement);
                fs.writeFileSync(filePath, updated, "utf8");
                console.log(`✅ Updated: ${path.basename(filePath)}`);
                updatedCount++;
            }
            // Reset regex lastIndex for next iteration
            addressRegex.lastIndex = 0;
        }
    }

    // 3. Update backend server.js
    const backendPath = path.join(__dirname, "../../backend/server.js");
    if (fs.existsSync(backendPath)) {
        const content = fs.readFileSync(backendPath, "utf8");
        const updated = content.replace(addressRegex, replacement);
        addressRegex.lastIndex = 0;
        fs.writeFileSync(backendPath, updated, "utf8");
        console.log("✅ Updated: server.js");
        updatedCount++;
    }

    // 4. Copy the compiled ABIs to frontend and backend
    const examArtifactPath = path.join(__dirname, "../artifacts/contracts/ExamSystem.sol/ExamSystem.json");
    if (fs.existsSync(examArtifactPath)) {
        fs.copyFileSync(examArtifactPath, path.join(__dirname, "../../frontend/src/ExamSystem.json"));
        fs.copyFileSync(examArtifactPath, path.join(__dirname, "../../backend/ExamSystem.json"));
        console.log("✅ ExamSystem ABI copied to frontend/src and backend");
    }

    const fraudLogArtifactPath = path.join(__dirname, "../artifacts/contracts/FraudLog.sol/FraudLog.json");
    if (fs.existsSync(fraudLogArtifactPath)) {
        fs.copyFileSync(fraudLogArtifactPath, path.join(__dirname, "../../frontend/src/FraudLog.json"));
        fs.copyFileSync(fraudLogArtifactPath, path.join(__dirname, "../../backend/FraudLog.json"));
        console.log("✅ FraudLog ABI copied to frontend/src and backend");
    }

    console.log(`\n🎉 Deployment complete!`);
    console.log(`   ExamSystem Address : ${addressToWrite}`);
    console.log(`   FraudLog Address   : ${fraudLogAddress}`);
    console.log(`   Network: ${hre.network.name}`);
    console.log(`   Files Updated: ${updatedCount}`);
    const netCfg = hre.network.config || {};
    const rpcUrl = netCfg.url || "N/A";
    const chainId = typeof netCfg.chainId !== "undefined" ? netCfg.chainId : "N/A";
    const networkLabel = hre.network.name === "ganache" ? "Ganache Local" : hre.network.name;
    console.log(`\n⚡ Add this network to MetaMask:`);
    console.log(`   Network Name: ${networkLabel}`);
    console.log(`   RPC URL: ${rpcUrl}`);
    console.log(`   Chain ID: ${chainId}`);
    console.log(`   Currency: ETH`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
