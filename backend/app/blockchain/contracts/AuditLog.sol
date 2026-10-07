// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Federated Learning Audit Log
/// @notice Append-only immutable log for recording FL round contribution verdicts.
/// @dev Raw model weights and patient data are NEVER stored on-chain. Only SHA-256 digests and verdicts.
contract AuditLog {
    struct Entry {
        uint256 roundNumber;
        uint256 clientId;
        string  updateHash;
        string  status;          // "ACCEPTED" | "FLAGGED" | "EXCLUDED"
        int256  similarityScaled; // Cosine similarity * 10000 (fixed point int)
        uint256 timestamp;
    }

    Entry[] public entries;

    event EntryLogged(
        uint256 indexed roundNumber,
        uint256 indexed clientId,
        string updateHash,
        string status,
        int256 similarityScaled,
        uint256 timestamp
    );

    /// @notice Append an immutable audit entry.
    function addEntry(
        uint256 roundNumber,
        uint256 clientId,
        string calldata updateHash,
        string calldata status,
        int256 similarityScaled
    ) external returns (uint256) {
        entries.push(
            Entry({
                roundNumber: roundNumber,
                clientId: clientId,
                updateHash: updateHash,
                status: status,
                similarityScaled: similarityScaled,
                timestamp: block.timestamp
            })
        );
        uint256 index = entries.length - 1;
        emit EntryLogged(roundNumber, clientId, updateHash, status, similarityScaled, block.timestamp);
        return index;
    }

    /// @notice Returns the total count of entries.
    function entryCount() external view returns (uint256) {
        return entries.length;
    }

    /// @notice Retrieve an entry by index.
    function getEntry(uint256 index)
        external
        view
        returns (
            uint256 roundNumber,
            uint256 clientId,
            string memory updateHash,
            string memory status,
            int256 similarityScaled,
            uint256 timestamp
        )
    {
        require(index < entries.length, "Index out of bounds");
        Entry storage e = entries[index];
        return (
            e.roundNumber,
            e.clientId,
            e.updateHash,
            e.status,
            e.similarityScaled,
            e.timestamp
        );
    }
}
