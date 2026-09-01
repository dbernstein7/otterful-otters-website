const { verifyMessage } = require("viem");
const { buildSessionMessage } = require("./attestation.js");

function isHexSig(s) {
  return /^0x[0-9a-fA-F]{130}$/.test(s) || /^0x[0-9a-fA-F]{128}$/.test(s);
}

async function verifySessionSignature(params) {
  const { wallet, nonce, issuedAtSec, signature } = params;
  if (!wallet || !nonce || !isHexSig(signature)) return false;
  if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) return false;

  const msg = buildSessionMessage(wallet, nonce, issuedAtSec);
  try {
    return await verifyMessage({
      address: wallet.trim(),
      message: msg,
      signature,
    });
  } catch {
    return false;
  }
}

module.exports = { verifySessionSignature, isHexSig };
