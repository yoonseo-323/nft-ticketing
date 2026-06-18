require("dotenv").config();
const { ethers } = require("ethers");
const { ownerWallet } = require("../config/chain");
const path = require("path");

const artifactBase = path.join(__dirname, "../../../contract/artifacts/contracts");

const identityRegistryABI = require(`${artifactBase}/IdentityRegistry.sol/IdentityRegistry.json`).abi;
const ticketNFTABI = require(`${artifactBase}/TicketNFT.sol/TicketNFT.json`).abi;
const ticketMarketABI = require(`${artifactBase}/TicketMarket.sol/TicketMarket.json`).abi;
const fanNFTABI = require(`${artifactBase}/FanNFT.sol/FanNFT.json`).abi;

// owner 지갑을 NonceManager로 감싸서 모든 컨트랙트가 nonce를 메모리에서 안전하게 공유
const nonceManagedWallet = new ethers.NonceManager(ownerWallet);

const identityRegistry = new ethers.Contract(
  process.env.IDENTITY_REGISTRY_ADDRESS,
  identityRegistryABI,
  nonceManagedWallet
);

const ticketNFT = new ethers.Contract(
  process.env.TICKET_NFT_ADDRESS,
  ticketNFTABI,
  nonceManagedWallet
);

const ticketMarket = new ethers.Contract(
  process.env.TICKET_MARKET_ADDRESS,
  ticketMarketABI,
  nonceManagedWallet
);

const fanNFT = new ethers.Contract(
  process.env.FAN_NFT_ADDRESS,
  fanNFTABI,
  nonceManagedWallet
);

module.exports = { identityRegistry, ticketNFT, ticketMarket, fanNFT };