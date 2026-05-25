// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IdentityRegistry
 * @dev 사용자 지갑 주소의 KYC 인증 상태를 관리하는 컨트랙트
 */
contract IdentityRegistry is Ownable {
    // 각 사용자 주소별 KYC 인증 여부를 저장하는 매핑
    mapping(address => bool) private _verifiedUsers;

    // 이벤트 선언
    event UserVerified(address indexed user); // 사용자 인증 등록 시 발생
    event UserRevoked(address indexed user);  // 사용자 인증 취소 시 발생

    constructor() Ownable(msg.sender) {}

    /**
     * @dev 사용자 지갑 주소를 KYC 인증 완료 상태로 등록
     * @param _user 인증할 사용자의 지갑 주소
     */
    function verify(address _user) public onlyOwner {
        require(_user != address(0), "IdentityRegistry: Invalid address");
        require(!_verifiedUsers[_user], "IdentityRegistry: User already verified");
        _verifiedUsers[_user] = true;
        emit UserVerified(_user);
    }

    /**
     * @dev 여러 사용자 지갑 주소를 한 번에 KYC 인증 완료 상태로 일괄 등록 (가스비 절감)
     * @param _users 인증할 사용자들의 지갑 주소 배열
     */
    function verifyBatch(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            verify(_users[i]);
        }
    }

    /**
     * @dev 사용자 지갑 주소의 KYC 인증 상태를 취소
     * @param _user 인증을 취소할 사용자의 지갑 주소
     */
    function revoke(address _user) public onlyOwner {
        require(_user != address(0), "IdentityRegistry: Invalid address");
        require(_verifiedUsers[_user], "IdentityRegistry: User not verified");
        _verifiedUsers[_user] = false;
        emit UserRevoked(_user);
    }

    /**
     * @dev 여러 사용자 지갑 주소의 KYC 인증 상태를 한 번에 일괄 취소 (가스비 절감)
     * @param _users 인증을 취소할 사용자들의 지갑 주소 배열
     */
    function revokeBatch(address[] calldata _users) external onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            revoke(_users[i]);
        }
    }

    /**
     * @dev 특정 주소가 KYC 인증된 주소인지 확인
     * @param _user 조회할 사용자의 지갑 주소
     * @return bool 인증 여부 (true: 인증됨, false: 미인증)
     */
    function isVerified(address _user) external view returns (bool) {
        return _verifiedUsers[_user];
    }
}
