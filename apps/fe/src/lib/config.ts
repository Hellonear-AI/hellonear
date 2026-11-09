// HelloNear runs on NEAR testnet only (see issue #4).
export const NETWORK_ID = "testnet" as const

/** Testnet RPC, for reading the owner's own balance (docs.near.org lists it for testnet; checked 9 Nov). */
export const NEAR_RPC_URL = "https://rpc.testnet.near.org"
