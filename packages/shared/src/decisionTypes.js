/**
 * @typedef {"WAIT" | "SCOUT_SMALL" | "ENTER_UP" | "ENTER_DOWN" | "ADD_SMALL" | "EXIT_OR_DE_RISK"} DecisionAction
 */

/**
 * @typedef {"up" | "down" | "none"} DecisionSide
 */

/**
 * @typedef {string} DecisionReasonCode
 */

/**
 * @typedef {Object} DecisionProbabilityCandidate
 * @property {"base" | "chop" | "momentum" | "leaderAge" | "prePathShape"} source
 * @property {number | null} p
 * @property {number | null} n
 * @property {number | null} shrunk
 * @property {boolean} accepted
 * @property {"sparse" | "missing" | "not_applicable" | null} rejectionReason
 * @property {"usable" | "warning-only" | "ignored" | null | undefined} [supportTier]
 */

/**
 * @typedef {Object} DecisionResult
 * @property {DecisionAction} action
 * @property {DecisionAction | null | undefined} [actionPreMute]
 * @property {DecisionSide} leader
 * @property {DecisionReasonCode[]} reasonCodes
 * @property {string} decisionVersion
 * @property {Object | null | undefined} [flags]
 * @property {Object | null | undefined} [features]
 * @property {string | null | undefined} [distanceBucket]
 * @property {number | null | undefined} [signedDistanceBps]
 * @property {number | null | undefined} [absDistanceBps]
 * @property {number | null | undefined} [btcAgeMs]
 * @property {number | null | undefined} [btcPrice]
 * @property {number | null | undefined} [snapshotAgeMs]
 * @property {string | null | undefined} [sourceQuality]
 * @property {number | null | undefined} [secondsFromWindowStart]
 * @property {number | null | undefined} [checkpointSecond]
 * @property {number | null | undefined} [leaderAsk]
 * @property {number | null | undefined} [leaderBid]
 * @property {number | null | undefined} [leaderSpread]
 * @property {number | null | undefined} [leaderTopAskDepth]
 * @property {number | null | undefined} [edge]
 * @property {number | null | undefined} [requiredEdge]
 * @property {number | null | undefined} [requiredDistanceBps]
 * @property {number | null | undefined} [priceToBeat]
 * @property {string | null | undefined} [priceToBeatSource]
 * @property {number | null | undefined} [pBase]
 * @property {number | null | undefined} [pEst]
 * @property {DecisionProbabilityCandidate[] | undefined} [pCandidates]
 */

/**
 * @typedef {Object} DecisionSignal
 * @property {string} marketSlug
 * @property {number} evaluatedAt
 * @property {number} secondBucket
 * @property {number} checkpointSecond
 * @property {string} decisionVersion
 * @property {DecisionAction} action
 * @property {DecisionAction | null | undefined} [actionPreMute]
 * @property {DecisionReasonCode[]} reasonCodes
 * @property {DecisionSide | null | undefined} [leader]
 * @property {number | null | undefined} [pBase]
 * @property {number | null | undefined} [pEst]
 * @property {DecisionProbabilityCandidate[] | undefined} [pCandidates]
 */

/**
 * @typedef {Object} DecisionRuntimeFlags
 * @property {boolean} decision_engine_enabled
 * @property {"all" | "wait_only"} decision_emit_actions
 */

export {};
