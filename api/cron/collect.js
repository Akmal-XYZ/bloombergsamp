const { getDatabase } = require("../_firebase");
const https = require("node:https");

const API_URL = "https://sa-mp.co.id/api/server.php";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/123.0.0.0 Safari/537.36";

function requireCronSecret(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 500, message: "Missing CRON_SECRET" };
  }
  const provided =
    req.headers["x-cron-secret"] ||
    req.headers["x-cron-token"] ||
    req.query.secret ||
    "";
  if (String(provided) !== String(expected)) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return { ok: true };
}

function normalizeRecords(payload, timestamp) {
  if (!Array.isArray(payload)) return [];

  const records = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const ip = item.ipAddress || item.ip;
    const port = item.port;
    const onlinePlayers = item.onlinePlayers;
    const maxplayers = item.maxplayers;
    if (!ip || port == null || onlinePlayers == null || maxplayers == null) continue;

    const hostname = item.hostname || "";
    const gamemode = item.gamemode || "";
    const mapname = item.mapname || item.map || "";
    const worldtime = item.worldtime || item.time || "";
    const weather = item.weather == null ? "" : String(item.weather);
    const online = item.online == null ? 1 : Number(item.online);

    records.push({
      timestamp,
      ip: String(ip),
      port: Number(port),
      hostname: String(hostname),
      gamemode: String(gamemode),
      mapname: String(mapname),
      onlinePlayers: Number(onlinePlayers),
      maxplayers: Number(maxplayers),
      worldtime: String(worldtime),
      weather,
      online: Number.isFinite(online) ? online : 1,
    });
  }
  return records;
}

function toServerKey(ip, port) {
  return `${String(ip).replaceAll(".", "_")}:${Number(port)}`;
}

async function fetchPayload() {
  return await new Promise((resolve, reject) => {
    const request = https.request(
      API_URL,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeout: 30_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 0;
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            const error = new Error(`Upstream HTTP ${status}`);
            error.upstreamStatus = status;
            error.upstreamBody = bodyText.slice(0, 300);
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(bodyText));
          } catch (parseError) {
            const error = new Error("Upstream JSON parse failed");
            error.cause = parseError;
            error.upstreamBody = bodyText.slice(0, 300);
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Upstream timeout")));
    request.on("error", (error) => reject(error));
    request.end();
  });
}

module.exports = async (req, res) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) {
    res.status(auth.status).send(auth.message);
    return;
  }
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  try {
    const payload = await fetchPayload();
    const records = normalizeRecords(payload, timestamp);

    const serversById = {};
    for (const record of records) {
      const id = toServerKey(record.ip, record.port);
      serversById[id] = record;
    }

    const db = getDatabase();
    const updates = {};
    updates[`snapshots/${timestamp}`] = serversById;
    updates["latest"] = { timestamp, servers: serversById };

    await db.ref().update(updates);

    res.status(200).json({ ok: true, timestamp, servers: records.length });
  } catch (error) {
    console.error("Collect failed", {
      message: error?.message,
      upstreamStatus: error?.upstreamStatus,
      upstreamBody: error?.upstreamBody,
      stack: error?.stack,
    });
    res.status(500).json({ ok: false, error: "Collect failed" });
  }
};
