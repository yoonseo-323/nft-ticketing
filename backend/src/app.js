require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

require("./models/db");

app.use("/auth", require("./routes/auth"));
app.use("/event", require("./routes/event"));
app.use("/ticket", require("./routes/ticket"));
app.use("/market", require("./routes/market"));

app.get("/", (req, res) => {
  res.json({ message: "Suuca NFT Ticketing API 정상 작동!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);

  // 블록체인 이벤트 리스너 시작 (컨트랙트 주소가 설정된 경우만)
  if (process.env.TICKET_NFT_ADDRESS) {
    try {
      const { startChainListener } = require("./listeners/chainListener");
      startChainListener();
    } catch (err) {
      console.warn("⚠️ 체인 리스너 시작 실패:", err.message);
    }
  }
});
