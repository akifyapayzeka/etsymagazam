import { ETSY_API_BASE_URL, ETSY_PING_PATH, RATE_LIMITS } from "./constants.js";
import { RateLimiter } from "./rate-limiter.js";
import type {
  CreateDraftListingInput,
  EtsyListing,
  EtsyListingFile,
  EtsyListingImage,
  EtsyPaginatedResponse,
  EtsyReceipt,
  EtsyShop,
  UpdateListingInput,
} from "./types.js";

export class EtsyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EtsyApiError";
  }
}

/** Resolves a fresh, valid access token for a given shop; implementations refresh + persist as needed. */
export interface AccessTokenProvider {
  getAccessToken(shopId: string): Promise<string>;
}

export interface EtsyApiClientOptions {
  apiKeystring: string;
  /**
   * Etsy's "Shared secret" from the Developer Portal. NOT used to build the
   * x-api-key header — that's the keystring alone (see below). Kept as a
   * required option so call sites keep threading it through for webhook
   * signature verification and any future use, but this client itself
   * doesn't touch it.
   */
  sharedSecret: string;
  tokenProvider: AccessTokenProvider;
  shopId: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Thin, typed wrapper over the official Etsy Open API v3 REST endpoints.
 * Handles auth headers, QPS pacing, retry-with-backoff on 429/5xx, and
 * surfaces non-2xx responses as EtsyApiError.
 *
 * All endpoint paths below were verified against developer.etsy.com on
 * DOCS_LAST_VERIFIED (see constants.ts). Etsy occasionally changes paths —
 * if a call starts failing with 404, check the reference docs before
 * assuming the payload is wrong.
 */
export class EtsyApiClient {
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(private readonly opts: EtsyApiClientOptions) {
    this.limiter = new RateLimiter(RATE_LIMITS.queriesPerSecond, RATE_LIMITS.queriesPerDay);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  async ping(): Promise<{ application_id: number }> {
    return this.request<{ application_id: number }>("GET", ETSY_PING_PATH, { skipAuth: true });
  }

  async getShop(shopId: string): Promise<EtsyShop> {
    return this.request<EtsyShop>("GET", `/shops/${shopId}`);
  }

  /** Resolves the Etsy shop(s) owned by the authorizing user — used right after OAuth to discover the shop id. */
  async getShopsByOwnerUserId(userId: string): Promise<EtsyPaginatedResponse<EtsyShop>> {
    return this.request<EtsyPaginatedResponse<EtsyShop>>("GET", `/users/${userId}/shops`);
  }

  /** createDraftListing requires application/x-www-form-urlencoded, not JSON (verified against Etsy's official docs). */
  async createDraftListing(input: CreateDraftListingInput): Promise<EtsyListing> {
    return this.request<EtsyListing>("POST", `/shops/${this.opts.shopId}/listings`, { formUrlEncoded: input });
  }

  /** updateListing also requires application/x-www-form-urlencoded, not JSON. */
  async updateListing(listingId: string, input: UpdateListingInput): Promise<EtsyListing> {
    return this.request<EtsyListing>("PATCH", `/shops/${this.opts.shopId}/listings/${listingId}`, { formUrlEncoded: input });
  }

  async getListing(listingId: string): Promise<EtsyListing> {
    return this.request<EtsyListing>("GET", `/listings/${listingId}`);
  }

  async deleteListing(listingId: string): Promise<void> {
    await this.request<void>("DELETE", `/shops/${this.opts.shopId}/listings/${listingId}`);
  }

  async activateListing(listingId: string): Promise<EtsyListing> {
    return this.updateListing(listingId, { state: "active" });
  }

  async deactivateListing(listingId: string): Promise<EtsyListing> {
    return this.updateListing(listingId, { state: "inactive" });
  }

  /** Uploads a listing image. `imageBuffer` should be a JPEG/PNG buffer already sized per mockup spec. */
  async uploadListingImage(listingId: string, imageBuffer: Buffer, filename: string, rank?: number): Promise<EtsyListingImage> {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(imageBuffer)]), filename);
    if (rank !== undefined) form.append("rank", String(rank));
    return this.request<EtsyListingImage>("POST", `/shops/${this.opts.shopId}/listings/${listingId}/images`, {
      form,
    });
  }

  /** Uploads a digital file (customer download) attached to a listing. */
  async uploadListingFile(
    listingId: string,
    fileBuffer: Buffer,
    filename: string,
    rank?: number,
  ): Promise<EtsyListingFile> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(fileBuffer)]), filename);
    form.append("name", filename);
    if (rank !== undefined) form.append("rank", String(rank));
    return this.request<EtsyListingFile>("POST", `/shops/${this.opts.shopId}/listings/${listingId}/files`, {
      form,
    });
  }

  async listShopReceipts(params: {
    minCreated?: number;
    limit?: number;
    offset?: number;
    wasPaid?: boolean;
  } = {}): Promise<EtsyPaginatedResponse<EtsyReceipt>> {
    const query = new URLSearchParams();
    if (params.minCreated) query.set("min_created", String(params.minCreated));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    if (params.wasPaid !== undefined) query.set("was_paid", String(params.wasPaid));
    return this.request<EtsyPaginatedResponse<EtsyReceipt>>(
      "GET",
      `/shops/${this.opts.shopId}/receipts?${query.toString()}`,
    );
  }

  async getReceipt(receiptId: string): Promise<EtsyReceipt> {
    return this.request<EtsyReceipt>("GET", `/shops/${this.opts.shopId}/receipts/${receiptId}`);
  }

  /** Full seller taxonomy tree — used once (or when categories change) to resolve category names to the numeric taxonomy_id every listing requires. Not cached here; cache at the call site if polling often. */
  async getSellerTaxonomyNodes(): Promise<EtsyPaginatedResponse<{ id: number; name: string; level: number; parent_id: number | null }>> {
    return this.request("GET", "/seller-taxonomy/nodes");
  }

  get remainingDailyQuota(): number {
    return this.limiter.remainingToday;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { json?: unknown; form?: FormData; formUrlEncoded?: object; skipAuth?: boolean } = {},
  ): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      await this.limiter.acquire();

      // Etsy Open API v3's x-api-key is the keystring alone — NOT
      // `keystring:sharedSecret`. Sending the concatenated form here is
      // exactly what produces a 403 "Invalid API credentials" with the
      // misleading "must include 'keystring:secret'" message (see
      // https://github.com/etsy/open-api/discussions/1521): the whole
      // colon-joined string doesn't match any registered keystring, so
      // Etsy rejects the key as invalid/inactive rather than reporting a
      // malformed header.
      const headers: Record<string, string> = {
        "x-api-key": this.opts.apiKeystring,
      };
      if (!opts.skipAuth) {
        const token = await this.opts.tokenProvider.getAccessToken(this.opts.shopId);
        headers.Authorization = `Bearer ${token}`;
      }
      let body: string | FormData | undefined;
      if (opts.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.json);
      } else if (opts.formUrlEncoded !== undefined) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = encodeFormUrlEncoded(opts.formUrlEncoded);
      } else if (opts.form) {
        body = opts.form;
      }

      const url = path.startsWith("http") ? path : `${ETSY_API_BASE_URL}${path}`;
      const res = await this.fetchImpl(url, { method, headers, body });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const errBody = await res.json().catch(() => ({}));
      const retryable = res.status === 429 || res.status >= 500;

      if (retryable && attempt <= this.maxRetries) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        const backoffMs = retryAfterMs ?? Math.min(30_000, 500 * 2 ** attempt);
        await sleep(backoffMs);
        continue;
      }

      throw new EtsyApiError(
        `Etsy API ${method} ${path} failed: ${res.status} ${JSON.stringify(errBody)}`,
        res.status,
        errBody,
        retryable,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encodes a request body as application/x-www-form-urlencoded, as required
 * by createDraftListing/updateListing. Array values (tags, materials, style)
 * are joined with commas, matching Etsy's documented convention for
 * array-typed parameters in form-encoded requests. undefined/null values are
 * omitted entirely rather than sent as the string "undefined".
 */
function encodeFormUrlEncoded(input: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  return params.toString();
}
