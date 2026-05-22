import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("배포 계정:", deployer.address);

  // 1. IdentityRegistry 배포
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  console.log("IdentityRegistry:", identityRegistry.target);

  // 2. TicketNFT 배포 (IdentityRegistry 주소 주입)
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const ticketNFT = await TicketNFT.deploy(identityRegistry.target);
  await ticketNFT.waitForDeployment();
  console.log("TicketNFT:", ticketNFT.target);

  // 3. TicketMarket 배포
  const TicketMarket = await ethers.getContractFactory("TicketMarket");
  const ticketMarket = await TicketMarket.deploy();
  await ticketMarket.waitForDeployment();
  console.log("TicketMarket:", ticketMarket.target);

  console.log("\n.env에 아래 값을 복사하세요:");
  console.log(`IDENTITY_REGISTRY_ADDRESS=${identityRegistry.target}`);
  console.log(`TICKET_NFT_ADDRESS=${ticketNFT.target}`);
  console.log(`TICKET_MARKET_ADDRESS=${ticketMarket.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
