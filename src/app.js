require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

require("./models/db");

// 라우트 연결
app.use("/auth", require("./routes/auth"));
app.use("/event", require("./routes/event"));

// 테스트용
app.get("/", (req, res) => {
  res.json({ message: "서버 정상 작동!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
});