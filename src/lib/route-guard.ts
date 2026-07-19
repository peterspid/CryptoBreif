import "server-only";

import { NextResponse } from "next/server";
import { env } from "./env";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS_BEFORE_PRUNE = 1000;

class RouteGuardError extends Error {
  status = 403;

  constructor(message: string) {
    super(message);
    this.name = "RouteGuardError";
  }
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwarded || realIp || cfIp || "unknown";
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.key}:${clientKey(request)}`;

  if (buckets.size > MAX_BUCKETS_BEFORE_PRUNE) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }

  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return undefined;
  }

  current.count += 1;

  if (current.count <= options.limit) {
    return undefined;
  }

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return NextResponse.json(
    {
      ok: false,
      error: `Too many requests. Try again in ${retryAfter}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    },
  );
}

export function hasServerSecret(request: Request) {
  const expected = env.appApiSecret || env.cronSecret;

  if (!expected) {
    return false;
  }

  return (
    request.headers.get("authorization") === `Bearer ${expected}` ||
    request.headers.get("x-app-secret") === expected ||
    request.headers.get("x-cron-secret") === expected
  );
}

export function assertAllowedDeliveryTarget(
  request: Request,
  target: string | undefined,
  defaultTarget: string | undefined,
  label: string,
) {
  const normalized = target?.trim() || undefined;

  if (!normalized || normalized === defaultTarget) {
    return normalized;
  }

  if (env.allowCustomDeliveryRecipients || hasServerSecret(request)) {
    return normalized;
  }

  throw new RouteGuardError(
    `${label} must match the configured default recipient unless ALLOW_CUSTOM_DELIVERY_RECIPIENTS is enabled.`,
  );
}
