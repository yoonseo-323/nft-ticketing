const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const db = require("../models/db");

const NEXT_TIER_AT = {
  NONE: 1, BRONZE: 3, SILVER: 7, GOLD: 15, PLATINUM: 25, DIAMOND: null,
};

const TIER_META = {
  NONE:     { name: "No Badge",  description: "공연 관람 기록이 없습니다." },
  BRONZE:   { name: "Bronze",    description: "1회 이상 공연을 관람한 브론즈 뱃지" },
  SILVER:   { name: "Silver",    description: "3회 이상 공연을 관람한 실버 뱃지" },
  GOLD:     { name: "Gold",      description: "7회 이상 공연을 관람한 골드 뱃지" },
  PLATINUM: { name: "Platinum",  description: "15회 이상 공연을 관람한 플래티넘 뱃지" },
  DIAMOND:  { name: "Diamond",   description: "25회 이상 공연을 관람한 다이아몬드 뱃지" },
};

// GET /fan-nft/me — 마이페이지용 (JWT 필요)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRes = await db.query(
      "SELECT wallet_address FROM users WHERE id = $1", [userId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }
    const walletAddress = userRes.rows[0].wallet_address;

    const nftRes = await db.query(
      "SELECT token_id, attendance_count, tier FROM fan_nft WHERE LOWER(wallet_address) = LOWER($1)",
      [walletAddress]
    );

    if (!nftRes.rows.length) {
      return res.json({ tier: "NONE", attendance_count: 0, token_id: null, next_tier_at: 1, remaining: 1 });
    }

    const { token_id, attendance_count, tier } = nftRes.rows[0];
    const nextAt = NEXT_TIER_AT[tier] ?? null;

    return res.json({
      tier,
      attendance_count,
      token_id,
      next_tier_at: nextAt,
      remaining: nextAt ? nextAt - attendance_count : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /fan-nft/metadata/:address — tokenURI가 가리키는 메타데이터 (인증 불필요)
router.get("/metadata/:address", async (req, res) => {
  try {
    const address = req.params.address;
    const nftRes = await db.query(
      "SELECT attendance_count, tier FROM fan_nft WHERE LOWER(wallet_address) = LOWER($1)",
      [address]
    );

    const tier = nftRes.rows[0]?.tier ?? "NONE";
    const count = nftRes.rows[0]?.attendance_count ?? 0;
    const meta = TIER_META[tier] ?? TIER_META["NONE"];

    const host = req.headers.host || "localhost:3000";
    const protocol = req.secure ? "https" : "http";

    res.json({
      name: meta.name,
      description: meta.description,
      image: `${protocol}://${host}/images/badge_${tier.toLowerCase()}.png`,
      attributes: [
        { trait_type: "Tier", value: tier },
        { trait_type: "Attendance Count", value: count },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;