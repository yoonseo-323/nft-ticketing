const express = require("express");
const router = express.Router();
const db = require("../models/db");
const auth = require("../middlewares/auth");
const { ticketNFT, ticketMarket } = require("../contracts");

// GET /market — 판매 중인 티켓 목록
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ml.*, t.token_id, e.name AS event_name, e.event_date, s.seat_number,
              u.wallet AS seller_wallet
       FROM market_listings ml
       JOIN tickets t ON ml.ticket_id = t.id
       JOIN events e ON t.event_id = e.id
       JOIN seats s ON t.seat_id = s.id
       JOIN users u ON ml.seller_id = u.id
       WHERE ml.status = 'ACTIVE'
       ORDER BY ml.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /market/list — 판매 등록
// body: { tokenId, price }  (price: KRW 원 단위)
router.post("/list", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const { tokenId, price } = req.body;

    if (!tokenId || !price) {
      return res.status(400).json({ error: "tokenId, price 필수" });
    }

    // 티켓 소유 확인
    const ticketResult = await db.query(
      `SELECT t.*, e.original_price, u.wallet
       FROM tickets t
       JOIN users u ON t.owner_id = u.id
       JOIN events e ON t.event_id = e.id
       WHERE t.token_id = $1 AND t.status = 'CONFIRMED'`,
      [parseInt(tokenId)]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "확정된 티켓이 없습니다" });
    }
    const ticket = ticketResult.rows[0];

    if (ticket.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: "본인 티켓만 판매 가능" });
    }

    // 가격 상한 검증 (110%)
    const originalPrice = parseFloat(ticket.original_price);
    if (price > originalPrice * 1.1) {
      return res.status(400).json({
        error: `가격 상한 초과: 최대 ${Math.floor(originalPrice * 1.1)}원`,
      });
    }

    // 이미 리스팅 중인지 확인
    const existing = await db.query(
      `SELECT id FROM market_listings WHERE ticket_id = $1 AND status = 'ACTIVE'`,
      [ticket.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "이미 판매 등록된 티켓입니다" });
    }

    // 온체인 list (가격을 wei 단위로 변환: 1 KRW = 1 wei 매핑, 식별용)
    const userResult = await db.query(`SELECT id FROM users WHERE wallet = $1`, [wallet]);
    const sellerId = userResult.rows[0].id;

    const tx = await ticketMarket.list(
      parseInt(tokenId),
      BigInt(price),
      BigInt(Math.floor(originalPrice))
    );
    await tx.wait();

    // market 컨트랙트가 transferFrom 할 수 있도록 approve
    await ticketNFT.approveMarket(await ticketMarket.getAddress(), parseInt(tokenId));

    // DB listing 생성
    await db.query(
      `INSERT INTO market_listings (ticket_id, seller_id, price, original_price, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [ticket.id, sellerId, price, originalPrice]
    );

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /market/buy/:listingId — 티켓 구매
router.post("/buy/:listingId", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const { listingId } = req.params;

    const listingResult = await db.query(
      `SELECT ml.*, t.token_id, t.id AS ticket_id
       FROM market_listings ml
       JOIN tickets t ON ml.ticket_id = t.id
       WHERE ml.id = $1 AND ml.status = 'ACTIVE'`,
      [listingId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "판매 중인 티켓이 없습니다" });
    }
    const listing = listingResult.rows[0];

    // KYC 확인
    const kycRow = await db.query(`SELECT is_kyc FROM users WHERE wallet = $1`, [wallet]);
    if (!kycRow.rows[0]?.is_kyc) {
      return res.status(403).json({ error: "KYC 인증이 필요합니다" });
    }

    // 구매자 DB id
    const buyerResult = await db.query(`SELECT id FROM users WHERE wallet = $1`, [wallet]);
    const buyerId = buyerResult.rows[0].id;

    // 온체인 구매 (KRW 결제는 오프체인 처리됐다고 가정)
    const tx = await ticketMarket.buy(parseInt(listing.token_id), wallet);
    await tx.wait();

    // DB 소유권 이전
    await db.query(`UPDATE tickets SET owner_id = $1 WHERE id = $2`, [buyerId, listing.ticket_id]);
    await db.query(`UPDATE market_listings SET status = 'SOLD' WHERE id = $1`, [listingId]);

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /market/cancel/:listingId — 판매 취소
router.post("/cancel/:listingId", auth, async (req, res) => {
  try {
    const { wallet } = req.user;
    const { listingId } = req.params;

    const listingResult = await db.query(
      `SELECT ml.*, t.token_id, u.wallet AS seller_wallet
       FROM market_listings ml
       JOIN tickets t ON ml.ticket_id = t.id
       JOIN users u ON ml.seller_id = u.id
       WHERE ml.id = $1 AND ml.status = 'ACTIVE'`,
      [listingId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "활성 리스팅이 없습니다" });
    }
    const listing = listingResult.rows[0];

    if (listing.seller_wallet.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(403).json({ error: "판매자만 취소 가능" });
    }

    const tx = await ticketMarket.cancel(parseInt(listing.token_id));
    await tx.wait();

    await db.query(`UPDATE market_listings SET status = 'CANCELLED' WHERE id = $1`, [listingId]);

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
