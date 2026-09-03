# PVE / LXC

Mote Relay 运行在专用的 Proxmox VE LXC 中。不要假定固定的 CT ID、局域网 IP、网关或存储卷。这些值留在虚拟化宿主机上。

## 建议的客户机

```text
PVE
└── LXC: mote-relay
    └── Debian
        └── Docker Engine + Compose 插件
            ├── mote-relay
            └── caddy
```

这个很小的服务的基线资源：

```text
1 vCPU
512 MB – 1 GB RAM
4–8 GB 磁盘
Debian（若模板支持 Docker，非特权 LXC 即可）
```

不需要完整虚拟机。

给容器一个**稳定的局域网地址**（静态客户机 IP 或 DHCP 预留）。家庭 Split DNS 和本地客户端需要该地址保持不变。

## 创建并引导 LXC

1. 在 Proxmox 中创建 Debian LXC。不要把 CT ID 写进本仓库。
2. 分配预留的局域网 IP。
3. 更新 Debian：

```text
apt update && apt upgrade -y
```

4. 按 Debian 当前的 Docker 文档安装 Docker Engine 和 Docker Compose 插件。确认：

```text
docker --version
docker compose version
```

5. 创建部署目录：

```text
mkdir -p /opt/mote
```

6. 把 `deploy/docker-compose.yml`、`deploy/Caddyfile` 和 `deploy/.env.example` 复制到 `/opt/mote`。
7. 根据示例创建 `/opt/mote/.env`。不要把真实 token 放进 Git。
8. 启动栈：

```text
cd /opt/mote
docker compose up -d
docker compose ps
```

9. 验证进程，而不是验证某台 Mac：

```text
curl -sS http://127.0.0.1/health
curl -sS http://127.0.0.1/ready
```

Mac 离线并不意味着 Relay 不健康。

## 网络

客户机需要：

- 出站互联网（软件包更新、可选的 ACME DNS-01、Cloudflare Tunnel）
- iPhone 和 Mac 能从局域网访问
- Cloudflare Tunnel 能到达这台主机

使用 Cloudflare Tunnel 时，不需要入站公网端口转发、UPnP 或 DMZ。

### 防火墙

在局域网上只暴露：

```text
443/TCP → Caddy
```

`80/TCP` 可以保持开放，用于 HTTP-01 或本地健康检查。Relay 端口 `3000` 留在 Docker 网络内。不要发布 SQLite 或 CLI。

若 Cloudflare Tunnel 与本 LXC 同机，**不需要任何公网入站端口**。

## TLS 与 Split DNS

`relay.yanze.me` 必须出示 Apple 设备已经信任的证书，包括 Split DNS 把手机送到 LXC 的情况。

**不要**：

- 把 `https://192.168.x.x` 当作日常入口
- 在 Mote for Mac 中关闭 TLS 校验
- 依赖每台 iPhone 都要手动安装的自建 CA
- 把 Cloudflare Origin Certificate 当作家庭局域网客户端的唯一证书

Cloudflare Origin Certificate 受 Cloudflare 信任，不受局域网上的 iOS/macOS 信任。Split DNS 会绕过 Cloudflare，因此这些证书在 Apple 设备上会失败。

### 首选：在 Caddy 上使用公众信任的证书

为 `relay.yanze.me` 申请普通的 Let’s Encrypt（或其他公众）证书，并在 Caddy 上终止 TLS。

因为 80 端口常常无法从公网到达，**DNS-01** 是实际可用的 ACME 方法。用 Cloudflare DNS 模块构建 Caddy，并把 API token 只放在 `/opt/mote/.env`：

```text
xcaddy build --with github.com/caddy-dns/cloudflare
```

然后把站点块换成：

```text
relay.yanze.me {
  tls {
    dns cloudflare {env.CF_API_TOKEN}
  }
  reverse_proxy relay:3000 {
    flush_interval -1
    transport http {
      read_timeout 0
      write_timeout 0
    }
  }
}
```

该证书在家和外出都对这个公网名称有效。

### 备选：挂载已有的公众证书

若你已经有 `relay.yanze.me` 的公众信任证书，把文件放到 `/opt/mote/certs` 并让 Caddy 指向它们。不要提交这些文件。

## Split DNS（在家）

AdGuard Home 改写：

```text
relay.yanze.me  →  <本 LXC 的稳定局域网 IP>
```

在家庭客户端上验证：

```text
nslookup relay.yanze.me
dig relay.yanze.me
```

预期：LXC / Caddy 的局域网地址，而不是 Cloudflare。

然后：

```text
curl -sS https://relay.yanze.me/health
```

证书名称仍然必须是 `relay.yanze.me`。

## Cloudflare Tunnel（外出）

不要从本仓库自动化 Cloudflare API。在 Cloudflare 控制台创建隧道，或在能到达 Caddy 的 LXC（或其他常开主机）上使用 `cloudflared`。

公网主机名 ingress 概念：

```yaml
ingress:
  - hostname: relay.yanze.me
    service: https://127.0.0.1:443
  - service: http_status:404
```

若 Caddy 只用于局域网 TLS，而隧道应避免源站 TLS：

```yaml
ingress:
  - hostname: relay.yanze.me
    service: http://127.0.0.1:80
  - service: http_status:404
```

当同一客户机上可以使用 `localhost` 时，不要在隧道配置中写死 LXC IP。

在家庭网络外，`dig relay.yanze.me` 应走公网 Cloudflare 路径。然后：

```text
curl -sS https://relay.yanze.me/health
```

快捷指令 URL 不变。

## 第一台设备流程

1. 启动 Mote Relay（`docker compose up -d`）。
2. 启动 Mote for Mac，从设置中复制 Device ID。
3. 创建设备（密钥只打印一次）：

```text
docker compose exec relay node dist/cli.js device create --name "MacBook Pro" --id <MAC_DEVICE_ID>
```

4. 把设备凭据保存到 Mote for Mac（DEBUG 钥匙串字段，或文档中的配对路径）。
5. 确认 Mac 到达 `wss://relay.yanze.me/v1/ws/device` 并变为 Connected。
6. 用快捷指令 token（下一步创建）或下面的 `curl` 检查状态。
7. 创建快捷指令 token：

```text
docker compose exec relay node dist/cli.js token create --name "Leo iPhone"
```

8. 把 token 和设备 ID 放进 Apple 快捷指令（Phase 4）。
9. 接通 Siri 前先用 curl 测试：

```text
curl \
  -X POST \
  "https://relay.yanze.me/v1/devices/<DEVICE_ID>/commands" \
  -H "Authorization: Bearer <SHORTCUT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"action":"lock"}'
```

当 Mac 在线且已授予辅助功能时，预期：

```json
{
  "status": "completed",
  "device_id": "...",
  "device": "MacBook Pro",
  "command_id": "..."
}
```

不要把真实标识符写进本仓库。真实锁屏应保持为手动测试。

## 生产流程概览

1. 在 Proxmox 中创建专用 Debian LXC。
2. 配置稳定的局域网 IP / DHCP 预留。
3. 安装 Docker Engine 和 Compose。
4. 把这些部署文件复制到 `/opt/mote`。
5. 创建 `/opt/mote/.env`。
6. `docker compose up -d`
7. `docker compose ps`
8. `curl http://127.0.0.1/health` 和 `/ready`
9. 配置 TLS（DNS-01 或挂载的公众证书）。
10. 配置 AdGuard Split DNS。
11. 配置 Cloudflare Tunnel。
12. 用 Mac 的 Device ID 创建设备凭据。
13. 配置 Mote for Mac。
14. 创建快捷指令 token。
15. 用 curl 测试命令，然后做 Phase 4 快捷指令。
