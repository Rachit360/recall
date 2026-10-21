"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  displayTitle,
  hostnameOf,
  splitMatches,
  type Item,
  type TagCount,
} from "@recall/shared";
import { api } from "@/lib/client";

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitMatches(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function Dashboard({ email }: { email: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pollCount = useRef(0);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
      else setError(err instanceof Error ? err.message : "Something went wrong");
    },
    [router],
  );

  const load = useCallback(async () => {
    try {
      const [list, tagList] = await Promise.all([
        api.listItems({ q: query || undefined, tag: activeTag ?? undefined }),
        api.tags(),
      ]);
      setItems(list.items);
      setTags(tagList.tags);
      setError(null);
    } catch (err) {
      handleError(err);
    }
  }, [query, activeTag, handleError]);

  // Debounce typing in the search box.
  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // While the AI is still tagging something, check back a few times.
  const tagging = items?.some((i) => i.aiStatus === "pending") ?? false;
  useEffect(() => {
    if (!tagging) {
      pollCount.current = 0;
      return;
    }
    if (pollCount.current >= 8) return;
    const t = setTimeout(() => {
      pollCount.current += 1;
      void load();
    }, 3000);
    return () => clearTimeout(t);
  }, [tagging, items, load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.createItem({ content: draft });
      setDraft("");
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null); // optimistic
    try {
      await api.deleteItem(id);
      void load();
    } catch (err) {
      handleError(err);
      void load();
    }
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <p className="wordmark">Recall</p>
        <nav aria-label="Tags" className="tag-nav">
          <button className={`tag-link ${activeTag === null ? "is-active" : ""}`} onClick={() => setActiveTag(null)}>
            Everything
          </button>
          {tags.map((t) => (
            <button
              key={t.tag}
              className={`tag-link ${activeTag === t.tag ? "is-active" : ""}`}
              onClick={() => setActiveTag(activeTag === t.tag ? null : t.tag)}
            >
              <span>#{t.tag}</span>
              <span className="count">{t.count}</span>
            </button>
          ))}
        </nav>
        <div className="account">
          <span className="account-email">{email}</span>
          <button className="text-button" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <input
          className="search"
          type="search"
          placeholder="Search everything you've saved"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <form className="capture" onSubmit={save}>
          <textarea
            placeholder="Paste a link or write a note"
            aria-label="New note or link"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save(e);
            }}
          />
          <button className="button" disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>

        {error && <p className="form-error" role="alert">{error}</p>}

        {activeTag && (
          <p className="filter-note">
            Showing #{activeTag}.{" "}
            <button className="text-button" onClick={() => setActiveTag(null)}>Show everything</button>
          </p>
        )}

        {items === null ? (
          <p className="quiet">Loading…</p>
        ) : items.length === 0 ? (
          <p className="quiet">
            {query || activeTag
              ? "Nothing matches. Try a different word or tag."
              : "Nothing saved yet. Paste a link above, or share one from your phone."}
          </p>
        ) : (
          <ol className="items">
            {items.map((item) => (
              <li key={item.id} className="item">
                <div className="item-head">
                  <h2 className="item-title">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">
                        <Highlight text={displayTitle(item)} query={query} />
                      </a>
                    ) : (
                      <Highlight text={displayTitle(item)} query={query} />
                    )}
                  </h2>
                  <button className="delete" onClick={() => remove(item.id)} aria-label={`Delete ${displayTitle(item)}`}>
                    Delete
                  </button>
                </div>
                <p className="item-meta">
                  {hostnameOf(item.url) && <span>{hostnameOf(item.url)}</span>}
                  <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                </p>
                {item.summary ? (
                  <p className="item-body"><Highlight text={item.summary} query={query} /></p>
                ) : item.kind === "note" && item.content !== displayTitle(item) ? (
                  <p className="item-body"><Highlight text={item.content} query={query} /></p>
                ) : null}
                {item.aiStatus === "pending" ? (
                  <p className="tagging">Tagging…</p>
                ) : item.tags.length > 0 ? (
                  <p className="item-tags">
                    {item.tags.map((t) => (
                      <button key={t} className="tag" onClick={() => setActiveTag(t)}>
                        #<Highlight text={t} query={query} />
                      </button>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
