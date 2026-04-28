export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type FetchLike = (input: string, init?: { signal?: AbortSignal; dispatcher?: unknown }) => Promise<FetchLikeResponse>;

// Proxy-aware fetch: uses undici with ProxyAgent when proxyUrl is set,
// otherwise falls back to the provided fetchImpl.
export const buildProxyAwareFetch = async (
  proxyUrl: string | null,
  fetchImpl: FetchLike
): Promise<FetchLike> => {
  if (!proxyUrl) {
    return fetchImpl;
  }
  try {
    const { fetch: undiciFetch, ProxyAgent } = await import("undici");
    const agent = new ProxyAgent(proxyUrl);
    return (url: string, init?: { signal?: AbortSignal; dispatcher?: unknown }) =>
      undiciFetch(url, { ...init, dispatcher: agent }) as Promise<FetchLikeResponse>;
  } catch {
    return fetchImpl;
  }
};
