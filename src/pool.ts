import { KeyItem, KeyStatus, PoolStats } from './types';

/**
 * 遮罩密钥以保护敏感信息 (例如：tvly-8f3a••••e4d1)
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  const prefix = key.slice(0, 8);
  const suffix = key.slice(-4);
  return `${prefix}••••${suffix}`;
}

export class KeyPool {
  private static instance: KeyPool | null = null;
  private keys: KeyItem[] = [];
  private rawKeysString: string = '';
  private currentIndex: number = 0;

  private constructor() {}

  public static getInstance(): KeyPool {
    if (!KeyPool.instance) {
      KeyPool.instance = new KeyPool();
    }
    return KeyPool.instance;
  }

  /**
   * 同步环境变量中的 TAVILY_KEYS
   */
  public syncKeys(rawConfig: string | undefined): void {
    const trimmed = (rawConfig || '').trim();
    if (trimmed === this.rawKeysString) return;

    this.rawKeysString = trimmed;
    const incomingKeys = trimmed
      .split(/[\n,;]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 5);

    const oldKeyMap = new Map<string, KeyItem>();
    for (const item of this.keys) {
      oldKeyMap.set(item.rawKey, item);
    }

    this.keys = incomingKeys.map((k, index) => {
      const existing = oldKeyMap.get(k);
      if (existing) {
        return { ...existing, id: index + 1 };
      }
      return {
        id: index + 1,
        rawKey: k,
        maskedKey: maskKey(k),
        status: 'active',
        usage: null,
        limit: null,
        plan: null,
        latency: null,
        lastUsed: null,
        lastError: null,
      };
    });

    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }
  }

  /**
   * 轮询获取下一个活跃 Key
   */
  public getNextKey(): KeyItem | null {
    if (this.keys.length === 0) return null;

    const candidates = this.keys.filter((k) => k.status === 'active' || k.status === 'unknown');
    // 如果全部耗尽，自动保底降级为在全部 Key 中重试，防止误判卡死
    const targetPool = candidates.length > 0 ? candidates : this.keys;

    this.currentIndex = (this.currentIndex + 1) % targetPool.length;
    return targetPool[this.currentIndex];
  }

  public recordSuccess(keyId: number): void {
    const target = this.keys.find((k) => k.id === keyId);
    if (target) {
      target.lastUsed = Date.now();
      target.status = 'active';
      target.lastError = null;
    }
  }

  public recordFailure(keyId: number, status: KeyStatus, errorMessage: string): void {
    const target = this.keys.find((k) => k.id === keyId);
    if (target) {
      target.lastUsed = Date.now();
      target.status = status;
      target.lastError = errorMessage;
    }
  }

  /**
   * 利用 Tavily 官方 GET /usage 接口进行 100% 零扣费健康测活与真实余额拉取！
   */
  public async probeKey(item: KeyItem): Promise<KeyStatus> {
    const startTime = Date.now();
    try {
      const response = await fetch('https://api.tavily.com/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${item.rawKey}`,
        },
      });
      const latency = Date.now() - startTime;
      item.latency = latency;
      item.lastUsed = Date.now();

      if (response.ok) {
        const data: any = await response.json();
        const keyUsage = data?.key?.usage ?? data?.account?.usage ?? 0;
        const keyLimit = data?.key?.limit ?? data?.account?.limit ?? 1000;
        const planType = data?.account?.plan ?? 'free';

        item.usage = keyUsage;
        item.limit = keyLimit;
        item.plan = planType;

        // 如果已用点数达到了上限，自动标记为已耗尽 (exhausted)
        if (typeof keyLimit === 'number' && keyLimit > 0 && keyUsage >= keyLimit) {
          item.status = 'exhausted';
          item.lastError = `月度额度已用尽 (${keyUsage}/${keyLimit})`;
        } else {
          item.status = 'active';
          item.lastError = null;
        }
      } else if (response.status === 401) {
        item.status = 'invalid';
        item.lastError = 'Invalid API key (401)';
      } else if (response.status === 402 || response.status === 432) {
        item.status = 'exhausted';
        item.lastError = 'Payment Required (402/432)';
      } else {
        item.status = 'active';
      }
    } catch (e: any) {
      item.latency = Date.now() - startTime;
      item.lastError = e?.message || 'Usage probe failed';
    }
    return item.status;
  }

  /**
   * 并发对所有 Key 执行免费额度刷新与测活
   */
  public async probeAll(): Promise<void> {
    await Promise.all(this.keys.map((k) => this.probeKey(k)));
  }

  /**
   * 输出看板统计信息
   */
  public getStats(): PoolStats {
    let active = 0;
    let exhausted = 0;
    let invalid = 0;
    let totalUsage = 0;
    let totalLimit = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const k of this.keys) {
      if (k.status === 'active') active++;
      else if (k.status === 'exhausted') exhausted++;
      else if (k.status === 'invalid') invalid++;

      if (typeof k.usage === 'number') totalUsage += k.usage;
      if (typeof k.limit === 'number') totalLimit += k.limit;
      if (typeof k.latency === 'number' && k.latency > 0) {
        latencySum += k.latency;
        latencyCount++;
      }
    }

    const avgLatency = latencyCount > 0 ? Math.round(latencySum / latencyCount) : null;

    return {
      totalKeys: this.keys.length,
      activeKeys: active,
      exhaustedKeys: exhausted,
      invalidKeys: invalid,
      totalUsage,
      totalLimit,
      avgLatency,
      keys: this.keys.map((k) => ({
        id: k.id,
        maskedKey: k.maskedKey,
        status: k.status,
        usage: k.usage,
        limit: k.limit,
        plan: k.plan,
        latency: k.latency,
        lastUsed: k.lastUsed ? new Date(k.lastUsed).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : null,
        lastError: k.lastError,
      })),
    };
  }
}
