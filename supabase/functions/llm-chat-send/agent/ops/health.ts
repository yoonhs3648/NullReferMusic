/**
 * Provider Health / Circuit Breaker / Rate Limiter.
 * HealthScore = Latency + ErrorRate + 429 + SuccessRate 합성.
 */

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'down';

export type ProviderHealthScore = {
  /** 0~100 — Planner 페일오버 참고 */
  score: number;
  latencyMsAvg: number;
  errorRate: number;
  rateLimit429Count: number;
  successRate: number;
  samples: number;
};

export type ProviderHealth = {
  providerName: string;
  status: ProviderHealthStatus;
  latencyP50Ms?: number;
  errorRate?: number;
  checkedAt: string;
  score?: ProviderHealthScore;
};

export interface ProviderHealthMonitor {
  get(providerName: string): Promise<ProviderHealth> | ProviderHealth;
  recordSuccess(providerName: string, latencyMs: number): void;
  recordFailure(providerName: string, kind: string): void;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreaker {
  allow(providerName: string): boolean;
  onSuccess(providerName: string): void;
  onFailure(providerName: string): void;
  state(providerName: string): CircuitState;
}

export interface ProviderRateLimiter {
  tryAcquire(providerName: string): boolean;
  remaining(providerName: string): number | null;
}

type StatRow = {
  success: number;
  failure: number;
  rate429: number;
  latencySum: number;
  latencyN: number;
};

const stats = new Map<string, StatRow>();

function row(name: string): StatRow {
  let r = stats.get(name);
  if (!r) {
    r = { success: 0, failure: 0, rate429: 0, latencySum: 0, latencyN: 0 };
    stats.set(name, r);
  }
  return r;
}

function computeScore(name: string): ProviderHealthScore {
  const r = row(name);
  const samples = r.success + r.failure;
  const successRate = samples === 0 ? 1 : r.success / samples;
  const errorRate = samples === 0 ? 0 : r.failure / samples;
  const latencyMsAvg = r.latencyN === 0 ? 0 : r.latencySum / r.latencyN;
  // 100 만점: 성공률·지연·429 반영 (휴리스틱)
  let score = successRate * 70;
  if (latencyMsAvg > 0) {
    if (latencyMsAvg < 1500) score += 20;
    else if (latencyMsAvg < 4000) score += 10;
    else score += 2;
  } else {
    score += 15;
  }
  score -= Math.min(25, r.rate429 * 5);
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    latencyMsAvg: Math.round(latencyMsAvg),
    errorRate: Math.round(errorRate * 1000) / 1000,
    rateLimit429Count: r.rate429,
    successRate: Math.round(successRate * 1000) / 1000,
    samples,
  };
}

const health: ProviderHealthMonitor = {
  get(providerName) {
    const s = computeScore(providerName);
    const status: ProviderHealthStatus =
      s.samples === 0 ? 'healthy' : s.score >= 60 ? 'healthy' : s.score >= 35 ? 'degraded' : 'down';
    return {
      providerName,
      status,
      latencyP50Ms: s.latencyMsAvg,
      errorRate: s.errorRate,
      checkedAt: new Date().toISOString(),
      score: s,
    };
  },
  recordSuccess(providerName, latencyMs) {
    const r = row(providerName);
    r.success += 1;
    r.latencySum += Math.max(0, latencyMs);
    r.latencyN += 1;
  },
  recordFailure(providerName, kind) {
    const r = row(providerName);
    r.failure += 1;
    if (kind === 'rate_limit' || kind.includes('429')) r.rate429 += 1;
  },
};

const circuits = new Map<string, { failures: number; openUntil: number }>();

const breaker: CircuitBreaker = {
  allow(providerName) {
    const c = circuits.get(providerName);
    if (!c) return true;
    if (Date.now() < c.openUntil) return false;
    return true;
  },
  onSuccess(providerName) {
    circuits.delete(providerName);
  },
  onFailure(providerName) {
    const c = circuits.get(providerName) ?? { failures: 0, openUntil: 0 };
    c.failures += 1;
    if (c.failures >= 5) {
      c.openUntil = Date.now() + 30_000;
      c.failures = 0;
    }
    circuits.set(providerName, c);
  },
  state(providerName) {
    const c = circuits.get(providerName);
    if (!c) return 'closed';
    if (Date.now() < c.openUntil) return 'open';
    return 'half_open';
  },
};

const limiter: ProviderRateLimiter = {
  tryAcquire: () => true,
  remaining: () => null,
};

let healthMonitor = health;
let circuitBreaker = breaker;
let rateLimiter = limiter;

export function registerProviderHealthMonitor(m: ProviderHealthMonitor): void {
  healthMonitor = m;
}
export function registerCircuitBreaker(b: CircuitBreaker): void {
  circuitBreaker = b;
}
export function registerProviderRateLimiter(r: ProviderRateLimiter): void {
  rateLimiter = r;
}

export function getProviderHealthMonitor(): ProviderHealthMonitor {
  return healthMonitor;
}
export function getCircuitBreaker(): CircuitBreaker {
  return circuitBreaker;
}
export function getProviderRateLimiter(): ProviderRateLimiter {
  return rateLimiter;
}
