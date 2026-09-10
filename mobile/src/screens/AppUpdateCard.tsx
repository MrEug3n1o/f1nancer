import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  checkForUpdate,
  downloadAndInstall,
  getCurrentVersion,
  type UpdateCheckResult,
  type UpdateCheckStatus,
} from "../updates/apkUpdates";
import { colors, type Palette } from "./theme";

function statusLabel(status: UpdateCheckStatus, progress: number): string {
  switch (status) {
    case "up_to_date":
      return "Up to date";
    case "available":
      return "Update available";
    case "checking":
      return "Checking…";
    case "downloading":
      return `Downloading ${progress}%`;
    case "installing":
      return "Opening installer…";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

export function AppUpdateCard({ active, palette = colors }: { active: boolean; palette?: Palette }) {
  const styles = makeStyles(palette);
  const [info, setInfo] = useState<UpdateCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<UpdateCheckStatus>("idle");

  const runCheck = useCallback(async (quiet = false) => {
    if (Platform.OS !== "android") return;
    if (!quiet) setBusy(true);
    setPhase("checking");
    try {
      const result = await checkForUpdate();
      setInfo(result);
      setPhase(result.status);
    } catch (err) {
      setInfo({
        status: "failed",
        currentVersion: getCurrentVersion(),
        latestVersion: null,
        apkUrl: null,
        apkName: null,
        source: null,
        message: "Could not check for updates.",
        error: err instanceof Error ? err.message : String(err),
      });
      setPhase("failed");
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!active || Platform.OS !== "android") return;
    void runCheck(true);
  }, [active, runCheck]);

  async function startUpdate() {
    if (!info?.apkUrl) return;
    setBusy(true);
    setProgress(0);
    setPhase("downloading");
    try {
      await downloadAndInstall(info.apkUrl, (percent) => {
        setProgress(percent);
        if (percent >= 100) setPhase("installing");
      });
      setPhase("installing");
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              status: "installing",
              message:
                "Android installer opened. Confirm the install, then reopen F1nancer.",
              error: null,
            }
          : prev,
      );
    } catch (err) {
      setPhase("failed");
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              status: "failed",
              message: "Could not download or install the update.",
              error: err instanceof Error ? err.message : String(err),
            }
          : {
              status: "failed",
              currentVersion: getCurrentVersion(),
              latestVersion: null,
              apkUrl: null,
              apkName: null,
              source: null,
              message: "Could not download or install the update.",
              error: err instanceof Error ? err.message : String(err),
            },
      );
    } finally {
      setBusy(false);
    }
  }

  if (Platform.OS !== "android") {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>App updates</Text>
        <Text style={styles.muted}>
          In-app APK updates are only available on Android.
        </Text>
      </View>
    );
  }

  const current = info?.currentVersion ?? getCurrentVersion();
  const latest = info?.latestVersion;
  const canInstall = info?.status === "available" && Boolean(info.apkUrl) && !busy;
  const checking = phase === "checking" || phase === "downloading" || phase === "installing";

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>App updates</Text>
        <Text style={styles.badge}>{statusLabel(phase, progress)}</Text>
      </View>
      <Text style={styles.muted}>
        Checks GitHub Releases for a newer APK. Android will ask you to confirm
        the install. Your local data stays on this phone.
      </Text>
      <View style={styles.versions}>
        <View>
          <Text style={styles.label}>Current</Text>
          <Text style={styles.version}>{current}</Text>
        </View>
        <View>
          <Text style={styles.label}>Latest</Text>
          <Text style={styles.version}>{latest || "—"}</Text>
        </View>
      </View>
      {info?.message ? (
        <Text style={phase === "failed" ? styles.danger : styles.ink}>
          {info.message}
          {info.error ? ` ${info.error}` : ""}
        </Text>
      ) : null}
      {phase === "downloading" ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(progress, 4)}%` }]} />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={[styles.ghost, (busy || checking) && styles.disabled]}
          disabled={busy || checking}
          onPress={() => void runCheck(false)}
        >
          <Text style={styles.ghostText}>Check</Text>
        </Pressable>
        <Pressable
          style={[styles.button, !canInstall && styles.disabled]}
          disabled={!canInstall}
          onPress={() => void startUpdate()}
        >
          <Text style={styles.buttonText}>
            {phase === "downloading"
              ? `Downloading ${progress}%`
              : phase === "installing"
                ? "Installing…"
                : "Download & install"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) { return StyleSheet.create({
  card: {
    backgroundColor: colors.elevated,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  badge: { color: colors.accent, fontWeight: "600", fontSize: 13 },
  muted: { color: colors.muted, lineHeight: 20 },
  ink: { color: colors.ink, lineHeight: 20 },
  danger: { color: colors.danger, lineHeight: 20 },
  versions: { flexDirection: "row", gap: 24 },
  label: { color: colors.muted, marginBottom: 2, fontSize: 12 },
  version: { color: colors.ink, fontWeight: "700", fontSize: 18 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  actions: { flexDirection: "row", gap: 8 },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  ghostText: { color: colors.ink, fontWeight: "600" },
  button: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  disabled: { opacity: 0.45 },
}); }
