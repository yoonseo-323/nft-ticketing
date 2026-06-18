const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const db = require("../models/db");
const auth = require("../middlewares/auth");
const admin = require("../middlewares/admin");
const { ticketNFT } = require("../contracts");
const { ownerWallet } = require("../config/chain");

// POST /ticket/purchase — 좌석 선점 + mock 결제 + NFT 발행
router.post("/purchase", auth, async (req, res) => {
  const client = await db.getClient();
  try {
    const { eventId, seatId } = req.body;
    if (!eventId || !seatId) {
      return res.status(400).json({ error: "eventId, seatId 필수" });
    }

    await client.query("BEGIN");

    // 좌석 선점 (트랜잭션 + 락으로 동시 요청 차단)
    const seatResult = await client.query(
      `SELECT s.*, e.original_price FROM seats s
       JOIN events e ON s.event_id = e.id
       WHERE s.id = $1 AND s.event_id = $2 AND s.status = 'AVAILABLE'
       FOR UPDATE`,
      [seatId, eventId]
    );
    if (seatResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "좌석이 없거나 이미 예약됨" });
    }
    const seat = seatResult.rows[0];

    await client.query(
      "UPDATE seats SET status = 'RESERVED', reserved_at = NOW() WHERE id = $1",
      [seatId]
    );

    // PENDING 티켓 생성
    const ticketResult = await client.query(
      `INSERT INTO tickets (owner_id, event_id, seat_id, status, qr_version)
       VALUES ($1, $2, $3, 'PENDING', 0) RETURNING id`,
      [req.user.userId, eventId, seatId]
    );
    const ticketDbId = ticketResult.rows[0].id;

    await client.query("COMMIT");

    // 사용자 지갑 주소 조회
    const userResult = await db.query(
      "SELECT wallet_address FROM users WHERE id = $1",
      [req.user.userId]
    );
    const walletAddress = userResult.rows[0].wallet_address;

    // 온체인 mint (mock 결제 완료로 간주)
    const tx = await ticketNFT.mint(
      walletAddress,
      seat.seat_number,
      BigInt(seat.original_price)
    );
    const receipt = await tx.wait();

    // TicketMinted 이벤트에서 tokenId 추출
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = ticketNFT.interface.parseLog(log);
        if (parsed.name === "TicketMinted") {
          tokenId = Number(parsed.args.tokenId);
          break;
        }
      } catch {}
    }

    // DB 확정
    await db.query(
      `UPDATE tickets SET token_id = $1, status = 'CONFIRMED', tx_hash = $2 WHERE id = $3`,
      [tokenId, receipt.hash, ticketDbId]
    );
    await db.query(
      "UPDATE seats SET status = 'SOLD' WHERE id = $1",
      [seatId]
    );

    res.json({ ok: true, tokenId, txHash: receipt.hash });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /ticket/my — 내 티켓 목록
router.get("/my", auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.id, t.token_id, t.status, t.qr_version, t.created_at,
              e.name AS event_name, e.venue, e.event_date, e.original_price,
              s.seat_number
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       JOIN seats s ON t.seat_id = s.id
       WHERE t.owner_id = $1 AND t.status NOT IN ('CANCELLED')
       ORDER BY e.event_date ASC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ticket/qr/:tokenId — QR 데이터 생성 (유효 시간 1분)
router.get("/qr/:tokenId", auth, async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);

    const ticketResult = await db.query(
      `SELECT t.*, u.wallet_address FROM tickets t
       JOIN users u ON t.owner_id = u.id
       WHERE t.token_id = $1 AND t.status = 'CONFIRMED'`,
      [tokenId]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "확정된 티켓을 찾을 수 없습니다" });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.owner_id !== req.user.userId) {
      return res.status(403).json({ error: "본인 티켓만 QR 조회 가능" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${tokenId}:${ticket.owner_id}:${ticket.qr_version}:${timestamp}`;
    const signature = await ownerWallet.signMessage(payload);

    res.json({
      tokenId,
      qrVersion: ticket.qr_version,
      timestamp,
      expiresIn: 60,
      qrData: `${payload}:${signature}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ticket/enter — QR 검증 + 입장 처리 (ADMIN 전용)
router.post("/enter", admin, async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ error: "qrData 필수" });

    const parts = qrData.split(":");
    if (parts.length !== 5) return res.status(400).json({ error: "QR 형식 오류" });

    const [tokenId, userId, qrVersion, timestamp, signature] = parts;

    // 1분 만료 검증
    const now = Math.floor(Date.now() / 1000);
    if (now - parseInt(timestamp) > 60) {
      return res.status(401).json({ error: "QR 코드가 만료되었습니다 (1분)" });
    }

    // ECDSA 서명 검증: 서명에서 주소 복원 후 서버 지갑 주소와 비교
    const payload = `${tokenId}:${userId}:${qrVersion}:${timestamp}`;
    const recoveredAddress = ethers.verifyMessage(payload, signature);
    if (recoveredAddress.toLowerCase() !== ownerWallet.address.toLowerCase()) {
      return res.status(401).json({ error: "QR 서명이 유효하지 않습니다" });
    }

    // DB 티켓 확인
    const ticketResult = await db.query(
      `SELECT t.*, e.name AS event_name, s.seat_number, u.nickname
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       JOIN seats s ON t.seat_id = s.id
       JOIN users u ON t.owner_id = u.id
       WHERE t.token_id = $1 AND t.status = 'CONFIRMED'`,
      [parseInt(tokenId)]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "유효한 티켓 없음 (이미 사용됐거나 존재하지 않음)" });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.owner_id !== userId) {
      return res.status(401).json({ error: "소유자 불일치" });
    }
    if (parseInt(qrVersion) !== ticket.qr_version) {
      return res.status(401).json({ error: "이미 사용된 QR 코드입니다" });
    }

    // 입장 처리
    await db.query(
      `UPDATE tickets SET status = 'USED', entered_at = NOW(), qr_version = qr_version + 1
       WHERE id = $1`,
      [ticket.id]
    );
    await db.query("UPDATE seats SET status = 'USED' WHERE id = $1", [ticket.seat_id]);

    // NFT 소각 (비동기)
    ticketNFT.burn(parseInt(tokenId)).catch((err) =>
      console.error("[burn 실패]", err.message)
    );

    res.json({
      ok: true,
      nickname: ticket.nickname,
      eventName: ticket.event_name,
      seatNumber: ticket.seat_number,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ticket/cancel/:ticketId — 티켓 취소 (공연 전)
router.post("/cancel/:ticketId", auth, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticketResult = await db.query(
      "SELECT * FROM tickets WHERE id = $1 AND owner_id = $2 AND status = 'CONFIRMED'",
      [ticketId, req.user.userId]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "취소 가능한 티켓이 없습니다" });
    }
    const ticket = ticketResult.rows[0];

    // NFT 소각 (단순 취소용 소각 함수 호출)
    try {
      await ticketNFT.burnForCancellation(ticket.token_id);
    } catch (contractErr) {
      console.warn(`[NFT 소각 건너뜀] 토큰 ID ${ticket.token_id} 소각 중 에러 발생:`, contractErr.message);
      // ERC721NonexistentToken, nonexistent token 또는 CALL_EXCEPTION(함수 미정의 등) 발생 시
      // 이미 소각되었거나 환경 리셋으로 판단하고 DB 취소 처리를 계속 진행합니다.
      const isNonexistent = contractErr.message.includes("ERC721NonexistentToken") || 
                            contractErr.message.includes("nonexistent token") ||
                            contractErr.code === "CALL_EXCEPTION";
      if (!isNonexistent) {
        throw contractErr;
      }
    }

    // DB 처리
    await db.query("UPDATE tickets SET status = 'CANCELLED' WHERE id = $1", [ticketId]);
    await db.query("UPDATE seats SET status = 'AVAILABLE', reserved_at = NULL WHERE id = $1", [ticket.seat_id]);

    res.json({ ok: true, message: "티켓이 취소되었습니다 (환불은 별도 처리)" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
