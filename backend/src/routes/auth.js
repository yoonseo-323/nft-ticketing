const express = require("express");
const router = express.Router();
const { SiweMessage } = require("siwe");
const jwt = require("jsonwebtoken");
const db = require("../models/db");

// nonce 임시 저장 (나중에 Redis로 교체 가능)
const nonces = new Map();

// 1) nonce 발급
router.get("/nonce", (req, res) => {
  const nonce = Math.random().toString(36).substring(2);
  nonces.set(nonce, Date.now());
  res.json({ nonce });
});

// 2) 서명 검증 후 JWT 발급
router.post("/verify", async (req, res) => {
  try {
    const { message, signature } = req.body;
    const siweMessage = new SiweMessage(message);
    const { data: fields } = await siweMessage.verify({ signature });

    if (!nonces.has(fields.nonce)) {
      return res.status(401).json({ error: "유효하지 않은 nonce입니다" });
    }
    nonces.delete(fields.nonce);

    const wallet = fields.address.toLowerCase();

    // 신규 유저면 자동 생성
    await db.query(
      `INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
      [wallet]
    );

    const token = jwt.sign({ wallet }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, wallet });
  } catch (err) {
    res.status(401).json({ error: "서명 검증 실패: " + err.message });
  }
});

// 3) 내 정보 조회
router.get("/me", require("../middlewares/auth"), async (req, res) => {
  const result = await db.query(
    `SELECT id, wallet, nickname, is_kyc, created_at FROM users WHERE wallet = $1`,
    [req.user.wallet]
  );
  res.json(result.rows[0]);
});

module.exports = router;