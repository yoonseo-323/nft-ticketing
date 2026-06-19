# 🎫 FanNFT 백엔드 연동 가이드 (Integration Guide)

이 문서는 스마트 컨트랙트 파트에서 배포한 **FanNFT** SBT(Soulbound Token)를 백엔드에 연동하기 위한 상세 스펙 및 가이드라인입니다.

---

## 1. 데이터베이스 스키마 추가 (DB DDL)

사용자 지갑 주소별로 누적 관람 횟수 및 현재 등급을 캐싱하기 위해 `fan_nft` 테이블을 데이터베이스에 추가합니다. `backend/src/database/schema.sql` 파일 하단에 아래 쿼리를 추가하여 실행하십시오.

```sql
-- 사용자별 FanNFT 캐싱 테이블
CREATE TABLE IF NOT EXISTS fan_nft (
  wallet_address    VARCHAR(42) PRIMARY KEY,                  -- 사용자 지갑 주소 (소문자 저장 권장)
  token_id          BIGINT NOT NULL,                           -- 발행된 FanNFT 토큰 ID
  attendance_count  INTEGER NOT NULL DEFAULT 0,                -- 누적 관람 횟수
  tier              VARCHAR(20) NOT NULL DEFAULT 'NONE',      -- 현재 등급 (NONE / BRONZE / SILVER / GOLD / PLATINUM / DIAMOND)
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()        -- 마지막 업데이트 시각
);
```

---

## 2. 백엔드 컨트랙트 인스턴스 추가

배포 후 `.env` 파일에 `FAN_NFT_ADDRESS` 주소를 추가하고, `backend/src/contracts/index.js`에 아래 코드를 추가하여 `fanNFT` 인스턴스를 익스포트합니다.

### `.env` 추가 사항
```env
FAN_NFT_ADDRESS=0x[배포된_FanNFT_컨트랙트_주소]
```

### `backend/src/contracts/index.js` 수정 가이드
```javascript
// FanNFT ABI 로드
const fanNFTABI = require(`${artifactBase}/FanNFT.sol/FanNFT.json`).abi;

// FanNFT Contract 인스턴스 생성
const fanNFT = new ethers.Contract(
  process.env.FAN_NFT_ADDRESS,
  fanNFTABI,
  ownerWallet
);

// exports에 추가
module.exports = { identityRegistry, ticketNFT, ticketMarket, fanNFT };
```

---

## 3. 이벤트 리스너 연동 (`backend/src/listeners/chainListener.js`)

컨트랙트에서 발생하는 `AttendanceRecorded` 및 `TierUpgraded` 이벤트를 실시간으로 리슨하여 DB를 동기화하고 알림 서비스를 트리거합니다.

### 연동 스펙 및 예시 코드
```javascript
const { fanNFT } = require("../contracts");
const db = require("../models/db");
const axios = require("axios");

// 관람 횟수 기준에 따른 Tier 계산 함수
function getTier(count) {
  if (count >= 25) return "DIAMOND";
  if (count >= 15) return "PLATINUM";
  if (count >= 7) return "GOLD";
  if (count >= 3) return "SILVER";
  if (count >= 1) return "BRONZE";
  return "NONE";
}

function startFanNFTListener() {
  // 1. AttendanceRecorded 이벤트 리슨 -> fan_nft 테이블 Upsert
  // 이벤트 시그니처: AttendanceRecorded(address indexed fan, uint256 indexed tokenId, uint256 attendanceCount)
  fanNFT.on("AttendanceRecorded", async (fan, tokenId, attendanceCount) => {
    const walletAddress = fan.toLowerCase();
    const tid = Number(tokenId);
    const count = Number(attendanceCount);
    const tier = getTier(count);

    console.log(`[체인 이벤트] AttendanceRecorded: fan=${walletAddress}, tokenId=${tid}, count=${count}, tier=${tier}`);

    try {
      await db.query(
        `INSERT INTO fan_nft (wallet_address, token_id, attendance_count, tier, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (wallet_address)
         DO UPDATE SET
           token_id = EXCLUDED.token_id,
           attendance_count = EXCLUDED.attendance_count,
           tier = EXCLUDED.tier,
           updated_at = NOW()`,
        [walletAddress, tid, count, tier]
      );
      console.log(`✅ DB 동기화 성공 (fan_nft): ${walletAddress}`);
    } catch (err) {
      console.error(`❌ DB 동기화 실패 (fan_nft):`, err.message);
    }
  });

  // 2. TierUpgraded 이벤트 리슨 -> /notify 연동 (뱃지 업그레이드 푸시 알림)
  // 이벤트 시그니처: TierUpgraded(address indexed fan, string newTier)
  fanNFT.on("TierUpgraded", async (fan, newTier) => {
    const walletAddress = fan.toLowerCase();
    console.log(`[체인 이벤트] TierUpgraded: fan=${walletAddress}, newTier=${newTier}`);

    try {
      const port = process.env.PORT || 3000;
      await axios.post(`http://localhost:${port}/notify`, {
        walletAddress: walletAddress,
        tier: newTier
      });
      console.log(`✅ 푸시 알림 API 전송 완료: ${walletAddress} -> ${newTier}`);
    } catch (err) {
      console.error(`❌ 푸시 알림 연동 실패:`, err.message);
    }
  });

  console.log("✅ FanNFT 체인 이벤트 리스너 시작됨");
}
```

---

## 4. API 엔드포인트 구현 명세

### 4.1 `/notify` POST API 구현 (`backend/src/routes/notify.js`)
백엔드 이벤트 리스너로부터 호출되는 푸시 알림 수신 서버용 API입니다.

```javascript
const express = require("express");
const router = express.Router();

// POST /notify - 뱃지 등급 상승 푸시 알림 처리
router.post("/", (req, res) => {
  const { walletAddress, tier } = req.body;
  
  // 콘솔 및 로그에 화려하게 알림 내용 출력
  console.log(`🔔 [알림 푸시] ${walletAddress} 님의 뱃지 등급이 "${tier}"(으)로 업그레이드되었습니다! 🎉`);
  
  res.json({ success: true, message: "알림이 정상 전송되었습니다." });
});

module.exports = router;
```

### 4.2 `/fan-nft` API 구현 (`backend/src/routes/fanNft.js`)
마이페이지 조회 및 NFT 메타데이터 동적 서빙을 위한 API 라우터 파일입니다.

```javascript
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");
const db = require("../models/db");

// 1. GET /fan-nft/me - 마이페이지용 (JWT 필요)
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 사용자 지갑 주소 조회
    const userRes = await db.query("SELECT wallet_address FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }
    const walletAddress = userRes.rows[0].wallet_address;
    if (!walletAddress) {
      return res.status(400).json({ error: "사용자 지갑 주소가 존재하지 않습니다." });
    }

    // fan_nft 테이블에서 정보 조회
    const nftRes = await db.query(
      "SELECT attendance_count, tier FROM fan_nft WHERE LOWER(wallet_address) = LOWER($1)",
      [walletAddress]
    );

    let attendanceCount = 0;
    let tier = "NONE";

    if (nftRes.rows.length > 0) {
      attendanceCount = nftRes.rows[0].attendance_count;
      tier = nftRes.rows[0].tier;
    }

    // 다음 등급 요구 조건 계산
    let nextTierAt = 1;
    if (attendanceCount >= 25) {
      nextTierAt = null;
    } else if (attendanceCount >= 15) {
      nextTierAt = 25;
    } else if (attendanceCount >= 7) {
      nextTierAt = 15;
    } else if (attendanceCount >= 3) {
      nextTierAt = 7;
    } else if (attendanceCount >= 1) {
      nextTierAt = 3;
    }

    let remaining = 0;
    if (nextTierAt !== null) {
      remaining = nextTierAt - attendanceCount;
    }

    res.json({
      tier,
      attendance_count: attendanceCount,
      next_tier_at: nextTierAt,
      remaining
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /fan-nft/metadata/:address - tokenURI 메타데이터 동적 반환 (인증 불필요)
router.get("/metadata/:address", async (req, res) => {
  try {
    const address = req.params.address;
    const nftRes = await db.query(
      "SELECT attendance_count, tier FROM fan_nft WHERE LOWER(wallet_address) = LOWER($1)",
      [address]
    );

    let tier = "NONE";
    let count = 0;
    if (nftRes.rows.length > 0) {
      tier = nftRes.rows[0].tier;
      count = nftRes.rows[0].attendance_count;
    }

    // 등급별 메타데이터 속성 정의
    const tierMeta = {
      NONE: { name: "None", desc: "공연 관람 기록이 없습니다." },
      BRONZE: { name: "Bronze", desc: "1회 이상 공연을 관람한 브론즈 회원 뱃지" },
      SILVER: { name: "Silver", desc: "3회 이상 공연을 관람한 실버 회원 뱃지" },
      GOLD: { name: "Gold", desc: "7회 이상 공연을 관람한 골드 회원 뱃지" },
      PLATINUM: { name: "Platinum", desc: "15회 이상 공연을 관람한 플래티넘 회원 뱃지" },
      DIAMOND: { name: "Diamond", desc: "25회 이상 공연을 관람한 최고 등급 다이아몬드 회원 뱃지" }
    };

    const meta = tierMeta[tier] || tierMeta["NONE"];

    // 뱃지용 화려한 이미지 링크 구성 (서버 static 이미지 서빙 경로 활용)
    const host = req.headers.host || "localhost:3000";
    const protocol = req.secure ? "https" : "http";
    const imageUrl = `${protocol}://${host}/images/badge_${tier.toLowerCase()}.png`;

    res.json({
      name: meta.name,
      description: meta.desc,
      image: imageUrl,
      attributes: [
        { trait_type: "Tier", value: tier },
        { trait_type: "Attendance Count", value: count }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```
