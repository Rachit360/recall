import { createApiClient } from "@recall/shared";

// Same origin, cookie auth: the browser sends the httpOnly cookie automatically.
export const api = createApiClient({ baseUrl: "", credentials: "same-origin" });
