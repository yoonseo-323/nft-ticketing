// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TicketMarket is Ownable {
    struct Listing {
        address seller;
        uint256 price;         // KRW 원 단위 (온체인 기록용)
        uint256 originalPrice;
        bool isActive;
    }

    mapping(uint256 => Listing) public listings;

    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event TicketSold(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event TicketCanceled(uint256 indexed tokenId);

    constructor() Ownable(msg.sender) {}

    // 백엔드가 가격 130% 상한 검증 후 호출
    function list(uint256 tokenId, uint256 price, uint256 originalPrice, address seller) external onlyOwner {
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

    // KRW 결제 확인 후 백엔드가 호출 (NFT 이전은 TicketNFT.adminTransfer로 별도 처리)
    function completeSale(uint256 tokenId, address buyer) external onlyOwner {
        require(listings[tokenId].isActive, "TicketMarket: Not listed");
        uint256 price = listings[tokenId].price;
        delete listings[tokenId];
        emit TicketSold(tokenId, buyer, price);
    }

    // 판매 취소
    function cancel(uint256 tokenId) external onlyOwner {
        require(listings[tokenId].isActive, "TicketMarket: Not listed");
        delete listings[tokenId];
        emit TicketCanceled(tokenId);
    }
}
