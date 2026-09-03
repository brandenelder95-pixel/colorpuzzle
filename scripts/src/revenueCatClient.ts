import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient } from "@replit/revenuecat-sdk/client";

/**
 * Returns an authenticated RevenueCat API client that proxies through the
 * Replit RevenueCat connector (auth is injected automatically).
 * Always call this fresh — do not cache the result across requests.
 */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  // openapi-fetch passes a Request object as `input` with `init` undefined.
  // We must read method / headers / body from that Request object.
  const customFetch: typeof fetch = async (input, init) => {
    let url: string;
    let method: string;
    let headersRecord: Record<string, string> = {};
    let body: string | undefined;

    if (input instanceof Request) {
      url    = input.url;
      method = input.method;
      input.headers.forEach((value, key) => { headersRecord[key] = value; });
      if (input.method !== "GET" && input.method !== "HEAD") {
        body = await input.clone().text() || undefined;
      }
    } else {
      url    = typeof input === "string" ? input : input.toString();
      method = (init?.method || "GET").toUpperCase();
      if (init?.headers) {
        // Avoid referencing DOM-only `HeadersInit` type; use Headers constructor directly
        new Headers(init.headers as Record<string, string>).forEach((value, key) => {
          headersRecord[key] = value;
        });
      }
      if (init?.body != null) {
        body = typeof init.body === "string" ? init.body : String(init.body);
      }
    }

    // Strip the scheme+host — the proxy only needs the path (with /v2 prefix)
    const path = url.replace("https://api.revenuecat.com", "");

    const response = await connectors.proxy("revenuecat", path, {
      method,
      headers: headersRecord,
      body,
    });

    return response as Response;
  };

  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: customFetch,
  });
}
