# PVE / LXC

Mote Relay 运行在专用的 Proxmox VE LXC 中。当前生产地址是 `192.168.2.44`。Cloudflare Tunnel 已经运行在 PVE 宿主机上；不要在 Mote LXC 或 Compose 栈里再装一份 `cloudflared`。

```text
PVE Host
│
├── existing cloudflared
│    └── existing Cloudflare Tunnel
│
└── Mote LXC
     IP: 192.168.2.44
     │
     └── Docker
          └── mote-relay
               └── TCP 3000
```

这个很小的服务的基线资源：

```text
1 vCPU
512 MB – 1 GB RAM
4–8 GB 磁盘
Debian（若模板支持 Docker，非特权 LXC 即可）
```

不需要完整虚拟机。不要假定固定的 CT ID。

## 部署流程

1. 创建 Debian LXC。
2. 配置稳定 IP：`192.168.2.44`。
3. 安装 Docker Engine 和 Docker Compose 插件。
4. 克隆 Mote 仓库（建议放到 `/opt/mote`）。
5. 配置 `/opt/mote/deploy/.env`（从 `deploy/.env.example` 复制）。
6. 启动：

```text
cd /opt/mote/deploy
docker compose up -d
```

7. 验证：

```text
docker compose ps
```

应只看到 `mote-relay`（或等价的 Compose 服务名）。不应出现 `cloudflared` 或 `caddy`。

8. 在 LXC 内验证：

```bash
curl http://127.0.0.1:3000/health
```

预期：

```json
{
  "status": "ok"
}
```

9. 在 PVE 宿主机上验证源站：

```bash
curl -i http://192.168.2.44:3000/health
```

可选：

```bash
curl -i http://192.168.2.44:3000/ready
```

这一步失败时，先不要排查 Cloudflare。Tunnel 只有在宿主机能到达 origin 之后才会工作。

10. 在**现有** Cloudflare Tunnel 中创建 Published Application：

```text
Hostname:
relay.yanze.me
Service type:
HTTP
Service URL:
http://192.168.2.44:3000
```

不要安装另一份 `cloudflared`。不要调用 Cloudflare API。不要把 Tunnel token 放进 Mote `.env`。

11. 公网验证：

```bash
curl -i https://relay.yanze.me/health
```

预期 HTTP 200，然后：

```bash
curl -i https://relay.yanze.me/ready
```

同样预期 HTTP 200。不要要求 Cloudflare Access 认证。

12. 创建 Mac 设备。
13. 配置 Mote for Mac。
14. 创建快捷指令 token。
15. 测试设备状态。
16. 测试 lock 命令。
17. 配置 Apple 快捷指令。

## 引导 LXC

更新 Debian：

```text
apt update && apt upgrade -y
```

按 Debian 当前的 Docker 文档安装 Docker Engine 和 Docker Compose 插件。确认：

```text
docker --version
docker compose version
```

`.env` 使用生产默认值：

```text
MOTE_ENV=production
MOTE_HOST=0.0.0.0
MOTE_PORT=3000
MOTE_PUBLIC_URL=https://relay.yanze.me
MOTE_DATABASE_PATH=/data/mote.sqlite
```

不要加入 `CLOUDFLARE_TUNNEL_TOKEN`、`TUNNEL_TOKEN`、`CF_API_TOKEN` 或任何 `CADDY_*` 变量。Relay 不需要这些值。

## 为什么 origin 是 `192.168.2.44:3000`

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

`cloudflared` 运行在 PVE 宿主机上，因此它必须用 LXC 的局域网地址。Docker 服务名 `relay`、`localhost` 和 `https://192.168.2.44:3000` 都不是正确的 origin。

最后一跳 `PVE host → LXC` 使用 HTTP。不要为这一跳单独做本地 TLS。

`192.168.2.44` 只写在基础设施文档里。不要把它硬编码进 Relay 源码。

## 网络与防火墙

LXC 不需要公网入站。不要做路由器端口转发、UPnP 或 DMZ。不要向 Mote LXC 开放 `80` 或 `443`。

需要的连通性：

```text
PVE host → 192.168.2.44:3000/TCP
```

若启用了 Proxmox 防火墙，允许 PVE 宿主机或 `cloudflared` 所在的受信 LAN 源访问 TCP 3000。不要把 3000 对 WAN 开放。

Compose 发布 `3000:3000`。不要使用 `network_mode: host`，不要使用特权容器，不要再发布其他端口。

V1 不使用 Split DNS。在家和外出都走 Cloudflare Tunnel。未来 V2 可能用 Bonjour 做本地直连；那是 **Future / not implemented**。

## Cloudflare Access

不要在 Mote V1 前面放交互式 Cloudflare Access 策略。认证已经由下列凭据完成：

- 快捷指令：Bearer `send_command` token
- Mac：`device_connection` 凭据

交互式 Cloudflare 登录会干扰 Apple 快捷指令和 Mac 的持久 WebSocket。

把 `192.168.2.44:3000` 发布到家庭 LAN 并不意味着 API 可以取消认证。健康检查可以保持未认证；其余 API 仍要求现有的 Bearer、角色分离、允许列表、速率限制、TTL、无队列和重复保护。

## WebSocket

Mac 仍然连接：

```text
wss://relay.yanze.me/v1/ws/device
```

路径：

```text
Mac
  ↓
wss://relay.yanze.me/v1/ws/device
  ↓
Cloudflare
  ↓
Tunnel
  ↓
192.168.2.44:3000
  ↓
Mote Relay
```

不要另开 WebSocket 端口或单独的 WebSocket 主机名。

## 第一台设备流程

1. 启动 Mote Relay（`docker compose up -d`）。
2. 启动 Mote for Mac，从设置中复制 Device ID。
3. 创建设备（密钥只打印一次）：

```text
docker compose exec relay node dist/cli.js device create --name "MacBook Pro" --id <MAC_DEVICE_ID>
```

4. 把设备凭据保存到 Mote for Mac（DEBUG 钥匙串字段，或文档中的配对路径）。生产 Relay URL 保持 `https://relay.yanze.me`，不要改成 `http://192.168.2.44:3000`。
5. 确认 Mac 到达 `wss://relay.yanze.me/v1/ws/device` 并变为 Connected。
6. 用快捷指令 token（下一步创建）或下面的 `curl` 检查状态。
7. 创建快捷指令 token：

```text
docker compose exec relay node dist/cli.js token create --name "Leo iPhone"
```

8. 把 token 和设备 ID 放进 Apple 快捷指令（Phase 4）。快捷指令 URL 保持 `https://relay.yanze.me`。
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
