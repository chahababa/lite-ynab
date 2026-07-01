import { timingSafeEqual } from "node:crypto";

const MONTH_ID_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthId(value: unknown): value is string {
  return typeof value === "string" && MONTH_ID_PATTERN.test(value);
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  return timingSafeStringEqual(token, secret);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    // Still run a compare against a known-length buffer to keep timing closer to constant.
    timingSafeEqual(aBuffer, Buffer.alloc(aBuffer.length));
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}
