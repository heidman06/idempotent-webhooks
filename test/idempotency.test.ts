import assert from "node:assert/strict";
import { test } from "node:test";
import { IdempotencyService } from "../src/idempotency.ts";

test("runs the operation once and replays the result", async () => {
  const service = new IdempotencyService<{ opened: boolean }>();
  let calls = 0;
  const open = async () => {
    calls += 1;
    return { opened: true };
  };

  const first = await service.execute("door-42/open", open);
  const second = await service.execute("door-42/open", open);

  assert.equal(calls, 1);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.response.body, { opened: true });
});

test("collapses concurrent duplicates into a single execution", async () => {
  const service = new IdempotencyService<number>();
  let calls = 0;
  const slow = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return calls;
  };

  const results = await Promise.all([
    service.execute("same-key", slow),
    service.execute("same-key", slow),
    service.execute("same-key", slow),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(results.map((r) => r.replayed), [false, true, true]);
});

test("does not cache errors", async () => {
  const service = new IdempotencyService<string>();
  let attempts = 0;
  const flaky = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("panel unreachable");
    return "opened";
  };

  await assert.rejects(() => service.execute("key", flaky), /panel unreachable/);
  assert.equal(service.has("key"), false);

  const retry = await service.execute("key", flaky);
  assert.equal(retry.replayed, false);
  assert.equal(retry.response.body, "opened");
});

test("stops replaying once the ttl has elapsed", async () => {
  let clock = 1_000;
  const service = new IdempotencyService<string>({ ttlMs: 50, now: () => clock });
  let calls = 0;
  const run = async () => {
    calls += 1;
    return "ok";
  };

  await service.execute("key", run);
  clock += 10;
  await service.execute("key", run);
  assert.equal(calls, 1);

  clock += 100;
  await service.execute("key", run);
  assert.equal(calls, 2);
});
