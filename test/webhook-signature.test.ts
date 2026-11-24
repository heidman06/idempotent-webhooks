import assert from "node:assert/strict";
import { test } from "node:test";
import { sign, verify } from "../src/webhook-signature.ts";

const SECRET = "whsec_test_123";
const BODY = JSON.stringify({ door: 42, action: "open" });
const NOW = 1_700_000_000_000;

test("accepts a signature it just produced", () => {
  const header = sign(SECRET, BODY, Math.floor(NOW / 1000));
  const result = verify(SECRET, header, BODY, { now: () => NOW });
  assert.deepEqual(result, { ok: true, timestamp: Math.floor(NOW / 1000) });
});

test("rejects a tampered body", () => {
  const header = sign(SECRET, BODY, Math.floor(NOW / 1000));
  const result = verify(SECRET, header, BODY.replace("42", "43"), { now: () => NOW });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "signature_mismatch");
});

test("rejects a replayed header outside the tolerance window", () => {
  const old = Math.floor(NOW / 1000) - 3600;
  const header = sign(SECRET, BODY, old);
  const result = verify(SECRET, header, BODY, { now: () => NOW });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "timestamp_out_of_range");
});

test("rejects a malformed header", () => {
  for (const header of ["", "t=abc,v1=def", "v1=" + "a".repeat(64), undefined]) {
    const result = verify(SECRET, header, BODY, { now: () => NOW });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "malformed");
  }
});
