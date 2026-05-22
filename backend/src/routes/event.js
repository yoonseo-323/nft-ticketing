const express = require("express");
const router = express.Router();
const db = require("../models/db");

// GET /event — 공연 목록
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

// GET /event/:id — 공연 상세
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

// GET /event/:id/seats — 공연별 좌석 목록 및 상태
router.get("/:id/seats", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, seat_number, status
       FROM seats
       WHERE event_id = $1
       ORDER BY seat_number ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
