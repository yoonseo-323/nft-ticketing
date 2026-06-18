// publicnode를 통해 isVerified 체크 + registerBatch 전송 (Alchemy 지연 문제 회피)
// sepolia 배포용
require("dotenv").config();
const { ethers } = require("ethers");
const db = require("../src/models/db");

const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);

const abi = [
  "function isVerified(address) view returns (bool)",
  "function registerBatch(address[] calldata wallets) external",
];

const identityRegistry = new ethers.Contract(
  process.env.IDENTITY_REGISTRY_ADDRESS,
  abi,
  wallet
);

(async () => {
  const result = await db.query(
    "SELECT wallet_address FROM users WHERE is_kyc = true AND wallet_address IS NOT NULL"
  );
  const candidates = result.rows.map((r) => r.wallet_address);

  const toRegister = [];
  for (const addr of candidates) {
    const verified = await identityRegistry.isVerified(addr);
    console.log(addr, "->", verified ? "이미 등록됨" : "등록 필요");
    if (!verified) toRegister.push(addr);
  }

  if (toRegister.length === 0) {
    console.log("이미 전부 등록되어 있습니다.");
    process.exit(0);
  }

  console.log(`${toRegister.length}개 주소 재등록 중 (publicnode 경유)...`, toRegister);

  const tx = await identityRegistry.registerBatch(toRegister);
  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ 완료!");
  process.exit(0);
})().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});