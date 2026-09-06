const fs = require("fs");
const path = require("path");

function readAppVersion() {
  const versionPy = fs.readFileSync(
    path.join(__dirname, "../backend/app/version.py"),
    "utf8",
  );
  const match = versionPy.match(/APP_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not read APP_VERSION from backend/app/version.py");
  }
  return match[1];
}

function versionCodeFromSemver(version) {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`APP_VERSION must be X.Y.Z digits, got: ${version}`);
  }
  const [major, minor, patch] = parts;
  return major * 1_000_000 + minor * 1_000 + patch;
}

const version = readAppVersion();

/** @type {import('expo/config').ExpoConfig} */
const expoConfig = {
  name: "F1nancer",
  slug: "f1nancer",
  owner: "potuzhnist",
  version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0f1419",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.f1nancer.mobile",
    buildNumber: version,
  },
  android: {
    package: "app.f1nancer.mobile",
    versionCode: versionCodeFromSemver(version),
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f1419",
    },
  },
  plugins: [],
};

// Paste the UUID from `eas init` here, or set EAS_PROJECT_ID in CI secrets.
const COMMITTED_EAS_PROJECT_ID = "bd86d831-ef3d-495d-ac7e-02ef99e11a1b";
const projectId = process.env.EAS_PROJECT_ID || COMMITTED_EAS_PROJECT_ID;
if (projectId) {
  expoConfig.extra = { eas: { projectId } };
}

module.exports = { expo: expoConfig };
