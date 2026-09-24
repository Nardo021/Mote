# 部署

推荐用自己的 Cloudflare 账号一键部署。Docker Compose，以及 Proxmox VE 上现有 Tunnel，是自托管方案，步骤都保留。

## Cloudflare 一键部署（推荐）

仓库根目录的 [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/Nardo021/Mote) 按钮会把项目部署到点击者自己的 Cloudflare 账号。Cloudflare 克隆仓库、创建名为 `mote` 的 Worker 和它的 Durable Object，并用 Workers Builds 盯住克隆仓库的生产分支。之后往那个分支推送，线上 Relay 会重新构建并部署。

部署时填写 `.dev.vars.example` 里的 `MOTE_ADMIN_PASSWORD`（至少 12 位）。用户名是 `admin`。打开 Worker 的 `*.workers.dev` 地址登录 Dashboard。Mac 的 Relay URL 和快捷指令都用这个 HTTPS 基址。

本仓库自己的 `main` 要跟着更新时，在 GitHub Secrets 设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。推送到 `main` 会跑 `.github/workflows/deploy-cloudflare.yml`。Workers Builds 的构建命令是 `npm run build`，部署命令是 `npx wrangler deploy`。

别人点按钮得到的是一份克隆。本仓库的新提交不会自动进他们的账号；他们把上游合并进自己的克隆并推送后，才会重新部署。

SQLite 在 Durable Object 里，不在容器磁盘上。

## 自托管（Docker）

Mote Relay 也可以是单个 Docker 容器。把 `deploy/.env` 里的 `MOTE_PUBLIC_URL` 设成你的公网 HTTPS 基址，在任意 Docker 主机上 `docker compose up`。步骤见仓库根 [README](../README.md) 的「自托管」。

客户端（Mac、快捷指令、Dashboard 浏览器）只使用该公网 URL，不要用局域网 IP。HTTPS 终止在你自己的 Tunnel 或反向代理上；Compose 栈里没有 Caddy、Nginx 或 `cloudflared`。

下文的 `relay.example.com` 和 `192.0.2.10` 是示例。把公网主机名、`MOTE_PUBLIC_URL` 和源站地址换成自己的。

Proxmox VE + 宿主机上已有的 Cloudflare Tunnel 是可选拓扑，不是唯一部署方式。该路径的逐步说明见 [deploy/pve/README.md](../deploy/pve/README.md)。

```text
PVE Host
│
├── existing cloudflared
│
└── LXC 192.0.2.10
     │
     └── Docker
          └── mote-relay
               └── 3000:3000
```

```text
relay.example.com
        ↓
existing Cloudflare Tunnel
        ↓
cloudflared on PVE host
        ↓
http://192.0.2.10:3000
        ↓
Mote Relay
```

逐步的 LXC 与现有 Tunnel Published Application 说明见 [deploy/pve/README.md](../deploy/pve/README.md)。

## Compose

`deploy/docker-compose.yml` 以仓库根目录为 build context，用 `relay/Dockerfile` 构建单一 Relay 镜像（内含 Dashboard 静态资源）。活动栈只有 Relay。容器把 `3000` 发布到 Docker 主机网卡，供你的 HTTPS 前端（或可选的 PVE 宿主机 `cloudflared`）访问。

更新后的部署仍是：

```text
git pull
docker compose build --pull
docker compose up -d
```

没有单独的 Dashboard 部署步骤。引导管理员：

```text
docker compose exec -it relay node dist/cli.js admin create --username admin
```

不要用 `expose` 只在 Docker 网络内开放端口。PVE 宿主机上的 `cloudflared` 不在该 Docker 网络里，也无法解析 `relay` 这个 Compose 服务名。

容器健康检查打 `/health`。LXC 内可用 `http://127.0.0.1:3000/health` 验证。PVE 宿主机应使用 `http://192.0.2.10:3000/health`。`.env` 可选；未提供时使用 Compose 中的默认值（含示例 `MOTE_PUBLIC_URL=https://relay.example.com`）。生产必须改成真实公网 URL。

持久数据：

- Relay SQLite — Docker volume `mote_data` → `/data/mote.sqlite`

该 volume 必须在容器重启、`docker compose down/up`、LXC 重启和镜像重建后继续存在。

在 LXC 上把 `deploy/.env.example` 复制为 `deploy/.env`。`.env` 已被 gitignore。不要把 Cloudflare Tunnel token 放进 Mote 部署。

## 环境变量

见 `relay/.env.example`（本地开发）和 `deploy/.env.example`（生产）：

```text
MOTE_ENV=production
MOTE_HOST=0.0.0.0
MOTE_PORT=3000
MOTE_PUBLIC_URL=https://relay.example.com
MOTE_DATABASE_PATH=/data/mote.sqlite
MOTE_LOG_LEVEL=info
MOTE_COMMAND_TTL_MS=10000
MOTE_COMMAND_TIMEOUT_MS=12000
MOTE_HEARTBEAT_STALE_MS=90000
MOTE_AUTH_TIMEOUT_MS=5000
MOTE_MAX_BODY_BYTES=16384
```

配对相关（有默认值，通常不用改）：

```text
MOTE_PAIR_TTL_MS=600000
MOTE_PAIR_RATE_LIMIT_MAX=5
MOTE_PAIR_RATE_LIMIT_WINDOW_MS=600000
MOTE_PAIR_IP_RATE_LIMIT_MAX=20
MOTE_PAIR_IP_RATE_LIMIT_WINDOW_MS=600000
MOTE_SHORTCUT_ICLOUD_URL=
```

生产 Relay 必须监听 `0.0.0.0:3000`，而不是 `127.0.0.1:3000`。不要把 `192.0.2.10` 写进应用源码。Docker 端口映射负责把容器端口发布到 LXC。

`MOTE_PUBLIC_URL` 是客户端看到的公网 URL，不是源站 origin。

生产凭据不属于 Git。Relay 不需要、也不应持有 Cloudflare 密钥。

## 公网 URL 与源站

客户端始终使用：

```text
https://relay.example.com
wss://relay.example.com/v1/ws/device
wss://relay.example.com/v1/ws/pair
```

Cloudflare Published Application（在现有 Tunnel 上手工配置）：

```text
Hostname:
relay.example.com
Service type:
HTTP
Service URL:
http://192.0.2.10:3000
```

`cloudflared` 运行在 Proxmox VE 宿主机上，因此 Tunnel origin 必须是 LXC 的局域网地址。

不要配置：

- `http://relay:3000` — PVE 宿主机无法解析 LXC 内的 Docker 服务名
- `https://192.0.2.10:3000` — 家庭 LAN 上的最后一跳是明文 HTTP，不要为此加本地 TLS
- `http://localhost:3000` — `cloudflared` 不在 Mote LXC 内

网络边界：

```text
Cloudflare Edge
    ↓
encrypted Cloudflare Tunnel
    ↓
cloudflared on PVE host
    ↓
home LAN / PVE bridge
    ↓
192.0.2.10:3000
    ↓
Mote Relay
```

最后一跳 `PVE host → LXC` 使用 HTTP。不要为这一跳单独做本地 TLS。

当前不使用 Split DNS（例如 AdGuard 把 `relay.example.com` 指到 `192.0.2.10` 做直连 HTTPS）。在家和外出都走 Cloudflare Tunnel。之后可能用 Bonjour 做本地直连；那是 **Future / not implemented**。下一步是个人用 Mote iOS，仍走这条 Tunnel，见 [ios.md](ios.md)。

## 开发与生产

| 环境 | 客户端基址               | 设备 WebSocket                      | 配对 WebSocket                    |
| ---- | ------------------------ | ----------------------------------- | --------------------------------- |
| 开发 | `http://127.0.0.1:3000`  | `ws://127.0.0.1:3000/v1/ws/device`  | `ws://127.0.0.1:3000/v1/ws/pair`  |
| 生产 | `https://relay.example.com` | `wss://relay.example.com/v1/ws/device` | `wss://relay.example.com/v1/ws/pair` |

不要把生产客户端改成 `http://192.0.2.10:3000`。

## 健康检查

保留：

```text
GET /health
GET /ready
```

先在 PVE 宿主机上验证源站，再查公网。源站不通时不要先排查 Cloudflare。

```bash
curl http://192.0.2.10:3000/health
```

预期：

```json
{
  "status": "ok"
}
```

然后：

```bash
curl https://relay.example.com/health
```

两者应到达同一个 Relay。`/ready` 同样应返回 HTTP 200。健康检查不要求 Cloudflare Access。

## 防火墙

LXC 不需要公网入站。不要做路由器端口转发，也不要向 Mote LXC 开放 `80` 或 `443`。

需要的连通性只有：

```text
PVE host → 192.0.2.10:3000/TCP
```

若启用了 Proxmox 防火墙，允许 PVE 宿主机或 `cloudflared` 所在的受信 LAN 源访问 TCP 3000。不要把 3000 对 WAN 开放。

Compose 使用 `ports: "3000:3000"`，不要用 `network_mode: host`，也不要特权容器。只发布 Relay TCP 3000。

## Cloudflare Access

不要在 Mote 前面放交互式 Cloudflare Access 策略。认证已经由下列凭据完成：

- 快捷指令 / 未来 iOS：Bearer `send_command` token
- Mac：`device_connection` 凭据
- Dashboard：Relay 内的管理员会话 cookie

交互式 Cloudflare 登录会干扰 Apple 快捷指令、未来的 iOS 客户端和 Mac 的持久 WebSocket。iPhone 配置见 [shortcuts.md](shortcuts.md)。

## 安全边界

把 `192.0.2.10:3000` 发布到家庭 LAN 并不意味着 API 可以取消认证。Relay 仍要求 Bearer、设备 WebSocket 认证、凭据角色分离、命令允许列表、速率限制、TTL、无命令队列和重复保护。健康检查可以保持当前的未认证设计。不要因为服务在 Tunnel 后面就削弱 Relay 认证。
