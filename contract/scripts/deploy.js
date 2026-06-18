import pkg from "hardhat";
const { ethers } = pkg;
import pgPkg from "pg";
const { Client } = pgPkg;

/**
 * 컨트랙트 재배포 시 온체인-DB 상태 동기화
 * - market_listings: ACTIVE → CANCELLED
 * - tickets: token_id, tx_hash 초기화 (온체인 NFT가 사라지므로)
 */
async function resetDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("⚠️  DATABASE_URL이 설정되지 않아 DB 초기화를 건너뜁니다");
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();

    // ACTIVE 리스팅 → CANCELLED (온체인 listings 초기화됨)
    const listingResult = await client.query(
      "UPDATE market_listings SET status = 'CANCELLED' WHERE status = 'ACTIVE'"
    );
    console.log(`   - market_listings: ${listingResult.rowCount}건 CANCELLED 처리`);

    // CONFIRMED 티켓의 온체인 정보 초기화 (민팅 데이터가 사라짐)
    const ticketResult = await client.query(
      "UPDATE tickets SET token_id = NULL, tx_hash = NULL, status = 'CANCELLED' WHERE status IN ('CONFIRMED', 'PENDING')"
    );
    console.log(`   - tickets: ${ticketResult.rowCount}건 초기화`);

    // SOLD/RESERVED 좌석 → AVAILABLE (티켓이 초기화되므로)
    const seatResult = await client.query(
      "UPDATE seats SET status = 'AVAILABLE', reserved_at = NULL WHERE status IN ('SOLD', 'RESERVED')"
    );
    console.log(`   - seats: ${seatResult.rowCount}건 AVAILABLE 복원`);

    await client.end();
  } catch (err) {
    console.error("⚠️  DB 초기화 중 오류 (배포는 계속 진행):", err.message);
    await client.end().catch(() => {});
  }
}

async function main() {
  console.log("=========================================");
  console.log("🚀 NFT 티켓 시스템 스마트 컨트랙트 배포 시작...");
  console.log("=========================================");

  // 1. IdentityRegistry 배포
  console.log("\n1. IdentityRegistry 배포 중...");
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log(`✅ IdentityRegistry 배포 완료: ${identityRegistryAddress}`);

  // 2. TicketNFT 배포 (IdentityRegistry 주소 주입)
  console.log("\n2. TicketNFT 배포 중...");
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const ticketNFT = await TicketNFT.deploy(identityRegistryAddress);
  await ticketNFT.waitForDeployment();
  const ticketNFTAddress = await ticketNFT.getAddress();
  console.log(`✅ TicketNFT 배포 완료: ${ticketNFTAddress}`);

  // 3. FanNFT 배포 (기본 baseURI 주입)
  console.log("\n3. FanNFT 배포 중...");
  const FanNFT = await ethers.getContractFactory("FanNFT");
  const fanNFT = await FanNFT.deploy("http://localhost:3000/fan-nft/metadata/");
  await fanNFT.waitForDeployment();
  const fanNFTAddress = await fanNFT.getAddress();
  console.log(`✅ FanNFT 배포 완료: ${fanNFTAddress}`);

  // 4. TicketNFT와 FanNFT 상호 연결 설정
  console.log("\n4. TicketNFT와 FanNFT 상호 연결 설정 중...");
  const setFanNFTTx = await ticketNFT.setFanNFT(fanNFTAddress);
  await setFanNFTTx.wait();
  const setTicketNFTTx = await fanNFT.setTicketNFT(ticketNFTAddress);
  await setTicketNFTTx.wait();
  console.log("✅ TicketNFT - FanNFT 주소 연동 성공");

  // 5. TicketMarket 배포 (생성자 인자 없음)
  console.log("\n5. TicketMarket 배포 중...");
  const TicketMarket = await ethers.getContractFactory("TicketMarket");
  const ticketMarket = await TicketMarket.deploy();
  await ticketMarket.waitForDeployment();
  const ticketMarketAddress = await ticketMarket.getAddress();
  console.log(`✅ TicketMarket 배포 완료: ${ticketMarketAddress}`);

  // 6. 온체인-DB 상태 동기화 (재배포 시 기존 DB 데이터 정리)
  console.log("\n6. DB 온체인 동기화 중...");
  await resetDatabase();
  console.log("✅ DB 동기화 완료");

  console.log("\n=========================================");
  console.log("🎉 모든 스마트 컨트랙트 배포 성공!");
  console.log("=========================================");
  console.log("\n👇 백엔드 및 프론트엔드 .env 파일에 아래 값을 복사하여 붙여넣으세요:");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${identityRegistryAddress}`);
  console.log(`TICKET_NFT_ADDRESS=${ticketNFTAddress}`);
  console.log(`FAN_NFT_ADDRESS=${fanNFTAddress}`);
  console.log(`TICKET_MARKET_ADDRESS=${ticketMarketAddress}`);
  console.log("=========================================");
}

main().catch((error) => {
  console.error("\n❌ 배포 중 오류 발생:");
  console.error(error);
  process.exitCode = 1;
});
