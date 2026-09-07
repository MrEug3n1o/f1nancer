import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/sync/AuthProvider";
import { AuthScreen } from "./src/screens/AuthScreen";
import { MainScreen } from "./src/screens/MainScreen";
import { colors } from "./src/screens/theme";
import { getPowerSync, getPowerSyncInitError } from "./src/sync/database";

class StartupErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App startup error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>F1nancer failed to start</Text>
          <Text style={styles.body}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function Gate() {
  const { session, loading, configured } = useAuth();
  const [dbReady, setDbReady] = useState(!configured);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      setDbReady(true);
      return;
    }
    try {
      getPowerSync();
      setDbReady(true);
    } catch (err) {
      setDbError(
        getPowerSyncInitError()?.message ||
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }, [configured]);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Local database unavailable</Text>
        <Text style={styles.body}>{dbError}</Text>
      </View>
    );
  }
  if (!dbReady || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return session ? <MainScreen /> : <AuthScreen />;
}

export default function App() {
  return (
    <StartupErrorBoundary>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </StartupErrorBoundary>
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
