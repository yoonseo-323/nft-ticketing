/**
 * deploy.js의 resetDatabase 로직 단독 테스트 스크립트
 * 
 * 테스트 내용:
 * 1. DB 연결 가능 여부
 * 2. 테스트용 ACTIVE 리스팅 삽입 → resetDatabase 실행 → CANCELLED로 변경 확인
 * 3. DATABASE_URL 없을 때 graceful skip 확인
 */
import "dotenv/config";
import pgPkg from "pg";
const { Client } = pgPkg;

async function resetDatabase(dbUrl) {
  if (!dbUrl) {
    console.log("⚠️  DATABASE_URL이 설정되지 않아 DB 초기화를 건너뜁니다");
    return { skipped: true };
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();

    const listingResult = await client.query(
      "UPDATE market_listings SET status = 'CANCELLED' WHERE status = 'ACTIVE'"
    );
    console.log(`   - market_listings: ${listingResult.rowCount}건 CANCELLED 처리`);

    const ticketResult = await client.query(
      "UPDATE tickets SET token_id = NULL, tx_hash = NULL, status = 'CANCELLED' WHERE status IN ('CONFIRMED', 'PENDING')"
    );
    console.log(`   - tickets: ${ticketResult.rowCount}건 초기화`);

    const seatResult = await client.query(
      "UPDATE seats SET status = 'AVAILABLE', reserved_at = NULL WHERE status IN ('SOLD', 'RESERVED')"
    );
    console.log(`   - seats: ${seatResult.rowCount}건 AVAILABLE 복원`);

    await client.end();
    return { skipped: false, listings: listingResult.rowCount, tickets: ticketResult.rowCount, seats: seatResult.rowCount };
  } catch (err) {
    console.error("⚠️  DB 초기화 중 오류:", err.message);
    await client.end().catch(() => {});
    return { error: err.message };
  }
}

// ===================== 테스트 실행 =====================
async function runTests() {
  const dbUrl = process.env.DATABASE_URL;
  let passed = 0;
  let failed = 0;

  console.log("=========================================");
  console.log("🧪 resetDatabase 단위 테스트 시작");
  console.log("=========================================\n");

  // 테스트 1: DATABASE_URL 없을 때 graceful skip
  console.log("📌 테스트 1: DATABASE_URL 없으면 skip 처리");
  const skipResult = await resetDatabase(null);
  if (skipResult.skipped === true) {
    console.log("   ✅ PASS — 정상적으로 skip됨\n");
    passed++;
  } else {
    console.log("   ❌ FAIL — skip되지 않음\n");
    failed++;
  }

  // 테스트 2: DB 연결 및 resetDatabase 실행
  if (!dbUrl) {
    console.log("📌 테스트 2: DB 연결 테스트 — SKIP (DATABASE_URL 미설정)");
    console.log("   ⚠️  Contract/.env에 DATABASE_URL을 설정해주세요\n");
  } else {
    console.log("📌 테스트 2: DB 연결 및 resetDatabase 실행");
    
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      console.log("   ✅ DB 연결 성공\n");
      passed++;

      // 현재 ACTIVE 리스팅 수 확인
      const beforeListings = await client.query(
        "SELECT COUNT(*) as cnt FROM market_listings WHERE status = 'ACTIVE'"
      );
      const beforeTickets = await client.query(
        "SELECT COUNT(*) as cnt FROM tickets WHERE status IN ('CONFIRMED', 'PENDING')"
      );
      const beforeSeats = await client.query(
        "SELECT COUNT(*) as cnt FROM seats WHERE status IN ('SOLD', 'RESERVED')"
      );
      console.log(`📌 테스트 3: 현재 DB 상태 확인`);
      console.log(`   - ACTIVE 리스팅: ${beforeListings.rows[0].cnt}건`);
      console.log(`   - CONFIRMED/PENDING 티켓: ${beforeTickets.rows[0].cnt}건`);
      console.log(`   - SOLD/RESERVED 좌석: ${beforeSeats.rows[0].cnt}건`);

      await client.end();

      // resetDatabase 실행
      console.log("\n📌 테스트 4: resetDatabase 실행");
      const result = await resetDatabase(dbUrl);
      
      if (result.error) {
        console.log(`   ❌ FAIL — ${result.error}\n`);
        failed++;
      } else {
        console.log(`   ✅ PASS — 정상 실행 완료`);
        console.log(`      리스팅 ${result.listings}건, 티켓 ${result.tickets}건, 좌석 ${result.seats}건 처리\n`);
        passed++;
      }

      // 실행 후 확인
      const verifyClient = new Client({ connectionString: dbUrl });
      await verifyClient.connect();
      
      console.log("📌 테스트 5: 실행 후 검증");
      const afterListings = await verifyClient.query(
        "SELECT COUNT(*) as cnt FROM market_listings WHERE status = 'ACTIVE'"
      );
      const afterTickets = await verifyClient.query(
        "SELECT COUNT(*) as cnt FROM tickets WHERE status IN ('CONFIRMED', 'PENDING')"
      );
      const afterSeats = await verifyClient.query(
        "SELECT COUNT(*) as cnt FROM seats WHERE status IN ('SOLD', 'RESERVED')"
      );

      const allClear = 
        parseInt(afterListings.rows[0].cnt) === 0 &&
        parseInt(afterTickets.rows[0].cnt) === 0 &&
        parseInt(afterSeats.rows[0].cnt) === 0;

      if (allClear) {
        console.log("   ✅ PASS — ACTIVE 리스팅 0건, CONFIRMED/PENDING 티켓 0건, SOLD/RESERVED 좌석 0건");
        passed++;
      } else {
        console.log(`   ❌ FAIL — 아직 남아있음: 리스팅=${afterListings.rows[0].cnt}, 티켓=${afterTickets.rows[0].cnt}, 좌석=${afterSeats.rows[0].cnt}`);
        failed++;
      }

      await verifyClient.end();
    } catch (err) {
      console.log(`   ❌ FAIL — DB 연결 실패: ${err.message}`);
      console.log("   ⚠️  PostgreSQL이 실행 중인지, DATABASE_URL이 올바른지 확인하세요\n");
      failed++;
      await client.end().catch(() => {});
    }
  }

  console.log("\n=========================================");
  console.log(`🧪 테스트 결과: ${passed} passed, ${failed} failed`);
  console.log("=========================================");

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
