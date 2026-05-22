-- Suuca NFT Ticketing DB Schema
-- PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet      VARCHAR(42) UNIQUE NOT NULL,
  nickname    VARCHAR(50),
  is_kyc      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  venue          VARCHAR(255) NOT NULL,
  event_date     TIMESTAMPTZ NOT NULL,
  original_price NUMERIC(12, 0) NOT NULL,
  total_seats    INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_number VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
  -- AVAILABLE → RESERVED → SOLD → USED
  UNIQUE (event_id, seat_number)
);

CREATE TABLE IF NOT EXISTS tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    BIGINT UNIQUE NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id),
  event_id    UUID NOT NULL REFERENCES events(id),
  seat_id     UUID NOT NULL REFERENCES seats(id),
  status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING → CONFIRMED → USED → CANCELLED
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
  status         VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE → SOLD | CANCELLED
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 샘플 데이터 (테스트용)
INSERT INTO events (name, venue, event_date, original_price, total_seats)
VALUES
  ('BTS World Tour 2026', 'KSPO DOME', '2026-07-10 19:00:00+09', 165000, 100),
  ('아이유 단독 콘서트', '올림픽공원 체조경기장', '2026-08-15 20:00:00+09', 110000, 80)
ON CONFLICT DO NOTHING;
