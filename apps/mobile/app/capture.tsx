import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { extractUrl, hostnameOf } from "@recall/shared";
import { saveNewItem } from "@/lib/db";
import { useSync } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

/**
 * Opened by the OS share sheet. Saves immediately, with no form to fill in:
 * capture should take one tap. Works offline because it only writes to SQLite.
 */
export default function Capture() {
  const theme = useTheme();
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const { notifyLocalChange } = useSync();
  const [state, setState] = useState<"saving" | "saved" | "nothing" | "failed">("saving");
  const [preview, setPreview] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || handled.current) {
      if (!hasShareIntent) setState("nothing");
      return;
    }
    handled.current = true;
    const text = shareIntent.text?.trim() ?? "";
    const url = shareIntent.webUrl ?? extractUrl(text);
    const content = text || url || "";
    if (!content) {
      setState("nothing");
      return;
    }
    const title = typeof shareIntent.meta?.title === "string" ? shareIntent.meta.title : null;
    setPreview(title ?? hostnameOf(url) ?? content.slice(0, 120));
    saveNewItem({ content, url, title })
      .then(() => {
        setState("saved");
        notifyLocalChange();
      })
      .catch(() => setState("failed"));
  }, [hasShareIntent, shareIntent, notifyLocalChange]);

  function done() {
    resetShareIntent();
    router.replace("/");
  }

  const heading = {
    saving: "Saving…",
    saved: "Saved to Recall",
    nothing: "Nothing to save",
    failed: "Couldn't save this",
  }[state];

  const detail = {
    saving: null,
    saved: "Tags and a summary will appear once it syncs.",
    nothing: error ?? "Share a link or some text from another app to save it here.",
    failed: "Your phone's storage may be full. Try sharing it again.",
  }[state];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.paper }]}>
      <View style={styles.body}>
        <Text style={[styles.heading, { color: theme.ink }]}>{heading}</Text>
        {preview && (
          <Text style={[styles.preview, { color: theme.ink, backgroundColor: theme.surface, borderColor: theme.line }]} numberOfLines={3}>
            {preview}
          </Text>
        )}
        {detail && <Text style={[styles.detail, { color: theme.muted }]}>{detail}</Text>}
      </View>
      <Pressable style={[styles.button, { backgroundColor: theme.ink }]} onPress={done} accessibilityRole="button">
        <Text style={[styles.buttonText, { color: theme.paper }]}>Open Recall</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "space-between" },
  body: { flex: 1, justifyContent: "center", gap: 16 },
  heading: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  preview: { fontSize: 16, lineHeight: 22, padding: 14, borderWidth: 1, borderRadius: 8 },
  detail: { fontSize: 15, lineHeight: 21 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "700" },
});
