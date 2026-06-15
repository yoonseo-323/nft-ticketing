require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./models/db");

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use("/auth", require("./routes/auth"));
app.use("/event", require("./routes/event"));
app.use("/ticket", require("./routes/ticket"));
app.use("/market", require("./routes/market"));

app.get("/", (req, res) => {
  res.json({ message: "NFT Ticketing API 정상 작동!" });
});

// 좌석 선점 타임아웃 크론 (1분 간격, 10분 초과 RESERVED 해제)
setInterval(async () => {
  try {
    await db.query(
      `UPDATE tickets SET status = 'CANCELLED'
       FROM seats
       WHERE tickets.seat_id = seats.id
         AND tickets.status = 'PENDING'
         AND seats.status = 'RESERVED'
         AND seats.reserved_at < NOW() - INTERVAL '10 minutes'`
    );
    await db.query(
      `UPDATE seats SET status = 'AVAILABLE', reserved_at = NULL
       WHERE status = 'RESERVED'
         AND reserved_at < NOW() - INTERVAL '10 minutes'`
    );
  } catch (err) {
    console.error("[크론] 좌석 타임아웃 처리 실패:", err.message);
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);

});
