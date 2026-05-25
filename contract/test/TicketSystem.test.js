import pkg from "hardhat";
const { ethers } = pkg;
import { expect } from "chai";

describe("NFT Ticket System Integration Tests", function () {
  let identityRegistry;
  let ticketNFT;
  let ticketMarket;
  let owner, seller, verifiedBuyer, unverifiedBuyer;

  beforeEach(async function () {
    // 테스트용 지갑 계정 획득
    [owner, seller, verifiedBuyer, unverifiedBuyer] = await ethers.getSigners();

    // 1. IdentityRegistry 배포
    const IdentityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
    identityRegistry = await IdentityRegistryFactory.deploy();
    await identityRegistry.waitForDeployment();

    // 2. TicketNFT 배포 (IdentityRegistry 주소 주입)
    const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
    ticketNFT = await TicketNFTFactory.deploy(await identityRegistry.getAddress());
    await ticketNFT.waitForDeployment();

    // 3. TicketMarket 배포
    const TicketMarketFactory = await ethers.getContractFactory("TicketMarket");
    ticketMarket = await TicketMarketFactory.deploy();
    await ticketMarket.waitForDeployment();
  });

  describe("1. KYC 인증 및 발행(Mint) 단계 검증", function () {
    it("KYC 미인증 주소로 티켓 발행 시 실패해야 함", async function () {
      const originalPrice = ethers.parseEther("0.1"); // 원래 정가: 0.1 ETH
      const seatInfo = "A구역-1열-5번";

      // seller 지갑이 KYC 미인증 상태이므로 발행 트랜잭션이 실패해야 함
      await expect(
        ticketNFT.connect(owner).mint(seller.address, seatInfo, originalPrice)
      ).to.be.revertedWith("TicketNFT: Recipient is not KYC verified");
    });

    it("KYC 인증 완료 후 티켓 발행 시 성공 및 데이터 저장 검증", async function () {
      const originalPrice = ethers.parseEther("0.1");
      const seatInfo = "A구역-1열-5번";

      // 1. IdentityRegistry에 seller 지갑 인증 등록 (register)
      await expect(identityRegistry.connect(owner).register(seller.address))
        .to.emit(identityRegistry, "Registered")
        .withArgs(seller.address);

      // 2. 티켓 발행 시도 (성공 및 TicketMinted 이벤트 방출 검증)
      await expect(ticketNFT.connect(owner).mint(seller.address, seatInfo, originalPrice))
        .to.emit(ticketNFT, "TicketMinted")
        .withArgs(0, seller.address, seatInfo, originalPrice);

      // 3. 온체인 데이터 저장 검증
      expect(await ticketNFT.ownerOf(0)).to.equal(seller.address);
      expect(await ticketNFT.ticketSeats(0)).to.equal(seatInfo);
      expect(await ticketNFT.ticketPrices(0)).to.equal(originalPrice);
    });
  });

  describe("2. 마켓 판매 등록 단계 검증 (정가 130% 상한선 규칙)", function () {
    const originalPrice = ethers.parseEther("0.1");
    const seatInfo = "A구역-1열-5번";
    const tokenId = 0;

    beforeEach(async function () {
      // seller 인증 후 티켓 발행
      await identityRegistry.connect(owner).register(seller.address);
      await ticketNFT.connect(owner).mint(seller.address, seatInfo, originalPrice);
    });

    it("정가의 130%를 초과하는 판매 가격 책정 시 등록 실패해야 함", async function () {
      const tooExpensivePrice = ethers.parseEther("0.130001");

      // 어드민(owner)이 130% 초과 가격으로 등록하려고 하면 실패해야 함
      await expect(
        ticketMarket.connect(owner).list(tokenId, tooExpensivePrice, originalPrice, seller.address)
      ).to.be.revertedWith("TicketMarket: Price exceeds 130% cap");
    });

    it("정가의 130% 이하 가격 책정 시 등록 성공 및 이벤트 방출 검증", async function () {
      const validPrice = ethers.parseEther("0.13"); // 정확히 130% 가격

      // 어드민(owner)이 등록 성공 검증
      await expect(ticketMarket.connect(owner).list(tokenId, validPrice, originalPrice, seller.address))
        .to.emit(ticketMarket, "TicketListed")
        .withArgs(tokenId, seller.address, validPrice);

      // 등록된 매핑 데이터 확인
      const listing = await ticketMarket.listings(tokenId);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(validPrice);
      expect(listing.originalPrice).to.equal(originalPrice);
      expect(listing.isActive).to.be.true;

      // 일괄 조회 배치 뷰 함수 getListings 연동 검증
      const batchListings = await ticketMarket.getListings([tokenId]);
      expect(batchListings.length).to.equal(1);
      expect(batchListings[0].seller).to.equal(seller.address);
      expect(batchListings[0].price).to.equal(validPrice);
    });
  });

  describe("3. 마켓 티켓 구매 단계 검증 (구매자 KYC 우회 방지 보안 필터)", function () {
    const originalPrice = ethers.parseEther("0.1");
    const seatInfo = "A구역-1열-5번";
    const tokenId = 0;
    const salePrice = ethers.parseEther("0.12");

    beforeEach(async function () {
      // 1. 판매자 인증 및 티켓 발행
      await identityRegistry.connect(owner).register(seller.address);
      await ticketNFT.connect(owner).mint(seller.address, seatInfo, originalPrice);

      // 2. 마켓 등록
      await ticketMarket.connect(owner).list(tokenId, salePrice, originalPrice, seller.address);
    });

    it("KYC 미인증 구매자가 티켓을 양도(우회 전송)받으려 할 때 실패해야 함", async function () {
      // unverifiedBuyer 지갑이 KYC 미인증 상태이므로 백엔드가 adminTransfer로 소유권 전송을 시도할 때 실패해야 함
      await expect(
        ticketNFT.connect(owner).adminTransfer(seller.address, unverifiedBuyer.address, tokenId)
      ).to.be.revertedWith("TicketNFT: Recipient is not KYC verified");
    });

    it("KYC 인증 완료 구매자가 구매 시 성공, 소유권 이전 및 이벤트 검증", async function () {
      // 1. 구매자 지갑 KYC 인증 완료
      await identityRegistry.connect(owner).register(verifiedBuyer.address);

      // 2. 백엔드에서 온체인 리스팅 완료 처리
      await expect(ticketMarket.connect(owner).completeSale(tokenId, verifiedBuyer.address))
        .to.emit(ticketMarket, "TicketSold")
        .withArgs(tokenId, verifiedBuyer.address, salePrice);

      // 3. 백엔드에서 실소유권 양도 처리 (adminTransfer)
      await ticketNFT.connect(owner).adminTransfer(seller.address, verifiedBuyer.address, tokenId);

      // 4. 구매자에게 티켓 NFT가 정상 이전되었는지 검증
      expect(await ticketNFT.ownerOf(tokenId)).to.equal(verifiedBuyer.address);

      // 5. 마켓 등록 상태가 비활성화(삭제) 되었는지 검증
      const listing = await ticketMarket.listings(tokenId);
      expect(listing.isActive).to.be.false;
    });
  });

  describe("4. 티켓 소각(입장) 단계 검증", function () {
    const originalPrice = ethers.parseEther("0.1");
    const seatInfo = "A구역-1열-5번";
    const tokenId = 0;

    beforeEach(async function () {
      // seller 인증 후 티켓 발행
      await identityRegistry.connect(owner).register(seller.address);
      await ticketNFT.connect(owner).mint(seller.address, seatInfo, originalPrice);
    });

    it("어드민(Owner)이 아닌 계정이 임의로 티켓을 소각하려고 하면 실패해야 함", async function () {
      await expect(
        ticketNFT.connect(seller).burn(tokenId)
      ).to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount");
    });

    it("어드민(Owner)이 티켓 소각 시 성공 및 매핑 데이터 초기화 검증", async function () {
      // 티켓 소각 진행
      await expect(ticketNFT.connect(owner).burn(tokenId))
        .to.emit(ticketNFT, "TicketBurned")
        .withArgs(tokenId);

      // 온체인 저장소 메타데이터 초기화 검증
      expect(await ticketNFT.ticketSeats(tokenId)).to.equal("");
      expect(await ticketNFT.ticketPrices(tokenId)).to.equal(0n);
      
      // 소각되어 존재하지 않는 토큰 소유권 확인 시 에러 검증
      await expect(ticketNFT.ownerOf(tokenId)).to.be.revertedWithCustomError(
        ticketNFT,
        "ERC721NonexistentToken"
      );
    });
  });
});
