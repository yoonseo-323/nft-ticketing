# NFT 티켓팅 서비스 기능 명세

## 서비스 개요

블록체인 기반 티켓 발급·양도·입장 시스템. 실명 인증된 지갑만 티켓을 소유할 수 있고, 2차 거래 시 가격 상한선을 컨트랙트 수준에서 강제한다. 입장 처리 시 티켓(NFT)을 소각해 재사용을 원천 차단한다.

사용자는 ETH 없이 **원화(KRW)만으로** 티켓을 구매·양도한다. PG사가 결제를 처리하고, 백엔드가 결제 확인 후 NFT 발행·이전을 처리한다. 블록체인은 소유권 증명과 가격 상한 강제에만 사용하며, 사용자는 지갑이나 암호화폐를 직접 다룰 필요가 없다.

---

## 결제 구조

| 단계 | 결제 방식 | 주체 |
|---|---|---|
| 1차 구매 | PG (KRW) → 플랫폼 | 사용자 → 플랫폼 |
| 양도 구매 | PG (KRW) → 플랫폼 에스크로 | 구매자 → 플랫폼 |
| 양도 정산 | 계좌이체 → 판매자 | 플랫폼 → 판매자 개인 |
| 수수료 | 정산 시 차감 | 플랫폼이 보관 |

- ETH는 사용자에게 노출되지 않는다. 사용자는 KRW만 사용한다.
- PG사는 사업자(플랫폼)에게만 정산 가능하므로, 개인 판매자는 플랫폼에 정산 계좌를 등록하고 계좌이체로 정산받는다.
- 컨트랙트의 NFT 발행·이전은 모두 백엔드 서버 지갑(onlyOwner)이 실행한다.
- 데모에서는 PG 결제와 정산 계좌이체 모두 mock으로 처리한다 ("결제 완료" 버튼 클릭 시 성공으로 간주).

---

## 스마트 컨트랙트

### IdentityRegistry
- 플랫폼이 승인한 지갑 주소를 온체인에 등록·해제한다.
- 티켓 발급 및 구매 전에 반드시 등록된 지갑인지 검증한다.
- 등록·해제 권한은 컨트랙트 소유자(백엔드 서버 지갑)에게만 있다.

### TicketNFT (ERC-721)
- 공연 티켓을 NFT로 발행(mint)한다.
- 발행 시 좌석 정보(seatInfo)와 원가(originalPrice)를 온체인에 저장한다.
- 발행 대상은 IdentityRegistry에 등록된 지갑만 가능하다.
- 입장 완료 후 티켓을 소각(burn)해 재사용을 방지한다.
- 발행·소각 권한은 컨트랙트 소유자에게만 있다.
- tokenURI는 미구현 (데모 수준). 지갑 앱에서 NFT 이미지를 보여주려면 추가 필요.

### TicketMarket
- 티켓 2차 거래(양도)를 중개하는 마켓플레이스 컨트랙트.
- 양도 가격은 원가의 **130%** 를 초과할 수 없다 (가격 상한 강제).
- 판매 등록(listForSale), 취소(cancelListing), NFT 이전(buyTicket)을 제공한다.
- 실제 결제(KRW)는 백엔드에서 처리하고, 컨트랙트는 NFT 이전만 담당한다.

---

## 백엔드

### 인증 (Auth)
- User 테이블에 `role` 컬럼을 둔다. `USER` / `ADMIN` 두 가지 역할을 가진다.
- **USER**: 회원가입 시 KYC 본인인증을 먼저 진행한다. 인증 기관이 반환하는 CI(연계정보)를 DB에 unique 컬럼으로 저장해 동일인의 중복 가입을 차단한다. 인증 완료 후 서버가 자동으로 이더리움 지갑을 생성·IdentityRegistry 등록한다.
- **ADMIN**: 별도 가입 플로우 없이 DB에 계정을 미리 심어둔다. KYC·지갑 생성 없이 로그인만 가능하다.
- 개인키는 암호화해 DB에 저장하며, 사용자는 지갑 주소만 노출된다.
- 로그인 성공 시 JWT를 발급한다 (role 포함).
- 데모에서는 KYC 연동을 생략하고 가입 시 자동 VERIFIED 처리하며, CI는 mock 값으로 저장한다.

### 티켓 구매 (Tickets)
- 구매 요청이 들어오면 좌석을 RESERVED로 변경하고 DB에 PENDING 상태로 기록한다.
- PG사 결제 완료 확인 후 NFT를 발행하고 상태를 CONFIRMED로 갱신한다.
- 데모에서는 "결제 완료" 버튼 클릭 시 즉시 NFT 발행으로 처리한다.
- 블록체인 이벤트 리스너가 발행 완료를 확인하면 최종 CONFIRMED 처리한다.

### 좌석 선점 및 타임아웃
- 좌석 선택 시 즉시 RESERVED로 변경하고 `reserved_at` 타임스탬프를 기록한다.
- 10분 내 결제 미완료 시 자동으로 AVAILABLE로 복원한다.
- 크론 잡이 1분 간격으로 만료된 RESERVED 좌석을 일괄 해제한다.
- 동시에 같은 좌석을 선택하는 경우 DB 트랜잭션으로 선착순 1명만 RESERVED로 처리한다.

### QR 입장권
- QR 데이터는 `(tokenId + userId + qrVersion + timestamp)`를 서버 이더리움 개인키로 ECDSA 서명해 생성한다. ethers.js의 `signMessage()`를 사용하며, 검증 시 `verifyMessage()`로 서명자 주소를 복원해 서버 지갑 주소와 비교한다.
- QR 유효 시간은 **1분**. 만료된 QR은 입장 처리가 거부되며, 앱에서 만료 전 자동 갱신한다.
- 입장 처리 후 QR 버전(qrVersion)을 증가시켜 이전 QR을 무효화한다.
- 입장이 완료되면 해당 NFT를 소각(burn)해 재사용을 방지한다.
- 스크린샷 방지: Android는 FLAG_SECURE로 완전 차단, iOS는 스크린샷 감지 후 QR 무효화.

### 양도 마켓 (Market)
- 판매자가 양도 신청 시 DB에서 원가를 조회해 가격 상한(130%)을 서버 측에서도 1차 검증한다.
- 검증 통과 후 TicketMarket 컨트랙트에 등록하고, DB에 ACTIVE 상태로 기록한다.
- 구매자의 KRW 결제(PG) → 플랫폼 에스크로 보관 → 컨트랙트에서 NFT 소유권 이전 → 플랫폼이 판매자 등록 계좌로 즉시 계좌이체 정산 (수수료 차감).
- 판매자는 정산받을 계좌를 사전에 플랫폼에 등록해야 한다.
- 양도 완료 후에는 구매자 환불 불가. 이미 판매자에게 정산이 완료되었으므로 구매자 책임으로 처리한다.
- Seat 상태는 양도 시 변경하지 않는다. Seat(SOLD)는 그대로 유지하고 Ticket.owner만 새 구매자로 변경한다. Seat 상태는 입장(USED) 또는 취소(AVAILABLE 복원) 시에만 변경된다.
- 양도 거래가 완료되면 기존 QR을 무효화한다 (qrVersion 증가).

### 회원 탈퇴
- CONFIRMED 티켓 보유, 활성 양도 리스팅, 정산 대기 중인 경우 탈퇴 불가. 먼저 환불·취소 처리 후 탈퇴하도록 유도한다.
- 탈퇴 처리 순서: 조건 검증 → IdentityRegistry에서 지갑 deregister → 개인정보 삭제(이메일, 닉네임, 계좌, 암호화된 개인키) → DB 계정 비활성화.
- 블록체인 특성상 온체인 기록(NFT 이력, 거래 기록)은 삭제 불가. 단 개인정보보호법상 식별 가능 정보만 삭제하면 법적으로 문제없다.
- deregister된 지갑은 플랫폼 내에서 더 이상 티켓 발급·구매가 불가능하다.

### 환불·취소
- **티켓 취소 (공연 전)**: 사용자가 취소 요청 → NFT 소각 → DB CANCELLED → KRW 환불 처리.
- **공연 취소 (주최자)**: 해당 공연의 티켓 전체를 일괄 소각 → 전체 환불.
- **양도 등록 취소**: cancelListing() 호출로 마켓 등록 해제. 티켓은 원소유자 지갑에 그대로 남음.
- 취소 가능 기간은 별도 정책으로 정의 필요 (예: 공연 3일 전까지).

### 데이터 모델 요약

| 엔티티 | 주요 상태값 |
|---|---|
| User | role(USER/ADMIN), KYC 상태, CI(중복가입방지), 지갑 주소, 정산 계좌(은행명·계좌번호·예금주) |
| Event | 공연명, 장소, 날짜, 원가, 총 좌석 수, organizerId |
| Seat | AVAILABLE → RESERVED → SOLD → USED |
| Ticket | PENDING → CONFIRMED → USED → CANCELLED |
| Listing | ACTIVE → SOLD → CANCELLED |

- Seat에 `reserved_at` 컬럼 추가 (선점 타임아웃용).
- Event에 `organizerId` 컬럼 추가 (공연 취소 권한, 정산 대상 식별용).

---

## 프론트엔드

### 기술 스택
- Next.js (App Router)
- 백엔드 API: `http://localhost:3000`
- 인증: 로그인 후 받은 JWT 토큰을 `localStorage`에 저장, 모든 인증 요청 헤더에 `Authorization: Bearer {token}` 포함

---

### 공통 사항

**토큰 관리**
- 로그인·회원가입 성공 시 응답의 `token`을 `localStorage.setItem('token', token)`으로 저장
- 로그아웃 시 `localStorage.removeItem('token')`
- 인증이 필요한 페이지는 토큰 없으면 로그인 페이지로 리다이렉트

**API 호출 기본 패턴**
```
GET  /event              → 인증 불필요
POST /auth/login         → 인증 불필요
그 외 대부분             → Authorization 헤더 필요
```

---

### 화면별 API 명세

#### `/` 공연 목록
- `GET /event` → 공연 카드 목록 렌더링
- 응답 필드: `id`, `name`, `venue`, `event_date`, `original_price`, `total_seats`
- 카드 클릭 시 `/events/[id]`로 이동

#### `/events/[id]` 공연 상세
- `GET /event/:id` → 공연 정보
- `GET /event/:id/seats` → 좌석 목록 및 상태 (`AVAILABLE` / `RESERVED` / `SOLD` / `USED`)
- 좌석 선택 후 "구매" 버튼 → `POST /ticket/purchase` `{ eventId, seatId }`
- AVAILABLE 좌석만 선택 가능, 나머지는 비활성화

#### `/login` 로그인 · 회원가입
- 로그인: `POST /auth/login` `{ email, password }` → `token` 저장
- 회원가입: `POST /auth/register` `{ email, password, nickname }` → `token` 저장
- 회원가입은 IdentityRegistry 등록까지 포함되어 있어 응답이 수초 걸릴 수 있음

#### `/tickets` 내 티켓
- `GET /ticket/my` → 티켓 목록
- 응답 필드: `token_id`, `status`, `event_name`, `venue`, `event_date`, `seat_number`
- "QR 보기" 버튼 → `GET /ticket/qr/:tokenId` → `qrData`를 QR 라이브러리로 렌더링
- QR은 1분 후 만료 → 60초 타이머 후 자동 재요청
- "티켓 취소" 버튼 → `POST /ticket/cancel/:ticketId`

#### `/market` 양도 마켓
- `GET /market` → 판매 중인 티켓 목록
- 응답 필드: `id`, `price`, `event_name`, `venue`, `event_date`, `seat_number`, `seller_nickname`
- "구매" 버튼 → `POST /market/buy/:listingId`
- 내 티켓 양도 등록: `POST /market/list` `{ tokenId, price }`
- 양도 취소: `POST /market/cancel/:listingId`

#### `/mypage` 마이페이지 (선택)
- `GET /auth/me` → 내 정보 (닉네임, 이메일, 지갑 주소, 계좌 정보)
- 정산 계좌 등록: `PUT /auth/bank` `{ bank_name, bank_account, bank_holder }`
- 회원 탈퇴: `DELETE /auth/withdraw`

#### `/gate` 입장 게이트 (ADMIN 전용)
- 로그인 role이 `ADMIN`인 경우만 접근 허용
- `html5-qrcode` 라이브러리로 카메라 QR 스캔
- 스캔된 `qrData` → `POST /ticket/enter` `{ qrData }`
- 성공: 초록 화면 + 이름·좌석 표시, 3초 후 스캔 대기로 복귀
- 실패: 빨간 화면 + 오류 메시지, 3초 후 복귀

---

---

### API 명세

> 인증 필요한 요청은 헤더에 `Authorization: Bearer {token}` 포함

#### 인증

**POST /auth/register** — 회원가입
```json
// Request
{ "email": "test@test.com", "password": "1234", "nickname": "홍길동" }

// Response 201
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "test@test.com", "nickname": "홍길동", "role": "USER", "wallet_address": "0x..." }
}
```

**POST /auth/login** — 로그인
```json
// Request
{ "email": "test@test.com", "password": "1234" }

// Response 200
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "test@test.com", "nickname": "홍길동", "role": "USER", "wallet_address": "0x..." }
}
```

**GET /auth/me** — 내 정보 조회 `🔒`
```json
// Response 200
{
  "id": "uuid", "email": "test@test.com", "nickname": "홍길동",
  "role": "USER", "wallet_address": "0x...", "is_kyc": true,
  "bank_name": "카카오뱅크", "bank_account": "1234-5678", "bank_holder": "홍길동",
  "created_at": "2026-05-22T00:00:00Z"
}
```

**PUT /auth/bank** — 정산 계좌 등록 `🔒`
```json
// Request
{ "bank_name": "카카오뱅크", "bank_account": "1234-5678", "bank_holder": "홍길동" }

// Response 200
{ "ok": true }
```

**DELETE /auth/withdraw** — 회원 탈퇴 `🔒`
```json
// Response 200
{ "ok": true, "message": "회원 탈퇴가 완료되었습니다" }
```

---

#### 공연

**GET /event** — 공연 목록
```json
// Response 200
[
  { "id": "uuid", "name": "BTS World Tour 2026", "venue": "KSPO DOME",
    "event_date": "2026-07-10T19:00:00+09", "original_price": "165000", "total_seats": 100 }
]
```

**GET /event/:id** — 공연 상세
```json
// Response 200
{ "id": "uuid", "name": "BTS World Tour 2026", "venue": "KSPO DOME",
  "event_date": "2026-07-10T19:00:00+09", "original_price": "165000", "total_seats": 100 }
```

**GET /event/:id/seats** — 좌석 목록
```json
// Response 200
[
  { "id": "uuid", "seat_number": "A1", "status": "AVAILABLE" },
  { "id": "uuid", "seat_number": "A2", "status": "SOLD" }
]
```

---

#### 티켓

**POST /ticket/purchase** — 티켓 구매 `🔒`
```json
// Request
{ "eventId": "uuid", "seatId": "uuid" }

// Response 200
{ "ok": true, "tokenId": 0, "txHash": "0x..." }
```

**GET /ticket/my** — 내 티켓 목록 `🔒`
```json
// Response 200
[
  { "id": "uuid", "token_id": 0, "status": "CONFIRMED", "qr_version": 0,
    "event_name": "BTS World Tour 2026", "venue": "KSPO DOME",
    "event_date": "2026-07-10T19:00:00+09", "original_price": "165000",
    "seat_number": "A1", "created_at": "2026-05-22T00:00:00Z" }
]
```

**GET /ticket/qr/:tokenId** — QR 데이터 생성 `🔒`
```json
// Response 200
{
  "tokenId": 0, "qrVersion": 0,
  "timestamp": 1748000000, "expiresIn": 60,
  "qrData": "0:uuid:0:1748000000:abc123..."
}
// qrData를 react-qr-code에 그대로 넘겨서 QR 렌더링
// 60초마다 재요청하여 QR 갱신
```

**POST /ticket/enter** — QR 입장 처리 `🔒 ADMIN`
```json
// Request
{ "qrData": "0:uuid:0:1748000000:abc123..." }

// Response 200 (성공)
{ "ok": true, "nickname": "홍길동", "eventName": "BTS World Tour 2026", "seatNumber": "A1" }

// Response 401 (실패)
{ "error": "QR 코드가 만료되었습니다 (1분)" }
```

**POST /ticket/cancel/:ticketId** — 티켓 취소 `🔒`
```json
// Response 200
{ "ok": true, "message": "티켓이 취소되었습니다 (환불은 별도 처리)" }
```

---

#### 양도 마켓

**GET /market** — 판매 중인 티켓 목록
```json
// Response 200
[
  { "id": "uuid", "price": "170000", "original_price": "165000",
    "token_id": 0, "event_name": "BTS World Tour 2026", "venue": "KSPO DOME",
    "event_date": "2026-07-10T19:00:00+09", "seat_number": "A1",
    "seller_nickname": "홍길동", "created_at": "2026-05-22T00:00:00Z" }
]
```

**POST /market/list** — 양도 등록 `🔒`
```json
// Request
{ "tokenId": 0, "price": 170000 }

// Response 200
{ "ok": true, "txHash": "0x..." }
```

**POST /market/buy/:listingId** — 양도 구매 `🔒`
```json
// Response 200
{ "ok": true, "message": "구매 완료. 정산은 판매자 등록 계좌로 처리됩니다." }
```

**POST /market/cancel/:listingId** — 양도 취소 `🔒`
```json
// Response 200
{ "ok": true }
```

---

### 권장 라이브러리
```bash
npm install axios         # API 호출
npm install react-qr-code # QR 코드 표시 (/tickets)
npm install html5-qrcode  # QR 코드 스캔 (/gate)
```

### 화면 구성

| 화면 | 인증 필요 | ADMIN 전용 |
|---|---|---|
| `/` 공연 목록 | X | X |
| `/events/[id]` 공연 상세 | X | X |
| `/login` 로그인·회원가입 | X | X |
| `/tickets` 내 티켓 | O | X |
| `/market` 양도 마켓 | 구매·등록만 | X |
| `/mypage` 마이페이지 | O | X |
| `/gate` 입장 게이트 | O | O |

---

## 구현 순서

1. 스마트 컨트랙트 작성 및 테스트, 로컬 배포
2. DB 엔티티 설계 및 BlockchainService 구현
3. 회원가입·로그인 (지갑 생성 + 레지스트리 등록 포함)
4. 좌석 선점 + 타임아웃 크론 잡
5. 티켓 구매 플로우 (mock 결제 → NFT 발행 + 이벤트 리스너)
6. QR 생성 및 입장 처리 (NFT 소각)
7. 환불·취소 플로우
8. 양도 마켓 플로우
9. 프론트엔드 — 공연 목록 및 구매 UI
10. 프론트엔드 — QR 화면 및 게이트 스캔 UI
11. 프론트엔드 — 양도 마켓 UI
