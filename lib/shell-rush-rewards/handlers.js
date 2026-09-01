const { getShellRushConfig } = require("./env.js");
const { gateAwardPost, gateCheckPost } = require("./gate.js");
const { creditShellSnagClams } = require("./clams.js");
const { updateShellRushLeaderboard } = require("./leaderboard.js");
const { buildSyncFields, shouldProxyShellSnagUpstream, syncUrnzForClam } = require("../otterful-rewards/providers.js");

function isShellSnagRewardsRequest(body) {
  return body && body.game !== "otter-kart";
}

function buildClamFields(clam, sync) {
  if (!clam || clam.status === "skipped") return {};
  if (clam.status === "duplicate" || clam.status === "credited") {
    return {
      clamBalance: clam.clamBalance,
      clamTxId: clam.clamTxId,
      clamStatus: clam.status,
      ...buildSyncFields(sync),
    };
  }
  return {};
}

async function proxyUpstream(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: res.status, text, json };
}

function upstreamDripSucceeded(json) {
  return json?.ok === true && typeof json.dripId === "string" && typeof json.balance === "number";
}

async function handleShellSnagCheck(body) {
  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);
  const config = getShellRushConfig(envRecord);

  const gated = await gateCheckPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return { status: gated.status, json: gated.json };
  }

  try {
    const upstream = await proxyUpstream(config.upstreamCheckUrl, body);
    return { status: upstream.status, json: upstream.json, rawText: upstream.text };
  } catch (e) {
    return {
      status: 200,
      json: {
        ok: true,
        skipped: "upstream_unreachable",
        message: e && e.message ? e.message : "Could not reach upstream rewards service.",
      },
    };
  }
}

async function handleShellSnagAward(body) {
  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);
  const config = getShellRushConfig(envRecord);

  const gated = await gateAwardPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return { status: gated.status, json: gated.json };
  }

  const clam = await creditShellSnagClams(gated);
  if (clam.status === "failed") {
    return {
      status: 200,
      json: {
        ok: false,
        code: clam.code || "clam_ledger_failed",
        message: clam.message,
        clamStatus: "failed",
      },
    };
  }

  if (clam.status === "duplicate") {
    const sync = await syncUrnzForClam(clam);
    return {
      status: 200,
      json: {
        ok: true,
        alreadyCredited: true,
        ...buildClamFields(clam, sync),
      },
    };
  }

  const sync = await syncUrnzForClam(clam);

  if (!shouldProxyShellSnagUpstream()) {
    return {
      status: 200,
      json: {
        ok: true,
        skipped: "upstream_disabled",
        alreadyCredited: false,
        ...buildClamFields(clam, sync),
        ...(clam.status === "credited" ? { clamCredited: true } : {}),
      },
    };
  }

  let upstream;
  try {
    upstream = await proxyUpstream(config.upstreamAwardUrl, body);
  } catch (e) {
    return {
      status: 200,
      json: {
        ok: false,
        code: "upstream_unreachable",
        message: e && e.message ? e.message : "Could not reach upstream rewards service.",
        ...buildClamFields(clam, sync),
        ...(clam.status === "credited" ? { clamCredited: true } : {}),
      },
    };
  }

  const merged = { ...upstream.json, ...buildClamFields(clam, sync), alreadyCredited: false };

  if (upstreamDripSucceeded(upstream.json)) {
    await updateShellRushLeaderboard(
      gated.wallet,
      gated.effectiveShells,
      gated.effectiveScore,
    ).catch(() => {});
  }

  if (!upstream.json?.ok && clam.status === "credited") {
    merged.clamCredited = true;
    merged.dripStatus = "failed";
  }

  return { status: upstream.status, json: merged, rawText: upstream.text };
}

module.exports = {
  isShellSnagRewardsRequest,
  handleShellSnagCheck,
  handleShellSnagAward,
  buildClamFields,
  upstreamDripSucceeded,
};
