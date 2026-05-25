// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry
 * @dev 사용자 지갑 주소의 KYC 인증 상태를 관리하는 컨트랙트
 */
contract IdentityRegistry is Ownable {
    // 각 사용자 주소별 KYC 인증 여부를 저장하는 매핑
    mapping(address => bool) private _verified;

    // 이벤트 선언
    event Registered(address indexed wallet);   // 사용자 인증 등록 시 발생
    event Deregistered(address indexed wallet); // 사용자 인증 취소 시 발생

    constructor() Ownable(msg.sender) {}

    /**
     * @dev 사용자 지갑 주소를 KYC 인증 완료 상태로 등록
     * @param wallet 인증할 사용자의 지갑 주소
     */
    function register(address wallet) public onlyOwner {
        require(wallet != address(0), "IdentityRegistry: Invalid address");
        require(!_verified[wallet], "IdentityRegistry: Wallet already registered");
        _verified[wallet] = true;
        emit Registered(wallet);
    }

    /**
     * @dev 여러 사용자 지갑 주소를 한 번에 KYC 인증 완료 상태로 일괄 등록 (가스비 절감)
     * @param wallets 인증할 사용자들의 지갑 주소 배열
     */
    function registerBatch(address[] calldata wallets) external onlyOwner {
        for (uint256 i = 0; i < wallets.length; i++) {
            register(wallets[i]);
        }
    }

    /**
     * @dev 사용자 지갑 주소의 KYC 인증 상태를 취소
     * @param wallet 인증을 취소할 사용자의 지갑 주소
     */
    function deregister(address wallet) public onlyOwner {
        require(wallet != address(0), "IdentityRegistry: Invalid address");
        require(_verified[wallet], "IdentityRegistry: Wallet not registered");
        _verified[wallet] = false;
        emit Deregistered(wallet);
    }

    /**
     * @dev 여러 사용자 지갑 주소의 KYC 인증 상태를 한 번에 일괄 취소 (가스비 절감)
     * @param wallets 인증을 취소할 사용자들의 지갑 주소 배열
     */
    function deregisterBatch(address[] calldata wallets) external onlyOwner {
        for (uint256 i = 0; i < wallets.length; i++) {
            deregister(wallets[i]);
        }
    }

    /**
     * @dev 특정 주소가 KYC 인증된 주소인지 확인
     * @param wallet 조회할 사용자의 지갑 주소
     * @return bool 인증 여부 (true: 인증됨, false: 미인증)
     */
    function isVerified(address wallet) external view returns (bool) {
        return _verified[wallet];
    }
}
