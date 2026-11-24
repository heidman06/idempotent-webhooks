import { IdempotencyService } from "../src/idempotency.ts";

type Opening = { doorId: number; opened: boolean; pulseId: string };

const openings = new IdempotencyService<Opening>();

async function pulsePartnerPanel(doorId: number): Promise<Opening> {
  // In real life: HTTP call to the access-control panel, with a timeout.
  console.log(`pulse -> door ${doorId}`);
  return { doorId, opened: true, pulseId: crypto.randomUUID() };
}

const request = { doorId: 42, idempotencyKey: "req-2026-11-24-001" };

const first = await openings.execute(request.idempotencyKey, () => pulsePartnerPanel(request.doorId));
const retry = await openings.execute(request.idempotencyKey, () => pulsePartnerPanel(request.doorId));

console.log("first:", first.replayed ? "replayed" : "executed");
console.log("retry:", retry.replayed ? "replayed" : "executed");
console.log("same pulse:", first.response.body.pulseId === retry.response.body.pulseId);
