# 架构

Mote 是一套轻量的个人远程动作系统。

**Relay** 只是后端组件。产品名是 **Mote**。

Mote for Mac、Mote Relay、Dashboard 和配对已经实现。iPhone 当前用 [shortcuts.md](shortcuts.md) 手建快捷指令。原生 iOS 应用尚未进仓库；个人分发约定见 [ios.md](ios.md)。

## 命名

| 名称                 | 角色                      |
| -------------------- | ------------------------- |
| Mote                 | 产品                      |
| Mote for Mac         | 原生 macOS 应用           |
| Mote Agent           | Mote for Mac 内的后台组件 |
| Mote Relay           | 后端服务                  |
| Mote Relay Dashboard | Relay 内的管理界面        |
| Mote iOS             | 计划中的原生 iPhone 应用  |
| `relay.yanze.me`     | 生产环境公网主机名        |
| `mote`               | 仓库名                    |

## 当前架构

iPhone 使用 Apple 快捷指令和 Siri。Dashboard 也可以发同一条 `lock` 命令。在家和外出都走同一条公网主机名与 Cloudflare Tunnel。当前不使用 Split DNS。

```text
Apple Shortcut
      │
      │ HTTPS
      ▼
relay.yanze.me
      │
      ▼
Cloudflare Edge
      │
      ▼
Existing Cloudflare Tunnel
      │
      ▼
cloudflared on PVE Host
      │
      │ LAN HTTP
      ▼
192.168.2.44:3000
      │
      ▼
Mote Relay
      │
      │ persistent authenticated WebSocket
      ▼
Mote for Mac
      │
      ▼
macOS Lock Screen
```

```text
当前:
Apple Shortcut / Dashboard → Mote Relay → Mote Agent → Lock
```

### 基础设施

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

- **cloudflared** 已经运行在 Proxmox VE 宿主机上。它不是 Mote Compose 栈的一部分，Mote LXC 内也不安装第二份 Tunnel。
- **Mote LXC** 只运行 Docker 和 `mote-relay`。栈内没有 Caddy、Nginx、Traefik 或 `cloudflared` 容器。
- Cloudflare Published Application 把 `relay.yanze.me` 指到 `http://192.168.2.44:3000`。该局域网地址只属于基础设施配置，不得写进 Relay 源码，也不得当作客户端 URL。

### 组件

- **Apple 快捷指令** — 向 `https://relay.yanze.me` 发送已认证的 HTTPS 请求。在家和外出使用同一主机名。这是当前的 iPhone 触发方式。
- **Cloudflare Tunnel（PVE 宿主机）** — 现有 Tunnel 把该主机名发布到 LXC 上的 Relay。TLS 终止在 Cloudflare。
- **Mote Relay** — 认证命令客户端、确认 Mac 在线、生成短生命周期协议命令，并等待 `command_result`。它不执行操作系统命令。同一 Fastify 进程还托管 **Mote Relay Dashboard**、`/admin/api/*` 和配对通道。Relay 对 Cloudflare 无感知：它不调用 Cloudflare API，也不保存 Tunnel token。
- **Mote Relay Dashboard** — 浏览器管理界面。由 Relay 静态提供，不是单独的服务器或容器。页面：Overview、Devices（含配对批准）、Tokens、Activity、Settings。
- **Mote Agent** — Mote for Mac 的持久后台组件。维护 WebSocket，并执行允许列表中的本地动作。
- **Mote for Mac** — 原生 macOS 应用（菜单栏、生命周期、凭据、Agent 协调）。当前版本 `1.5.4`。
- **Mote iOS** — 尚未实现。计划复用同一条 `send_command` HTTPS API，见 [ios.md](ios.md)。

### 动作

当前唯一动作是 `lock`。`sleep`、`mute`、`unmute` 和 `play_pause` 已预留，在实现之前一律拒绝。

架构中永不包含任意 shell 命令执行。

### 设备身份

Mote for Mac 在首次启动时生成持久的 `device_id`，并在设置中显示。未配置时主按钮是 **Pair**：Mac 向 Relay 提交配对请求，Dashboard 批准后 Relay 创建设备并把 `device_connection` 凭据推给正在等待的 Mac。CLI `device create --id` 仍可用于恢复或离线登记。

### 连接模型

Mac 主动发起出站连接 `wss://relay.yanze.me/v1/ws/device`。路径是：

```text
Mote Relay
├── Public Dashboard
├── Admin API
├── Machine API
├── Pairing
├── WebSocket
├── Device Registry
├── Command Service
├── Auth
└── SQLite
```

```text
Cloudflare Tunnel
      │
      ▼
192.168.2.44:3000
      │
      ▼
Fastify / Mote Relay
      │
      ├── /
      │    Dashboard static SPA
      │
      ├── /admin/api/*
      │    Admin API
      │
      ├── /v1/*
      │    Machine API
      │
      ├── /v1/pair/requests
      │    Public pairing HTTP
      │
      ├── /v1/ws/device
      │    Authenticated device WebSocket
      │
      ├── /v1/ws/pair
      │    Pairing WebSocket
      │
      ├── /s/:deviceId
      │    Public shortcut setup page
      │
      ├── /health
      └── /ready
```

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

不要另开 WebSocket 端口或单独的 WebSocket 主机名。应用层「已连接」的含义是 `auth_result.status == "ok"`。没有额外的 `connected` 帧。每台设备同时只有一条活动套接字；更新的已认证连接会取代旧连接。

命令是短暂的。如果 Mac 离线，Relay 立即返回，不会把锁屏命令存起来以后再送。

活动来源（`source`）已写入 SQLite，允许值：

```text
shortcut
dashboard
ios
```

公开 `POST /v1/devices/:deviceId/commands` 目前记为 `shortcut`。Dashboard 发令记为 `dashboard`。`ios` 已预留，等原生客户端接入后再使用。不要为 iOS 另起一套命令对象。

## 公网 URL

快捷指令以及之后的命令客户端始终使用：

```text
https://relay.yanze.me
```

Mac 始终使用：

```text
wss://relay.yanze.me/v1/ws/device
```

未配置的 Mac 配对使用：

```text
https://relay.yanze.me/v1/pair/requests
wss://relay.yanze.me/v1/ws/pair
```

生产源站是局域网 HTTP：

```text
http://192.168.2.44:3000
```

客户端 URL 与源站 URL 不是一回事。不要把 Mac 或快捷指令改成访问 `192.168.2.44`。

开发仍然可以使用：

```text
http://127.0.0.1:3000
ws://127.0.0.1:3000/v1/ws/device
ws://127.0.0.1:3000/v1/ws/pair
```

见 [deployment.md](deployment.md)。快捷指令 HTTP 形状见 [protocol.md](protocol.md)。iPhone 操作步骤见 [shortcuts.md](shortcuts.md)。

## 下一步：Mote iOS

下一阶段增加原生 iOS 应用，但仍走 Relay HTTPS，不重写 Mote Relay。

```text
Mote iOS
   │
   ▼
POST /v1/devices/:deviceId/commands
Authorization: Bearer <send_command>
   │
   ▼
relay.yanze.me
   │
   ▼
Mote Relay
   │
   ▼
Mote Agent
```

个人分发：付费 Apple Developer + Xcode 装到自己的 iPhone，不上架 App Store。见 [ios.md](ios.md)。

## 之后：本地直连

命令对象保持与传输无关，以便以后增加本地直连而不改动作层。

```text
Mote iOS
   │
   ▼
CommandRouter
   │
   ├── LocalTransport
   │      │
   │      ├── Bonjour 发现
   │      └── 与 Mac 的直接认证连接
   │
   └── RelayTransport
          │
          ▼
     relay.yanze.me
```

```text
之后:
Mote iOS → 可用时走本地直连 → Relay 回退
```

规则：

- 现在不要实现 Bonjour / 本地 TCP。
- 保持 Mote 协议的命令和结果对象与传输无关。
- 保持 Mote Agent 的动作执行与命令到达方式无关。
- 把 Relay 路径当作永久回退传输，而不是临时方案。
- 未来可能用 Bonjour 做本地直连。那是 **Future / not implemented**。当前不使用 AdGuard Split DNS 把 `relay.yanze.me` 指到 `192.168.2.44` 做直连 HTTPS。

## 不在范围内

- App Store 上架或把 TestFlight 当作个人日常更新通道
- Bonjour / 本地发现（Future / not implemented）
- Split DNS / 家庭直连 HTTPS
- Caddy 或其他 LXC 内反向代理
- 在 Mote Compose 栈或 Mote LXC 内运行 cloudflared
- 蓝牙
- MQTT
- Kubernetes 或微服务
- 任意 shell、可执行路径或 AppleScript 执行
- 通用远程代码执行后端
- 单独的 Dashboard 服务器、反向代理或 Dashboard 容器
