/**
 * PIN → cookie token. Edge- and Node-safe (Web Crypto only, no Buffer) so the
 * same helper runs in middleware and route handlers.
 */
export const AUTH_COOKIE = "hfc_auth";

export async function pinToken(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`hfc-v1::${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
