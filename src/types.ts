export type KeyStatus = 'active' | 'exhausted' | 'invalid' | 'unknown';

export interface KeyItem {
  id: number;
  rawKey: string;
  maskedKey: string;
  status: KeyStatus;
  usage: number | null;
  limit: number | null;
  plan: string | null;
  successCount: number;
  errorCount: number;
  lastUsed: number | null;
  lastError: string | null;
}

export interface PoolStats {
  totalKeys: number;
  activeKeys: number;
  exhaustedKeys: number;
  invalidKeys: number;
  totalUsage: number;
  totalLimit: number;
  totalSuccess: number;
  totalFailures: number;
  keys: Array<{
    id: number;
    maskedKey: string;
    status: KeyStatus;
    usage: number | null;
    limit: number | null;
    plan: string | null;
    successCount: number;
    errorCount: number;
    lastUsed: string | null;
    lastError: string | null;
  }>;
}

export interface Env {
  STATUS_TOKEN?: string;
  PROXY_TOKEN?: string;
  TAVILY_KEYS?: string;
}
