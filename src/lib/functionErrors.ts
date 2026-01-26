/**
 * Extracts a useful error message from a failed backend function invocation.
 * Supabase-js (and compatible clients) often return a generic
 * "Edge function error" unless we parse the response body.
 */
export async function getFunctionErrorMessage(err: unknown): Promise<string> {
  const anyErr = err as any;

  // Supabase Functions errors often include a Response-like `context`.
  const ctx: Response | undefined = anyErr?.context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const clone = ctx.clone();
      const contentType = clone.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await clone.json().catch(() => null);
        const msg = json?.error || json?.message;
        if (typeof msg === "string" && msg.trim()) return msg;
      }

      const text = await clone.text().catch(() => "");
      if (text.trim()) return text.slice(0, 500);
      if (typeof ctx.status === "number" && ctx.status) return `Request failed (HTTP ${ctx.status})`;
    } catch {
      // fall through
    }
  }

  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return "Request failed";
}
