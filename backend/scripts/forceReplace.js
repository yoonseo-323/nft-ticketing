// 멤풀에 멈춰있는 nonce 31번 트랜잭션을 더 높은 가스비로 교체
require("dotenv").config();
const { ethers } = require("ethers");
const db = require("../src/models/db");
const { identityRegistry } = require("../src/contracts");

(async () => {
  const result = await db.query(
    "SELECT wallet_address FROM users WHERE is_kyc = true AND wallet_address IS NOT NULL"
  );
  const candidates = result.rows.map((r) => r.wallet_address);

  const toRegister = [];
  for (const addr of candidates) {
    const verified = await identityRegistry.isVerified(addr);
    if (!verified) toRegister.push(addr);
  }

  if (toRegister.length === 0) {
    console.log("이미 전부 등록되어 있습니다.");
    process.exit(0);
  }

  console.log(`${toRegister.length}개 주소, nonce 31로 교체 전송 중...`, toRegister);

  const tx = await identityRegistry.registerBatch(toRegister, {
    nonce: 31,
    maxFeePerGas: ethers.parseUnits("15", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1.5", "gwei"),
  });

  console.log("재전송 tx hash:", tx.hash);
  await tx.wait();
  console.log("✅ 완료!");
  process.exit(0);
})().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});