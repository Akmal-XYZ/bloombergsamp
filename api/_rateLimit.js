const buckets = new Map();

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(req, { windowMs, maxRequests }) {
  const ip = getIp(req);
  const now = Date.now();
  const key = `${ip}`;
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, maxRequests - bucket.count);
  const retryAfterSeconds = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    ok: bucket.count <= maxRequests,
    remaining,
    retryAfterSeconds,
  };
}

module.exports = { rateLimit };

