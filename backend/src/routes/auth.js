const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const crypto = require("crypto");
const db = require("../models/db");
const authMiddleware = require("../middlewares/auth");
const { identityRegistry } = require("../contracts");

function encryptPrivateKey(privateKey) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, nickname } = req.body;
    if (!email || !password || !nickname) {
      return res.status(400).json({ error: "email, password, nickname 필수" });
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "이미 사용 중인 이메일입니다" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // 지갑 생성
    const wallet = ethers.Wallet.createRandom();

    // 개인키 암호화
    const encryptedKey = encryptPrivateKey(wallet.privateKey);

    // CI: 데모에서는 UUID 기반 mock 값
    const ci = crypto.randomUUID();

    // DB 저장
    const result = await db.query(
      `INSERT INTO users (email, password_hash, nickname, role, ci, wallet_address, encrypted_private_key, is_kyc)
       VALUES ($1, $2, $3, 'USER', $4, $5, $6, true)
       RETURNING id, email, nickname, role, wallet_address`,
      [email, passwordHash, nickname, ci, wallet.address, encryptedKey]
    );
    const user = result.rows[0];

    // IdentityRegistry에 지갑 등록
    const tx = await identityRegistry.register(wallet.address);
    await tx.wait();

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email, password 필수" });
    }

    const result = await db.query(
      "SELECT id, email, nickname, role, password_hash, wallet_address FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
    }
    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role, wallet_address: user.wallet_address },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, nickname, role, wallet_address, is_kyc, bank_name, bank_account, bank_holder, created_at
       FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /auth/bank — 정산 계좌 등록
router.put("/bank", authMiddleware, async (req, res) => {
  try {
    const { bank_name, bank_account, bank_holder } = req.body;
    if (!bank_name || !bank_account || !bank_holder) {
      return res.status(400).json({ error: "bank_name, bank_account, bank_holder 필수" });
    }
    await db.query(
      "UPDATE users SET bank_name = $1, bank_account = $2, bank_holder = $3 WHERE id = $4",
      [bank_name, bank_account, bank_holder, req.user.userId]
    );
    res.json({ ok: true, bank_name, bank_account, bank_holder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /auth/withdraw — 회원 탈퇴
router.delete("/withdraw", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 탈퇴 불가 조건 검증
    const activeTickets = await db.query(
      "SELECT id FROM tickets WHERE owner_id = $1 AND status = 'CONFIRMED'",
      [userId]
    );
    if (activeTickets.rows.length > 0) {
      return res.status(400).json({ error: "사용 가능한 티켓이 있어 탈퇴할 수 없습니다. 먼저 취소해주세요." });
    }

    const activeListings = await db.query(
      "SELECT id FROM market_listings WHERE seller_id = $1 AND status = 'ACTIVE'",
      [userId]
    );
    if (activeListings.rows.length > 0) {
      return res.status(400).json({ error: "판매 중인 티켓이 있어 탈퇴할 수 없습니다. 먼저 취소해주세요." });
    }

    // IdentityRegistry deregister
    const userResult = await db.query("SELECT wallet_address FROM users WHERE id = $1", [userId]);
    const walletAddress = userResult.rows[0]?.wallet_address;
    if (walletAddress) {
      const tx = await identityRegistry.deregister(walletAddress);
      await tx.wait();
    }

    // 개인정보 삭제 (계정 비활성화)
    await db.query(
      `UPDATE users SET
        email = 'deleted_' || id || '@deleted.com',
        password_hash = '',
        nickname = '탈퇴한 사용자',
        ci = NULL,
        encrypted_private_key = NULL,
        bank_name = NULL, bank_account = NULL, bank_holder = NULL
       WHERE id = $1`,
      [userId]
    );

    res.json({ ok: true, message: "회원 탈퇴가 완료되었습니다" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
