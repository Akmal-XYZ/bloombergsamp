const https = require("node:https");

const API_URL = "https://sa-mp.co.id/api/server.php";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/123.0.0.0 Safari/537.36";

function toServerKey(ip, port) {
  return `${String(ip).replaceAll(".", "_")}:${Number(port)}`;
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

    records.push({
      timestamp,
      ip: String(ip),
      port: Number(port),
      hostname: String(item.hostname || ""),
      gamemode: String(item.gamemode || ""),
      mapname: String(item.mapname || item.map || ""),
      onlinePlayers: Number(onlinePlayers),
      maxplayers: Number(maxplayers),
      worldtime: String(item.worldtime || item.time || ""),
      weather: item.weather == null ? "" : String(item.weather),
      online: item.online == null ? 1 : Number(item.online),
    });
  }
  return records;
}

async function fetchPayload(timeoutMs = 30_000) {
  return await new Promise((resolve, reject) => {
    const request = https.request(
      API_URL,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeout: timeoutMs,
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

async function writeSnapshot(db, timestamp, records) {
  const serversById = {};
  for (const record of records) {
    const id = toServerKey(record.ip, record.port);
    serversById[id] = record;
  }

  await db.ref().update({
    [`snapshots/${timestamp}`]: serversById,
    latest: { timestamp, servers: serversById },
  });
}

async function collectOnce(db, { timeoutMs = 30_000 } = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = await fetchPayload(timeoutMs);
  const records = normalizeRecords(payload, timestamp);
  await writeSnapshot(db, timestamp, records);
  return { timestamp, servers: records.length };
}

module.exports = { collectOnce };

