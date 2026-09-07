import { Component, type ComponentType, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "./src/screens/theme";

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

/**
 * Thin shell: no PowerSync / op-sqlite imports here.
 * Native sync stack loads only after the first frame via dynamic import.
 */
export default function App() {
  const [Root, setRoot] = useState<ComponentType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./src/RootApp")
      .then((mod) => {
        if (!cancelled) setRoot(() => mod.default);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.title}>F1nancer failed to start</Text>
        <Text style={styles.body}>{loadError}</Text>
      </View>
    );
  }

  if (!Root) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <StartupErrorBoundary>
      <Root />
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
