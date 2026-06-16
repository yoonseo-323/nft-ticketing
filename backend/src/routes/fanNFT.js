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

// GET /fan-nft/me — 아티스트별 뱃지 목록 (JWT 필요)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userRes = await db.query(
      "SELECT wallet_address FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }
    const walletAddress = userRes.rows[0].wallet_address;

    // 아티스트별 전체 뱃지 목록 조회
    const nftRes = await db.query(
      `SELECT artist_address, token_id, attendance_count, tier
       FROM fan_nft
       WHERE LOWER(wallet_address) = LOWER($1)
       ORDER BY attendance_count DESC`,
      [walletAddress]
    );

    // 뱃지가 하나도 없는 경우
    if (!nftRes.rows.length) {
      return res.json({ badges: [] });
    }

    // 아티스트별 다음 등급 정보 계산
    const badges = nftRes.rows.map((row) => {
      const nextAt = NEXT_TIER_AT[row.tier] ?? null;
      return {
        artist_address:   row.artist_address,
        token_id:         row.token_id,
        attendance_count: row.attendance_count,
        tier:             row.tier,
        next_tier_at:     nextAt,
        remaining:        nextAt ? nextAt - row.attendance_count : 0,
      };
    });

    res.json({ badges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /fan-nft/metadata/:address — tokenURI 메타데이터 (인증 불필요)
router.get("/metadata/:address", async (req, res) => {
  try {
    const address = req.params.address;

    // 해당 지갑의 모든 아티스트 뱃지 조회
    const nftRes = await db.query(
      `SELECT artist_address, attendance_count, tier
       FROM fan_nft
       WHERE LOWER(wallet_address) = LOWER($1)`,
      [address]
    );

    if (!nftRes.rows.length) {
      return res.json({
        name: "No Badge",
        description: "공연 관람 기록이 없습니다.",
        attributes: [],
      });
    }

    const host = req.headers.host || "localhost:3000";
    const protocol = req.secure ? "https" : "http";

    // 아티스트별 메타데이터 배열로 반환
    const metadata = nftRes.rows.map((row) => {
      const meta = TIER_META[row.tier] ?? TIER_META["NONE"];
      return {
        artist_address: row.artist_address,
        name:           meta.name,
        description:    meta.description,
        image:          `${protocol}://${host}/images/badge_${row.tier.toLowerCase()}.png`,
        attributes: [
          { trait_type: "Tier",             value: row.tier },
          { trait_type: "Attendance Count", value: row.attendance_count },
          { trait_type: "Artist",           value: row.artist_address },
        ],
      };
    });

    res.json({ metadata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;