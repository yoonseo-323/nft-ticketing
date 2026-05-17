// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ITicketNFT is IERC721 {
    function ticketPrices(uint256 tokenId) external view returns (uint256);
}

contract TicketMarket is Ownable, ReentrancyGuard {
    ITicketNFT public ticketNFT;

    struct Listing {
        address seller;
        uint256 price;
        bool isActive;
    }

    // tokenId => Listing
    mapping(uint256 => Listing) public listings;

    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event TicketBought(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event TicketCanceled(uint256 indexed tokenId, address indexed seller);

    constructor(address _ticketNFT) Ownable(msg.sender) {
        ticketNFT = ITicketNFT(_ticketNFT);
    }

    /**
     * @dev 2차 시장에 티켓 판매 등록 (가격 상한 강제)
     * @param tokenId 판매할 티켓 ID
     * @param price 판매 희망가
     */
    function listForSale(uint256 tokenId, uint256 price) external {
        require(ticketNFT.ownerOf(tokenId) == msg.sender, "TicketMarket: Not the owner");
        require(
            ticketNFT.getApproved(tokenId) == address(this) || ticketNFT.isApprovedForAll(msg.sender, address(this)),
            "TicketMarket: Contract not approved"
        );
        
        uint256 origPrice = ticketNFT.ticketPrices(tokenId);
        require(origPrice > 0, "TicketMarket: Original price not set or does not exist");
        
        // 와이어프레임 조건: 정가의 130% 초과 시 트랜잭션 자동 거부
        require(price <= (origPrice * 130) / 100, "TicketMarket: Price exceeds 130% of original price");

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            isActive: true
        });

        emit TicketListed(tokenId, msg.sender, price);
    }

    /**
     * @dev 등록된 판매 취소
     * @param tokenId 취소할 티켓 ID
     */
    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        require(listing.isActive, "TicketMarket: Not listed");
        require(listing.seller == msg.sender, "TicketMarket: Not the seller");

        delete listings[tokenId];
        emit TicketCanceled(tokenId, msg.sender);
    }

    /**
     * @dev 티켓 구매 (ETH 즉시 분배/정산)
     * @param tokenId 구매할 티켓 ID
     */
    function buyTicket(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.isActive, "TicketMarket: Not listed for sale");
        require(msg.value >= listing.price, "TicketMarket: Insufficient payment");

        address seller = listing.seller;
        uint256 price = listing.price;

        // 상태 변경 먼저 수행 (Reentrancy 공격 방지)
        delete listings[tokenId];

        // 구매자에게 NFT 전송
        ticketNFT.safeTransferFrom(seller, msg.sender, tokenId);

        // 판매자에게 ETH 즉시 송금
        (bool success, ) = payable(seller).call{value: price}("");
        require(success, "TicketMarket: ETH transfer failed");

        // 초과 입금된 ETH가 있다면 환불
        if (msg.value > price) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(refundSuccess, "TicketMarket: Refund failed");
        }

        emit TicketBought(tokenId, msg.sender, price);
    }
}
