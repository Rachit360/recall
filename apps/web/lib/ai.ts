import { Types } from "mongoose";
import { z } from "zod";
import { Item } from "./models";

/**
 * AI enrichment: fetches a link's page title, then asks an LLM for a title,
 * a one-line summary and tags. Runs after the response is sent (see `after()`
 * in the routes), so saving never waits on the model.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const enrichmentSchema = z.object({
  title: z.string().nullish(),
  summary: z.string(),
  tags: z.array(z.string()),
});

export async function enrichItems(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await enrichItem(id);
    } catch (err) {
      console.error(`[ai] enrichment failed for ${id}`, err);
      await Item.updateOne({ _id: id }, { aiStatus: "failed", syncedAt: new Date() });
    }
  }
}

async function enrichItem(id: string): Promise<void> {
  const item = await Item.findById(id);
  if (!item || item.deletedAt) return;

  const pageTitle = item.url ? await fetchPageTitle(item.url) : null;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    item.set({ title: item.title ?? pageTitle, aiStatus: "skipped", syncedAt: new Date() });
    await item.save();
    return;
  }

  const existingTags = await topTags(item.userId);
  const result = await callModel(apiKey, {
    content: item.content.slice(0, 4000),
    url: item.url,
    pageTitle,
    existingTags,
  });

  item.set({
    title: pageTitle ?? result.title ?? null,
    summary: result.summary.slice(0, 300),
    tags: normalizeTags(result.tags),
    aiStatus: "done",
    syncedAt: new Date(), // so the phone pulls the tags on its next sync
  });
  await item.save();
}

async function callModel(apiKey: string, input: Record<string, unknown>) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You organize a person's saved links and notes. Reply with JSON only, shaped " +
            '{"title": string | null, "summary": string, "tags": string[]}. ' +
            "title: at most 8 words, or null if pageTitle is already good. " +
            "summary: one plain sentence, at most 25 words, saying what this is and why it might matter. " +
            "tags: 2 to 5 lowercase topic tags, single words or kebab-case. " +
            "Reuse tags from existingTags whenever one fits, so the person's tags stay consistent.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq responded ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  return enrichmentSchema.parse(JSON.parse(text));
}

function normalizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) =>
      t
        .toLowerCase()
        .trim()
        .replace(/^#/, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, ""),
    )
    .filter((t) => t.length > 1 && t.length <= 30);
  return [...new Set(clean)].slice(0, 5);
}

async function topTags(userId: Types.ObjectId): Promise<string[]> {
  const rows = await Item.aggregate<{ _id: string }>([
    { $match: { userId, deletedAt: null } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 30 },
  ]);
  return rows.map((r) => r._id);
}

/**
 * The server fetches URLs that users submit, which is a classic SSRF risk.
 * Block obvious internal targets. (A production hardening step would also
 * resolve DNS and re-check the IP, which this does not do.)
 */
function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host.startsWith("[")) return false; // IPv6 literals
    if (/^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPageTitle(url: string): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "RecallBot/1.0 (+title preview)", Accept: "text/html" },
    });
    if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) return null;
    const html = (await res.text()).slice(0, 300_000);
    const raw =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return raw ? decodeEntities(raw).trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}
