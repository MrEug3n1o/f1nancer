import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../sync/AuthProvider";
import { isSyncConfigured } from "../sync/config";
import { colors } from "./theme";

export function AuthScreen() {
  const { signIn, signUp, configured } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(username, password);
      else await signIn(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.shell}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.logo}>
        <View style={styles.coin}><Text style={styles.coinText}>¢</Text></View>
        <Text style={styles.brand}>f<Text style={styles.brandAccent}>1</Text>nancer</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{mode === "signup" ? "Create account" : "Sign in"}</Text>
        <Text style={styles.muted}>
          Your finances, on every device. Use the same account as desktop.
        </Text>
        {!configured || !isSyncConfigured() ? (
          <Text style={styles.error}>
            Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and
            EXPO_PUBLIC_POWERSYNC_URL.
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={[styles.button, (!configured || busy) && styles.disabled]}
          disabled={!configured || busy}
          onPress={() => void submit()}
        >
          <Text style={styles.buttonText}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          <Text style={styles.link}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.sidebar,
  },
  logo: {
    alignItems: "center",
    marginBottom: 26,
    gap: 10,
  },
  coin: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  coinText: { color: "#fff", fontSize: 38, lineHeight: 44, fontWeight: "800" },
  card: {
    backgroundColor: colors.elevated,
    borderRadius: 14,
    padding: 22,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  brand: { fontSize: 30, fontWeight: "600", color: colors.sidebarText, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  brandAccent: { color: colors.accentBright },
  title: { fontSize: 26, fontWeight: "600", color: colors.ink, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  muted: { color: colors.muted, lineHeight: 20 },
  error: { color: colors.danger },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    padding: 13,
    backgroundColor: colors.input,
    color: colors.ink,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    padding: 14,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { color: colors.accent, textAlign: "center" },
});
