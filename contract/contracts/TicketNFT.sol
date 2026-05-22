// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
}

contract TicketNFT is ERC721, Ownable {
    IIdentityRegistry public identityRegistry;

    uint256 private _nextTokenId;
    mapping(uint256 => string) public ticketSeats;
    mapping(uint256 => uint256) public ticketPrices;

    event TicketMinted(uint256 indexed tokenId, address indexed to);
    event TicketBurned(uint256 indexed tokenId);

    constructor(address _identityRegistry) ERC721("TicketNFT", "TKT") Ownable(msg.sender) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function mint(address to, string calldata seatInfo, uint256 originalPrice) external onlyOwner returns (uint256) {
        require(identityRegistry.isVerified(to), "TicketNFT: User is not KYC verified");
        uint256 tokenId = _nextTokenId++;
        ticketSeats[tokenId] = seatInfo;
        ticketPrices[tokenId] = originalPrice;
        _safeMint(to, tokenId);
        emit TicketMinted(tokenId, to);
        return tokenId;
    }

    // 백엔드가 KRW 결제 확인 후 양도 시 직접 소유권 이전
    function adminTransfer(address from, address to, uint256 tokenId) external onlyOwner {
        require(identityRegistry.isVerified(to), "TicketNFT: Buyer is not KYC verified");
        _transfer(from, to, tokenId);
    }

    // 입장 완료 후 소각
    function burn(uint256 tokenId) external onlyOwner {
        delete ticketSeats[tokenId];
        delete ticketPrices[tokenId];
        _burn(tokenId);
        emit TicketBurned(tokenId);
    }
}
