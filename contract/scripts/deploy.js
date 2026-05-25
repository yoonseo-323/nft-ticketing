import pkg from "hardhat";
const { ethers } = pkg;

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

  // 3. TicketMarket 배포 (생성자 인자 없음)
  console.log("\n3. TicketMarket 배포 중...");
  const TicketMarket = await ethers.getContractFactory("TicketMarket");
  const ticketMarket = await TicketMarket.deploy();
  await ticketMarket.waitForDeployment();
  const ticketMarketAddress = await ticketMarket.getAddress();
  console.log(`✅ TicketMarket 배포 완료: ${ticketMarketAddress}`);

  console.log("\n=========================================");
  console.log("🎉 모든 스마트 컨트랙트 배포 성공!");
  console.log("=========================================");
  console.log("\n👇 백엔드 및 프론트엔드 .env 파일에 아래 값을 복사하여 붙여넣으세요:");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${identityRegistryAddress}`);
  console.log(`TICKET_NFT_ADDRESS=${ticketNFTAddress}`);
  console.log(`TICKET_MARKET_ADDRESS=${ticketMarketAddress}`);
  console.log("=========================================");
}

main().catch((error) => {
  console.error("\n❌ 배포 중 오류 발생:");
  console.error(error);
  process.exitCode = 1;
});
