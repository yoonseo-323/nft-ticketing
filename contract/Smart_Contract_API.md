# NFT 티켓 스마트 컨트랙트 API 명세서

## 1. IdentityRegistry (KYC 인증 레지스트리)
사용자의 지갑 주소별 KYC 인증 상태를 기록, 업데이트 및 조회하는 컨트랙트입니다. 백엔드 서버의 회원가입 또는 본인인증 단계와 연동하여 사용합니다.

### 상태 변경 함수 (Write Functions)

#### verify(address _user)
- 설명: 특정 지갑 주소를 KYC 인증 완료 상태로 등록합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용 (백엔드 서버의 관리자 서명 필요)
- 매개변수:
  - _user (address): 인증을 완료 처리할 사용자의 지갑 주소

#### verifyBatch(address[] _users)
- 설명: 여러 개의 지갑 주소를 한 번의 트랜잭션으로 대량 일괄 인증 처리합니다. (가스비 대폭 절감)
- 호출 권한: 컨트랙트 소유자(Owner) 전용
- 매개변수:
  - _users (address[]): 일괄 인증할 지갑 주소 배열

#### revoke(address _user)
- 설명: 특정 지갑 주소의 KYC 인증 상태를 취소(해제)합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용
- 매개변수:
  - _user (address): 인증을 취소할 사용자의 지갑 주소

#### revokeBatch(address[] _users)
- 설명: 여러 개의 지갑 주소의 KYC 인증 상태를 한 번의 트랜잭션으로 대량 일괄 취소 처리합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용
- 매개변수:
  - _users (address[]): 일괄 인증 취소할 지갑 주소 배열

### 조회 함수 (Read Functions - 가스비 무료)

#### isVerified(address _user)
- 설명: 특정 지갑 주소가 KYC 인증이 완료된 지갑인지 여부를 조회합니다.
- 호출 권한: 누구나 제한 없이 호출 가능
- 매개변수:
  - _user (address): 확인할 지갑 주소
- 반환값: bool (true = 인증 완료, false = 미인증)

### 이벤트 (Events)
- event UserVerified(address indexed user): 특정 지갑 주소가 인증 완료되었을 때 발생
- event UserRevoked(address indexed user): 특정 지갑 주소의 인증이 취소되었을 때 발생

---

## 2. TicketNFT (티켓 NFT 컨트랙트)
ERC-721 표준 기반의 공연 티켓 NFT 계약입니다. 티켓의 신규 발행(Mint), 소유 및 입장 시 소각(Burn)을 관리하며, 모든 소유권 전송 단계에서 수령인의 KYC 검증이 자동 처리됩니다.

### 상태 변경 함수 (Write Functions)

#### mint(address to, string seatInfo, uint256 originalPrice)
- 설명: 지정된 지갑 주소로 좌석 정보와 원래 정가가 기록된 티켓 NFT를 신규 발행합니다.
- 보안 필터: 수령인(to)의 지갑이 KYC 미인증 상태인 경우 트랜잭션이 자동으로 거절됩니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용 (사용자의 결제 완료를 백엔드 서버가 확인한 후 호출)
- 매개변수:
  - to (address): 티켓 NFT를 발급받을 사용자의 지갑 주소 (KYC 인증 완료 필수)
  - seatInfo (string): 좌석 정보 문자열 (예: "A구역-1열-5번")
  - originalPrice (uint256): 티켓의 원래 정가 (단위: Wei, 1 ETH = 10^18 Wei)

#### burn(uint256 tokenId)
- 설명: 현장 입장 게이트 통과 시 티켓 NFT 및 저장된 메타데이터를 영구 소각(입장 완료 처리)합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용 (현장 검증 기기 또는 백엔드 서버가 호출)
- 매개변수:
  - tokenId (uint256): 소각할 티켓의 고유 Token ID

#### approve(address to, uint256 tokenId)
- 설명: 특정 티켓의 전송 대행 권한을 마켓플레이스 등에 양도합니다. 2차 마켓 등록 전에 반드시 사용자의 프론트엔드 지갑에서 호출해야 합니다.
- 호출 권한: 해당 티켓 토큰의 현재 소유자(Owner) 전용
- 매개변수:
  - to (address): 대행 권한을 부여받을 주소 (TicketMarket 컨트랙트의 주소 전달)
  - tokenId (uint256): 권한을 부여할 티켓의 Token ID

### 조회 함수 (Read Functions - 가스비 무료)

#### ticketSeats(uint256 tokenId)
- 설명: 특정 티켓 NFT에 할당된 좌석 정보 문자열을 반환합니다.
- 반환값: string (예: "A구역-1열-5번")

#### ticketPrices(uint256 tokenId)
- 설명: 특정 티켓 NFT의 원래 정가(Wei 단위)를 반환합니다.
- 반환값: uint256 (원래 정가 값)

#### ownerOf(uint256 tokenId)
- 설명: 특정 티켓 NFT의 현재 실소유자 지갑 주소를 반환합니다. (ERC721 표준)
- 반환값: address (현재 소유자 지갑 주소)

### 이벤트 (Events)
- event TicketMinted(uint256 indexed tokenId, address indexed to, string seatInfo, uint256 originalPrice): 신규 티켓 발행 성공 시 상세 정보 방출 (백엔드 로컬 데이터베이스 실시간 캐싱 업데이트용으로 최적화됨)
- event Transfer(address indexed from, address indexed to, uint256 indexed tokenId): 소유권 변경 시 기본 방출 (ERC721 표준)

---

## 3. TicketMarket (2차 거래 마켓플레이스 컨트랙트)
정가 대비 최대 130% 상한 제한을 강제하여 암표 거래를 원천 차단하고, 안전한 ETH 즉시 정산 및 대금 지급을 중개하는 스마트 컨트랙트입니다.

### 상태 변경 함수 (Write Functions)

#### listForSale(uint256 tokenId, uint256 price)
- 설명: 본인이 소유한 티켓 NFT를 2차 마켓에 판매 상품으로 등록합니다.
- 보안 필터: 등록하려는 가격(price)이 해당 티켓의 원래 정가(originalPrice)의 130%를 초과하는 경우 트랜잭션이 자동으로 거절됩니다.
- 호출 권한: 해당 티켓 토큰의 현재 소유자(Owner) 전용 (사전에 TicketNFT.approve가 완료되어야 함)
- 매개변수:
  - tokenId (uint256): 판매 등록할 티켓의 Token ID
  - price (uint256): 희망 판매 가격 (단위: Wei)

#### cancelListing(uint256 tokenId)
- 설명: 마켓에 등록했던 판매 상품 정보를 취소하고 마켓 목록에서 내립니다.
- 호출 권한: 해당 상품을 판매 등록했던 원래 판매자 전용
- 매개변수:
  - tokenId (uint256): 취소할 티켓의 Token ID

#### buyTicket(uint256 tokenId) external payable
- 설명: 마켓에 등록된 티켓 상품을 즉시 구매합니다.
- 실행 프로세스: 구매자가 송금한 ETH가 즉시 판매자의 지갑으로 바로 전송(정산)되고, 동시에 티켓 NFT의 소유권이 구매자에게 이전됩니다. 만약 구매자가 초과해서 보낸 ETH가 있다면 구매자에게 자동으로 즉시 환불됩니다.
- 보안 필터: 구매자(msg.sender)가 KYC 인증 완료 지갑이 아니거나, 판매자가 구매 직전 마켓에 부여했던 전송 권한을 취소한 경우 트랜잭션 전체가 안전하게 거절되며 지불한 금액은 전액 자동 환불됩니다.
- 호출 권한: 누구나 호출 가능 (단, 구매자의 지갑은 KYC 인증 완료 상태여야 함)
- 주의사항: 지갑에서 트랜잭션을 호출할 때 반드시 구매 가격만큼의 ETH를 value 필드에 실어 전송해야 합니다.
- 매개변수:
  - tokenId (uint256): 구매하고자 하는 티켓의 Token ID

### 조회 함수 (Read Functions - 가스비 무료)

#### listings(uint256 tokenId)
- 설명: 특정 토큰 ID에 등록되어 있는 마켓 판매 정보를 조회합니다.
- 반환값: Listing 구조체 (address seller, uint256 price, bool isActive)

#### getListings(uint256[] tokenIds)
- 설명: 다수의 토큰 ID들에 대한 마켓 등록 현황을 한 번의 RPC 요청으로 일괄 조회합니다. (프론트엔드 상품 목록 페이지 조회 최적화용 배치 조회 함수)
- 매개변수:
  - tokenIds (uint256[]): 일괄 조회할 토큰 ID 배열
- 반환값: Listing 구조체 배열

### 이벤트 (Events)
- event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price): 마켓 신규 상품 등록 시 발생
- event TicketBought(uint256 indexed tokenId, address indexed buyer, uint256 price): 구매 성공 및 정산 완료 시 발생
- event TicketCanceled(uint256 indexed tokenId, address indexed seller): 등록된 상품 취소 시 발생

---

## 4. FanNFT (관람 횟수 및 뱃지 등급 관리)
사용자의 누적 관람 횟수를 기록하고 뱃지 등급을 자동 산정하여 관리하는 ERC-721 기반의 전송 불가 SBT(Soulbound Token) 컨트랙트입니다.

### 상태 변경 함수 (Write Functions)

#### recordAttendance(address fan)
- 설명: 특정 사용자의 관람 횟수를 1회 증가시키고, 누적된 횟수를 바탕으로 등급 상승 여부를 자동 판별합니다. 만약 사용자가 FanNFT를 소유하고 있지 않은 경우(최초 1회 관람 시) 토큰을 신규 발행(Mint)하여 사용자 지갑으로 전송합니다.
- 보안 필터: SBT 전송이 제한되도록 `_update` 함수를 오버라이드하여 민팅(Mint) 및 소각(Burn)을 제외한 모든 사용자 간 전송(Transfer) 시도가 강제로 거절(Revert)됩니다.
- 호출 권한: TicketNFT 컨트랙트 전용 (TicketNFT.burn 실행 시 자동 호출됨)
- 매개변수:
  - fan (address): 관람 횟수를 기록할 사용자의 지갑 주소

#### setTicketNFT(address _ticketNFT)
- 설명: recordAttendance를 호출할 수 있는 TicketNFT 컨트랙트의 주소를 지정합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용
- 매개변수:
  - _ticketNFT (address): TicketNFT 컨트랙트 주소

#### setBaseURI(string _newBaseURI)
- 설명: FanNFT의 메타데이터 서버 base URI를 업데이트합니다.
- 호출 권한: 컨트랙트 소유자(Owner) 전용
- 매개변수:
  - _newBaseURI (string): 변경할 base URI 문자열 (예: "http://localhost:3000/fan-nft/metadata/")

### 조회 함수 (Read Functions - 가스비 무료)

#### attendanceCount(address fan)
- 설명: 특정 사용자의 누적 관람 횟수를 반환합니다.
- 매개변수:
  - fan (address): 조회할 사용자의 지갑 주소
- 반환값: uint256 (누적 관람 횟수)

#### userTokenId(address fan)
- 설명: 특정 사용자의 FanNFT 토큰 ID를 반환합니다.
- 매개변수:
  - fan (address): 조회할 사용자의 지갑 주소
- 반환값: uint256 (토큰 ID)

#### tokenURI(uint256 tokenId)
- 설명: 특정 FanNFT에 대한 고정된 메타데이터 URL을 반환합니다.
- 반환값: string (예: "http://localhost:3000/fan-nft/metadata/{walletAddress}")

### 이벤트 (Events)
- event AttendanceRecorded(address indexed fan, uint256 indexed tokenId, uint256 attendanceCount): 관람 횟수 누적 및 FanNFT 발급 시 발생 (백엔드 캐싱용)
- event TierUpgraded(address indexed fan, string newTier): 관람 횟수가 승급 조건(1, 3, 7, 15, 25)에 도달하여 등급이 상승했을 때 발생 (푸시 알림 연동용)
