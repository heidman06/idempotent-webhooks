# idempotent-webhooks

Two primitives for systems with **physical side effects** — door opening, payment, provisioning:

- **`IdempotencyService`** — a repeated request runs once; concurrent duplicates collapse into a single execution; errors are never cached.
- **`sign` / `verify`** — HMAC-SHA256 signatures over `timestamp.body`, with a replay window and timing-safe comparison.

No dependencies. TypeScript, run directly by Node 22.6+ (type stripping).

## Why

A retried HTTP call is normal. A door that opens twice is an incident.

Idempotency is usually implemented as *"look up the key, then run"*, which is a race: two
requests arriving together both find nothing and both execute. This library keeps an in-flight
map, so the second caller waits for the first result instead of duplicating the side effect.

It also makes the failure model explicit: if the operation throws, nothing is stored, and the
next attempt with the same key actually runs. Callers never receive a cached error as if it
were a result.

## Usage

```ts
import { IdempotencyService } from "./src/idempotency.ts";

const openings = new IdempotencyService<{ opened: boolean }>();

const { replayed, response } = await openings.execute(requestKey, () =>
  pulsePartnerPanel(doorId),
);

// replayed === true  -> the panel was not called again
// replayed === false -> this call performed the work
```

Signed webhooks:

```ts
import { sign, verify } from "./src/webhook-signature.ts";

const header = sign(secret, rawBody, Math.floor(Date.now() / 1000)); // t=...,v1=...
const result = verify(secret, header, rawBody, { toleranceSeconds: 300 });

if (!result.ok) {
  // "malformed" | "timestamp_out_of_range" | "signature_mismatch"
}
```

## Tests

```bash
npm test        # node --test
npm run example # a door pulse, executed once and replayed once
```

8 tests, no dependencies: replay, concurrent collapse, error handling, TTL expiry, signature
validity, tampering, replay window, malformed headers.

## Design notes

- **In-memory store.** Deliberate: the interface is small enough to swap for Redis or a table
  with a unique constraint on the key. The in-memory version is honest about being single-node.
- **`replayed` is not an error.** It is the normal outcome of a retry, and the caller should
  return the same response to the client.
- **Status is fixed at 200** in this version. A stored 5xx would make the failure permanent.

## License

MIT.
