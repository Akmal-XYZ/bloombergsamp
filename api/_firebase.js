const admin = require("firebase-admin");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Missing environment variable: ${name}`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}

function getServiceAccount() {
  const b64 = requiredEnv("FIREBASE_SERVICE_ACCOUNT_B64");
  const jsonText = Buffer.from(b64, "base64").toString("utf8").trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    const error = new Error("Invalid FIREBASE_SERVICE_ACCOUNT_B64 (not valid JSON).");
    error.statusCode = 500;
    throw error;
  }
}

function getDatabase() {
  if (!admin.apps.length) {
    const databaseURL = requiredEnv("FIREBASE_DATABASE_URL");
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });
  }
  return admin.database();
}

module.exports = { getDatabase };

