require("dotenv").config();
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
const ownerWallet = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);

module.exports = { provider, ownerWallet };
