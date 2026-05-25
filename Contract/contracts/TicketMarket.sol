// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev TicketNFT 컨트랙트 인터페이스 정의
 */
interface ITicketNFT is IERC721 {
    /**
     * @dev 특정 티켓 NFT의 원래 정가를 조회
     * @param tokenId 조회할 티켓의 Token ID
     * @return uint256 티켓의 정가 (Wei 단위)
     */
    function ticketPrices(uint256 tokenId) external view returns (uint256);
}

/**
 * @title TicketMarket
 * @dev 티켓 NFT의 2차 거래(판매 등록, 구매, 취소)를 관리하고 암표 방지를 위해 정가 제한을 강제하는 마켓 컨트랙트
 */
contract TicketMarket is Ownable, ReentrancyGuard {
    // 거래할 대상 TicketNFT 컨트랙트 인스턴스
    ITicketNFT public ticketNFT;

    // 판매 등록된 티켓의 세부 정보를 저장하는 구조체
    struct Listing {
        address seller; // 판매자 지갑 주소
        uint256 price;  // 판매 희망 가격 (Wei 단위)
        bool isActive;  // 판매 활성화 여부
    }

    // Token ID별 판매 정보를 저장하는 매핑
    mapping(uint256 => Listing) public listings;

    // 이벤트 선언
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);   // 티켓 판매 등록 시 발생
    event TicketBought(uint256 indexed tokenId, address indexed buyer, uint256 price);    // 티켓 구매 완료 시 발생
    event TicketCanceled(uint256 indexed tokenId, address indexed seller);                 // 티켓 판매 등록 취소 시 발생

    /**
     * @dev 생성자 - 대상 TicketNFT 컨트랙트 주소를 초기화
     * @param _ticketNFT TicketNFT 컨트랙트 주소
     */
    constructor(address _ticketNFT) Ownable(msg.sender) {
        ticketNFT = ITicketNFT(_ticketNFT);
    }

    /**
     * @dev 2차 마켓에 티켓 판매 등록 (정가 제한 규칙 강제)
     * @param tokenId 판매 등록할 티켓의 Token ID
     * @param price 판매 희망 가격 (Wei 단위)
     */
    function listForSale(uint256 tokenId, uint256 price) external {
        // 호출자가 해당 티켓의 소유자인지 확인
        require(ticketNFT.ownerOf(tokenId) == msg.sender, "TicketMarket: Not the owner");
        
        // 마켓 컨트랙트가 해당 NFT를 전송할 수 있도록 권한(Approve)을 얻었는지 확인
        require(
            ticketNFT.getApproved(tokenId) == address(this) || ticketNFT.isApprovedForAll(msg.sender, address(this)),
            "TicketMarket: Contract not approved"
        );
        
        // 티켓의 원래 정가 획득 및 정가 등록 여부 확인
        uint256 origPrice = ticketNFT.ticketPrices(tokenId);
        require(origPrice > 0, "TicketMarket: Original price not set or does not exist");
        
        // 와이어프레임 규칙: 암표 방지를 위해 판매가를 원래 정가의 130% 이하로 제한
        require(price <= (origPrice * 130) / 100, "TicketMarket: Price exceeds 130% of original price");

        // 판매 등록 상태로 저장
        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            isActive: true
        });

        emit TicketListed(tokenId, msg.sender, price);
    }

    /**
     * @dev 등록한 판매 상품 취소
     * @param tokenId 취소할 티켓의 Token ID
     */
    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        require(listing.isActive, "TicketMarket: Not listed");
        require(listing.seller == msg.sender, "TicketMarket: Not the seller");

        // 매핑에서 판매 정보 삭제
        delete listings[tokenId];
        emit TicketCanceled(tokenId, msg.sender);
    }

    /**
     * @dev 등록된 티켓 구매 (ETH 즉시 송금 및 남는 잔액 환불 처리)
     * @param tokenId 구매할 티켓의 Token ID
     */
    function buyTicket(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = listings[tokenId];
        
        // 판매 중인지 확인 및 지불한 금액이 판매가 이상인지 검증
        require(listing.isActive, "TicketMarket: Not listed for sale");
        require(msg.value >= listing.price, "TicketMarket: Insufficient payment");

        address seller = listing.seller;
        uint256 price = listing.price;

        // 재진입(Reentrancy) 공격 방지를 위해 상태값을 먼저 삭제
        delete listings[tokenId];

        // 구매자에게 티켓 NFT 전송
        // (참고: 수령인인 msg.sender가 KYC 인증을 완료하지 않았다면 TicketNFT._update에서 자동으로 트랜잭션이 거부됩니다.)
        ticketNFT.safeTransferFrom(seller, msg.sender, tokenId);

        // 판매자에게 ETH 대금 즉시 송금
        (bool success, ) = payable(seller).call{value: price}("");
        require(success, "TicketMarket: ETH transfer failed");

        // 구매자가 더 많은 ETH를 보냈을 경우 차액 환불
        if (msg.value > price) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(refundSuccess, "TicketMarket: Refund failed");
        }

        emit TicketBought(tokenId, msg.sender, price);
    }

    /**
     * @dev 여러 개의 토큰 ID에 대한 판매 등록 정보를 일괄 조회 (프론트엔드 연동 최적화)
     * @param tokenIds 조회할 토큰 ID 배열
     * @return Listing[] 각 토큰 ID에 해당하는 판매 정보 배열
     */
    function getListings(uint256[] calldata tokenIds) external view returns (Listing[] memory) {
        Listing[] memory batchListings = new Listing[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            batchListings[i] = listings[tokenIds[i]];
        }
        return batchListings;
    }
}
