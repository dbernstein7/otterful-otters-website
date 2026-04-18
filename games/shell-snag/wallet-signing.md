# Wallet signing (Otter Shell Rush)

When you connect a wallet and use rewards, your wallet may ask you to **sign a message**. This page explains what that means in plain language.

## In one sentence

Signing proves the connected wallet is yours for this reward check—it does **not** send crypto or approve spending.

## What signing is

- Your wallet shows **human-readable text** and asks you to confirm.
- You produce a **cryptographic signature**: proof that someone who controls that address agreed to **that exact text**.
- The game server checks the signature so rewards can be tied to **your** address safely.

## What signing is not

- **Not** a blockchain transaction (no gas, no transfer).
- **Not** token approvals or “unlimited access” to your assets.
- **Not** a permanent permission grant like logging into a social account—each prompt is for the message shown.

## Why the game asks

Shell Rush uses signatures so the backend can verify shell/reward claims without trusting the browser alone. Without a signature, someone could spoof another player’s address.

## What you are asked to sign

The app only uses standard **message signing** (`personal_sign`, [EIP-191](https://eips.ethereum.org/EIPS/eip-191)). The text always includes the Otter Shell Rush label and your wallet address. Typical forms:

**After a run (shells attestation)** — lines like:

```text
Otter Shell Rush — shells collected attestation
v1
wallet:<your address>
shells:<number>
runId:<id>
issuedAt:<unix time>
```

**Rewards status check** — lines like:

```text
Otter Shell Rush — rewards status check
v1
wallet:<your address>
issuedAt:<unix time>
```

Exact wording may evolve, but it will stay readable and tied to this game.

## Further reading (external)

- [MetaMask — Sign data](https://docs.metamask.io/wallet/how-to/sign-data) — how message signing works in wallets.
- [EIP-191 — Signed data standard](https://eips.ethereum.org/EIPS/eip-191) — technical specification.

If anything in the prompt does not match a Shell Rush attestation like above, **do not sign** and contact the team.
