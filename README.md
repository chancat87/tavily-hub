# 🔍 Tavily Hub (Tavily API 负载均衡网关与实时余额看板)

<p align="center">
  <b>高性能 · 零扣费余额看板 · 多 Key 轮询与熔断 · Header/Body 双兼容 · 零数据库依赖</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Cloudflare%20Workers-F38020?logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Deployment-Web%20Dashboard%20%7C%20Wrangler-blue" alt="Deploy">
  <img src="https://img.shields.io/badge/Zero--Dependency-100%25-brightgreen" alt="Zero-Dependency">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>

---

## 🌟 核心特性

- 📊 **独家「真实月度额度进度条」**：
  - 接入 Tavily 官方 `GET /usage` 接口，**一键测活 100% 免费，不扣除任何搜索点数**！
  - 精确展示每张 Key 的已用点数、剩余点数、百分比进度条与套餐类型（如 `已用 150 / 1000 点 · 剩余 850 点 (15%) · 计划: free`）。
- 🚀 **内存级无锁轮询**：摆脱任何数据库读写锁限制，Key 在 Worker 内存中原子轮询，**0ms 额外排队延迟**。
- 🔄 **智能自动故障转移（Failover）**：当某张 Key 遇到 `401`（Key 无效）或 `402/432`（点数用尽）时，网关在内存中即时标记下线，**自动无缝切换到下一张可用 Key 重试**，客户端完全无感。
- 🔌 **Header / Body 双重 Key 智能替换**：
  - 既支持标准的 HTTP Header `Authorization: Bearer <key>` 鉴权；
  - 也兼容各类老旧 Agent / LangChain 客户端在 JSON 请求体中发送 `{"api_key": "..."}`。
- 🛡️ **隐蔽免密 Uptime 状态大盘**：
  - 访问路径保护：`/status?token=你的密钥`，密码错误直接返回 **404 装死**。
  - **地址栏自动洗白**：页面加载后自动调用 `history.replaceState` 瞬间抹去 URL 中的密码，防截图泄密。
  - **内置实时搜索沙盒**：无需寻找客户端，在页面上直接输入关键词即可发起真实搜索并打印结果，调用计数实时跳动。
- 📦 **双模部署**：既支持 **Cloudflare 网页控制台直接全选粘贴（无需安装任何工具）**，也支持本地 **Wrangler CLI 工程化部署**。

---

## 🚀 部署方式一：Cloudflare 网页后台直接粘贴（最推荐 · 1 分钟上线）

**完全不需要安装 Node.js、Git 或任何命令行工具！**

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Workers 和 Pages**，点击 **创建应用程序** -> **创建 Worker**。
2. 命名（如 `tavily-hub`）后点击 **部署**。
3. 进入刚刚创建的 Worker，点击右上角的 **快速编辑（Quick Edit）**。
4. 打开本项目根目录下的 [`worker.js`](worker.js)，**全选复制全部代码，覆盖粘贴到网页编辑器中**，点击 **保存并部署**。
5. 返回 Worker 页面，进入 **设置 (Settings)** -> **变量和机密 (Variables and Secrets)**，添加以下环境变量：
   - `TAVILY_KEYS`：你的 Tavily API 密钥列表（以 `tvly-` 开头），多个密钥用逗号 `,` 隔开（例如：`tvly-key1,tvly-key2`）。
   - `STATUS_TOKEN`：你自定义的状态页访问密码（例如：`admin123`）。
   - `PROXY_TOKEN`（可选）：客户端调用接口时的鉴权保护密码；留空则对外直接可用。
6. **搞定！** 你的高可用负载均衡网关已经上线！

---

## 🛠️ 部署方式二：本地 Wrangler CLI 部署（适合开发者）

如果你习惯使用本地命令行与 Git：

1. **克隆项目并安装依赖**：
   ```bash
   git clone https://github.com/chancat87/tavily-hub.git
   cd tavily-hub
   npm install
   ```

2. **配置 `wrangler.toml`**：
   ```toml
   [vars]
   STATUS_TOKEN = "my_secret_token"
   TAVILY_KEYS = "tvly-key1,tvly-key2"
   PROXY_TOKEN = "" # 留空对外开放
   ```

3. **一键发布**：
   ```bash
   npm run deploy
   ```

---

## 💻 客户端接入示例

只需将官方 API 域名 `https://api.tavily.com` 替换为你自己的 Worker 域名即可！

### 1. Python (`tavily-python` 官方 SDK)

```python
from tavily import TavilyClient

# 初始化时将 api_key 与 base_url 指向你的 Worker 域名
tavily = TavilyClient(
    api_key="your_proxy_token_or_any_string", # 若配置了 PROXY_TOKEN 请填入，否则填任意字符串
)
# 将客户端默认请求地址覆盖为你的网关
tavily.client.base_url = "https://your-worker.workers.dev"

response = tavily.search(query="2026 AI developments", search_depth="basic")
print(response)
```

### 2. cURL 命令行验证

```bash
curl -X POST "https://your-worker.workers.dev/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_proxy_token" \
  -d '{"query": "Latest breakthroughs in quantum computing", "max_results": 2}'
```

### 3. JSON Body 传递 API Key 格式（LangChain / Dify 兼容）

```bash
curl -X POST "https://your-worker.workers.dev/search" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "your_proxy_token", "query": "OpenAI news", "max_results": 2}'
```

---

## 📊 监控看板使用方式

在浏览器访问：
```text
https://your-worker.workers.dev/status?token=你的STATUS_TOKEN
```

- **安全隐形**：直接访问 `/status` 或密码错误会返回 `404 Not Found`。
- **真实进度条**：点击右上角 **「⚡ 一键免费测活与刷新余额」**，Worker 会并发向官方拉取每个 Key 的真实月度已用点数与剩余额度，绘制进度条。
- **安心截图**：页面加载后，地址栏会自动抹去 `?token=...`，截取大盘分享给团队成员绝不泄密。
- **在线调试沙盒**：在页面底部直接输入关键词发起搜索，实时检验代理连通性并让成功计数动态递增。

---

## ⚙️ 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| `TAVILY_KEYS` | 是 | 无 | 待轮询的 Tavily API Key 列表（以 `tvly-` 开头），逗号分隔 |
| `STATUS_TOKEN` | 是 | `admin` | 查看 Uptime 监控看板的 URL 秘钥凭据 |
| `PROXY_TOKEN` | 否 | 空 | 客户端调用反代接口的保护秘钥；若配置，请求需带 Token |

---

## 📌 架构定位与容量/限制说明 (Capacity & Limitations)

本项目定位于**个人开发者与轻量自用场景**，核心追求**极致纯粹、零维护、零数据库/KV依赖**（无需绑定 Cloudflare 任何收费或复杂的持久化存储服务）。使用时请注意以下平台边界与设计考量：

### 1. 密钥容量与 Cloudflare 平台限制
- **建议配置规模**：**1 ~ 30 个 Key** 体验与稳定性最佳。
- **环境变量体积限制**：Cloudflare Workers 单个环境变量上限约为 **5 KB**（通过控制台录入），最多可容纳约 **100 ~ 130 个 Key** 的字符串长度。
- **免费版并发子请求上限（Subrequest Limit）**：
  - Cloudflare Workers 免费版规定单个请求发起的外部 `fetch`（子请求）**硬性上限为 50 次**。
  - 若在免费版 Workers 中填入了**超过 50 个 Key**，点击看板的「一键免费测活与刷新余额」时并发请求数会撞击平台阈值，触发 Cloudflare 抛出 `Error 1042 (Too many subrequests)` 异常。
  - 如需管理 50 个以上的 Key，需使用 Cloudflare Workers Paid 付费版（支持单次 1000 次并发子请求）。

### 2. 关于持久化历史数据与 Cloudflare KV
- **为何不包含永久调用计数与历史报表？**
  Cloudflare Workers 是运行在全球数百个边缘节点上的无状态服务（Serverless Edge），各边缘节点的运行实例彼此独立。本项目采用**纯内存无状态（Stateless In-Memory）**设计，各节点的调用计数随实例冷启动生命周期运作，以此达成 **0ms 数据库排队延迟** 与 **零运维成本**。
- **若需要跨节点全局持久化与历史数据统计**：
  必须额外创建并绑定 **Cloudflare KV** 空间或 **D1 数据库**，每次转发请求时向 KV 执行写入操作。但引入 KV 会带来写入频次限制、读写延迟、并发锁冲突以及复杂的权限配置成本。对于个人和小团队轻量级自用，当前的纯无状态架构是**最轻便、部署最快、容错率最高**的选择。

---

## 📄 开源许可证与免责声明

- 本项目基于 [MIT 许可证](LICENSE) 开源。
- **免责声明 (Disclaimer)**：本项目为非官方开源负载均衡网关，仅供技术研究、学习与提升开发效率使用，与 Tavily.com 官方无任何隶属或商业背书关系。使用本项目时，请在合法合规的前提下遵守 Tavily 官方服务条款。
