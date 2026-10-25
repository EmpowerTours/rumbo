// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title  TESTNET STAND-IN for the shared $TOURS (ToursTokenV2 on Monad mainnet). Not the real token.
/// @notice Same external interface and behaviour as ToursTokenV2: fixed MAX_SUPPLY minted to the
///         deployer at construction (so `mint` can never add supply), burn/burnFrom, owner-or-DAO pause
///         that blocks transfers but not burns, `authorizedMinters`, `daoTimelock`. Name/symbol say
///         "stand-in" so it can never be mistaken for the real token. No testnet copy of ToursTokenV2
///         exists (checked 2026-10-18), hence this.
contract ToursTokenStandIn is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 100_000_000_000 ether;
    address public daoTimelock;
    mapping(address => bool) public authorizedMinters;
    bool public paused;

    event TokensMinted(address indexed to, uint256 amount, address indexed minter);
    event DAOTimelockUpdated(address indexed oldTimelock, address indexed newTimelock);
    event AuthorizedMinterUpdated(address indexed minter, bool authorized);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor() ERC20("TOURS stand-in (testnet, not real)", "tTOURS") Ownable(msg.sender) {
        _mint(msg.sender, MAX_SUPPLY);
    }

    modifier onlyOwnerOrDAO() {
        require(msg.sender == owner() || msg.sender == daoTimelock, "Only owner or DAO");
        _;
    }

    function mint(address to, uint256 amount) external {
        require(authorizedMinters[msg.sender] || msg.sender == owner(), "Not authorized to mint");
        require(!paused, "Token is paused");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    function burn(uint256 amount) external { _burn(msg.sender, amount); }

    function burnFrom(address from, uint256 amount) external {
        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
    }

    function setDAOTimelock(address t) external onlyOwner { emit DAOTimelockUpdated(daoTimelock, t); daoTimelock = t; }
    function setAuthorizedMinter(address m, bool a) external onlyOwnerOrDAO { authorizedMinters[m] = a; emit AuthorizedMinterUpdated(m, a); }
    function pause() external onlyOwnerOrDAO { paused = true; emit Paused(msg.sender); }
    function unpause() external onlyOwnerOrDAO { paused = false; emit Unpaused(msg.sender); }

    function _update(address from, address to, uint256 value) internal override {
        if (to != address(0)) require(!paused, "Token transfers paused");
        super._update(from, to, value);
    }
}
