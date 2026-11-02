export function createRewardOutbox({ storage, key, send, ready, notify = () => {} }) {
  let busy = false;
  const attempted = new Map();
  const read = () => JSON.parse(storage.getItem(key) || "[]");
  const save = (items) => storage.setItem(key, JSON.stringify(items));
  return {
    enqueue(item) {
      const items = read();
      if (!items.some((x) => x.runId === item.runId)) save([...items, item]);
    },
    async flush() {
      if (busy || !ready()) return;
      busy = true;
      try {
        for (const item of read()) {
          if (!ready()) break;
          if (Date.now() - (attempted.get(item.runId) || 0) < 30000) continue;
          attempted.set(item.runId, Date.now());
          try {
            const result = await send(item);
            notify(result.text, { ...result, runId: item.runId });
            if (result.ok && result.syncStatus === "synced") {
              save(read().filter((x) => x.runId !== item.runId));
            }
          } catch {
            notify("Reward pending. We’ll retry automatically while the game is open.", { runId: item.runId, syncStatus: "pending" });
          }
        }
      } finally { busy = false; }
    },
  };
}
