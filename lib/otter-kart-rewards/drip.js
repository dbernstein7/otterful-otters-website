const DRIP_API_BASE = "https://api.drip.re";

async function dripFetch(path, init, apiKey) {
  return fetch(`${DRIP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
}

async function searchRealmMembers(apiKey, realmId, type, values) {
  const searchParams = new URLSearchParams({ type, values: values.trim() });
  const searchRes = await dripFetch(
    `/api/v1/realms/${realmId}/members/search?${searchParams.toString()}`,
    { method: "GET" },
    apiKey,
  );
  if (!searchRes.ok) {
    const text = await searchRes.text();
    return { ok: false, status: searchRes.status, text };
  }
  const searchJson = await searchRes.json();
  return { ok: true, data: searchJson?.data ?? [] };
}

async function findRealmMemberForAward(apiKey, realmId, wallet, dripUserId) {
  const w = String(wallet || "").trim();
  const attempts = [];
  if (w) {
    attempts.push({ type: "wallet", label: "wallet", values: w });
    const lower = w.toLowerCase();
    if (lower !== w) attempts.push({ type: "wallet", label: "wallet (lowercase)", values: lower });
  }
  const id = typeof dripUserId === "string" ? dripUserId.trim() : "";
  if (id) attempts.push({ type: "drip-id", label: "drip-id", values: id });

  if (!attempts.length) {
    return { ok: false, code: "no_member", message: "Provide a wallet and/or dripUserId to find a realm member." };
  }

  for (const a of attempts) {
    const res = await searchRealmMembers(apiKey, realmId, a.type, a.values);
    if (!res.ok) {
      return {
        ok: false,
        code: "drip_error",
        message: `Member search (${a.label}) failed: ${res.status} ${res.text}`,
        status: res.status,
      };
    }
    const member = res.data[0];
    if (member?.id) return { ok: true, member };
  }

  return { ok: false, code: "no_member", message: "No DRIP realm member matched wallet or drip user id." };
}

async function checkDripRealmMember(input) {
  const { apiKey, realmId, currencyId, wallet, dripUserId } = input;
  const found = await findRealmMemberForAward(apiKey, realmId, wallet, dripUserId);
  if (!found.ok) {
    if (found.code === "no_member") return { ok: true, found: false };
    return { ok: false, code: "drip_error", message: found.message, status: found.status };
  }
  const row = found.member.balances?.find((b) => b.currencyId === currencyId);
  return {
    ok: true,
    found: true,
    dripId: found.member.id,
    balance: row !== undefined ? row.balance : null,
  };
}

async function awardDripPointsServer(input) {
  const { apiKey, realmId, currencyId, wallet, dripUserId, points, patchMode, initiatorId } = input;
  const found = await findRealmMemberForAward(apiKey, realmId, wallet, dripUserId);
  if (!found.ok) return found;
  const member = found.member;

  const current = member.balances?.find((b) => b.currencyId === currencyId)?.balance ?? 0;
  const amount = patchMode === "absolute" ? current + points : points;

  const patchBodyWithCurrency = { amount, currencyId };
  if (initiatorId && /^[0-9a-fA-F]{24}$/.test(initiatorId)) {
    patchBodyWithCurrency.initiatorId = initiatorId;
  }

  const patchBodyNoCurrency = { amount };
  if (initiatorId && /^[0-9a-fA-F]{24}$/.test(initiatorId)) {
    patchBodyNoCurrency.initiatorId = initiatorId;
  }

  const candidateIds = [member.realmMemberId, member.id]
    .filter((v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v))
    .filter((v, i, a) => a.indexOf(v) === i);

  let patchJson = null;
  let lastErr = null;

  async function tryPatch(targetId, body) {
    return dripFetch(
      `/api/v1/realms/${realmId}/members/${targetId}/balance`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      apiKey,
    );
  }

  for (const targetId of candidateIds) {
    const res1 = await tryPatch(targetId, patchBodyWithCurrency);
    if (res1.ok) {
      patchJson = await res1.json();
      break;
    }
    const text1 = await res1.text();
    lastErr = { status: res1.status, text: text1 };

    if (res1.status === 400 && text1.includes("Failed to update token balance")) {
      const res2 = await tryPatch(targetId, patchBodyNoCurrency);
      if (res2.ok) {
        patchJson = await res2.json();
        break;
      }
      const text2 = await res2.text();
      lastErr = { status: res2.status, text: text2 };
      if (res2.status !== 400) break;
      continue;
    }
    if (res1.status !== 400) break;
  }

  if (!patchJson) {
    return {
      ok: false,
      code: "drip_error",
      message: `Balance update failed: ${lastErr?.status ?? 0} ${lastErr?.text ?? ""}`.trim(),
      status: lastErr?.status,
    };
  }

  return {
    ok: true,
    dripId: member.id,
    balance: typeof patchJson.balance === "number" ? patchJson.balance : current + points,
  };
}

module.exports = { checkDripRealmMember, awardDripPointsServer };
