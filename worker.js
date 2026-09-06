/**
 * Tavily Hub - 极简单文件版 (Zero-Dependency Single File)
 * 
 * 部署方式：直接全选复制本文件全部代码，粘贴到 Cloudflare Workers 网页控制台的“快速编辑”中保存即可！
 * 无需安装 Node.js，无需 Wrangler CLI，开箱即用。
 */

// ============================================================================
// 1. 内存 Key 池与健康/月度额度状态管理
// ============================================================================

class TavilyKeyPoolManager {
  constructor() {
    this.keys = [];
    this.rawConfig = '';
    this.currentIndex = 0;
  }

  maskKey(key) {
    if (!key || key.length < 8) return '****';
    return `${key.slice(0, 8)}••••${key.slice(-4)}`;
  }

  sync(rawConfig) {
    const trimmed = (rawConfig || '').trim();
    if (trimmed === this.rawConfig) return;

    this.rawConfig = trimmed;
    const incoming = trimmed
      .split(/[\n,;]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 5);

    const oldMap = new Map();
    for (const item of this.keys) {
      oldMap.set(item.rawKey, item);
    }

    this.keys = incoming.map((k, index) => {
      const existing = oldMap.get(k);
      if (existing) return { ...existing, id: index + 1 };
      return {
        id: index + 1,
        rawKey: k,
        maskedKey: this.maskKey(k),
        status: 'active', // 'active' | 'exhausted' | 'invalid'
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

  getNextKey() {
    if (this.keys.length === 0) return null;
    const candidates = this.keys.filter((k) => k.status === 'active');
    const targetPool = candidates.length > 0 ? candidates : this.keys;

    this.currentIndex = (this.currentIndex + 1) % targetPool.length;
    return targetPool[this.currentIndex];
  }

  recordSuccess(id) {
    const target = this.keys.find((k) => k.id === id);
    if (target) {
      target.lastUsed = Date.now();
      target.status = 'active';
      target.lastError = null;
    }
  }

  recordFailure(id, status, errorMsg) {
    const target = this.keys.find((k) => k.id === id);
    if (target) {
      target.lastUsed = Date.now();
      target.status = status;
      target.lastError = errorMsg;
    }
  }

  /**
   * 利用 Tavily 官方 GET /usage 接口进行 100% 零扣费健康测活与真实余额拉取！
   */
  async probeKey(item) {
    const startTime = Date.now();
    try {
      const res = await fetch('https://api.tavily.com/usage', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${item.rawKey}` },
      });
      const latency = Date.now() - startTime;
      item.latency = latency;
      item.lastUsed = Date.now();

      if (res.ok) {
        const data = await res.json();
        const keyUsage = data?.key?.usage ?? data?.account?.usage ?? 0;
        const keyLimit = data?.key?.limit ?? data?.account?.limit ?? 1000;
        const planType = data?.account?.plan ?? 'free';

        item.usage = keyUsage;
        item.limit = keyLimit;
        item.plan = planType;

        if (typeof keyLimit === 'number' && keyLimit > 0 && keyUsage >= keyLimit) {
          item.status = 'exhausted';
          item.lastError = `月度额度已用尽 (${keyUsage}/${keyLimit})`;
        } else {
          item.status = 'active';
          item.lastError = null;
        }
      } else if (res.status === 401) {
        item.status = 'invalid';
        item.lastError = 'Invalid API key (401)';
      } else if (res.status === 402 || res.status === 432) {
        item.status = 'exhausted';
        item.lastError = 'Payment Required (402/432)';
      } else {
        item.status = 'active';
      }
    } catch (e) {
      item.latency = Date.now() - startTime;
      item.lastError = e?.message || 'Check failed';
    }
  }

  async probeAll() {
    await Promise.all(this.keys.map((k) => this.probeKey(k)));
  }

  getStats() {
    let active = 0, exhausted = 0, invalid = 0;
    let totalUsage = 0, totalLimit = 0;
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

const globalPool = new TavilyKeyPoolManager();

// ============================================================================
// 2. Uptime 状态看板页面 HTML 渲染器
// ============================================================================

function renderStatusPageHTML(stats, token) {
  const remainTotal = stats.totalLimit > 0 ? Math.max(0, stats.totalLimit - stats.totalUsage) : '-';
  const avgLatencyText = stats.avgLatency ? `${stats.avgLatency}ms` : '--';

  const cards = stats.keys
    .map((k) => {
      let badge = 'badge-active', text = '正常活跃', dot = '#10b981';
      let statusText = k.lastUsed ? '🟢 响应正常' : '🟢 正常就绪', statusValClass = 'success-val';
      if (k.status === 'exhausted') {
        badge = 'badge-exhausted'; text = '额度已用尽'; dot = '#f59e0b';
        statusText = '🟡 额度耗尽'; statusValClass = 'warning-val';
      } else if (k.status === 'invalid') {
        badge = 'badge-invalid'; text = '失效/错误 (401)'; dot = '#ef4444';
        statusText = '🔴 密钥失效'; statusValClass = 'danger-val';
      }

      let progressPercent = 0;
      let progressColor = 'var(--success)';
      let quotaText = '尚未同步额度（可点击右上角测活）';

      if (typeof k.usage === 'number' && typeof k.limit === 'number' && k.limit > 0) {
        progressPercent = Math.min(100, Math.round((k.usage / k.limit) * 100));
        const r = Math.max(0, k.limit - k.usage);
        quotaText = `已用 ${k.usage} / ${k.limit} 点 · 剩余 ${r} 点 (${progressPercent}%) · 计划: ${k.plan || 'free'}`;
        if (progressPercent > 80) progressColor = 'var(--danger)';
        else if (progressPercent > 50) progressColor = 'var(--warning)';
      }

      let latencyDisplay = '--';
      let latencyClass = '';
      if (typeof k.latency === 'number' && k.latency > 0) {
        latencyDisplay = `${k.latency}ms`;
        if (k.latency < 300) latencyClass = 'success-val';
        else if (k.latency < 800) latencyClass = 'warning-val';
        else latencyClass = 'danger-val';
      }

      return `
        <div class="key-card">
          <div class="key-header">
            <div class="key-title">
              <span class="status-dot" style="background:${dot};"></span>
              <span class="key-name">Key #${k.id}</span>
              <code class="key-mono">${k.maskedKey}</code>
            </div>
            <span class="badge ${badge}">${text}</span>
          </div>

          <div class="quota-box">
            <div class="quota-meta">
              <span>📊 月度点数消耗</span>
              <span class="quota-desc">${quotaText}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${progressPercent}%; background: ${progressColor};"></div>
            </div>
          </div>

          <div class="key-meta">
            <div class="meta-item"><span class="meta-label">测活状态</span><span class="meta-val ${statusValClass}">${statusText}</span></div>
            <div class="meta-item"><span class="meta-label">测活延迟</span><span class="meta-val ${latencyClass}">${latencyDisplay}</span></div>
            <div class="meta-item"><span class="meta-label">最近测活</span><span class="meta-val">${k.lastUsed || '尚未测活'}</span></div>
          </div>
          ${k.lastError ? `<div class="key-error-msg">⚠️ ${k.lastError}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tavily Hub · 状态大盘与额度监控</title>
  <style>
    :root {
      --bg: #090d16; --card-bg: #131b2e; --card-hover: #19233c; --border: #202b42;
      --text: #f8fafc; --text-muted: #94a3b8; --primary: #0ea5e9; --primary-hover: #0284c7;
      --success: #10b981; --warning: #f59e0b; --danger: #ef4444; --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 32px 16px; line-height: 1.5; }
    .container { max-width: 880px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo-badge { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #0ea5e9, #38bdf8); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: #032b43; }
    h1 { font-size: 20px; font-weight: 700; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .btn { background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .stat-val { font-size: 22px; font-weight: 700; }
    .stat-val.active { color: var(--success); }
    .stat-val.exhausted { color: var(--warning); }
    .stat-val.invalid { color: var(--danger); }
    .stat-val.credits { color: #38bdf8; }
    .section-title { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .keys-container { display: flex; flex-direction: column; gap: 12px; }
    .key-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; }
    .key-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .key-title { display: flex; align-items: center; gap: 10px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .key-name { font-weight: 600; font-size: 14px; }
    .key-mono { background: #090d16; border: 1px solid var(--border); padding: 2px 8px; border-radius: 6px; font-size: 12px; font-family: monospace; color: #cbd5e1; }
    .badge { font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-exhausted { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-invalid { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

    .quota-box { background: #090d16; border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
    .quota-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; flex-wrap: wrap; gap: 4px; }
    .quota-desc { color: var(--text-muted); font-weight: 500; }
    .progress-track { width: 100%; height: 6px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }

    .key-meta { display: flex; gap: 24px; flex-wrap: wrap; }
    .meta-item { display: flex; flex-direction: column; gap: 2px; min-width: 100px; }
    .meta-label { font-size: 11px; color: var(--text-muted); }
    .meta-val { font-size: 13px; font-weight: 500; }
    .success-val { color: var(--success); }
    .warning-val { color: var(--warning); }
    .danger-val { color: var(--danger); }
    .key-error-msg { margin-top: 10px; padding: 6px 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); font-size: 12px; color: #fca5a5; }

    /* Live API Playground */
    .playground-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; margin-top: 24px; }
    .playground-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
    .playground-title { font-weight: 600; font-size: 15px; }
    .playground-sub { font-size: 12px; color: var(--text-muted); }
    .playground-input-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .playground-input { flex: 1; min-width: 260px; background: #090d16; border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 13px; outline: none; transition: border-color 0.2s; }
    .playground-input:focus { border-color: var(--primary); }
    .playground-input::placeholder { color: #64748b; opacity: 1; }
    .search-result-area { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px; font-size: 13px; }
    .result-header { color: var(--success); font-weight: 600; margin-bottom: 10px; }
    .result-error { color: var(--danger); font-weight: 500; }
    .result-item { background: #090d16; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
    .result-title a { color: #38bdf8; font-weight: 600; text-decoration: none; font-size: 14px; }
    .result-title a:hover { text-decoration: underline; }
    .result-url { color: var(--text-muted); font-size: 11px; margin: 2px 0 6px; word-break: break-all; }
    .result-snippet { color: #cbd5e1; line-height: 1.4; font-size: 12px; }
    .hidden { display: none !important; }

    footer { margin-top: 36px; text-align: center; font-size: 12px; color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">🔍</div>
        <div>
          <h1>Tavily Hub 状态大盘</h1>
          <div class="subtitle">实时负载均衡与月度额度监控</div>
        </div>
      </div>
      <button id="checkBtn" class="btn" onclick="checkAll()">⚡ 一键免费测活与刷新余额</button>
    </header>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">总密钥数</div><div class="stat-val" id="statTotal">${stats.totalKeys}</div></div>
      <div class="stat-card"><div class="stat-label">活跃存活</div><div class="stat-val active" id="statActive">${stats.activeKeys}</div></div>
      <div class="stat-card"><div class="stat-label">额度耗尽</div><div class="stat-val exhausted" id="statExhausted">${stats.exhaustedKeys}</div></div>
      <div class="stat-card"><div class="stat-label">总池子剩余点数</div><div class="stat-val credits" id="statRemain">${remainTotal}</div></div>
      <div class="stat-card"><div class="stat-label">平均测活延迟</div><div class="stat-val" id="statLatency">${avgLatencyText}</div></div>
    </div>

    <div class="section-title">API 密钥健康与剩余点数</div>
    <div class="keys-container" id="keysList">${cards}</div>

    <!-- 实时 API 测试沙盒 -->
    <div class="playground-card">
      <div class="playground-header">
        <div class="playground-title">🧪 实时 Tavily API 搜索测试沙盒</div>
        <div class="playground-sub">直接向网关发送真实搜索请求，测试连通性并实时观察耗时</div>
      </div>
      <div class="playground-input-group">
        <input id="searchQueryInput" class="playground-input" type="text" placeholder="输入搜索关键词测试连通性，例如：人工智能、开源项目、科技资讯..." value="" />
        <button id="searchTestBtn" class="btn" onclick="runLiveSearch()">🚀 发送真实 Tavily 搜索</button>
      </div>
      <div id="searchResultArea" class="search-result-area hidden"></div>
    </div>

    <footer>Tavily-Hub · Zero-Config High Availability Gateway</footer>
  </div>

  <script>
    // 页面载入瞬间抹去 URL 中的 ?token=... 防止截图泄密
    const secretToken = ${JSON.stringify(token)};
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    function renderStatsUI(stats) {
      const remain = stats.totalLimit > 0 ? Math.max(0, stats.totalLimit - stats.totalUsage) : '-';
      const avgLat = stats.avgLatency ? stats.avgLatency + 'ms' : '--';

      document.getElementById('statTotal').textContent = stats.totalKeys;
      document.getElementById('statActive').textContent = stats.activeKeys;
      document.getElementById('statExhausted').textContent = stats.exhaustedKeys;
      document.getElementById('statRemain').textContent = remain;
      document.getElementById('statLatency').textContent = avgLat;

      const container = document.getElementById('keysList');
      container.innerHTML = stats.keys.map(k => {
        let badge = 'badge-active', text = '正常活跃', dot = '#10b981';
        let statusText = k.lastUsed ? '🟢 响应正常' : '🟢 正常就绪', statusValClass = 'success-val';
        if (k.status === 'exhausted') {
          badge = 'badge-exhausted'; text = '额度已用尽'; dot = '#f59e0b';
          statusText = '🟡 额度耗尽'; statusValClass = 'warning-val';
        } else if (k.status === 'invalid') {
          badge = 'badge-invalid'; text = '失效/错误 (401)'; dot = '#ef4444';
          statusText = '🔴 密钥失效'; statusValClass = 'danger-val';
        }

        let progressPercent = 0;
        let progressColor = 'var(--success)';
        let quotaText = '尚未同步额度（可点击右上角测活）';

        if (typeof k.usage === 'number' && typeof k.limit === 'number' && k.limit > 0) {
          progressPercent = Math.min(100, Math.round((k.usage / k.limit) * 100));
          const r = Math.max(0, k.limit - k.usage);
          quotaText = \`已用 \${k.usage} / \${k.limit} 点 · 剩余 \${r} 点 (\${progressPercent}%) · 计划: \${k.plan || 'free'}\`;
          if (progressPercent > 80) progressColor = 'var(--danger)';
          else if (progressPercent > 50) progressColor = 'var(--warning)';
        }

        let latencyDisplay = '--';
        let latencyClass = '';
        if (typeof k.latency === 'number' && k.latency > 0) {
          latencyDisplay = k.latency + 'ms';
          if (k.latency < 300) latencyClass = 'success-val';
          else if (k.latency < 800) latencyClass = 'warning-val';
          else latencyClass = 'danger-val';
        }

        return \`
          <div class="key-card">
            <div class="key-header">
              <div class="key-title">
                <span class="status-dot" style="background:\${dot};"></span>
                <span class="key-name">Key #\${k.id}</span>
                <code class="key-mono">\${k.maskedKey}</code>
              </div>
              <span class="badge \${badge}">\${text}</span>
            </div>

            <div class="quota-box">
              <div class="quota-meta">
                <span>📊 月度点数消耗</span>
                <span class="quota-desc">\${quotaText}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: \${progressPercent}%; background: \${progressColor};"></div>
              </div>
            </div>

            <div class="key-meta">
              <div class="meta-item"><span class="meta-label">测活状态</span><span class="meta-val \${statusValClass}">\${statusText}</span></div>
              <div class="meta-item"><span class="meta-label">测活延迟</span><span class="meta-val \${latencyClass}">\${latencyDisplay}</span></div>
              <div class="meta-item"><span class="meta-label">最近测活</span><span class="meta-val">\${k.lastUsed || '尚未测活'}</span></div>
            </div>
            \${k.lastError ? \`<div class="key-error-msg">⚠️ \${k.lastError}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }

    // 一键健康测活与免费余额同步（0 扣费）
    async function checkAll() {
      const btn = document.getElementById('checkBtn');
      btn.disabled = true;
      btn.textContent = '⏳ 正在免费拉取真实额度与测活...';
      try {
        const res = await fetch('/api/check?token=' + encodeURIComponent(secretToken), { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.stats) {
            renderStatsUI(data.stats);
          }
        } else {
          alert('测活请求失败');
        }
      } catch (e) {
        alert('测活异常: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ 一键免费测活与刷新余额';
      }
    }

    // 实时 API 测试沙盒
    async function runLiveSearch() {
      const input = document.getElementById('searchQueryInput');
      const btn = document.getElementById('searchTestBtn');
      const area = document.getElementById('searchResultArea');
      const q = input.value.trim();
      if (!q) return alert('请输入搜索关键词');

      btn.disabled = true;
      btn.textContent = '⏳ 正在向 Tavily 请求真实搜索...';
      area.classList.remove('hidden');
      area.innerHTML = '<div style="color:var(--text-muted); padding:10px 0;">正在轮询可用 Key 发送请求并获取实时网页结果...</div>';

      const startTime = performance.now();
      try {
        const res = await fetch('/search?token=' + encodeURIComponent(secretToken), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-status-token': secretToken
          },
          body: JSON.stringify({
            query: q,
            max_results: 2,
            search_depth: 'basic'
          })
        });
        const latency = Math.round(performance.now() - startTime);
        const data = await res.json();

        if (res.ok && data.results) {
          let html = \`<div class="result-header">✅ Tavily 官方搜索成功！耗时 <b>\${latency}ms</b>，返回 \${data.results.length} 条真实数据：</div>\`;
          html += data.results.map((r, i) => \`
            <div class="result-item">
              <div class="result-title"><a href="\${r.url}" target="_blank">\${i+1}. \${r.title || r.url}</a></div>
              <div class="result-url">\${r.url}</div>
              <div class="result-snippet">\${r.content || '（无正文内容）'}</div>
            </div>
          \`).join('');
          area.innerHTML = html;

          // 自动刷新指标与剩余点数
          const statusRes = await fetch('/api/status?token=' + encodeURIComponent(secretToken));
          if (statusRes.ok) {
            const newStats = await statusRes.json();
            renderStatsUI(newStats);
          }
        } else {
          area.innerHTML = \`<div class="result-error">❌ 搜索失败 (\${res.status}): \${JSON.stringify(data)}</div>\`;
        }
      } catch (err) {
        area.innerHTML = \`<div class="result-error">❌ 网络请求异常: \${err.message}</div>\`;
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 发送真实 Tavily 搜索';
      }
    }
  </script>
</body>
</html>`;
}

// ============================================================================
// 3. Worker 主入口 (支持 Cloudflare 控制台直接在线粘贴)
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    globalPool.sync(env.TAVILY_KEYS);

    const url = new URL(request.url);
    const pathname = url.pathname;
    const expectedToken = env.STATUS_TOKEN || 'admin';
    const queryToken = url.searchParams.get('token') || url.searchParams.get('key');
    const statusTokenHeader = request.headers.get('x-status-token');
    const isStatusAdmin = (queryToken && queryToken === expectedToken) || 
                          (statusTokenHeader && statusTokenHeader === expectedToken);

    // 1. 路由：Uptime 状态大盘 (/status)
    if (pathname === '/status') {
      if (!queryToken || queryToken !== expectedToken) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(renderStatusPageHTML(globalPool.getStats(), queryToken), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 2. 路由：一键免费健康测活与余额同步 (/api/check)
    if (pathname === '/api/check') {
      if (!queryToken || queryToken !== expectedToken) {
        return new Response('Not Found', { status: 404 });
      }
      await globalPool.probeAll();
      return new Response(JSON.stringify({ success: true, stats: globalPool.getStats() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. 路由：JSON 监控数据接口 (/api/status)
    if (pathname === '/api/status') {
      if (!queryToken || queryToken !== expectedToken) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(JSON.stringify(globalPool.getStats()), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 解析请求体（以备重试与 body 内 api_key 字段替换）
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    let bodyJson = null;
    let rawBodyBuffer = null;

    if (hasBody) {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          bodyJson = await request.json();
        } catch {
          rawBodyBuffer = await request.arrayBuffer();
        }
      } else {
        rawBodyBuffer = await request.arrayBuffer();
      }
    }

    // 4. 客户端可选鉴权检查 (PROXY_TOKEN)
    const cleanToken = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.trim().replace(/^["']|["']$/g, '');
    };

    const expectedProxyToken = cleanToken(env.PROXY_TOKEN);
    if (expectedProxyToken.length > 0) {
      const authHeader = request.headers.get('authorization') || '';
      const bearerToken = cleanToken(authHeader.replace(/^Bearer\s+/i, ''));
      const clientAuth = cleanToken(
        request.headers.get('x-api-key') || 
        request.headers.get('x-tavily-api-key') || 
        (bearerToken.length > 0 ? bearerToken : null) ||
        (bodyJson && typeof bodyJson.api_key === 'string' ? bodyJson.api_key : null)
      );

      if (clientAuth !== expectedProxyToken && !isStatusAdmin) {
        const mask = (t) => t ? `${t.slice(0, 4)}...${t.slice(-4)} (len:${t.length})` : 'none';
        return new Response(JSON.stringify({ 
          error: 'Unauthorized', 
          message: 'Invalid or missing proxy access token',
          hint: clientAuth 
            ? `Token mismatch. Received: ${mask(clientAuth)}, Expected: ${mask(expectedProxyToken)}` 
            : 'No token found in Authorization header, x-api-key, x-tavily-api-key, or request body'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 自动兼容客户端路径（自动剥离 /v1 前缀与末尾多余斜杠）
    let normalizedPath = pathname;
    if (normalizedPath.startsWith('/v1/')) {
      normalizedPath = normalizedPath.replace(/^\/v1\//, '/');
    }
    if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    // 5. 核心：透明反向代理（Header/Body 双重替换，401/402 自动重试，零拷贝）
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      const keyItem = globalPool.getNextKey();
      if (!keyItem) {
        return new Response(JSON.stringify({ error: 'Service Unavailable', message: 'No active Tavily keys available' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 净化上游查询参数
      const upstreamParams = new URLSearchParams(url.search);
      upstreamParams.delete('token');
      upstreamParams.delete('key');
      const queryStr = upstreamParams.toString() ? '?' + upstreamParams.toString() : '';
      const upstreamUrl = new URL(normalizedPath + queryStr, 'https://api.tavily.com');

      const upstreamHeaders = new Headers(request.headers);
      upstreamHeaders.delete('x-status-token');
      upstreamHeaders.delete('x-api-key');
      upstreamHeaders.delete('x-tavily-api-key');
      // 注入当前轮询的 Tavily 密钥
      upstreamHeaders.set('Authorization', `Bearer ${keyItem.rawKey}`);
      upstreamHeaders.delete('host');

      // 如果客户端请求体里带了 api_key 字段，同步替换为选中的 key
      let finalBody = null;
      if (bodyJson) {
        const cloned = { ...bodyJson };
        if ('api_key' in cloned) {
          cloned.api_key = keyItem.rawKey;
        }
        finalBody = JSON.stringify(cloned);
      } else {
        finalBody = rawBodyBuffer;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒超时保护

        const upstreamRes = await fetch(upstreamUrl.toString(), {
          method: request.method,
          headers: upstreamHeaders,
          body: finalBody,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // 401（Key 失效）或 402/432（额度耗尽）：熔断并切换下一个 Key 重试
        if (upstreamRes.status === 401) {
          globalPool.recordFailure(keyItem.id, 'invalid', 'Tavily 401: Invalid API Key');
          attempts++;
          continue;
        }

        if (upstreamRes.status === 402 || upstreamRes.status === 432) {
          globalPool.recordFailure(keyItem.id, 'exhausted', 'Tavily 402/432: Credits Limit Reached');
          attempts++;
          continue;
        }

        // 调用成功
        if (upstreamRes.ok) {
          globalPool.recordSuccess(keyItem.id);
        }

        const resHeaders = new Headers(upstreamRes.headers);
        resHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: resHeaders,
        });
      } catch (err) {
        console.error(`[Tavily-Hub] Attempt ${attempts + 1} failed:`, err);
        attempts++;
      }
    }

    return new Response(JSON.stringify({ error: 'Bad Gateway', message: 'All retries failed with available keys' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
