import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

// Serverless functions and Next's dev hot reload both re-run module code,
// so the connection lives on globalThis to avoid opening a new pool each time.
const globalForMongo = globalThis as unknown as { _mongoose?: Cache };
const cache: Cache = (globalForMongo._mongoose ??= { conn: null, promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  cache.promise ??= mongoose.connect(uri, { bufferCommands: false });
  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null; // let the next request retry instead of caching the failure
    throw err;
  }
  return cache.conn;
}
