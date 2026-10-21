import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import type { Item } from "@recall/shared";

/**
 * The phone's own copy of every item. The UI only ever reads from here,
 * which is what makes the app work offline: saving is a local write,
 * and sync happens in the background.
 *
 * `dirty = 1` means "changed on this phone and not yet confirmed by the server".
 */

export type LocalItem = Item & { dirty: boolean };

type Row = {
  id: string;
  kind: string;
  content: string;
  url: string | null;
  title: string | null;
  summary: string | null;
  tags: string;
  ai_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync("recall.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        url TEXT,
        title TEXT,
        summary TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        ai_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS items_created ON items (created_at DESC);
      CREATE INDEX IF NOT EXISTS items_dirty ON items (dirty);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
    `);
    return db;
  })();
  return dbPromise;
}

function fromRow(r: Row): LocalItem {
  return {
    id: r.id,
    kind: r.kind as Item["kind"],
    content: r.content,
    url: r.url,
    title: r.title,
    summary: r.summary,
    tags: JSON.parse(r.tags) as string[],
    aiStatus: r.ai_status as Item["aiStatus"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    dirty: r.dirty === 1,
  };
}

export async function listItems(query = ""): Promise<LocalItem[]> {
  const db = await getDb();
  const q = query.trim();
  if (!q) {
    const rows = await db.getAllAsync<Row>(
      "SELECT * FROM items WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 300",
    );
    return rows.map(fromRow);
  }
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM items
     WHERE deleted_at IS NULL
       AND (content LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
            OR summary LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
     ORDER BY created_at DESC LIMIT 300`,
    [like, like, like, like],
  );
  return rows.map(fromRow);
}

export async function saveNewItem(input: { content: string; url: string | null; title?: string | null }) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO items (id, kind, content, url, title, created_at, updated_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      Crypto.randomUUID(),
      input.url ? "link" : "note",
      input.content.slice(0, 10_000),
      input.url,
      input.title ?? null,
      now,
      now,
    ],
  );
}

export async function deleteItem(id: string) {
  const db = await getDb();
  const now = new Date().toISOString();
  // Keep a tombstone until the server confirms, so the delete can sync.
  await db.runAsync("UPDATE items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?", [now, now, id]);
}

export async function getDirtyItems(limit: number): Promise<LocalItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM items WHERE dirty = 1 ORDER BY updated_at LIMIT ?", [limit]);
  return rows.map(fromRow);
}

export async function countDirty(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE dirty = 1");
  return row?.n ?? 0;
}

/**
 * Merge what the server sent. If the phone changed an item *after* the version
 * the server has, keep the phone's copy; it will be pushed on the next sync.
 */
export async function applyServerItems(items: Item[]) {
  if (items.length === 0) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const it of items) {
      const local = await tx.getFirstAsync<{ dirty: number; updated_at: string }>(
        "SELECT dirty, updated_at FROM items WHERE id = ?",
        [it.id],
      );
      if (local && local.dirty === 1 && local.updated_at > it.updatedAt) continue;

      if (it.deletedAt) {
        await tx.runAsync("DELETE FROM items WHERE id = ?", [it.id]);
        continue;
      }
      await tx.runAsync(
        `INSERT OR REPLACE INTO items
           (id, kind, content, url, title, summary, tags, ai_status, created_at, updated_at, deleted_at, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
        [
          it.id,
          it.kind,
          it.content,
          it.url,
          it.title,
          it.summary,
          JSON.stringify(it.tags),
          it.aiStatus,
          it.createdAt,
          it.updatedAt,
        ],
      );
    }
  });
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM meta WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
}

/** On sign-out: this phone shouldn't keep the previous account's data. */
export async function clearLocalData() {
  const db = await getDb();
  await db.execAsync("DELETE FROM items; DELETE FROM meta;");
}
