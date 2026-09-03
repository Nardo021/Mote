# 部署

Mote Relay 运行在专用的 Proxmox VE LXC 容器中，由 Caddy 反向代理。

```text
PVE
└── LXC: mote-relay
    └── Debian
        └── Docker
            ├── mote-relay
            └── caddy
```

```text
客户端
  ↓
HTTPS / WSS
  ↓
Caddy
  ↓
Mote Relay  (:3000，Docker 内部)
```

不要假定固定的 CT ID 或局域网 IP。运维本机的值留在宿主机上。

逐步的 LXC、TLS、Split DNS 和 Tunnel 说明见 [deploy/pve/README.md](../deploy/pve/README.md)。

## Compose

`deploy/docker-compose.yml` 从 `relay/Dockerfile` 构建 Relay 镜像，并让 Caddy 作为唯一对外发布的 HTTP/HTTPS 服务。Relay `:3000` 只在 Docker 网络内暴露。容器健康检查打 `/health`。宿主机可用 `http://127.0.0.1/health`（经 Caddy `:80`）验证。`.env` 可选；未提供时使用 Compose 中的默认值。

持久数据：

- Relay SQLite — Docker volume `mote_data` → `/data/mote.sqlite`
- Caddy 数据/配置 — `caddy_data`、`caddy_config`

在宿主机上把 `deploy/.env.example` 复制为 `deploy/.env`。`.env` 已被 gitignore。

## 环境变量

见 `relay/.env.example` 和 `deploy/.env.example`：

```text
MOTE_ENV=production
MOTE_HOST=0.0.0.0
MOTE_PORT=3000
MOTE_PUBLIC_URL=https://relay.yanze.me
MOTE_DATABASE_PATH=/data/mote.sqlite
MOTE_LOG_LEVEL=info
MOTE_COMMAND_TTL_MS=10000
MOTE_COMMAND_TIMEOUT_MS=12000
MOTE_HEARTBEAT_STALE_MS=90000
MOTE_AUTH_TIMEOUT_MS=5000
MOTE_MAX_BODY_BYTES=16384
```

生产凭据和证书不属于 Git。

## Split DNS

客户端始终使用：

```text
https://relay.yanze.me
wss://relay.yanze.me/v1/ws/device
```

### 在家

```text
relay.yanze.me
    ↓
AdGuard Home DNS 改写
    ↓
mote-relay LXC（Caddy）的局域网 IP
```

在家庭客户端上用 `dig relay.yanze.me` 验证。答案应是 LXC，而不是 Cloudflare。然后执行 `curl https://relay.yanze.me/health`。证书仍然必须是 `relay.yanze.me`。

### 外出

```text
relay.yanze.me
    ↓
Cloudflare
    ↓
Cloudflare Tunnel
    ↓
LXC 上的 Caddy
    ↓
Mote Relay
```

`cloudflared` 配置在宿主机上。它不是 Compose 文件的一部分。

## TLS

家庭 Split DNS 仍然使用指向公网主机名的 HTTPS。Apple 设备必须在无需手动安装 CA 的情况下信任该证书。

首选：在 Caddy 上使用公众信任的证书（当 80 端口无法从公网到达时，Let’s Encrypt DNS-01 是常见做法）。

Cloudflare Origin Certificate 不足以服务局域网里的 Apple 客户端。不要在 Mote for Mac 中关闭 TLS 检查。不要用 `https://192.168.x.x` 作为日常入口。

## 防火墙

局域网：`443/TCP` 到 Caddy。Relay 的 `:3000` 保持内部。若使用 Cloudflare Tunnel，不需要路由器端口转发。
