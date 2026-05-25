const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "로그인이 필요합니다" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({ error: "관리자 권한이 필요합니다" });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "유효하지 않은 토큰입니다" });
  }
};
