import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, credentialsSchema } from "@recall/shared";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function Login() {
  const theme = useTheme();
  const router = useRouter();
  const { email: signedInEmail, signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (signedInEmail) return <Redirect href="/" />;

  async function submit() {
    const parsed = credentialsSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(mode, parsed.data);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const input = [styles.input, { borderColor: theme.line, backgroundColor: theme.surface, color: theme.ink }];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={[styles.wordmark, { color: theme.ink }]}>Recall</Text>
        <Text style={[styles.lede, { color: theme.muted }]}>
          Share anything into Recall from any app. Find it again later.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={input}
            placeholder="Email"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={input}
            placeholder="Password"
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
          <Pressable
            style={[styles.button, { backgroundColor: theme.ink, opacity: busy ? 0.6 : 1 }]}
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.paper }]}>
                {mode === "login" ? "Sign in" : "Create account"}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }} hitSlop={8}>
          <Text style={[styles.switch, { color: theme.muted }]}>
            {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  wordmark: { fontSize: 44, fontWeight: "800", letterSpacing: -1.5 },
  lede: { fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { fontSize: 14 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  switch: { marginTop: 20, textAlign: "center", textDecorationLine: "underline" },
});
