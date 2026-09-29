# Mote Relay

Mote 的后端。生产运行时只有：

```text
Cloudflare Worker
    → 一个 MoteRelay Durable Object（idFromName("mote")）
    → Durable Object SQLite
    → Durable Object WebSocket

Dashboard：Workers Assets
```

Mac 主动连出 `wss://…/v1/ws/device`。Dashboard 和快捷指令走 HTTPS。没有 Node 服务器，也没有 Docker 镜像。

## 本地

在仓库根：

```text
cp .dev.vars.example .dev.vars
npm run dev:worker
```

Wrangler 监听 `http://127.0.0.1:8787`。`.dev.vars` 里的 `MOTE_ADMIN_PASSWORD` 会在数据库还没有管理员时创建 `admin`。

改 Dashboard 界面时，另开 `npm run dev --prefix dashboard`。Vite 在 `5173`，并把 API 代理到 `8787`。

```text
cd relay
npm test
npm run typecheck
```

`npm run typecheck` 会先生成并检查共享代码、测试，以及生产入口 `src/worker/index.ts`。`worker-configuration.d.ts` 由仓库根的 `npm run cf-typegen` 从 `wrangler.jsonc` 生成，已 gitignore，不提交。密钥 `MOTE_ADMIN_PASSWORD`、`MOTE_PUBLIC_URL`、`MOTE_SHORTCUT_ICLOUD_URL` 不在 Wrangler vars 里，所以写在 Worker `Env` 的可选字段上。

测试里的 HTTP 和 WebSocket 走 Worker 适配器：`handleWorkerRequest`，以及 Durable Object 使用的同一套套接字处理。内存 SQLite 只给测试用。

## 路由

Worker 把这些路径交给 Durable Object，其余交给 Workers Assets：

```text
/health
/ready
/v1/*                 机器 API 与设备 / 配对 WebSocket
/admin/*              管理员 API 与 SSE
/s/:deviceId          快捷指令安装页
```

业务规则在共享层，不在 Worker 入口里重写：Shortcut token 认证、设备范围、管理员会话、CSRF、命令提交、配对、设备和 token 操作、活动查询。

## 安全边界

- 配对密钥只出现在 `pair_auth` 帧里，不出现在 URL 查询参数。
- Shortcut token 绑定一台设备。未绑定的 token 拒绝。拿它访问别的设备返回 403。
- `command_result` 只能由目标设备的已认证连接完成。
- 明文 token 和设备凭据只在创建或轮换时返回一次。响应里没有哈希。
- 日志会把 URL 里的 `pair_secret`、`token`、`credential`、`password` 打成 `[redacted]`。

细节见 [docs/security.md](../docs/security.md) 和 [docs/architecture.md](../docs/architecture.md)。

## 在途命令

等待 Mac 结果的 HTTP 调用放在 Durable Object 内存里。离线立即拒绝，不排队。Durable Object 被驱逐时，这次等待会丢；这是当前规模下接受的限制。
