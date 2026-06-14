// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title FanNFT
 * @dev 사용자 관람 횟수를 기록하고 뱃지 등급을 관리하는 ERC721 기반 SBT(Soulbound Token)
 */
contract FanNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    address public ticketNFT;
    string public baseURI;

    // 지갑 주소별 누적 관람 횟수
    mapping(address => uint256) public attendanceCount;
    // 지갑 주소별 발행된 FanNFT 토큰 ID
    mapping(address => uint256) public userTokenId;

    enum Tier { NONE, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND }

    event AttendanceRecorded(address indexed fan, uint256 indexed tokenId, uint256 attendanceCount);
    event TierUpgraded(address indexed fan, string newTier);

    modifier onlyTicketNFT() {
        require(msg.sender == ticketNFT, "FanNFT: Only TicketNFT can call this");
        _;
    }

    constructor(string memory _initialBaseURI) ERC721("FanBadgeNFT", "FBN") Ownable(msg.sender) {
        baseURI = _initialBaseURI;
    }

    /**
     * @dev TicketNFT 컨트랙트 주소 설정
     * @param _ticketNFT TicketNFT 주소
     */
    function setTicketNFT(address _ticketNFT) external onlyOwner {
        ticketNFT = _ticketNFT;
    }

    /**
     * @dev baseURI 설정
     * @param _newBaseURI 새로운 baseURI
     */
    function setBaseURI(string memory _newBaseURI) external onlyOwner {
        baseURI = _newBaseURI;
    }

    /**
     * @dev SBT 전송 제한을 위해 전송(transfer)을 차단
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address previousOwner = super._update(to, tokenId, auth);
        if (previousOwner != address(0) && to != address(0)) {
            revert("FanNFT: SBT transfer is not allowed");
        }
        return previousOwner;
    }

    /**
     * @dev 관람 횟수를 누적하고 등급 상승 시 이벤트 방출
     * @param fan 관람을 기록할 사용자의 지갑 주소
     */
    function recordAttendance(address fan) external onlyTicketNFT {
        require(fan != address(0), "FanNFT: Invalid fan address");

        uint256 prevCount = attendanceCount[fan];
        attendanceCount[fan] = prevCount + 1;
        uint256 newCount = attendanceCount[fan];

        if (balanceOf(fan) == 0) {
            uint256 tokenId = _nextTokenId++;
            _safeMint(fan, tokenId);
            userTokenId[fan] = tokenId;
        }

        uint256 tid = userTokenId[fan];
        emit AttendanceRecorded(fan, tid, newCount);

        Tier prevTier = _calcTier(prevCount);
        Tier newTier = _calcTier(newCount);
        if (prevTier != newTier) {
            emit TierUpgraded(fan, _tierToString(newTier));
        }
    }

    /**
     * @dev tokenURI 조회
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address owner = ownerOf(tokenId);
        return string(abi.encodePacked(baseURI, Strings.toHexString(owner)));
    }

    function _calcTier(uint256 count) internal pure returns (Tier) {
        if (count >= 25) return Tier.DIAMOND;
        if (count >= 15) return Tier.PLATINUM;
        if (count >= 7) return Tier.GOLD;
        if (count >= 3) return Tier.SILVER;
        if (count >= 1) return Tier.BRONZE;
        return Tier.NONE;
    }

    function _tierToString(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.DIAMOND) return "DIAMOND";
        if (tier == Tier.PLATINUM) return "PLATINUM";
        if (tier == Tier.GOLD) return "GOLD";
        if (tier == Tier.SILVER) return "SILVER";
        if (tier == Tier.BRONZE) return "BRONZE";
        return "NONE";
    }
}
