const { test } = require("node:test");
const assert = require("node:assert/strict");
async function setup(send, ready = () => true) {
  const { createRewardOutbox } = await import("../games/reward-outbox.mjs");
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) };
  const make = () => createRewardOutbox({ storage, key: "wallet-a", send, ready });
  return { box: make(), make, items: () => JSON.parse(storage.getItem("wallet-a") || "[]") };
}
test("lost response survives reload and retries the same reward ID", async () => {
  const calls = [];
  const state = await setup(async item => { calls.push(item.runId); if (calls.length === 1) throw Error("lost response"); return {ok:true, syncStatus:"synced"}; });
  state.box.enqueue({runId:"race-1",amount:13});
  await state.box.flush();
  assert.equal(state.items().length,1);
  await state.make().flush();
  assert.deepEqual(calls,["race-1","race-1"]);
  assert.equal(state.items().length,0);
});
test("local credit with failed Urnz stays pending; repeated observation is throttled", async () => {
  let calls=0;
  const state=await setup(async () => {calls++;return {ok:true,syncStatus:"failed"};});
  state.box.enqueue({runId:"race-1",amount:13});
  state.box.enqueue({runId:"race-1",amount:13});
  await state.box.flush();await state.box.flush();
  assert.equal(calls,1);assert.equal(state.items().length,1);
});
test("no authenticated session submits no payout", async () => {
  let calls=0;const state=await setup(async()=>{calls++;},()=>false);
  state.box.enqueue({runId:"race-1",amount:13});await state.box.flush();
  assert.equal(calls,0);assert.equal(state.items().length,1);
});
test("race arriving during a request is preserved", async () => {
  let release;const waiting=new Promise(r=>release=r);
  const state=await setup(async()=>{await waiting;return {ok:true,syncStatus:"synced"};});
  state.box.enqueue({runId:"race-1",amount:13});const flushing=state.box.flush();
  state.box.enqueue({runId:"race-2",amount:7});release();await flushing;
  assert.deepEqual(state.items().map(x=>x.runId),["race-2"]);
});

test("full-run total survives offline recovery as one payout", async () => {
  const calls=[];let online=false;
  const state=await setup(async item=>{calls.push({...item});return {ok:true,syncStatus:"synced"};},()=>online);
  state.box.enqueue({runId:"endless-full-run",shells:450,batchId:"run"});
  await state.box.flush();assert.equal(calls.length,0);assert.equal(state.items().length,1);
  online=true;await state.make().flush();
  assert.deepEqual(calls.map(item=>[item.runId,item.shells]),[["endless-full-run",450]]);
  assert.equal(state.items().length,0);
});
