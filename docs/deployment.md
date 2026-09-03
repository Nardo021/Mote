# 部署

Mote Relay 运行在专用的 Proxmox VE LXC 中。Cloudflare Tunnel 已经运行在 PVE 宿主机上，不在 Mote LXC 或 Compose 栈内。

```text
PVE Host
│
├── existing cloudflared
│
└── LXC 192.168.2.44
     │
     └── Docker
          └── mote-relay
               └── 3000:3000
```

```text
relay.yanze.me
        ↓
existing Cloudflare Tunnel
        ↓
cloudflared on PVE host
        ↓
http://192.168.2.44:3000
        ↓
Mote Relay
```

逐步的 LXC 与现有 Tunnel Published Application 说明见 [deploy/pve/README.md](../deploy/pve/README.md)。

## Compose

`deploy/docker-compose.yml` 以仓库根目录为 build context，用 `relay/Dockerfile` 构建单一 Relay 镜像（内含 Dashboard 静态资源）。活动栈只有 Relay。容器把 `3000` 发布到 LXC 网卡，供 PVE 宿主机上的 `cloudflared` 访问 `http://192.168.2.44:3000`。

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

容器健康检查打 `/health`。LXC 内可用 `http://127.0.0.1:3000/health` 验证。PVE 宿主机应使用 `http://192.168.2.44:3000/health`。`.env` 可选；未提供时使用 Compose 中的默认值。

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
MOTE_PUBLIC_URL=https://relay.yanze.me
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

生产 Relay 必须监听 `0.0.0.0:3000`，而不是 `127.0.0.1:3000`。不要把 `192.168.2.44` 写进应用源码。Docker 端口映射负责把容器端口发布到 LXC。

`MOTE_PUBLIC_URL` 是客户端看到的公网 URL，不是源站 origin。

生产凭据不属于 Git。Relay 不需要、也不应持有 Cloudflare 密钥。

## 公网 URL 与源站

客户端始终使用：

```text
https://relay.yanze.me
wss://relay.yanze.me/v1/ws/device
wss://relay.yanze.me/v1/ws/pair
```

Cloudflare Published Application（在现有 Tunnel 上手工配置）：

```text
Hostname:
relay.yanze.me
Service type:
HTTP
Service URL:
http://192.168.2.44:3000
```

`cloudflared` 运行在 Proxmox VE 宿主机上，因此 Tunnel origin 必须是 LXC 的局域网地址。

不要配置：

- `http://relay:3000` — PVE 宿主机无法解析 LXC 内的 Docker 服务名
- `https://192.168.2.44:3000` — 家庭 LAN 上的最后一跳是明文 HTTP，不要为此加本地 TLS
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
192.168.2.44:3000
    ↓
Mote Relay
```

最后一跳 `PVE host → LXC` 使用 HTTP。不要为这一跳单独做本地 TLS。

当前不使用 Split DNS（例如 AdGuard 把 `relay.yanze.me` 指到 `192.168.2.44` 做直连 HTTPS）。在家和外出都走 Cloudflare Tunnel。之后可能用 Bonjour 做本地直连；那是 **Future / not implemented**。下一步是个人用 Mote iOS，仍走这条 Tunnel，见 [ios.md](ios.md)。

## 开发与生产

| 环境 | 客户端基址               | 设备 WebSocket                      | 配对 WebSocket                    |
| ---- | ------------------------ | ----------------------------------- | --------------------------------- |
| 开发 | `http://127.0.0.1:3000`  | `ws://127.0.0.1:3000/v1/ws/device`  | `ws://127.0.0.1:3000/v1/ws/pair`  |
| 生产 | `https://relay.yanze.me` | `wss://relay.yanze.me/v1/ws/device` | `wss://relay.yanze.me/v1/ws/pair` |

不要把生产客户端改成 `http://192.168.2.44:3000`。

## 健康检查

保留：

```text
GET /health
GET /ready
```

先在 PVE 宿主机上验证源站，再查公网。源站不通时不要先排查 Cloudflare。

```bash
curl http://192.168.2.44:3000/health
```

预期：

```json
{
  "status": "ok"
}
```

然后：

```bash
curl https://relay.yanze.me/health
```

两者应到达同一个 Relay。`/ready` 同样应返回 HTTP 200。健康检查不要求 Cloudflare Access。

## 防火墙

LXC 不需要公网入站。不要做路由器端口转发，也不要向 Mote LXC 开放 `80` 或 `443`。

需要的连通性只有：

```text
PVE host → 192.168.2.44:3000/TCP
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

把 `192.168.2.44:3000` 发布到家庭 LAN 并不意味着 API 可以取消认证。Relay 仍要求 Bearer、设备 WebSocket 认证、凭据角色分离、命令允许列表、速率限制、TTL、无命令队列和重复保护。健康检查可以保持当前的未认证设计。不要因为服务在 Tunnel 后面就削弱 Relay 认证。
