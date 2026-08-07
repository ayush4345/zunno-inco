# contracts — Zunno × Inco

Foundry project for the confidential UNO contract (`src/ZunnoInco.sol`).

> ⚠️ WIP skeleton — not yet compiled. Validate Inco Lightning imports/usage against https://docs.inco.org (Inco for Games / ConfidentialDeck).

## Setup
```bash
forge install
# install the Inco Lightning solidity lib (submodule or npm per docs), then
# adjust remappings in foundry.toml / remappings.txt
cp .env.example .env   # fill BASE_SEPOLIA_RPC, PRIVATE_KEY
forge build
```

## Deploy (Base Sepolia)
```bash
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia --broadcast --private-key $PRIVATE_KEY
```

## Key Inco APIs used
- `euint8`, `ebool` — encrypted types (`@inco/lightning/src/Lib.sol`)
- `e.randEuint8()` — encrypted randomness (fair deal)
- `e.allow(handle, addr)` / `e.allowThis(handle)` — access control
- `inco.getFee()` — fee for FHE ops (attach as msg.value where required)
- `inco.incoVerifier().isValidDecryptionAttestation(dec, sigs)` — verify covalidator reveal
