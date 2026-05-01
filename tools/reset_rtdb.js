const admin = require("firebase-admin");

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

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--yes")) {
    console.error('Refusing to reset without "--yes".');
    process.exit(2);
  }

  const db = getDatabase();
  await db.ref().update({
    snapshots: null,
    latest: null,
  });

  console.log(JSON.stringify({ ok: true, reset: ["snapshots", "latest"] }));

  try {
    await admin.app().delete();
  } catch {
    // ignore
  }
}

main().catch((error) => {
  console.error("Reset failed", error);
  process.exit(1);
});

