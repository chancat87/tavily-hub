import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { KeyPool } from './pool';
import { renderStatusPage } from './status-page';

const app = new Hono<{ Bindings: Env }>();

// 1. 全局跨域支持
app.use('*', cors());

// 2. 状态同步钩子：每次请求确保环境变量中的 Key 与内存池保持同步
app.use('*', async (c, next) => {
  const pool = KeyPool.getInstance();
  pool.syncKeys(c.env.TAVILY_KEYS);
  await next();
});

// 3. Uptime 状态看板路由（隐蔽免密安全设计：带 token 访问，失败直接 404 装死）
app.get('/status', (c) => {
  const expectedToken = c.env.STATUS_TOKEN || 'admin';
  const queryToken = c.req.query('token') || c.req.query('key');

  if (!queryToken || queryToken !== expectedToken) {
    return c.text('Not Found', 404);
  }

  const pool = KeyPool.getInstance();
  const html = renderStatusPage(pool.getStats(), queryToken);
  return c.html(html);
});

// 4. 一键免费健康测活与余额同步接口
app.post('/api/check', async (c) => {
  const expectedToken = c.env.STATUS_TOKEN || 'admin';
  const queryToken = c.req.query('token') || c.req.query('key');

  if (!queryToken || queryToken !== expectedToken) {
    return c.text('Not Found', 404);
  }

  const pool = KeyPool.getInstance();
  await pool.probeAll();
  return c.json({ success: true, stats: pool.getStats() });
});

// 5. JSON 格式状态监控接口（便于接入 UptimeRobot 等外部监控告警）
app.get('/api/status', (c) => {
  const expectedToken = c.env.STATUS_TOKEN || 'admin';
  const queryToken = c.req.query('token') || c.req.query('key');

  if (!queryToken || queryToken !== expectedToken) {
    return c.text('Not Found', 404);
  }

  const pool = KeyPool.getInstance();
  return c.json(pool.getStats());
});

// 6. 核心：透明反向代理（全接口透传 + Header/Body 双重 Key 替换 + 401/402 自动换 Key 重试）
app.all('*', async (c) => {
  const pool = KeyPool.getInstance();
  const rawReq = c.req.raw;
  const url = new URL(rawReq.url);
  const expectedStatusToken = c.env.STATUS_TOKEN || 'admin';
  const queryToken = c.req.query('token') || c.req.query('key');
  const statusTokenHeader = c.req.header('x-status-token');
  const isStatusAdmin = (queryToken && queryToken === expectedStatusToken) || 
                        (statusTokenHeader && statusTokenHeader === expectedStatusToken);

  // 解析请求体
  const hasBody = rawReq.method !== 'GET' && rawReq.method !== 'HEAD';
  let bodyJson: Record<string, any> | null = null;
  let rawBodyBuffer: ArrayBuffer | null = null;

  if (hasBody) {
    const contentType = rawReq.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        bodyJson = await rawReq.json();
      } catch {
        rawBodyBuffer = await rawReq.arrayBuffer();
      }
    } else {
      rawBodyBuffer = await rawReq.arrayBuffer();
    }
  }

  // （可选）客户端鉴权校验：如果配置了 PROXY_TOKEN，必须带上才能调用
  if (c.env.PROXY_TOKEN && c.env.PROXY_TOKEN.trim().length > 0) {
    const authHeader = c.req.header('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const clientKey = c.req.header('x-api-key')?.trim() || 
                      c.req.header('x-tavily-api-key')?.trim() ||
                      (bearerToken.length > 0 ? bearerToken : null) ||
                      (bodyJson && typeof bodyJson.api_key === 'string' ? bodyJson.api_key.trim() : null);

    if (clientKey !== c.env.PROXY_TOKEN.trim() && !isStatusAdmin) {
      return c.json({ error: 'Unauthorized', message: 'Invalid or missing proxy access token' }, 401);
    }
  }

  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    const keyItem = pool.getNextKey();
    if (!keyItem) {
      return c.json({ error: 'Service Unavailable', message: 'No active Tavily keys available' }, 503);
    }

    // 净化上游查询参数（剔除用于看板验证的内部 token/key 参数）
    const upstreamParams = new URLSearchParams(url.search);
    upstreamParams.delete('token');
    upstreamParams.delete('key');
    const queryStr = upstreamParams.toString() ? '?' + upstreamParams.toString() : '';
    const targetUrl = new URL(url.pathname + queryStr, 'https://api.tavily.com');

    // 构造发往 Tavily 官方的 Headers
    const upstreamHeaders = new Headers(rawReq.headers);
    upstreamHeaders.delete('x-status-token');
    upstreamHeaders.delete('x-api-key');
    // 注入当前轮询选中的 Tavily API Key
    upstreamHeaders.set('Authorization', `Bearer ${keyItem.rawKey}`);
    upstreamHeaders.delete('host');

    // 构造请求体：如果客户端是把 api_key 塞在 JSON Body 里的，同时替换 Body 中的 api_key
    let finalBody: BodyInit | null = null;
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
      const upstreamRes = await fetch(targetUrl.toString(), {
        method: rawReq.method,
        headers: upstreamHeaders,
        body: finalBody,
      });

      // 401（Key 失效）或 402/432（额度耗尽）：熔断并切换下一个 Key 重试
      if (upstreamRes.status === 401) {
        pool.recordFailure(keyItem.id, 'invalid', 'Tavily 401: Invalid API Key');
        attempts++;
        continue;
      }

      if (upstreamRes.status === 402 || upstreamRes.status === 432) {
        pool.recordFailure(keyItem.id, 'exhausted', 'Tavily 402/432: Credits Limit Reached');
        attempts++;
        continue;
      }

      // 请求成功
      if (upstreamRes.ok) {
        pool.recordSuccess(keyItem.id);
      }

      // 真正流式零拷贝透传
      const resHeaders = new Headers(upstreamRes.headers);
      resHeaders.set('access-control-allow-origin', '*');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: resHeaders,
      });
    } catch (err: any) {
      console.error(`[Tavily-Hub] Attempt ${attempts + 1} failed:`, err);
      attempts++;
    }
  }

  return c.json({ error: 'Bad Gateway', message: 'All retry attempts failed with available keys' }, 502);
});

export default app;
