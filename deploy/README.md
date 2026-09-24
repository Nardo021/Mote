# 部署

自托管用的 Docker Compose。推荐部署是仓库根 README 里的 Cloudflare 一键部署。`relay.example.com` 与 `192.0.2.10` 是示例，换成自己的公网主机名和源站地址。自托管步骤见仓库根 [README](../README.md)。

HTTPS 与 Tunnel 不在本目录管理。Compose 栈只跑 Relay。Proxmox VE + 现有 `cloudflared` 是可选路径，见 [pve/README.md](pve/README.md)。

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

Compose 栈只运行 Relay。容器端口 `3000` 发布为 LXC 端口 `3000`，以便 PVE 宿主机到达源站。栈内没有 Caddy、Nginx、Traefik 或 `cloudflared`。

## 文件

| 文件                 | 作用                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `docker-compose.yml` | 以仓库根为 context 构建 `relay/Dockerfile`，只运行 `relay`，发布 `3000:3000` |
| `.env.example`       | 在 LXC 上复制为 `.env`（可选；Compose 有默认值）                             |
| `pve/README.md`      | LXC、现有 Cloudflare Tunnel、第一台设备流程                                  |

SQLite 位于 Docker volume `mote_data`（Relay 容器内为 `/data/mote.sqlite`）。它能在 `docker compose down`、容器重启、LXC 重启和镜像更新后继续存在。

## LXC 布局

建议把仓库放在 LXC 的 `/opt/mote`：

```text
/opt/mote/
├── dashboard/
├── deploy/
│   ├── docker-compose.yml
│   └── .env
└── relay/
```

```text
cp .env.example .env
docker compose up -d
docker compose ps
curl -sS http://127.0.0.1:3000/health
curl -sS http://127.0.0.1:3000/ready
```

`docker compose ps` 应只显示 `mote-relay`（或等价的 Compose 服务名）。不应出现 `cloudflared` 或 `caddy`。

对同一数据库使用 CLI：

```text
docker compose exec relay node dist/cli.js device list
docker compose exec -it relay node dist/cli.js admin create --username admin
```

无 TTY 时：

```text
printf '%s\n' "$PASSWORD" | docker compose exec -T relay \
  node dist/cli.js admin create --username admin --password-stdin
```

## 主机名

客户端始终使用：

```text
https://relay.example.com
wss://relay.example.com/v1/ws/device
wss://relay.example.com/v1/ws/pair
```

生产源站（仅供 PVE 宿主机上的现有 Tunnel 使用）是：

```text
http://192.0.2.10:3000
```

客户端都不要使用原始局域网 IP URL。细节见 [pve/README.md](pve/README.md) 和 [docs/deployment.md](../docs/deployment.md)。
