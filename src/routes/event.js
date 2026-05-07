const express = require("express");
const router = express.Router();
const db = require("../models/db");

// 공연 목록 전체 조회
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM events ORDER BY event_date ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 공연 상세 조회
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM events WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "공연을 찾을 수 없습니다" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;