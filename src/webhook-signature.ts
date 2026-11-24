import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const HEADER = /^t=(\d+),v1=([0-9a-f]{64})$/;

export type VerifyOptions = {
  /** how far the signed timestamp may drift from now, in seconds */
  toleranceSeconds?: number;
  now?: () => number;
};

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "malformed" | "timestamp_out_of_range" | "signature_mismatch" };

/** Base string: the timestamp and the raw body, so a replay cannot be re-signed. */
const baseString = (timestamp: number, body: string): string => `${timestamp}.${body}`;

export function sign(secret: string, body: string, timestampSeconds: number): string {
  const mac = createHmac("sha256", secret).update(baseString(timestampSeconds, body)).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

export function verify(
  secret: string,
  header: string | undefined,
  body: string,
  options: VerifyOptions = {},
): VerifyResult {
  if (header === undefined) return { ok: false, reason: "malformed" };

  const match = HEADER.exec(header);
  if (match === null) return { ok: false, reason: "malformed" };

  const timestamp = Number(match[1]);
  const given = Buffer.from(match[2], "hex");

  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const expected = createHmac("sha256", secret).update(baseString(timestamp, body)).digest();
  if (!HEX_SHA256.test(match[2]) || given.length !== expected.length) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return timingSafeEqual(given, expected)
    ? { ok: true, timestamp }
    : { ok: false, reason: "signature_mismatch" };
}
