// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TicketMarket
 * @dev 티켓 NFT의 2차 거래 상태를 기록하고 암표 방지를 위해 정가 대비 최대 130% 상한 제한을 강제하는 중개 마켓 컨트랙트
 */
contract TicketMarket is Ownable {
    // 판매 등록된 티켓의 세부 정보를 저장하는 구조체
    struct Listing {
        address seller;        // 판매자 지갑 주소
        uint256 price;         // 판매 등록 가격 (온체인 기록용)
        uint256 originalPrice; // 티켓의 원래 정가
        bool isActive;         // 판매 활성화 여부
    }

    // Token ID별 판매 정보를 저장하는 매핑
    mapping(uint256 => Listing) public listings;

    // 이벤트 선언
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price); // 티켓 판매 등록 시 발생
    event TicketSold(uint256 indexed tokenId, address indexed buyer, uint256 price);    // 티켓 판매 완료 시 발생
    event TicketCanceled(uint256 indexed tokenId);                                      // 판매 등록 취소 시 발생

    constructor() Ownable(msg.sender) {}

    /**
     * @dev 백엔드가 가격 130% 상한 검증 후 호출하여 2차 마켓에 티켓 등록 (Owner 전용)
     * @param tokenId 판매 등록할 티켓의 Token ID
     * @param price 판매 가격 (온체인 기록용)
     * @param originalPrice 티켓의 원래 정가
     * @param seller 판매자 지갑 주소
     */
    function list(uint256 tokenId, uint256 price, uint256 originalPrice, address seller) external onlyOwner {
        // 암표 방지: 판매가가 정가의 130% 이하인지 더블 체크 검증
        require(price <= (originalPrice * 130) / 100, "TicketMarket: Price exceeds 130% cap");
        require(!listings[tokenId].isActive, "TicketMarket: Already listed");

        listings[tokenId] = Listing({
            seller: seller,
            price: price,
            originalPrice: originalPrice,
            isActive: true
        });

        emit TicketListed(tokenId, seller, price);
    }

    /**
     * @dev 결제 완료 확인 후 백엔드에 의해 호출되어 판매 완료 상태로 전환 (Owner 전용)
     * @notice 실제 NFT 소유권 이전은 TicketNFT.adminTransfer를 통해 백엔드에서 별도로 처리합니다.
     * @param tokenId 구매할 티켓의 Token ID
     * @param buyer 구매자 지갑 주소
     */
    function completeSale(uint256 tokenId, address buyer) external onlyOwner {
        require(listings[tokenId].isActive, "TicketMarket: Not listed");
        uint256 price = listings[tokenId].price;
        
        // 매핑에서 판매 정보 삭제 (상태 변경)
        delete listings[tokenId];
        
        emit TicketSold(tokenId, buyer, price);
    }

    /**
     * @dev 판매 취소 (Owner 전용)
     * @param tokenId 취소할 티켓의 Token ID
     */
    function cancel(uint256 tokenId) external onlyOwner {
        require(listings[tokenId].isActive, "TicketMarket: Not listed");
        
        // 매핑에서 판매 정보 삭제
        delete listings[tokenId];
        
        emit TicketCanceled(tokenId);
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
