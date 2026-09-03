# 部署

专用 Proxmox VE LXC 上的 **Mote Relay** 生产布局。

```text
PVE
└── LXC: mote-relay
    └── Debian
        └── Docker
            ├── mote-relay
            └── caddy
```

```text
Caddy :443 / :80
  ↓
relay:3000
```

Node 进程不发布到宿主机。Caddy 是唯一的入站 HTTP/HTTPS 监听器。

## 文件

| 文件                 | 作用                                               |
| -------------------- | -------------------------------------------------- |
| `docker-compose.yml` | 构建 `../relay/Dockerfile`，运行 `relay` + `caddy` |
| `Caddyfile`          | `relay.yanze.me` 与 `:80` 反向代理，支持 WebSocket |
| `.env.example`       | 在宿主机复制为 `.env`（可选；Compose 有默认值）    |
| `certs/`             | 可选挂载的公众信任证书                             |
| `pve/README.md`      | LXC、Split DNS、Cloudflare Tunnel、TLS             |

SQLite 位于 Docker volume `mote_data`（Relay 容器内为 `/data/mote.sqlite`）。它能在 `docker compose down`、容器重启、宿主机重启和镜像更新后继续存在。

## 宿主机布局

建议在 LXC 上使用：

```text
/opt/mote/
├── docker-compose.yml
├── Caddyfile
├── .env
└── certs/          可选挂载的公众信任证书
```

从本目录复制这些文件。不要提交 `.env`。

```text
cp .env.example .env
docker compose up -d
docker compose ps
curl -sS http://127.0.0.1/health
curl -sS http://127.0.0.1/ready
```

对同一数据库使用 CLI：

```text
docker compose exec relay node dist/cli.js device list
```

## 主机名

客户端始终使用：

```text
https://relay.yanze.me
wss://relay.yanze.me/v1/ws/device
```

在家使用 Split DNS。外出使用 Cloudflare Tunnel。客户端都不要使用原始局域网 IP URL。细节见 [pve/README.md](pve/README.md) 和 [docs/deployment.md](../docs/deployment.md)。
