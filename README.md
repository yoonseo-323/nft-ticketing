# 🎫 NFT 티켓팅 및 양도마켓 서비스 — Backend

> 블록체인 기반 암표 방지 NFT 티켓팅 서비스의 백엔드 서버

---

## 🛠 Tech Stack

| 분류 | 기술 |
|------|------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| Blockchain | ethers.js |
| Auth | SIWE (Sign-In with Ethereum) + JWT |
| Dev Tools | nodemon |

---

## 🚀 Quick Start

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
cp .env.example .env
# .env 파일을 열어서 값 입력
```

### 3. 서버 실행
```bash
npm run dev    # 개발 환경
npm start      # 운영 환경
```

서버 실행 주소: `http://localhost:3000`

---

## 📁 프로젝트 구조

```
src/
├── config/          # 블록체인 설정
├── contracts/       # ABI 및 컨트랙트 인스턴스
├── listeners/       # 블록체인 이벤트 리스너
├── middlewares/     # JWT 인증 미들웨어
├── models/          # DB 연결
├── routes/          # API 라우트
└── app.js
```

---

## 📡 API 목록

### Auth
| Method | URL | 설명 |
|--------|-----|------|
| GET | `/auth/nonce` | 로그인용 nonce 발급 |
| POST | `/auth/verify` | 지갑 서명 검증 + JWT 발급 |
| GET | `/auth/me` | 내 정보 조회 |

### Event
| Method | URL | 설명 |
|--------|-----|------|
| GET | `/event` | 공연 목록 조회 |
| GET | `/event/:id` | 공연 상세 조회 |

### Ticket
| Method | URL | 설명 |
|--------|-----|------|
| POST | `/ticket/kyc` | KYC 인증 등록 |
| POST | `/ticket/mint` | NFT 티켓 발행 |
| GET | `/ticket/my` | 내 티켓 목록 |
| POST | `/ticket/burn/:tokenId` | 티켓 소각 (입장) |

### Market
| Method | URL | 설명 |
|--------|-----|------|
| GET | `/market` | 판매 중인 티켓 목록 |
| POST | `/market/list` | 티켓 판매 등록 |
| POST | `/market/buy/:listingId` | 티켓 구매 |

---

## 🗄 DB 테이블

```
users            지갑 주소 기반 사용자
events           공연 정보
seats            좌석 정보
tickets          발행된 NFT 티켓 (온체인 캐싱)
market_listings  양도 마켓 리스팅
```

---

## ⚙️ 환경변수

```
PORT=3000
JWT_SECRET=
DATABASE_URL=postgresql://postgres:비밀번호@localhost:5432/nft_ticketing
RPC_URL=http://127.0.0.1:8545
OWNER_PRIVATE_KEY=
TICKET_NFT_ADDRESS=
TICKET_MARKET_ADDRESS=
IDENTITY_REGISTRY_ADDRESS=
```

---

## 👥 팀원

| 이름 | 역할 |
|------|------|
| 최윤서 | Backend |
| 안재우 | Smart Contract |
| 최효석 | Smart Contract |
| 이수련 | Frontend |
