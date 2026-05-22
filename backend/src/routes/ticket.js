const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../models/db");
const auth = require("../middlewares/auth");
const { identityRegistry, ticketNFT } = require("../contracts");

// POST /ticket/kyc — 지갑 주소를 IdentityRegistry에 등록 (KYC 완료 처리)
router.post("/kyc", auth, async (req, res) => {
  try {
    const { wallet } = req.user;

    const already = await identityRegistry.isRegistered(wallet);
    if (already) {
      return res.status(409).json({ error: "이미 KYC 등록된 지갑입니다" });
    }

    const tx = await identityRegistry.register(wallet);
    await tx.wait();

    await db.query(`UPDATE users SET is_kyc = true WHERE wallet = $1`, [wallet]);

    res.json({ ok: true, tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ticket/mint — NFT 티켓 발행
// body: { eventId, seatId }
router.post("/mint", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const { eventId, seatId } = req.body;

    if (!eventId || !seatId) {
      return res.status(400).json({ error: "eventId, seatId 필수" });
    }

    // KYC 확인
    const kycRow = await db.query(`SELECT is_kyc FROM users WHERE wallet = $1`, [wallet]);
    if (!kycRow.rows[0]?.is_kyc) {
      return res.status(403).json({ error: "KYC 인증이 필요합니다" });
    }

    // 좌석 유효성 + 이벤트 확인
    const seatResult = await db.query(
      `SELECT s.*, e.original_price FROM seats s JOIN events e ON s.event_id = e.id
       WHERE s.id = $1 AND s.event_id = $2 AND s.status = 'AVAILABLE'`,
      [seatId, eventId]
    );
    if (seatResult.rows.length === 0) {
      return res.status(400).json({ error: "좌석이 없거나 이미 예약됨" });
    }
    const seat = seatResult.rows[0];

    // 좌석 RESERVED 처리
    await db.query(`UPDATE seats SET status = 'RESERVED' WHERE id = $1`, [seatId]);

    // tokenId: 현재 시각 기반 unique number (실제 서비스에선 sequence 사용)
    const tokenId = Date.now();

    // 유저 DB row 조회
    const userResult = await db.query(`SELECT id FROM users WHERE wallet = $1`, [wallet]);
    const userId = userResult.rows[0].id;

    // DB에 PENDING 상태로 티켓 기록
    const ticketResult = await db.query(
      `INSERT INTO tickets (token_id, owner_id, event_id, seat_id, status, qr_version)
       VALUES ($1, $2, $3, $4, 'PENDING', 0) RETURNING id`,
      [tokenId, userId, eventId, seatId]
    );
    const ticketDbId = ticketResult.rows[0].id;

    // 온체인 mint (비동기 — 이벤트 리스너가 CONFIRMED 처리)
    const tx = await ticketNFT.mint(wallet, tokenId);
    await db.query(`UPDATE tickets SET tx_hash = $1 WHERE id = $2`, [tx.hash, ticketDbId]);

    res.json({ ok: true, tokenId, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ticket/my — 내 티켓 목록
router.get("/my", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const result = await db.query(
      `SELECT t.*, e.name AS event_name, e.event_date, s.seat_number
       FROM tickets t
       JOIN users u ON t.owner_id = u.id
       JOIN events e ON t.event_id = e.id
       JOIN seats s ON t.seat_id = s.id
       WHERE u.wallet = $1 AND t.status NOT IN ('CANCELLED')
       ORDER BY e.event_date ASC`,
      [wallet]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /ticket/qr/:tokenId — QR 데이터 생성 (ECDSA 서명 페이로드)
router.get("/qr/:tokenId", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const tokenId = parseInt(req.params.tokenId);

    const ticketResult = await db.query(
      `SELECT t.*, u.wallet FROM tickets t JOIN users u ON t.owner_id = u.id
       WHERE t.token_id = $1 AND t.status = 'CONFIRMED'`,
      [tokenId]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "확정된 티켓을 찾을 수 없습니다" });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: "본인 티켓만 QR 조회 가능" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${tokenId}:${wallet}:${ticket.qr_version}:${timestamp}`;
    const signature = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(payload)
      .digest("hex");

    res.json({
      tokenId,
      wallet,
      qrVersion: ticket.qr_version,
      timestamp,
      signature,
      qrData: `${payload}:${signature}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ticket/enter — QR 검증 + 입장 처리 + burn (관리자/게이트용)
router.post("/enter", async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ error: "qrData 필수" });

    const parts = qrData.split(":");
    if (parts.length !== 5) return res.status(400).json({ error: "QR 형식 오류" });

    const [tokenId, wallet, qrVersion, timestamp, signature] = parts;

    // 5분 만료 검증
    const now = Math.floor(Date.now() / 1000);
    if (now - parseInt(timestamp) > 300) {
      return res.status(401).json({ error: "QR 코드가 만료됐습니다 (5분)" });
    }

    // 서명 검증
    const payload = `${tokenId}:${wallet}:${qrVersion}:${timestamp}`;
    const expected = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(payload)
      .digest("hex");

    if (signature !== expected) {
      return res.status(401).json({ error: "QR 서명이 유효하지 않습니다" });
    }

    // DB 티켓 확인
    const ticketResult = await db.query(
      `SELECT t.*, u.wallet FROM tickets t JOIN users u ON t.owner_id = u.id
       WHERE t.token_id = $1 AND t.status = 'CONFIRMED'`,
      [parseInt(tokenId)]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "유효한 티켓 없음" });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: "지갑 불일치" });
    }

    if (parseInt(qrVersion) !== ticket.qr_version) {
      return res.status(401).json({ error: "이미 사용된 QR 코드입니다" });
    }

    // DB 입장 처리 (qr_version 증가로 재사용 방지)
    await db.query(
      `UPDATE tickets SET status = 'USED', entered_at = NOW(), qr_version = qr_version + 1
       WHERE id = $1`,
      [ticket.id]
    );

    // 온체인 burn (비동기)
    ticketNFT.burn(parseInt(tokenId)).catch((err) =>
      console.error("[burn 실패]", err.message)
    );

    res.json({ ok: true, message: "입장 처리 완료" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
