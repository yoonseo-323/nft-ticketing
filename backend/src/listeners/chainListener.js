const { ticketNFT, fanNFT } = require("../contracts");
const db = require("../models/db");

function startChainListener() {
  // TicketMinted(tokenId, to) 이벤트를 수신해 DB tickets 상태를 CONFIRMED로 변경
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

  // FanNFT 관람 횟수 기록 이벤트
  fanNFT.on("AttendanceRecorded", async (fan, artist, tokenId, attendanceCount) => {
    const walletAddress = fan.toLowerCase();
    const artistAddress = artist.toLowerCase();
    const tid = Number(tokenId);
    const count = Number(attendanceCount);
    const tier = getTier(count);

    console.log(`[체인] AttendanceRecorded fan=${walletAddress} artist=${artistAddress} count=${count} tier=${tier}`);

    try {
      await db.query(
        `INSERT INTO fan_nft (wallet_address, artist_address, token_id, attendance_count, tier, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (wallet_address, artist_address)
         DO UPDATE SET
           token_id = EXCLUDED.token_id,
           attendance_count = EXCLUDED.attendance_count,
           tier = EXCLUDED.tier,
           updated_at = NOW()`,
        [walletAddress, artistAddress, tid, count, tier]
      );
    } catch (err) {
      console.error("[체인 리스너] fan_nft DB 업데이트 실패:", err.message);
    }
  });

  // FanNFT 등급 상승 이벤트 → /notify 연동
  fanNFT.on("TierUpgraded", async (fan, artist, newTier) => {
    const walletAddress = fan.toLowerCase();
    const artistAddress = artist.toLowerCase();
    console.log(`[체인] TierUpgraded fan=${walletAddress} artist=${artistAddress} newTier=${newTier}`);

    try {
      const port = process.env.PORT || 3000;
      await fetch(`http://localhost:${port}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, artistAddress, tier: newTier }),
      });
    } catch (err) {
      console.error("[체인 리스너] notify 전송 실패:", err.message);
    }
  });

  console.log("✅ 체인 이벤트 리스너 시작됨");
}

function getTier(count) {
  if (count >= 25) return "DIAMOND";
  if (count >= 15) return "PLATINUM";
  if (count >= 7)  return "GOLD";
  if (count >= 3)  return "SILVER";
  if (count >= 1)  return "BRONZE";
  return "NONE";
}

module.exports = { startChainListener };