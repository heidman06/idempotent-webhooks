export type StoredResponse<T> = {
  status: number;
  body: T;
  createdAt: number;
};

export type ExecuteResult<T> = {
  /** true when the operation did not run because the key was already used */
  replayed: boolean;
  response: StoredResponse<T>;
};

export type IdempotencyOptions = {
  /** how long a stored result stays replayable */
  ttlMs?: number;
  /** injectable clock, for tests */
  now?: () => number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Replays the stored result for a repeated key, and collapses concurrent
 * duplicates into a single execution.
 *
 * The failure model matters as much as the happy path: if the operation
 * throws, nothing is stored and the next attempt with the same key really
 * runs — the caller never gets a cached error.
 */
export class IdempotencyService<T = unknown> {
  #completed = new Map<string, StoredResponse<T>>();
  #inflight = new Map<string, Promise<StoredResponse<T>>>();
  #ttlMs: number;
  #now: () => number;

  constructor(options: IdempotencyOptions = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#now = options.now ?? Date.now;
  }

  has(key: string): boolean {
    const stored = this.#completed.get(key);
    return stored !== undefined && !this.#isExpired(stored);
  }

  async execute(key: string, operation: () => Promise<T>): Promise<ExecuteResult<T>> {
    const cached = this.#completed.get(key);
    if (cached !== undefined && !this.#isExpired(cached)) {
      return { replayed: true, response: cached };
    }

    const inflight = this.#inflight.get(key);
    if (inflight !== undefined) {
      return { replayed: true, response: await inflight };
    }

    const promise = this.#run(key, operation);
    this.#inflight.set(key, promise);
    try {
      return { replayed: false, response: await promise };
    } finally {
      this.#inflight.delete(key);
    }
  }

  async #run(key: string, operation: () => Promise<T>): Promise<StoredResponse<T>> {
    const body = await operation();
    const response: StoredResponse<T> = { status: 200, body, createdAt: this.#now() };
    this.#completed.set(key, response);
    return response;
  }

  #isExpired(response: StoredResponse<T>): boolean {
    return this.#now() - response.createdAt > this.#ttlMs;
  }
}
