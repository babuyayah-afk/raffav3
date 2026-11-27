// lib/circuitBreaker.js — protects the app from slow/failing dependencies.
export class CircuitBreaker {
  constructor({ name, failureThreshold = 5, resetMs = 30_000, timeoutMs = 5_000, onStateChange = () => {} }) {
    Object.assign(this, { name, failureThreshold, resetMs, timeoutMs, onStateChange });
    this.state = 'closed'; this.failures = 0; this.openedAt = 0;
  }

  #set(state) { if (this.state !== state) { this.state = state; this.onStateChange(this.name, state); } }

  async exec(fn, fallback) {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.resetMs) this.#set('half-open');
      else return this.#fallback(fallback, new Error(`${this.name} circuit open`));
    }
    try {
      const result = await fn(AbortSignal.timeout(this.timeoutMs));
      this.failures = 0; this.#set('closed');
      return result;
    } catch (err) {
      this.failures++;
      if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
        this.openedAt = Date.now(); this.#set('open');
      }
      return this.#fallback(fallback, err);
    }
  }

  #fallback(fallback, err) { if (fallback) return fallback(err); throw err; }
}

// Retry with exponential backoff + full jitter (idempotent calls only).
export async function retry(fn, { retries = 3, baseMs = 200, maxMs = 5_000 } = {}) {
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); }
    catch (err) {
      if (attempt >= retries) throw err;
      const delay = Math.random() * Math.min(maxMs, baseMs * 2 ** attempt);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
