// 컨트랙트 재배포시 KYC인증 동기화
require("dotenv").config();
const db = require("../src/models/db");
const { identityRegistry } = require("../src/contracts");

(async () => {
  const result = await db.query(
    "SELECT wallet_address FROM users WHERE is_kyc = true AND wallet_address IS NOT NULL"
  );
  const candidates = result.rows.map((r) => r.wallet_address);

  // 이미 온체인에 등록된 주소는 제외 (하나라도 섞이면 registerBatch 전체가 revert됨)
  const toRegister = [];
  for (const addr of candidates) {
    const verified = await identityRegistry.isVerified(addr);
    if (!verified) toRegister.push(addr);
  }

  if (toRegister.length === 0) {
    console.log("이미 전부 등록되어 있습니다.");
    process.exit(0);
  }

  console.log(`${toRegister.length}개 주소 재등록 중...`, toRegister);
  const tx = await identityRegistry.registerBatch(toRegister);
  await tx.wait();
  console.log("✅ 완료!");
  process.exit(0);
})().catch((err) => {
  console.error("❌ 실패:", err.message);
  process.exit(1);
});