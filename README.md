# Mote

<img src="docs/mote-icon.png" width="96" alt="Mote">

Mote 是一套轻量的个人远程动作系统：用 iPhone 锁定自己的 Mac。

当前 iPhone 侧走 **Apple 快捷指令 + Siri**。快捷指令向 `relay.yanze.me` 发送经过认证的 HTTPS 请求。**Mote Relay** 再通过持久、已认证的 WebSocket 把命令转发给 **Mote Agent**（运行在 **Mote for Mac** 中）。同一进程在 `https://relay.yanze.me/` 提供 **Mote Relay Dashboard**。原生 **Mote iOS** 尚未进仓库；后端已预留活动来源 `ios`，见 [docs/ios.md](docs/ios.md)。

```text
当前:
Apple Shortcut / Dashboard → Mote Relay → Mote Agent → Lock

下一步:
Mote iOS → 同一条 HTTPS 命令 API → Mote Relay → Mote Agent

之后（未实现）:
Mote iOS → 可用时走本地直连 → Relay 回退
```

本仓库名为 `mote`。**Relay** 只是后端组件，不是产品名。

## 当前范围

- 一台 Mac、一台 iPhone、自己用。
- iPhone 用 Apple 快捷指令 + Siri；Dashboard 也可以发 `lock`。
- 快捷指令与之后的 iOS 客户端始终访问 `https://relay.yanze.me`（在家和外出同一主机名）。
- Mote for Mac 始终连接 `wss://relay.yanze.me/v1/ws/device`。未配置时走 `wss://relay.yanze.me/v1/ws/pair`。
- 在家和外出都走同一条 Cloudflare Tunnel。当前不使用 Split DNS。
- 生产配对：Mac 点 **Pair**，Dashboard **Allow**，凭据写入钥匙串后立刻连接。
- 唯一动作为 `lock`。
- 架构中永不包含任意 shell 执行。
- 原生 iOS 应用尚未实现。个人分发计划是付费 Apple Developer + Xcode 直装，不上架 App Store。

## 基础设施

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
├── /v1/ws/pair          Pairing WebSocket
├── /v1/pair/requests    公开配对请求
├── /s/:deviceId         Shortcut 安装页
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
Browser / Dashboard
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

命令协议与 Relay HTTP API 保持传输无关，以便以后增加原生 iOS 和本地直连时不必重写后端。见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
mote/
├── docs/          架构、协议、安全、部署、开发、快捷指令、iOS
├── design.md      视觉与文案规范
├── macos/         Mote for Mac（Xcode 工程、应用、测试）
├── dashboard/     Mote Relay Dashboard（React + Vite）
├── relay/         Mote Relay（Node.js + TypeScript）
├── deploy/        Docker Compose 与 PVE 说明
├── scripts/       辅助脚本
└── .github/       后续 CI 工作流
```

仓库里还没有 `ios/` 目录。

## 技术栈

| 区域         | 技术                                                                                                         | 状态              |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Mote for Mac | Swift 6、SwiftUI、菜单栏、ServiceManagement、URLSession WebSocket、Network.framework、Keychain、CoreGraphics | 已实现（1.5.2）   |
| Mote Relay   | Node.js、TypeScript、Fastify、WebSocket、SQLite                                                              | 已实现            |
| Dashboard    | React、TypeScript、Vite、shadcn/ui                                                                           | 由 Relay 静态托管 |
| 传输         | HTTPS + 持久、已认证的 WebSocket；配对另有 `/v1/ws/pair`                                                     | 已实现            |
| 家庭与远程   | 现有 Cloudflare Tunnel（PVE 宿主机上的 cloudflared）→ LXC `192.168.2.44:3000`                                | 已文档化          |
| 触发         | Apple 快捷指令 + Siri；Dashboard 也可发 `lock`                                                               | 配置步骤已文档化  |
| Mote iOS     | 计划：SwiftUI、同一条 `send_command` HTTPS API、付费开发者账号 + Xcode 直装                                  | 尚未实现          |

## 开发状态

**Phase 1 — 仓库基础** 已完成。

**Phase 2 — Mote for Mac** 已完成。原生 Mac 应用、菜单栏 Agent、钥匙串凭据、命令校验、锁屏动作和出站 WebSocket 均已实现。当前版本 `1.5.2`（build `10`）。

**Phase 3 — Mote Relay** 已完成。Fastify HTTP API、设备 WebSocket、配对、SQLite、CLI、Docker 镜像、Compose 栈和 PVE 文档均已实现。同一容器提供管理员 Dashboard。

**Phase 4 — Apple 快捷指令** 配置步骤已文档化。仓库不附带 `.shortcut` 文件。见 [docs/shortcuts.md](docs/shortcuts.md)。

**Phase 5 — Mote iOS** 尚未实现。个人用原生客户端，走现有命令 API，不上架 App Store。见 [docs/ios.md](docs/ios.md)。

**之后 — 本地直连** 未实现。Bonjour / 家庭直连属于 **Future / not implemented**。

## 安全原则

- 动作来自预定义允许列表。当前唯一动作是 `lock`。
- 禁止任意 shell 命令、可执行路径，以及远程下发的 AppleScript。
- Mote Relay 不是通用远程代码执行系统。
- 快捷指令凭据（`send_command`）与 Mac 设备凭据（`device_connection`）不可互换。管理员使用独立的用户名/密码会话，不能用 Shortcut token 或设备凭据登录 Dashboard。
- 生产流量仅使用 HTTPS/WSS。
- 密钥永不提交。macOS 设备凭据存放在钥匙串；Relay 只保存哈希。
- 命令很快过期。离线锁屏不会排队。

细节见 [docs/security.md](docs/security.md)、[docs/protocol.md](docs/protocol.md) 和 [docs/shortcuts.md](docs/shortcuts.md)。

## 路线图

1. **Phase 1 — 仓库基础** — 已完成。
2. **Phase 2 — Mote for Mac** — 已完成。
3. **Phase 3 — Mote Relay** — 已完成。含配对与 Dashboard。
4. **Phase 4 — Apple 快捷指令** — 已文档化。Siri + 快捷指令触发 `lock`。
5. **Phase 5 — Mote iOS** — 下一步。个人 Xcode 直装，不上架；更新版本再 Run 一次即可。
6. **之后 — 本地直连** — Bonjour 与 Relay 回退。尚未开始。

## 文档

| 文件                             | 范围                                        |
| -------------------------------- | ------------------------------------------- |
| [架构](docs/architecture.md)     | 产品组件、当前形状、下一步 iOS              |
| [协议](docs/protocol.md)         | WebSocket 线上格式、配对、快捷指令 HTTP API |
| [快捷指令](docs/shortcuts.md)    | 当前 iPhone 配置、Siri、curl 验证           |
| [iOS](docs/ios.md)               | 个人分发、Xcode 直装、与现有 API 的衔接     |
| [安全](docs/security.md)         | 凭据角色、哈希、执行边界                    |
| [部署](docs/deployment.md)       | Compose、PVE Tunnel、源站校验               |
| [开发](docs/development.md)      | 本地命令、质量约定、阶段状态                |
| [设计语言](design.md)            | 视觉与文案规范；窗口尺寸以已落地界面为准    |
| [Mote for Mac](macos/README.md)  | Mac 客户端构建、配对、验证                  |
| [Mote Relay](relay/README.md)    | Relay 开发、CLI、HTTP API                   |
| [Dashboard](dashboard/README.md) | 管理界面本地开发                            |
| [部署文件](deploy/README.md)     | Compose / Relay 发布端口                    |
| [PVE](deploy/pve/README.md)      | LXC、现有 Tunnel、第一台设备流程            |
