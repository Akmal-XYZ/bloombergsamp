const https = require("node:https");
const admin = require("firebase-admin");

const API_URL = "https://sa-mp.co.id/api/server.php";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/123.0.0.0 Safari/537.36";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getServiceAccount() {
  const b64 = requiredEnv("FIREBASE_SERVICE_ACCOUNT_B64");
  const jsonText = Buffer.from(b64, "base64").toString("utf8").trim();
  return JSON.parse(jsonText);
}

function getDatabase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
      databaseURL: requiredEnv("FIREBASE_DATABASE_URL"),
    });
  }
  return admin.database();
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
        timeout: 45_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode || 0;
          const bodyText = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            reject(new Error(`Upstream HTTP ${status}: ${bodyText.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(bodyText));
          } catch (error) {
            reject(new Error(`Upstream JSON parse failed: ${String(error)}`));
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Upstream timeout")));
    request.on("error", (error) => reject(error));
    request.end();
  });
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

function toServerKey(ip, port) {
  return `${String(ip).replaceAll(".", "_")}:${Number(port)}`;
}

async function deleteOldSnapshots(db, cutoffTimestamp) {
  const ref = db.ref("snapshots");
  const oldSnap = await ref.orderByKey().endAt(String(cutoffTimestamp)).limitToFirst(500).once("value");
  const old = oldSnap.val() || {};
  const keys = Object.keys(old);
  if (!keys.length) return 0;

  const updates = {};
  for (const key of keys) {
    updates[`snapshots/${key}`] = null;
  }
  await db.ref().update(updates);
  return keys.length;
}

async function main() {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = await fetchPayload();
  const records = normalizeRecords(payload, timestamp);

  const serversById = {};
  for (const record of records) {
    const id = toServerKey(record.ip, record.port);
    serversById[id] = record;
  }

  const db = getDatabase();
  await db.ref().update({
    [`snapshots/${timestamp}`]: serversById,
    latest: { timestamp, servers: serversById },
  });

  const cutoff = timestamp - 30 * 24 * 60 * 60;
  let deleted = 0;
  for (let i = 0; i < 20; i += 1) {
    const batch = await deleteOldSnapshots(db, cutoff);
    deleted += batch;
    if (batch === 0) break;
  }

  console.log(JSON.stringify({ ok: true, timestamp, servers: records.length, deletedSnapshots: deleted }));
}

main().catch((error) => {
  console.error("Collect job failed", error);
  process.exit(1);
});
