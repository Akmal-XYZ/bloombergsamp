const { getDatabase } = require("./_firebase");
const { rateLimit } = require("./_rateLimit");

const RANGE_SECONDS = {
  "10m": 10 * 60,
  "1h": 60 * 60,
  "6h": 6 * 60 * 60,
  "12h": 12 * 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
};

const CSV_HEADER =
  "timestamp,ip,port,hostname,gamemode,mapname,onlinePlayers,maxplayers,worldtime,weather,online\n";

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsvRow(record) {
  const row = [
    record.timestamp,
    record.ip,
    record.port,
    record.hostname || "",
    record.gamemode || "",
    record.mapname || "",
    record.onlinePlayers,
    record.maxplayers,
    record.worldtime || "",
    record.weather ?? "",
    record.online ?? 1,
  ];
  return `${row.map(escapeCsv).join(",")}\n`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const limit = rateLimit(req, { windowMs: 60_000, maxRequests: 120 });
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).send("Too Many Requests");
    return;
  }

  const range = String(req.query.range || "24h");
  const seconds = RANGE_SECONDS[range];
  if (!seconds) {
    res.status(400).send("Invalid range");
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoffSeconds = nowSeconds - seconds;

  try {
    const db = getDatabase();
    const snapshotsRef = db
      .ref("snapshots")
      .orderByKey()
      .startAt(String(cutoffSeconds))
      .endAt(String(nowSeconds));

    const snapshot = await snapshotsRef.once("value");
    const snapshots = snapshot.val() || {};

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");

    let body = CSV_HEADER;
    const snapshotKeys = Object.keys(snapshots).sort();
    for (const timestampKey of snapshotKeys) {
      const servers = snapshots[timestampKey] || {};
      for (const serverKey of Object.keys(servers)) {
        const record = servers[serverKey];
        if (!record) continue;
        body += toCsvRow(record);
      }
    }

    res.status(200).send(body);
  } catch (error) {
    res.status(500).send("Failed to read data");
  }
};

