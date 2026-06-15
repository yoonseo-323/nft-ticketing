require("dotenv").config();
const { ethers } = require("ethers");
const { ownerWallet } = require("../config/chain");
const path = require("path");

const artifactBase = path.join(__dirname, "../../../contract/artifacts/contracts");

const identityRegistryABI = require(`${artifactBase}/IdentityRegistry.sol/IdentityRegistry.json`).abi;
const ticketNFTABI = require(`${artifactBase}/TicketNFT.sol/TicketNFT.json`).abi;
const ticketMarketABI = require(`${artifactBase}/TicketMarket.sol/TicketMarket.json`).abi;
const fanNFTABI = require(`${artifactBase}/FanNFT.sol/FanNFT.json`).abi;

const identityRegistry = new ethers.Contract(
  process.env.IDENTITY_REGISTRY_ADDRESS,
  identityRegistryABI,
  ownerWallet
);

const ticketNFT = new ethers.Contract(
  process.env.TICKET_NFT_ADDRESS,
  ticketNFTABI,
  ownerWallet
);

const ticketMarket = new ethers.Contract(
  process.env.TICKET_MARKET_ADDRESS,
  ticketMarketABI,
  ownerWallet
);

const fanNFT = new ethers.Contract(
  process.env.FAN_NFT_ADDRESS,
  fanNFTABI,
  ownerWallet
);

module.exports = { identityRegistry, ticketNFT, ticketMarket, fanNFT };
