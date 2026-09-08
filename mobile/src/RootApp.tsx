import { formatSyncError, syncErrorFromStatus, type SyncStatusError } from "@f1nancer/domain";
import { useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./sync/AuthProvider";
import { AuthScreen } from "./screens/AuthScreen";
import { colors } from "./screens/theme";

function Gate() {
  const { session, loading, configured } = useAuth();
  const [MainScreen, setMainScreen] = useState<ComponentType | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<SyncStatusError | null>(null);

  const userId = session?.user.id ?? null;

  // Connect once per signed-in user. Token refresh must not remount MainScreen.
  useEffect(() => {
    if (!userId) {
      setMainScreen(null);
      setDbReady(true);
      setDbError(null);
      setSyncError(null);
      return;
    }
    if (!configured) {
      setDbReady(true);
      return;
    }

    let cancelled = false;
    let unregister: (() => void) | undefined;
    setDbReady(false);
    setSyncError(null);
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const [{ getPowerSync }, { SupabaseConnector }, main] = await Promise.all([
            import("./sync/database"),
            import("./sync/powersyncConnector"),
            import("./screens/MainScreen"),
          ]);
          const db = getPowerSync();
          await db.waitForReady();
          unregister = db.registerListener({
            statusChanged: (status) => {
              const next = syncErrorFromStatus(status);
              if (next) setSyncError(next);
              else if (status.connected) setSyncError(null);
            },
          });
          await db.connect(new SupabaseConnector());
          if (!cancelled) {
            setMainScreen(() => main.MainScreen);
            setDbReady(true);
          }
        } catch (err) {
          if (!cancelled) {
            setDbError(formatSyncError(err));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      unregister?.();
      task.cancel();
    };
  }, [configured, userId]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Local database unavailable</Text>
        <Text style={styles.body}>{dbError}</Text>
      </View>
    );
  }
  if (loading || (session && (!dbReady || !MainScreen))) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (session && MainScreen) {
    return (
      <View style={styles.fill}>
        {syncError ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Text style={styles.bannerTitle}>
              {syncError.kind === "upload"
                ? "Cloud sync upload failed"
                : "Cloud sync is not connected"}
            </Text>
            <Text style={styles.bannerBody}>
              {syncError.message}{" "}
              {syncError.kind === "upload"
                ? "Your data on this device is still here; changes are not reaching the cloud yet."
                : "Your data on this device is still here; it just is not downloading from the cloud yet."}
            </Text>
          </View>
        ) : null}
        <MainScreen />
      </View>
    );
  }
  return <AuthScreen />;
}

export default function RootApp() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Gate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink, textAlign: "center" },
  body: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  banner: {
    backgroundColor: "#3b1515",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#7f1d1d",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  bannerTitle: { color: "#fecaca", fontWeight: "700", fontSize: 14 },
  bannerBody: { color: "#fca5a5", fontSize: 13, lineHeight: 18 },
});
