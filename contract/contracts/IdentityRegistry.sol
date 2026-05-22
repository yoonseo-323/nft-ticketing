// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract IdentityRegistry is Ownable {
    mapping(address => bool) private _verified;

    event Registered(address indexed wallet);
    event Deregistered(address indexed wallet);

    constructor() Ownable(msg.sender) {}

    function register(address wallet) external onlyOwner {
        _verified[wallet] = true;
        emit Registered(wallet);
    }

    function deregister(address wallet) external onlyOwner {
        _verified[wallet] = false;
        emit Deregistered(wallet);
    }

    function isVerified(address wallet) external view returns (bool) {
        return _verified[wallet];
    }
}
