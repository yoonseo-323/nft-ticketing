// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev IdentityRegistry 컨트랙트 인터페이스 정의
 */
interface IIdentityRegistry {
    /**
     * @dev 특정 사용자의 KYC 인증 여부를 조회
     * @param wallet 조회할 사용자의 주소
     * @return bool 인증 여부
     */
    function isVerified(address wallet) external view returns (bool);
}

interface IFanNFT {
    // artist 파라미터 추가
    function recordAttendance(address fan, address artist) external;
}

/**
 * @title TicketNFT
 * @dev 공연 티켓을 NFT로 발행, 소유 및 소각하는 기능을 제공하는 ERC721 컨트랙트
 */
contract TicketNFT is ERC721, Ownable {
    // KYC 인증 여부를 검증할 IdentityRegistry 컨트랙트 인스턴스
    IIdentityRegistry public identityRegistry;
    
    // 다음에 발행될 티켓의 Token ID (자동 증가 값)
    uint256 private _nextTokenId;
    
    // 각 Token ID별 좌석 정보를 저장하는 매핑 (예: "A구역-1열-5번")
    mapping(uint256 => string) public ticketSeats;
    
    // 각 Token ID별 원래 정가(Wei 또는 원화 등의 정가 값)를 저장하는 매핑
    mapping(uint256 => uint256) public ticketPrices;

    // 각 Token ID 별 어떤 아티스트 공연인지 아티스트 정보 매핑
    mapping(uint256 => address) public ticketArtist;

    // FanNFT 컨트랙트 주소
    address public fanNFT;

    // 티켓 신규 발행 시 방출되는 커스텀 이벤트 (백엔드 인덱싱 및 프론트 연동 최적화)
    event TicketMinted(uint256 indexed tokenId, address indexed to, string seatInfo, uint256 originalPrice);
    
    // 티켓 소각 시 방출되는 이벤트
    event TicketBurned(uint256 indexed tokenId);

    /**
     * @dev 생성자 - ERC721 토큰의 이름과 심볼 설정 및 IdentityRegistry 초기화
     * @param _identityRegistry IdentityRegistry 컨트랙트 주소
     */
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
     * @dev FanNFT 컨트랙트 주소 설정 (Owner 전용)
     * @param _fanNFT FanNFT 주소
     */
    function setFanNFT(address _fanNFT) external onlyOwner {
        fanNFT = _fanNFT;
    }

    /**
     * @dev 토큰 전송 시 수령자(to)가 KYC 인증을 받았는지 일괄 검증하는 내부 전송 훅
     * @notice 민팅 및 양도 시에도 자동으로 호출되며, 소각(burn, 수령자가 address(0)) 시에는 검증을 건너뜁니다.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        // 소각(burn)하는 경우가 아니라면 수령인은 반드시 KYC 인증이 완료된 주소여야 함 (보안 구멍 방지)
        if (to != address(0)) {
            require(identityRegistry.isVerified(to), "TicketNFT: Recipient is not KYC verified");
        }
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev KYC 인증이 완료된 사용자에게 좌석 정보와 정가가 포함된 새로운 티켓 NFT 발행 (Owner 전용)
     * @param to 티켓을 수령할 사용자의 지갑 주소
     * @param seatInfo 부여할 좌석 정보 (예: "A구역-1열-5번")
     * @param originalPrice 티켓의 정가
     * @return uint256 발행된 티켓의 Token ID
     */
    function mint(address to, string calldata seatInfo, uint256 originalPrice, address artist) external onlyOwner returns (uint256) {
        // KYC 검증은 _safeMint 내부에서 트리거되는 _update 전송 훅에 의해 자동으로 수행됩니다.
        uint256 tokenId = _nextTokenId++;
        ticketSeats[tokenId] = seatInfo;
        ticketPrices[tokenId] = originalPrice;
        ticketArtist[tokenId] = artist;
        
        _safeMint(to, tokenId);
        
        // 백엔드 데이터베이스 실시간 동기화를 돕기 위한 상세 이벤트 방출
        emit TicketMinted(tokenId, to, seatInfo, originalPrice);
        return tokenId;
    }

    /**
     * @dev 백엔드가 결제 확인 후 양도 시 직접 소유권을 이전하는 함수 (Owner 전용)
     * @param from 현재 티켓 소유자 주소
     * @param to 수령할 사용자 주소
     * @param tokenId 이전할 티켓의 Token ID
     */
    function adminTransfer(address from, address to, uint256 tokenId) external onlyOwner {
        // KYC 검증은 _transfer 내부에서 트리거되는 _update 전송 훅에 의해 자동으로 수행됩니다.
        _transfer(from, to, tokenId);
    }

    /**
     * @dev 입장 확인(사용 완료) 시 티켓 NFT 소각 및 FanNFT 관람 기록 (Owner 전용)
     * @param tokenId 소각할 티켓의 Token ID
     */
    function burn(uint256 tokenId) external onlyOwner {
        address ticketOwner = ownerOf(tokenId);
        address artist = ticketArtist[tokenId];
        delete ticketSeats[tokenId];
        delete ticketPrices[tokenId];
        delete ticketArtist[tokenId];
        _burn(tokenId);
        emit TicketBurned(tokenId);

        if (fanNFT != address(0)) {
            IFanNFT(fanNFT).recordAttendance(ticketOwner, artist);
        }
    }

    /**
     * @dev 단순 취소 시 티켓 NFT 소각 (FanNFT 관람 기록 없음, Owner 전용)
     * @param tokenId 소각할 티켓의 Token ID
     */
    function burnForCancellation(uint256 tokenId) external onlyOwner {
        delete ticketSeats[tokenId];
        delete ticketPrices[tokenId];
        delete ticketArtist[tokenId];
        _burn(tokenId);
        emit TicketBurned(tokenId);
    }
}
