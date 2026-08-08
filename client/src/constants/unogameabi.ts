export const unoGameABI = [
  {
    type: "function",
    name: "createGame",
    inputs: [
      { name: "creator", type: "address" },
      { name: "isBot", type: "bool" },
    ],
    outputs: [{ name: "gameId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [
      { name: "creator", type: "address" },
      { name: "isBot", type: "bool" },
      { name: "isPrivate", type: "bool" },
      { name: "gameCodeHash", type: "bytes32" },
      { name: "maxPlayers", type: "uint256" },
    ],
    outputs: [{ name: "gameId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deleteGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getGamesByCreator",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPublicNotStartedGames",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "joinGame",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "joinee", type: "address" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "startGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "dealCards",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "count", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "commitOpening",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "value", type: "uint256" },
      { name: "sigs", type: "bytes[]" },
      { name: "chosenColor", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "drawCard",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "playCard",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "handIndex", type: "uint256" },
      { name: "claimedValue", type: "uint256" },
      { name: "sigs", type: "bytes[]" },
      { name: "chosenColor", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getGameState",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "players", type: "address[]" },
      { name: "currentPlayer", type: "address" },
      { name: "turn", type: "uint8" },
      { name: "direction", type: "int8" },
      { name: "pot", type: "uint256" },
      { name: "buyIn", type: "uint256" },
      { name: "phase", type: "uint8" },
      { name: "topValue", type: "uint256" },
      { name: "activeColor", type: "uint8" },
      { name: "winner", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getHandSizes",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "out", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDealProgress",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "dealt", type: "uint16" },
      { name: "total", type: "uint16" },
      { name: "ready", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMyHandHandles",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "out", type: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOpeningHandle",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

// Legacy Noir verifier helpers remain available for the optional computer-game panel.
export const VERIFIER_ADDRESSES = {
  baseSepolia: {
    shuffle: "0x9D2fE939001325fF9fb58C2a22dB60549D4Ba1dA",
    deal: "0x4AeaB7206A19EE01FbAEC8aee3654e4E93B59BE6",
    draw: "0x4d9CA273817BfEf07a9D73E23072DEabeb825060",
    play: "0xB99a5Cb916bd38353C435d52dDfCb9F7b51bfF0a",
  },
} as const;

export enum CircuitType {
  Shuffle,
  Deal,
  Draw,
  Play,
}
