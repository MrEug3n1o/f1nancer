import { useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, SafeAreaView, Platform, StatusBar as NativeStatusBar } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./sync/AuthProvider";
import { AuthScreen } from "./screens/AuthScreen";
import { colors } from "./screens/theme";

function Gate() {
  const { session, loading, dbReady, dbError, syncError, syncInfo, retrySync } = useAuth();
  const [MainScreen, setMainScreen] = useState<ComponentType | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (session && dbReady) void import('./screens/MainScreen').then(main => { if (!cancelled) setMainScreen(() => main.MainScreen); });
    return () => { cancelled = true; };
  }, [session?.user.id, dbReady]);
  if (dbError) return <View style={styles.center}><Text style={styles.title}>Local database unavailable</Text><Text>{dbError}</Text></View>;
  if (loading || (session && (!dbReady || !MainScreen))) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!session || !MainScreen) return <AuthScreen />;
  return <SafeAreaView style={styles.fill}>
    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>{syncError ? syncError.message : syncInfo.connected && !syncInfo.hasSynced ? 'Downloading your data…' : syncInfo.connected ? 'Cloud connected' : 'Offline — local data available'}</Text>
      <Text style={styles.bannerBody}>{syncInfo.pendingUploads} changes waiting to upload{syncInfo.lastSyncedAt ? ` · Last synced ${new Date(syncInfo.lastSyncedAt).toLocaleString()}` : ' · First cloud download not confirmed'}</Text>
      {syncInfo.conflicts > 0 && <Text style={styles.bannerBody}>{syncInfo.conflicts} backup conflicts need review in Account.</Text>}
      <Pressable accessibilityRole="button" onPress={() => void retrySync()}><Text style={styles.bannerBody}>Retry sync</Text></Pressable>
    </View>
    <MainScreen key={session.user.id} />
  </SafeAreaView>;
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
  fill: { flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0 },
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
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.muted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  bannerTitle: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  bannerBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
