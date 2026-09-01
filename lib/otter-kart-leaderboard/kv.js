function getKvRestConfig() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }
  return null;
}

async function kvCommand(command, args) {
  const cfg = getKvRestConfig();
  if (!cfg) throw new Error("KV not configured.");
  const url = `${cfg.url}/${command}/${args.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV ${command} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json && Object.prototype.hasOwnProperty.call(json, "result") ? json.result : null;
}

let redisClientPromise = null;

async function getRedisClient() {
  if (!process.env.KV_REDIS_URL) return null;
  if (!redisClientPromise) {
    const { createClient } = require("redis");
    const client = createClient({ url: process.env.KV_REDIS_URL });
    redisClientPromise = client
      .connect()
      .then(() => client)
      .catch((e) => {
        redisClientPromise = null;
        throw e;
      });
  }
  return redisClientPromise;
}

function isKvConfigured() {
  return !!(getKvRestConfig() || process.env.KV_REDIS_URL);
}

async function zrevrangeWithScores(key, limit) {
  const n = Math.max(1, Math.floor(limit));
  const restCfg = getKvRestConfig();
  if (restCfg) {
    return kvCommand("zrevrange", [key, "0", String(n - 1), "WITHSCORES"]);
  }
  const client = await getRedisClient();
  if (!client) return [];
  return client.sendCommand(["ZREVRANGE", key, "0", String(n - 1), "WITHSCORES"]);
}

async function zscore(key, member) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    return kvCommand("zscore", [key, member]);
  }
  const client = await getRedisClient();
  if (!client) return null;
  return client.sendCommand(["ZSCORE", key, member]);
}

async function zadd(key, score, member) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    await kvCommand("zadd", [key, String(score), member]);
    return;
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  await client.sendCommand(["ZADD", key, String(score), member]);
}

async function hset(hashKey, field, value) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    await kvCommand("hset", [hashKey, field, value]);
    return;
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  await client.sendCommand(["HSET", hashKey, field, value]);
}

async function hget(hashKey, field) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    return kvCommand("hget", [hashKey, field]);
  }
  const client = await getRedisClient();
  if (!client) return null;
  return client.sendCommand(["HGET", hashKey, field]);
}

async function kvGet(key) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    return kvCommand("get", [key]);
  }
  const client = await getRedisClient();
  if (!client) return null;
  return client.get(key);
}

async function kvSet(key, value) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    await kvCommand("set", [key, String(value)]);
    return;
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  await client.set(key, String(value));
}

async function kvSetNx(key, value) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    const result = await kvCommand("set", [key, String(value), "nx"]);
    return result === "OK";
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  const result = await client.set(key, String(value), { NX: true });
  return result === "OK";
}

async function kvIncrBy(key, increment) {
  const delta = Math.trunc(Number(increment) || 0);
  const restCfg = getKvRestConfig();
  if (restCfg) {
    const result = await kvCommand("incrby", [key, String(delta)]);
    return Number(result);
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  return client.incrBy(key, delta);
}

async function kvDel(key) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    await kvCommand("del", [key]);
    return;
  }
  const client = await getRedisClient();
  if (!client) throw new Error("KV not configured.");
  await client.del(key);
}

async function kvKeys(pattern) {
  const restCfg = getKvRestConfig();
  if (restCfg) {
    const result = await kvCommand("keys", [pattern]);
    return Array.isArray(result) ? result : [];
  }
  const client = await getRedisClient();
  if (!client) return [];
  return client.keys(pattern);
}

module.exports = {
  isKvConfigured,
  zrevrangeWithScores,
  zscore,
  zadd,
  hset,
  hget,
  kvGet,
  kvSet,
  kvSetNx,
  kvIncrBy,
  kvDel,
  kvKeys,
};
