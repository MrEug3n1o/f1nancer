import { Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";

export const GITHUB_REPO = "MrEug3n1o/f1nancer";

const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const APK_NAME = /^F1nancer-.+\.apk$/i;

export type UpdateCheckStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "installing"
  | "failed";

export type UpdateCheckResult = {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  apkUrl: string | null;
  apkName: string | null;
  message: string;
  error: string | null;
  source: string | null;
};

type GithubAsset = {
  name?: string;
  browser_download_url?: string;
  size?: number;
};

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  assets?: GithubAsset[];
};

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

function parseVersion(version: string): [number, number, number] | null {
  const parts = normalizeTag(version).split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  return [parts[0], parts[1], parts[2]];
}

/** Returns true when `latest` is strictly newer than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return latest !== current;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

export function getCurrentVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    "0.0.0"
  );
}

function baseResult(
  partial: Partial<UpdateCheckResult> & Pick<UpdateCheckResult, "status" | "message">,
): UpdateCheckResult {
  return {
    currentVersion: getCurrentVersion(),
    latestVersion: null,
    apkUrl: null,
    apkName: null,
    error: null,
    source: null,
    ...partial,
  };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (Platform.OS !== "android") {
    return baseResult({
      status: "failed",
      message: "In-app APK updates are only available on Android.",
      error: "Unsupported platform",
    });
  }

  const currentVersion = getCurrentVersion();
  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `F1nancer-mobile/${currentVersion}`,
      },
    });
    if (res.status === 404) {
      return baseResult({
        status: "failed",
        currentVersion,
        message: "No GitHub releases found.",
        error: "HTTP 404",
      });
    }
    if (res.status === 403) {
      return baseResult({
        status: "failed",
        currentVersion,
        message: "GitHub rate-limited this device. Try again later.",
        error: "HTTP 403",
      });
    }
    if (!res.ok) {
      return baseResult({
        status: "failed",
        currentVersion,
        message: `GitHub request failed (${res.status}).`,
        error: `HTTP ${res.status}`,
      });
    }

    const release = (await res.json()) as GithubRelease;
    const tag = String(release.tag_name || "").trim();
    if (!tag) {
      return baseResult({
        status: "failed",
        currentVersion,
        message: "GitHub release is missing a version tag.",
        error: "Missing tag_name",
      });
    }

    const latestVersion = normalizeTag(tag);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const apk = assets.find((asset) => APK_NAME.test(String(asset.name || "")));
    const apkUrl = apk?.browser_download_url ?? null;
    const apkName = apk?.name ?? null;
    const source = release.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`;

    if (!apkUrl) {
      const listed =
        assets.map((a) => a.name).filter(Boolean).join(", ") || "none";
      return baseResult({
        status: "failed",
        currentVersion,
        latestVersion,
        source,
        message: `This GitHub release has no Android APK. Assets: ${listed}`,
        error: "Missing APK asset",
      });
    }

    if (isNewerVersion(latestVersion, currentVersion)) {
      return baseResult({
        status: "available",
        currentVersion,
        latestVersion,
        apkUrl,
        apkName,
        source,
        message: `Version ${latestVersion} is available.`,
      });
    }

    return baseResult({
      status: "up_to_date",
      currentVersion,
      latestVersion,
      apkUrl,
      apkName,
      source,
      message: "You're up to date.",
    });
  } catch (err) {
    return baseResult({
      status: "failed",
      currentVersion,
      message: "Could not check for updates.",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function downloadAndInstall(
  apkUrl: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("APK install is only supported on Android");
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error("App cache directory is unavailable");
  }

  const fileUri = `${cacheDir}F1nancer-update.apk`;
  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }

  const download = FileSystem.createDownloadResumable(
    apkUrl,
    fileUri,
    {},
    (progress) => {
      const total = progress.totalBytesExpectedToWrite || 0;
      if (total <= 0) {
        onProgress?.(0);
        return;
      }
      const percent = Math.min(
        100,
        Math.round((progress.totalBytesWritten / total) * 100),
      );
      onProgress?.(percent);
    },
  );

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error("APK download failed");
  }

  onProgress?.(100);
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
