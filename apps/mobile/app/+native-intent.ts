import { getShareExtensionKey } from "expo-share-intent";

/**
 * When another app shares into Recall, the OS opens us with a special deep
 * link. Route it to the capture screen instead of letting Expo Router 404.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return "/capture";
    return path;
  } catch {
    return "/";
  }
}
