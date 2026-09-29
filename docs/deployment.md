# 部署

Mote Relay 只部署到 Cloudflare。

```text
Internet
    → Cloudflare Worker
    → 一个 MoteRelay Durable Object
    → Mac 出站 WSS

Dashboard：Workers Assets
```

Cloudflare Access 不是 Mote 的认证。Cloudflare Tunnel 不是生产架构的一部分。Docker 和 Node 自托管不再支持。

文档里的 `relay.example.com` 是示例主机名。生产用 `MOTE_PUBLIC_URL` 和你自己的域名。

## 一键部署

仓库根 README 有 Deploy to Cloudflare 按钮。它会克隆仓库、创建 Worker 和 Durable Object，并接上 Workers Builds。

1. 登录自己的 Cloudflare 账号。
2. 设置 `MOTE_ADMIN_PASSWORD`（至少 12 位）。用户名默认是 `admin`（`MOTE_ADMIN_USERNAME`）。
3. 构建命令：`npm run ci`。部署命令：`npx wrangler deploy`。`npm run ci` 先测再构建；失败就不会进入部署命令。
4. 打开 `https://mote.<你的子域>.workers.dev`，用这个管理员登录 Dashboard。
5. Mac 的 Relay URL 填这个 HTTPS 基址，点 **Pair**，再回 Dashboard **Allow**。

Worker 第一次启动时，如果数据库里还没有管理员，并且设置了 `MOTE_ADMIN_PASSWORD`，会创建这个账号。密码只通过 Wrangler secret 或 Workers 环境变量提供，不要写进仓库。

维护本仓库、希望推送到 `main` 就更新线上 Relay 时，在 GitHub Secrets 里设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。`.github/workflows/deploy-cloudflare.yml` 只在 CI 于 `main` 上成功之后执行 `wrangler deploy`。密钥未设置时跳过，并且不打印。CI 本身不部署。

## 配置

Worker 会读这些值：

| 变量 | 作用 |
| --- | --- |
| `MOTE_ADMIN_USERNAME` | 首次创建管理员时的用户名，默认 `admin` |
| `MOTE_ADMIN_PASSWORD` | 首次创建管理员的密码。用 secret，不要提交 |
| `MOTE_PUBLIC_URL` | 对外 HTTPS 基址。快捷指令安装页用它拼命令 URL。未设置时，Durable Object 用当前请求的 origin |
| `MOTE_SHORTCUT_ICLOUD_URL` | 可选。安装页上的 iCloud 快捷指令链接 |
| `MOTE_COMMAND_TTL_MS` | 命令 TTL，默认 10 秒 |
| `MOTE_COMMAND_TIMEOUT_MS` | 等待 Mac 结果的时间，默认 12 秒 |
| `MOTE_HEARTBEAT_STALE_MS` | 心跳过期，默认 90 秒 |
| `MOTE_AUTH_TIMEOUT_MS` | WebSocket 认证超时，默认 5 秒 |
| `MOTE_PAIR_TTL_MS` | 配对请求有效期 |

不再使用 `MOTE_HOST`、`MOTE_PORT`、`MOTE_DATABASE_PATH`。没有监听地址，也没有磁盘上的数据库文件。

超时语义在这一版没有改。认证超时和心跳过期由 Durable Object alarm 清扫；清扫间隔默认 15 秒，所以套接字会在超时之后的下一次清扫关闭。

## 自定义域名

可以给 Worker 绑自己的域名。客户端只使用这个 HTTPS 主机名：

```text
https://relay.example.com
wss://relay.example.com/v1/ws/device
wss://relay.example.com/v1/ws/pair
```

把 `MOTE_PUBLIC_URL` 设成同一个基址。不要让 Mac 或快捷指令去访问 Worker 的内部地址。

## 本地

见 [development.md](development.md)。`wrangler dev` 默认监听 `http://127.0.0.1:8787`。本地管理员密码放在仓库根的 `.dev.vars`（已 gitignore）。

## 健康检查

`GET /health` 和 `GET /ready` 仍由 Durable Object 提供，给部署检查用。它们不是 Docker 健康检查。
