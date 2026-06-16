-- NFT Ticketing DB Schema
-- PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 VARCHAR(255) UNIQUE NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  nickname              VARCHAR(50) NOT NULL,
  role                  VARCHAR(10) NOT NULL DEFAULT 'USER',  -- USER | ADMIN
  ci                    VARCHAR(255) UNIQUE,                  -- KYC 연계정보 (중복 가입 방지)
  wallet_address        VARCHAR(42) UNIQUE,                   -- 서버 생성 지갑 주소
  encrypted_private_key TEXT,                                 -- AES 암호화된 개인키
  is_kyc                BOOLEAN NOT NULL DEFAULT false,
  bank_name             VARCHAR(50),                          -- 정산 계좌: 은행명
  bank_account          VARCHAR(30),                          -- 정산 계좌: 계좌번호
  bank_holder           VARCHAR(50),                          -- 정산 계좌: 예금주
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  venue          VARCHAR(255) NOT NULL,
  event_date     TIMESTAMPTZ NOT NULL,
  original_price NUMERIC(12, 0) NOT NULL,
  total_seats    INT NOT NULL,
  organizer_id   UUID REFERENCES users(id),
  artist_address VARCHAR(42),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_number VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',  -- AVAILABLE → RESERVED → SOLD → USED
  reserved_at TIMESTAMPTZ,                               -- 선점 시각 (타임아웃 기준)
  UNIQUE (event_id, seat_number)
);

CREATE TABLE IF NOT EXISTS tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    BIGINT UNIQUE,                             -- 온체인 mint 후 확정
  owner_id    UUID NOT NULL REFERENCES users(id),
  event_id    UUID NOT NULL REFERENCES events(id),
  seat_id     UUID NOT NULL REFERENCES seats(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',   -- PENDING → CONFIRMED → USED → CANCELLED
  tx_hash     VARCHAR(66),
  qr_version  INT NOT NULL DEFAULT 0,
  entered_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id),
  seller_id      UUID NOT NULL REFERENCES users(id),
  price          NUMERIC(12, 0) NOT NULL,
  original_price NUMERIC(12, 0) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE → SOLD | CANCELLED
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 데모용 ADMIN 계정 (비밀번호: admin1234)
-- bcryptjs로 해싱된 값: $2a$10$X4kv7j5ZcG39WgogSl16BeSsHrTDv6QIJhW6Pt7Dp.c/USy7qFl2
INSERT INTO users (email, password_hash, nickname, role, is_kyc)
VALUES ('admin@test.com', '$2a$10$X4kv7j5ZcG39WgogSl16BeSsHrTDv6QIJhW6Pt7Dp.c/USy7qFl2', '관리자', 'ADMIN', true)
ON CONFLICT (email) DO NOTHING;

-- 샘플 공연 데이터
INSERT INTO events (name, venue, event_date, original_price, total_seats, artist_address)
VALUES
  ('BTS World Tour 2026', 'KSPO DOME', '2026-07-10 19:00:00+09', 165000, 100, NULL),
  ('아이유 단독 콘서트', '올림픽공원 체조경기장', '2026-08-15 20:00:00+09', 110000, 80, NULL)
ON CONFLICT DO NOTHING;

-- 샘플 좌석 데이터 (BTS 공연 10석)
INSERT INTO seats (event_id, seat_number)
SELECT e.id, 'A' || s.n
FROM events e, generate_series(1, 10) AS s(n)
WHERE e.name = 'BTS World Tour 2026'
ON CONFLICT DO NOTHING;

-- 샘플 좌석 데이터 (아이유 공연 10석)
INSERT INTO seats (event_id, seat_number)
SELECT e.id, 'A' || s.n
FROM events e, generate_series(1, 10) AS s(n)
WHERE e.name = '아이유 단독 콘서트'
ON CONFLICT DO NOTHING;

-- FanNFT 뱃지 테이블
CREATE TABLE IF NOT EXISTS fan_nft (
  wallet_address    VARCHAR(42),
  artist_address    VARCHAR(42) NOT NULL,
  token_id          BIGINT NOT NULL,
  attendance_count  INTEGER NOT NULL DEFAULT 0,
  tier              VARCHAR(20) NOT NULL DEFAULT 'NONE',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wallet_address, artist_address)
);