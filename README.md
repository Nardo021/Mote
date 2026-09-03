# Mote

<img src="docs/mote-icon.png" width="96" alt="Mote">

Mote 是一套轻量的 macOS 远程动作系统。

V1 没有 iOS 应用。iPhone 通过 Apple 快捷指令和 Siri 触发唯一允许的动作 —— `lock`。快捷指令向 `relay.yanze.me` 发送经过认证的 HTTPS 请求。**Mote Relay** 再通过持久、已认证的 WebSocket 把命令转发给 **Mote Agent**（运行在 **Mote for Mac** 中）。同一进程在 `https://relay.yanze.me/` 提供 **Mote Relay Dashboard**。

```text
V1:
Apple Shortcut → Mote Relay → Mote Agent → Lock

V2:
Mote iOS → 可用时走本地直连 → Relay 回退
```

本仓库名为 `mote`。**Relay** 只是后端组件，不是产品名。

## 当前 V1 范围

- 没有 iOS 应用。
- iPhone 使用 Apple 快捷指令 + Siri。
- 快捷指令始终访问 `https://relay.yanze.me`（在家和外出使用同一主机名）。
- Mote for Mac 始终连接 `wss://relay.yanze.me/v1/ws/device`。
- 在家和外出都走同一条 Cloudflare Tunnel 路径。V1 不使用 Split DNS。
- Mote for Mac 与 Mote Relay 保持一条持久、已认证的 WebSocket。
- V1 唯一动作为 `lock`。
- 架构中永不包含任意 shell 执行。

## V1 基础设施

Mote 不管理 Cloudflare。现有 Tunnel 和 `cloudflared` 已经运行在 Proxmox VE 宿主机上。

```text
Proxmox VE host:
- existing Cloudflare Tunnel / cloudflared

Mote LXC:
- Debian
- Docker
- Mote Relay
- SQLite

Cloudflare route:
relay.yanze.me
→ http://192.168.2.44:3000
```

```text
PVE Host
│
├── existing cloudflared
│
└── CT: mote-relay
     IP: 192.168.2.44
     │
     └── Docker
          └── Relay :3000
```

## 架构摘要

```text
relay.yanze.me
│
├── /                    Dashboard
├── /admin/api/*         Admin API
├── /v1/*                Machine API
├── /v1/ws/device        Mac WebSocket
├── /health
└── /ready
```

```text
                   PUBLIC
Apple Shortcut
      │
      │ HTTPS
      ▼
relay.yanze.me
Browser
      │
      │ HTTPS
      ▼
relay.yanze.me
Mote for Mac
      │
      │ WSS
      ▼
relay.yanze.me
      │
      ▼
Cloudflare
      │
      ▼
Existing Tunnel
      │
      ▼
cloudflared on PVE host
      │
      ▼
192.168.2.44:3000
      │
      ▼
Mote Relay
      │
      ├── Dashboard + Admin API
      └── 持久、已认证的 WebSocket
            ▼
         Mote Agent
            ▼
         macOS 锁屏
```

快捷指令和 Mac 都不要使用 `http://192.168.2.44:3000`。该地址只是 Cloudflare 源站配置，不是客户端 URL。

V2 可以在不重写后端或命令协议的前提下增加原生 iOS 应用和本地传输。Relay 路径会作为永久回退。见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
mote/
├── docs/          架构、协议、安全、部署、开发、快捷指令
├── macos/         Mote for Mac（Xcode 工程、应用、测试）
├── dashboard/     Mote Relay Dashboard（React + Vite）
├── relay/         Mote Relay（Node.js + TypeScript）
├── deploy/        Docker Compose 与 PVE 说明
├── scripts/       辅助脚本
└── .github/       后续 CI 工作流
```

## 技术栈

| 区域         | 技术                                                                                                             | 状态                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Mote for Mac | Swift、SwiftUI、MenuBarExtra、ServiceManagement、URLSession WebSocket、Network.framework、Keychain、CoreGraphics | Phase 2 已实现                    |
| Mote Relay   | Node.js、TypeScript、Fastify、WebSocket、SQLite                                                                  | Phase 3 已实现                    |
| Dashboard    | React、TypeScript、Vite、shadcn/ui                                                                                | 由 Relay 静态托管                 |
| 传输         | HTTPS + 持久、已认证的 WebSocket                                                                                 | Mac 客户端与 Relay 接入路径已实现 |
| 家庭与远程   | 现有 Cloudflare Tunnel（PVE 宿主机上的 cloudflared）→ LXC `192.168.2.44:3000`                                    | 已文档化                          |
| 触发（V1）   | Apple 快捷指令 + Siri                                                                                            | 配置步骤已文档化                  |

## 开发状态

**Phase 1 — 仓库基础** 已完成。

**Phase 2 — Mote for Mac** 已完成。原生 Mac 应用、菜单栏 Agent、钥匙串凭据、命令校验、锁屏动作和出站 WebSocket 客户端均已实现。

**Phase 3 — Mote Relay** 已完成。Fastify HTTP API、设备 WebSocket、SQLite 凭据、CLI、Docker 镜像、Compose 栈和 PVE 文档均已实现。同一容器现在也提供管理员 Dashboard。

**Phase 4 — Apple 快捷指令** 配置步骤已文档化。没有原生 iOS 应用，仓库不附带 `.shortcut` 文件。见 [docs/shortcuts.md](docs/shortcuts.md)。

**Phase 5 — V2** 尚未实现。

## 安全原则

- 动作来自预定义允许列表。V1 唯一动作是 `lock`。
- 禁止任意 shell 命令、可执行路径，以及远程下发的 AppleScript。
- Mote Relay 不是通用远程代码执行系统。
- 快捷指令凭据（`send_command`）与 Mac 设备凭据（`device_connection`）不可互换。管理员使用独立的用户名/密码会话，不能用 Shortcut token 或设备凭据登录 Dashboard。
- 生产流量仅使用 HTTPS/WSS。
- 密钥永不提交。macOS 设备凭据存放在钥匙串；Relay 只保存哈希。
- 命令很快过期。离线锁屏不会排队。

细节见 [docs/security.md](docs/security.md)、[docs/protocol.md](docs/protocol.md) 和 [docs/shortcuts.md](docs/shortcuts.md)。

## V1 路线图

1. **Phase 1 — 仓库基础** — 已完成。
2. **Phase 2 — Mote for Mac** — 已完成。
3. **Phase 3 — Mote Relay** — 已完成。
4. **Phase 4 — Apple 快捷指令** — 已文档化。Siri + 快捷指令触发 `lock`。V1 没有 iOS 应用。

## V2 路线图

**Phase 5 — V2**

- 原生 iOS 应用（Mote iOS）
- Bonjour 发现
- 与 Mac 的本地直连
- 自动回退到 Mote Relay

V2 仅为兼容性而文档化。本仓库尚未实现。未来的本地直连（例如 Bonjour）属于 **Future / not implemented**，不是当前 V1 部署路径。

## 文档

| 文件                            | 范围                                     |
| ------------------------------- | ---------------------------------------- |
| [架构](docs/architecture.md)    | 产品组件、V1/V2 形状、命名               |
| [协议](docs/protocol.md)        | WebSocket 线上格式与快捷指令 HTTP API    |
| [快捷指令](docs/shortcuts.md)   | iPhone 配置、Siri、curl 验证             |
| [安全](docs/security.md)        | 凭据角色、哈希、执行边界                 |
| [部署](docs/deployment.md)      | Compose、PVE Tunnel、源站校验            |
| [开发](docs/development.md)     | 本地命令、质量约定、阶段状态             |
| [设计语言](design.md)           | 视觉与文案规范；窗口尺寸以已落地界面为准 |
| [Mote for Mac](macos/README.md) | Mac 客户端构建、配对、验证               |
| [Mote Relay](relay/README.md)   | Relay 开发、CLI、HTTP API                |
| [部署文件](deploy/README.md)    | Compose / Relay 发布端口                 |
| [PVE](deploy/pve/README.md)     | LXC、现有 Tunnel、第一台设备流程         |
