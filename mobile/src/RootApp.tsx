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

  useEffect(() => {
    if (!session) {
      setMainScreen(null);
      setDbReady(true);
      setDbError(null);
      return;
    }
    if (!configured) {
      setDbReady(true);
      return;
    }

    let cancelled = false;
    setDbReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const [{ getPowerSync }, { SupabaseConnector }, main] = await Promise.all([
            import("./sync/database"),
            import("./sync/powersyncConnector"),
            import("./screens/MainScreen"),
          ]);
          const db = getPowerSync();
          await db.connect(new SupabaseConnector());
          if (!cancelled) {
            setMainScreen(() => main.MainScreen);
            setDbReady(true);
          }
        } catch (err) {
          if (!cancelled) {
            setDbError(err instanceof Error ? err.message : String(err));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [configured, session]);

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
    return <MainScreen />;
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
});
