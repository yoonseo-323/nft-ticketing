const express = require("express");
const router = express.Router();
const db = require("../models/db");
const auth = require("../middlewares/auth");
const { identityRegistry, ticketNFT, ticketMarket } = require("../contracts");

// GET /market — 판매 중인 티켓 목록
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ml.id, ml.price, ml.original_price, ml.created_at,
              t.token_id,
              e.name AS event_name, e.venue, e.event_date,
              s.seat_number,
              u.nickname AS seller_nickname
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

// POST /market/list — 양도 등록
router.post("/list", auth, async (req, res) => {
  try {
    const { tokenId, price } = req.body;
    if (!tokenId || !price) {
      return res.status(400).json({ error: "tokenId, price 필수" });
    }

    // 티켓 소유 및 상태 확인
    const ticketResult = await db.query(
      `SELECT t.*, e.original_price
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE t.token_id = $1 AND t.owner_id = $2 AND t.status = 'CONFIRMED'`,
      [parseInt(tokenId), req.user.userId]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "본인 소유의 확정된 티켓이 없습니다" });
    }
    const ticket = ticketResult.rows[0];

    // 가격 상한 130% 검증
    const originalPrice = parseFloat(ticket.original_price);
    if (price > originalPrice * 1.3) {
      return res.status(400).json({
        error: `가격 상한 초과: 최대 ${Math.floor(originalPrice * 1.3).toLocaleString()}원`,
      });
    }

    // 이미 등록된 리스팅 확인
    const existing = await db.query(
      "SELECT id FROM market_listings WHERE ticket_id = $1 AND status = 'ACTIVE'",
      [ticket.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "이미 판매 등록된 티켓입니다" });
    }

    // 정산 계좌 확인
    const userResult = await db.query(
      "SELECT bank_name, bank_account, wallet_address FROM users WHERE id = $1",
      [req.user.userId]
    );
    const user = userResult.rows[0];
    if (!user.bank_name || !user.bank_account) {
      return res.status(400).json({ error: "정산 계좌를 먼저 등록해주세요" });
    }

    // 온체인 리스팅 (가격 상한 컨트랙트에도 강제)
    const tx = await ticketMarket.list(
      parseInt(tokenId),
      BigInt(price),
      BigInt(Math.floor(originalPrice)),
      user.wallet_address
    );
    await tx.wait();

    // DB 리스팅 생성
    await db.query(
      `INSERT INTO market_listings (ticket_id, seller_id, price, original_price, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [ticket.id, req.user.userId, price, originalPrice]
    );

    res.json({ ok: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /market/buy/:listingId — 양도 구매 (mock 결제)
router.post("/buy/:listingId", auth, async (req, res) => {
  try {
    const { listingId } = req.params;

    const listingResult = await db.query(
      `SELECT ml.*, t.token_id, t.id AS ticket_id, t.seat_id, t.qr_version,
              u.wallet_address AS seller_wallet
       FROM market_listings ml
       JOIN tickets t ON ml.ticket_id = t.id
       JOIN users u ON ml.seller_id = u.id
       WHERE ml.id = $1 AND ml.status = 'ACTIVE'`,
      [listingId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "판매 중인 티켓이 없습니다" });
    }
    const listing = listingResult.rows[0];

    // 본인 티켓 구매 방지
    if (listing.seller_id === req.user.userId) {
      return res.status(400).json({ error: "본인 티켓은 구매할 수 없습니다" });
    }

    // 구매자 지갑 주소 조회
    const buyerResult = await db.query(
      "SELECT wallet_address FROM users WHERE id = $1",
      [req.user.userId]
    );
    const buyerWallet = buyerResult.rows[0].wallet_address;

    // 구매자 KYC 인증 사전 검증
    const isVerified = await identityRegistry.isVerified(buyerWallet);
    if (!isVerified) {
      return res.status(400).json({ error: "구매자가 KYC 인증이 완료되지 않았습니다. 먼저 본인인증을 해주세요." });
    }

    // 온체인 리스팅 완료 처리
    const saleTx = await ticketMarket.completeSale(parseInt(listing.token_id), buyerWallet);
    await saleTx.wait();

    // NFT 소유권 이전 (TicketNFT.adminTransfer)
    const transferTx = await ticketNFT.adminTransfer(
      listing.seller_wallet,
      buyerWallet,
      parseInt(listing.token_id)
    );
    await transferTx.wait();

    // DB 소유권 이전 + QR 무효화
    await db.query(
      "UPDATE tickets SET owner_id = $1, qr_version = qr_version + 1 WHERE id = $2",
      [req.user.userId, listing.ticket_id]
    );
    await db.query(
      "UPDATE market_listings SET status = 'SOLD' WHERE id = $1",
      [listingId]
    );

    res.json({ ok: true, message: "구매 완료. 정산은 판매자 등록 계좌로 처리됩니다." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /market/cancel/:listingId — 양도 취소
router.post("/cancel/:listingId", auth, async (req, res) => {
  try {
    const { listingId } = req.params;

    const listingResult = await db.query(
      `SELECT ml.*, t.token_id
       FROM market_listings ml
       JOIN tickets t ON ml.ticket_id = t.id
       WHERE ml.id = $1 AND ml.seller_id = $2 AND ml.status = 'ACTIVE'`,
      [listingId, req.user.userId]
    );
    if (listingResult.rows.length === 0) {
      return res.status(404).json({ error: "취소 가능한 리스팅이 없습니다" });
    }
    const listing = listingResult.rows[0];

    // 판매자 지갑 주소 조회 (온체인 소유권 비교용)
    const sellerResult = await db.query(
      "SELECT wallet_address FROM users WHERE id = $1",
      [req.user.userId]
    );
    const sellerWallet = sellerResult.rows[0]?.wallet_address || "";

    let txFailedButNotListed = false;
    try {
      const tx = await ticketMarket.cancel(parseInt(listing.token_id));
      await tx.wait();
    } catch (contractErr) {
      if (contractErr.message.includes("TicketMarket: Not listed") || contractErr.code === "CALL_EXCEPTION") {
        txFailedButNotListed = true;
      } else {
        throw contractErr;
      }
    }

    if (txFailedButNotListed) {
      // 온체인의 실제 소유자 확인 (데이터 불일치 복구 플로우)
      let currentOwnerWallet = null;
      try {
        currentOwnerWallet = await ticketNFT.ownerOf(parseInt(listing.token_id));
      } catch (ownerErr) {
        // 이미 소각되었거나 토큰이 존재하지 않는 경우 (예외 처리)
        currentOwnerWallet = null;
      }

      if (!currentOwnerWallet || currentOwnerWallet.toLowerCase() === sellerWallet.toLowerCase()) {
        // 소유자가 판매자 본인이거나 이미 토큰이 사라진 경우 -> 취소 처리 완료로 동기화
        await db.query(
          "UPDATE market_listings SET status = 'CANCELLED' WHERE id = $1",
          [listingId]
        );
        return res.json({ ok: true, message: "이미 온체인에서 리스팅이 취소된 상태이므로 DB 상태를 CANCELLED로 동기화했습니다." });
      } else {
        // 소유자가 타인(구매자)인 경우 -> 이미 양도가 완료된 상태이므로 SOLD 처리로 동기화
        const buyerResult = await db.query(
          "SELECT id FROM users WHERE LOWER(wallet_address) = $1",
          [currentOwnerWallet.toLowerCase()]
        );
        if (buyerResult.rows.length > 0) {
          const buyerId = buyerResult.rows[0].id;
          await db.query(
            "UPDATE tickets SET owner_id = $1, qr_version = qr_version + 1 WHERE id = $2",
            [buyerId, listing.ticket_id]
          );
          await db.query(
            "UPDATE market_listings SET status = 'SOLD' WHERE id = $1",
            [listingId]
          );
          return res.status(200).json({ ok: true, message: "이미 온체인에서 양도 완료된 티켓이므로 DB 상태를 SOLD로 동기화했습니다." });
        } else {
          return res.status(500).json({ error: "온체인의 티켓 소유 지갑 주소가 등록된 회원 정보에 없습니다." });
        }
      }
    } else {
      await db.query(
        "UPDATE market_listings SET status = 'CANCELLED' WHERE id = $1",
        [listingId]
      );
      res.json({ ok: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
