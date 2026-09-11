import { PoolStats } from './types';

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
}

/**
 * 渲染 Tavily Hub Uptime 状态大盘 HTML
 * 亮点特性：
 * 1. 独家支持每个 Key 的「月度额度真实进度条」与套餐类型（通过 GET /usage 零扣费官方拉取）
 * 2. 真实网络延迟（ms）探测与健康状态检测，彻底杜绝无状态 Edge 漂移与虚假 0 次统计
 * 3. 汇总大盘显示总池子可用点数与平均测活延迟
 * 4. 首次载入自动静默测活拉取真实余额，页面载入自动 history.replaceState 洗白敏感 token
 * 5. 内置实时 API 测试沙盒，支持直接发起真实搜索并观察链路延迟
 * 6. 全程 AJAX 平滑增量渲染，0 闪烁，不重载网页
 */
export function renderStatusPage(stats: PoolStats, token: string): string {
  const remainingTotal = stats.totalLimit > 0 ? Math.max(0, stats.totalLimit - stats.totalUsage) : '-';
  const avgLatencyText = stats.avgLatency ? `${stats.avgLatency}ms` : '--';

  const renderKeyCard = (k: PoolStats['keys'][0]) => {
    let badgeClass = 'badge-active';
    let badgeText = '正常活跃';
    let dotColor = 'var(--success)';
    let statusText = k.lastUsed ? '🟢 响应正常' : '🟢 正常就绪';
    let statusValClass = 'success-val';

    if (k.status === 'exhausted') {
      badgeClass = 'badge-exhausted';
      badgeText = '额度已用尽';
      dotColor = 'var(--warning)';
      statusText = '🟡 额度耗尽';
      statusValClass = 'warning-val';
    } else if (k.status === 'invalid') {
      badgeClass = 'badge-invalid';
      badgeText = '失效/错误 (401)';
      dotColor = 'var(--danger)';
      statusText = '🔴 密钥失效';
      statusValClass = 'danger-val';
    }

    // 计算额度进度百分比
    let progressPercent = 0;
    let progressColor = 'var(--success)';
    let quotaText = '尚未同步额度（可点击右上角测活）';

    if (typeof k.usage === 'number' && typeof k.limit === 'number' && k.limit > 0) {
      progressPercent = Math.min(100, Math.round((k.usage / k.limit) * 100));
      const remain = Math.max(0, k.limit - k.usage);
      quotaText = `已用 ${k.usage} / ${k.limit} 点 · 剩余 ${remain} 点 (${progressPercent}%) · 计划: ${k.plan || 'free'}`;
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
            <span class="status-dot" style="background: ${dotColor};"></span>
            <span class="key-name">Key #${k.id}</span>
            <code class="key-mono">${escapeHtml(k.maskedKey)}</code>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>

        <!-- 真实月度额度进度条 (Tavily 官方零扣费直连拉取) -->
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
          <div class="meta-item">
            <span class="meta-label">测活状态</span>
            <span class="meta-val ${statusValClass}">${statusText}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">测活延迟</span>
            <span class="meta-val ${latencyClass}">${latencyDisplay}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">最近测活</span>
            <span class="meta-val">${k.lastUsed || '尚未测活'}</span>
          </div>
        </div>
        ${k.lastError ? `<div class="key-error-msg">⚠️ ${escapeHtml(k.lastError)}</div>` : ''}
      </div>
    `;
  };

  const keysHtml = stats.keys.map(renderKeyCard).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tavily Hub · 状态大盘与额度监控</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #131b2e;
      --card-hover: #19233c;
      --border: #202b42;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #0ea5e9;
      --primary-hover: #0284c7;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container { max-width: 900px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0ea5e9, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 20px;
      color: #032b43;
    }
    h1 { font-size: 20px; font-weight: 700; }
    .subtitle { font-size: 12px; color: var(--text-muted); }
    .btn {
      background: var(--primary);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    /* Overview Stats */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .stat-val { font-size: 22px; font-weight: 700; }
    .stat-val.active { color: var(--success); }
    .stat-val.exhausted { color: var(--warning); }
    .stat-val.invalid { color: var(--danger); }
    .stat-val.credits { color: #38bdf8; }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .keys-container { display: flex; flex-direction: column; gap: 12px; }
    .key-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
    }
    .key-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .key-title { display: flex; align-items: center; gap: 10px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    .key-name { font-weight: 600; font-size: 14px; }
    .key-mono {
      background: #090d16;
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
      color: #cbd5e1;
    }
    .badge {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    .badge-active { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge-exhausted { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-invalid { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

    /* Quota Progress Bar */
    .quota-box {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }
    .quota-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
      flex-wrap: wrap;
      gap: 4px;
    }
    .quota-desc { color: var(--text-muted); font-weight: 500; }
    .progress-track {
      width: 100%;
      height: 6px;
      background: #1e293b;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
    }

    .key-meta { display: flex; gap: 24px; flex-wrap: wrap; }
    .meta-item { display: flex; flex-direction: column; gap: 2px; min-width: 100px; }
    .meta-label { font-size: 11px; color: var(--text-muted); }
    .meta-val { font-size: 13px; font-weight: 500; }
    .success-val { color: var(--success); }
    .warning-val { color: var(--warning); }
    .danger-val { color: var(--danger); }
    .key-error-msg {
      margin-top: 10px;
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      font-size: 12px;
      color: #fca5a5;
    }

    /* Live API Playground */
    .playground-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px;
      margin-top: 24px;
    }
    .playground-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .playground-title { font-weight: 600; font-size: 15px; }
    .playground-sub { font-size: 12px; color: var(--text-muted); }
    .playground-input-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .playground-input {
      flex: 1;
      min-width: 260px;
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .playground-input:focus { border-color: var(--primary); }
    .playground-input::placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input::-webkit-input-placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input::-moz-placeholder { color: #e2e8f0 !important; opacity: 1 !important; }
    .playground-input:-ms-input-placeholder { color: #e2e8f0 !important; }
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
      <div class="stat-card"><div class="stat-label">总池子剩余点数</div><div class="stat-val credits" id="statRemain">${remainingTotal}</div></div>
      <div class="stat-card"><div class="stat-label">平均测活延迟</div><div class="stat-val" id="statLatency">${avgLatencyText}</div></div>
    </div>

    <div class="section-title">API 密钥健康与剩余点数</div>
    <div class="keys-container" id="keysList">${keysHtml}</div>

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
    // 防注入：JSON.stringify 不转义 "<"，手动改写为 unicode 转义防止突破 script 标签
    const secretToken = ${JSON.stringify(token).replace(/</g, '\\u003c')};

    function escHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
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
        let badge = 'badge-active', text = '正常活跃', dot = 'var(--success)';
        let statusText = k.lastUsed ? '🟢 响应正常' : '🟢 正常就绪', statusValClass = 'success-val';
        if (k.status === 'exhausted') {
          badge = 'badge-exhausted'; text = '额度已用尽'; dot = 'var(--warning)';
          statusText = '🟡 额度耗尽'; statusValClass = 'warning-val';
        } else if (k.status === 'invalid') {
          badge = 'badge-invalid'; text = '失效/错误 (401)'; dot = 'var(--danger)';
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
                <code class="key-mono">\${escHtml(k.maskedKey)}</code>
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
            \${k.lastError ? \`<div class="key-error-msg">⚠️ \${escHtml(k.lastError)}</div>\` : ''}
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
