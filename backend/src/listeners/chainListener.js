const { ticketNFT } = require("../contracts");
const db = require("../models/db");

// TicketMinted(tokenId, to) 이벤트를 수신해 DB tickets 상태를 CONFIRMED로 변경
function startChainListener() {
  ticketNFT.on("TicketMinted", async (tokenId, to) => {
    const id = Number(tokenId);
    console.log(`[체인] TicketMinted tokenId=${id} to=${to}`);
    try {
      await db.query(
        `UPDATE tickets SET status = 'CONFIRMED' WHERE token_id = $1 AND status = 'PENDING'`,
        [id]
      );
    } catch (err) {
      console.error("[체인 리스너] DB 업데이트 실패:", err.message);
    }
  });

  console.log("✅ 체인 이벤트 리스너 시작됨");
}

module.exports = { startChainListener };
