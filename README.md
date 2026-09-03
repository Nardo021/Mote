# Mote

<img src="docs/mote-icon.png" width="96" alt="Mote">

Mote 是一套轻量的 macOS 远程动作系统。

V1 没有 iOS 应用。iPhone 通过 Apple 快捷指令和 Siri 触发唯一允许的动作 —— `lock`。快捷指令向 `relay.yanze.me` 发送经过认证的 HTTPS 请求。**Mote Relay** 再通过持久、已认证的 WebSocket 把命令转发给 **Mote Agent**（运行在 **Mote for Mac** 中）。

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
- 在家时，Split DNS 把该主机名解析到本地 Proxmox VE LXC。
- 外出时，同一主机名经 Cloudflare Tunnel 到达。
- Mote for Mac 与 Mote Relay 保持一条持久、已认证的 WebSocket。
- V1 唯一动作为 `lock`。
- 架构中永不包含任意 shell 执行。

## 架构摘要

```text
Apple Siri
    │
    ▼
Apple Shortcut
    │
    │ HTTPS POST
    ▼
relay.yanze.me
    │
    ├── 在家:
    │     Split DNS
    │       ↓
    │     本地 PVE LXC
    │
    └── 外出:
          公网 DNS
            ↓
          Cloudflare
            ↓
          Cloudflare Tunnel
            ↓
          PVE LXC
              ↓
          Mote Relay
              │
              │ 持久、已认证的 WebSocket
              ▼
          Mote Agent
              │
              ▼
          macOS 锁屏
```

快捷指令不需要知道手机当前在家庭局域网还是远程。

V2 可以在不重写后端或命令协议的前提下增加原生 iOS 应用和本地传输。Relay 路径会作为永久回退。见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
mote/
├── docs/          架构、协议、安全、部署、开发
├── macos/         Mote for Mac（Xcode 工程、应用、测试）
├── relay/         Mote Relay（Node.js + TypeScript）
├── deploy/        Docker Compose、Caddy、PVE 说明
├── scripts/       辅助脚本
└── .github/       后续 CI 工作流
```

## 技术栈

| 区域         | 技术                                                                                                             | 状态                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Mote for Mac | Swift、SwiftUI、MenuBarExtra、ServiceManagement、URLSession WebSocket、Network.framework、Keychain、CoreGraphics | Phase 2 已实现                    |
| Mote Relay   | Node.js、TypeScript、Fastify、WebSocket、SQLite                                                                  | Phase 3 已实现                    |
| 传输         | HTTPS + 持久、已认证的 WebSocket                                                                                 | Mac 客户端与 Relay 接入路径已实现 |
| 家庭访问     | Split DNS → 本地 PVE LXC                                                                                         | 已文档化                          |
| 远程访问     | Cloudflare Tunnel → PVE LXC                                                                                      | 已文档化                          |
| 触发（V1）   | Apple 快捷指令 + Siri                                                                                            | 配置待完成                        |

## 开发状态

**Phase 1 — 仓库基础** 已完成。

**Phase 2 — Mote for Mac** 已完成。原生 Mac 应用、菜单栏 Agent、钥匙串凭据、命令校验、锁屏动作和出站 WebSocket 客户端均已实现。

**Phase 3 — Mote Relay** 已完成。Fastify HTTP API、设备 WebSocket、SQLite 凭据、CLI、Docker 镜像、Compose 栈和 PVE 文档均已实现。

**Phase 4 — Apple 快捷指令** 配置待完成。没有原生 iOS 应用。

**Phase 5 — V2** 尚未实现。

从 Siri 远程锁屏仍需要完成 Phase 4 的快捷指令。

## 安全原则

- 动作来自预定义允许列表。V1 唯一动作是 `lock`。
- 禁止任意 shell 命令、可执行路径，以及远程下发的 AppleScript。
- Mote Relay 不是通用远程代码执行系统。
- 快捷指令凭据（`send_command`）与 Mac 设备凭据（`device_connection`）不可互换。
- 生产流量仅使用 HTTPS/WSS。
- 密钥永不提交。macOS 设备凭据存放在钥匙串；Relay 只保存哈希。
- 命令很快过期。离线锁屏不会排队。

细节见 [docs/security.md](docs/security.md) 和 [docs/protocol.md](docs/protocol.md)。

## V1 路线图

1. **Phase 1 — 仓库基础** — 已完成。
2. **Phase 2 — Mote for Mac** — 已完成。
3. **Phase 3 — Mote Relay** — 已完成。
4. **Phase 4 — Apple 快捷指令** — Siri + 快捷指令触发 `lock`。V1 没有 iOS 应用。

## V2 路线图

**Phase 5 — V2**

- 原生 iOS 应用（Mote iOS）
- Bonjour 发现
- 与 Mac 的本地直连
- 自动回退到 Mote Relay

V2 仅为兼容性而文档化。本仓库尚未实现。

## 文档

| 文件                            | 范围                                     |
| ------------------------------- | ---------------------------------------- |
| [架构](docs/architecture.md)    | 产品组件、V1/V2 形状、命名               |
| [协议](docs/protocol.md)        | WebSocket 线上格式与快捷指令 HTTP API    |
| [安全](docs/security.md)        | 凭据角色、哈希、执行边界                 |
| [部署](docs/deployment.md)      | Compose、Split DNS、TLS 概览             |
| [开发](docs/development.md)     | 本地命令、质量约定、阶段状态             |
| [设计语言](design.md)           | 视觉与文案规范；窗口尺寸以已落地界面为准 |
| [Mote for Mac](macos/README.md) | Mac 客户端构建、配对、验证               |
| [Mote Relay](relay/README.md)   | Relay 开发、CLI、HTTP API                |
| [部署文件](deploy/README.md)    | Compose / Caddy                          |
| [PVE](deploy/pve/README.md)     | LXC、隧道、第一台设备流程                |
