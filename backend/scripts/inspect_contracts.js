const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("=== CONTRACT DEPLOYMENT INSPECTOR ===");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
  if (!ownerPrivateKey) {
    console.error("OWNER_PRIVATE_KEY is not defined in .env");
    process.exit(1);
  }
  const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);
  console.log("Backend Admin Wallet address:", ownerWallet.address);

  const addresses = {
    IDENTITY_REGISTRY: process.env.IDENTITY_REGISTRY_ADDRESS,
    TICKET_NFT: process.env.TICKET_NFT_ADDRESS,
    TICKET_MARKET: process.env.TICKET_MARKET_ADDRESS,
    FAN_NFT: process.env.FAN_NFT_ADDRESS
  };

  for (const [name, addr] of Object.entries(addresses)) {
    console.log(`\nChecking ${name} at address: ${addr}`);
    if (!addr) {
      console.log(`❌ ${name} address is NOT defined in .env`);
      continue;
    }

    try {
      const code = await provider.getCode(addr);
      if (code === "0x") {
        console.log(`❌ No code deployed at this address (it is an EOA or empty).`);
      } else {
        console.log(`✅ Code is deployed (${code.length / 2 - 1} bytes).`);
      }
    } catch (err) {
      console.log(`❌ Failed to get code: ${err.message}`);
    }
  }

  // Inspect TicketNFT details
  if (addresses.TICKET_NFT) {
    console.log("\n--- Inspecting TicketNFT Contract ---");
    try {
      const ticketNFTABI = [
        "function owner() view returns (address)",
        "function fanNFT() view returns (address)",
        "function identityRegistry() view returns (address)"
      ];
      const ticketNFT = new ethers.Contract(addresses.TICKET_NFT, ticketNFTABI, provider);
      const ownerAddr = await ticketNFT.owner();
      const linkedFanNFT = await ticketNFT.fanNFT();
      const linkedRegistry = await ticketNFT.identityRegistry();

      console.log("TicketNFT Owner:", ownerAddr);
      console.log("Is Owner matching Backend Wallet?", ownerAddr.toLowerCase() === ownerWallet.address.toLowerCase() ? "✅ YES" : "❌ NO");
      console.log("Linked FanNFT in TicketNFT:", linkedFanNFT);
      console.log("Is Linked FanNFT matching .env?", linkedFanNFT.toLowerCase() === addresses.FAN_NFT?.toLowerCase() ? "✅ YES" : "❌ NO");
      console.log("Linked IdentityRegistry in TicketNFT:", linkedRegistry);
      console.log("Is Linked IdentityRegistry matching .env?", linkedRegistry.toLowerCase() === addresses.IDENTITY_REGISTRY?.toLowerCase() ? "✅ YES" : "❌ NO");

    } catch (err) {
      console.log("❌ Failed to inspect TicketNFT details:", err.message);
    }
  }

  // Inspect FanNFT details
  if (addresses.FAN_NFT) {
    console.log("\n--- Inspecting FanNFT Contract ---");
    try {
      const fanNFTABI = [
        "function owner() view returns (address)",
        "function ticketNFT() view returns (address)"
      ];
      const fanNFT = new ethers.Contract(addresses.FAN_NFT, fanNFTABI, provider);
      const ownerAddr = await fanNFT.owner();
      const linkedTicketNFT = await fanNFT.ticketNFT();

      console.log("FanNFT Owner:", ownerAddr);
      console.log("Linked TicketNFT in FanNFT:", linkedTicketNFT);
      console.log("Is Linked TicketNFT matching .env?", linkedTicketNFT.toLowerCase() === addresses.TICKET_NFT?.toLowerCase() ? "✅ YES" : "❌ NO");

    } catch (err) {
      console.log("❌ Failed to inspect FanNFT details:", err.message);
    }
  }

  process.exit(0);
}

main();
