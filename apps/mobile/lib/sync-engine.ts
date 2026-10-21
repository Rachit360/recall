import type { ApiClient, ItemChange } from "@recall/shared";
import { applyServerItems, getDirtyItems, getMeta, setMeta, type LocalItem } from "./db";

const BATCH = 100;
const CURSOR_KEY = "last_sync";

let inFlight: Promise<void> | null = null;
let runAgain = false;

/**
 * Run a sync. Calls made while one is already running don't start a second
 * request in parallel; they schedule exactly one more pass afterwards, so a
 * note saved mid-sync still goes out promptly.
 */
export function syncNow(api: ApiClient): Promise<void> {
  if (inFlight) {
    runAgain = true;
    return inFlight;
  }
  inFlight = (async () => {
    do {
      runAgain = false;
      await syncPass(api);
    } while (runAgain);
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function syncPass(api: ApiClient) {
  // Loop in batches so a long offline stretch doesn't become one huge request.
  for (let round = 0; round < 20; round++) {
    const dirty = await getDirtyItems(BATCH);
    const since = await getMeta(CURSOR_KEY);
    const res = await api.sync({ since, changes: dirty.map(toChange) });
    await applyServerItems(res.items);
    await setMeta(CURSOR_KEY, res.serverTime);
    if (dirty.length < BATCH) return;
  }
}

function toChange(item: LocalItem): ItemChange {
  return {
    id: item.id,
    kind: item.kind,
    content: item.content,
    url: item.url,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}
