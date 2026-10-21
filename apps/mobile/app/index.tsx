import { Redirect, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { displayTitle, extractUrl, hostnameOf, splitMatches } from "@recall/shared";
import { useAuth } from "@/lib/auth";
import { deleteItem, listItems, saveNewItem, type LocalItem } from "@/lib/db";
import { useSync } from "@/lib/sync";
import { useTheme, type Theme } from "@/lib/theme";

export default function Home() {
  const router = useRouter();
  const { ready, email } = useAuth();
  const { hasShareIntent } = useShareIntentContext();

  // A share that arrives while the app is already open lands here.
  useEffect(() => {
    if (hasShareIntent) router.push("/capture");
  }, [hasShareIntent, router]);

  if (!ready) return null;
  if (!email) return <Redirect href="/login" />;
  return <Library />;
}

function Library() {
  const theme = useTheme();
  const { email, signOut } = useAuth();
  const { online, syncing, pending, error, dataVersion, requestSync, notifyLocalChange } = useSync();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<LocalItem[]>([]);

  const load = useCallback(async () => setItems(await listItems(query)), [query]);
  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  async function save() {
    const content = draft.trim();
    if (!content) return;
    await saveNewItem({ content, url: extractUrl(content) });
    setDraft("");
    notifyLocalChange();
  }

  function confirmDelete(item: LocalItem) {
    Alert.alert("Delete this item?", displayTitle(item), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteItem(item.id);
          notifyLocalChange();
        },
      },
    ]);
  }

  function confirmSignOut() {
    const warning = pending > 0 ? `${pending} unsynced item(s) on this phone will be lost.` : undefined;
    Alert.alert("Sign out?", warning, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  const status = !online
    ? pending > 0
      ? `Offline. ${pending} saved on this phone, will sync later.`
      : "Offline. Everything here still works."
    : error
      ? `Couldn't sync: ${error}`
      : pending > 0
        ? `${pending} waiting to sync…`
        : syncing
          ? "Syncing…"
          : "Up to date";

  const input = { borderColor: theme.line, backgroundColor: theme.surface, color: theme.ink };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={requestSync} tintColor={theme.muted} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <Text style={[styles.wordmark, { color: theme.ink }]}>Recall</Text>
              <Pressable onPress={confirmSignOut} hitSlop={10} accessibilityLabel={`Signed in as ${email}. Sign out`}>
                <Text style={[styles.small, { color: theme.muted }]}>Sign out</Text>
              </Pressable>
            </View>
            <Text style={[styles.small, { color: error ? theme.danger : theme.muted }]}>{status}</Text>

            <TextInput
              style={[styles.search, { color: theme.ink, borderBottomColor: theme.ink }]}
              placeholder="Search"
              placeholderTextColor={theme.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />

            <View style={styles.captureRow}>
              <TextInput
                style={[styles.capture, input]}
                placeholder="Write a note or paste a link"
                placeholderTextColor={theme.muted}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
              <Pressable
                style={[styles.saveButton, { backgroundColor: theme.ink, opacity: draft.trim() ? 1 : 0.4 }]}
                onPress={save}
                disabled={!draft.trim()}
                accessibilityRole="button"
              >
                <Text style={[styles.saveText, { color: theme.paper }]}>Save</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.muted }]}>
            {query
              ? "Nothing matches. Try a different word."
              : "Nothing saved yet. In any app, tap Share and choose Recall."}
          </Text>
        }
        renderItem={({ item }) => (
          <Row item={item} query={query} theme={theme} onLongPress={() => confirmDelete(item)} />
        )}
      />
    </SafeAreaView>
  );
}

function Highlighted({ text, query, theme }: { text: string; query: string; theme: Theme }) {
  return (
    <>
      {splitMatches(text, query).map((part, i) =>
        part.match ? (
          <Text key={i} style={{ backgroundColor: theme.mark, color: theme.markInk }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Row({ item, query, theme, onLongPress }: { item: LocalItem; query: string; theme: Theme; onLongPress: () => void }) {
  const host = hostnameOf(item.url);
  const body = item.summary ?? (item.kind === "note" && item.content !== displayTitle(item) ? item.content : null);
  const state = item.dirty ? "Waiting to sync" : item.aiStatus === "pending" ? "Tagging…" : null;

  return (
    <Pressable
      onPress={() => item.url && void Linking.openURL(item.url)}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, { borderTopColor: theme.line, opacity: pressed ? 0.6 : 1 }]}
      accessibilityHint={item.url ? "Opens the link. Long press to delete." : "Long press to delete."}
    >
      <Text style={[styles.title, { color: theme.ink }]} numberOfLines={2}>
        <Highlighted text={displayTitle(item)} query={query} theme={theme} />
      </Text>
      {host && <Text style={[styles.small, { color: theme.muted }]}>{host}</Text>}
      {body && (
        <Text style={[styles.body, { color: theme.ink }]} numberOfLines={4}>
          <Highlighted text={body} query={query} theme={theme} />
        </Text>
      )}
      {state ? (
        <Text style={[styles.small, styles.meta, { color: theme.muted, fontStyle: "italic" }]}>{state}</Text>
      ) : item.tags.length > 0 ? (
        <Text style={[styles.small, styles.meta, { color: theme.muted }]}>
          {item.tags.map((t) => `#${t}`).join("  ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingBottom: 48 },
  header: { paddingTop: 12, paddingBottom: 20 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  wordmark: { fontSize: 30, fontWeight: "800", letterSpacing: -1 },
  small: { fontSize: 13, lineHeight: 18 },
  search: { fontSize: 26, fontWeight: "700", borderBottomWidth: 2, paddingVertical: 8, marginTop: 20 },
  captureRow: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginTop: 20 },
  capture: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, maxHeight: 120 },
  saveButton: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  saveText: { fontSize: 16, fontWeight: "700" },
  empty: { fontSize: 15, lineHeight: 22, marginTop: 24 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 16, gap: 2 },
  title: { fontSize: 17, fontWeight: "700", lineHeight: 23 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 6, fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) },
  meta: { marginTop: 8 },
});
