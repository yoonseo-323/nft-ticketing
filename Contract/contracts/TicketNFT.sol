// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IIdentityRegistry {
    function isVerified(address _user) external view returns (bool);
}

contract TicketNFT is ERC721, ERC721Burnable, Ownable {
    IIdentityRegistry public identityRegistry;
    uint256 private _nextTokenId;
    mapping(uint256 => string) public ticketSeats;
    mapping(uint256 => uint256) public ticketPrices;

    constructor(address _identityRegistry) ERC721("TicketNFT", "TKT") Ownable(msg.sender) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    /**
     * @dev IdentityRegistry 컨트랙트 주소 업데이트
     * @param _identityRegistry 새로운 IdentityRegistry 주소
     */
    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    /**
     * @dev 인증된 사용자에게 좌석 정보와 정가가 포함된 새로운 티켓 NFT 발행
     * @param to 티켓을 받을 사용자 주소
     * @param seatInfo 부여할 좌석 정보 (예: "A구역-1열-5번")
     * @param originalPrice 티켓의 정가 (Wei 단위)
     */
    function mint(address to, string calldata seatInfo, uint256 originalPrice) external onlyOwner {
        require(identityRegistry.isVerified(to), "TicketNFT: User is not KYC verified");
        uint256 tokenId = _nextTokenId++;
        ticketSeats[tokenId] = seatInfo;
        ticketPrices[tokenId] = originalPrice;
        _safeMint(to, tokenId);
    }

    /**
     * @dev 입장 후 티켓 소각
     * @param tokenId 소각할 티켓의 ID
     */
    function burn(uint256 tokenId) public override onlyOwner {
        delete ticketSeats[tokenId];
        delete ticketPrices[tokenId];
        _update(address(0), tokenId, address(0));
    }
}
