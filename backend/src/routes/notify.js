const express = require("express");
const router = express.Router();

// POST /notify — 뱃지 등급 상승 알림
router.post("/", (req, res) => {
  const { walletAddress, tier } = req.body;
  console.log(`🔔 [알림] ${walletAddress} 뱃지가 "${tier}"로 업그레이드됐습니다!`);
  res.json({ success: true });
});

module.exports = router;