// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AIMME Hazard Registry
 * Stores high-risk hazard events immutably for auditability.
 */
contract HazardRegistry {
    struct HazardEvent {
        string asset;
        string riskLevel;
        uint256 timestamp;
        uint256 aiConfidenceBps; // optional: 0..10000
        address reporter;
    }

    HazardEvent[] public hazards;

    event HazardLogged(
        uint256 indexed hazardId,
        string asset,
        string riskLevel,
        uint256 timestamp,
        uint256 aiConfidenceBps,
        address indexed reporter
    );

    function logHazard(
        string calldata asset,
        string calldata riskLevel,
        uint256 timestamp,
        uint256 aiConfidenceBps
    ) external returns (uint256 hazardId) {
        require(bytes(asset).length > 0, "asset required");
        require(bytes(riskLevel).length > 0, "riskLevel required");
        require(aiConfidenceBps <= 10000, "confidence out of range");

        hazards.push(
            HazardEvent({
                asset: asset,
                riskLevel: riskLevel,
                timestamp: timestamp,
                aiConfidenceBps: aiConfidenceBps,
                reporter: msg.sender
            })
        );
        hazardId = hazards.length - 1;
        emit HazardLogged(hazardId, asset, riskLevel, timestamp, aiConfidenceBps, msg.sender);
    }

    function hazardsCount() external view returns (uint256) {
        return hazards.length;
    }
}
