# Mote

<img src="docs/mote-icon.png" width="96" alt="Mote">

Mote 是一套个人远程动作系统：用 iPhone 锁定自己的 Mac。一台 Relay，操作者自己的一台或多台 Mac。推荐用自己的 Cloudflare 账号一键部署；也可以在自己的机器上用 Docker 自托管。

当前 iPhone 侧走 **Apple 快捷指令 + Siri**。快捷指令向你的公网 Relay（文档示例 `relay.example.com`）发送经过认证的 HTTPS 请求。**Mote Relay** 再通过持久、已认证的 WebSocket 把命令转发给 **Mote Agent**（运行在 **Mote for Mac** 中）。同一进程在该基址提供 **Mote Relay Dashboard**。原生 **Mote iOS** 尚未进仓库；后端已预留活动来源 `ios`，见 [docs/ios.md](docs/ios.md)。

```text
当前:
Apple Shortcut / Dashboard → Mote Relay → Mote Agent → Lock

下一步:
Mote iOS → 同一条 HTTPS 命令 API → Mote Relay → Mote Agent

之后（未实现）:
Mote iOS → 可用时走本地直连 → Relay 回退
```

本仓库名为 `mote`。**Relay** 只是后端组件，不是产品名。

文档和默认常量里的 `relay.example.com`、`192.0.2.10`、`com.example.mote` 是示例，请换成自己的公网主机名、源站地址和 Bundle ID。生产 Relay 用 `MOTE_PUBLIC_URL`；Mac 用设置里的 Relay URL 或 `MOTE_RELAY_URL`。

## 快速部署

推荐用自己的 Cloudflare 账号一键部署。点下去会克隆这个仓库、创建 Worker 和 Durable Object，并接上 Workers Builds：之后推送到自己克隆仓库的生产分支，部署会跟着更新。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nardo021/Mote)

1. 点上面的按钮，登录自己的 Cloudflare 账号。
2. 填写 `MOTE_ADMIN_PASSWORD`（至少 12 位）。用户名是 `admin`。Workers Builds 的构建命令用 `npm run build`，部署命令用 `npx wrangler deploy`。
3. 打开 `https://mote.<你的子域>.workers.dev`，用这个账号登录 Dashboard。
4. 在自己的 Mac 上用 Xcode 打开 `macos/Mote.xcodeproj`。把 Bundle ID 从 `com.example.mote` 换成自己的，选自己的 Development Team，Run 或 Archive 安装。仓库不提供现成签名包；别人的 `.app` 不能直接拿来用。
5. 打开 Mote，把 Relay URL 填成这个 `https://mote.<子域>.workers.dev`，点 **Pair**。
6. 浏览器打开同一地址，Dashboard **Allow**。iPhone 快捷指令也指向该 HTTPS 基址。见 [docs/shortcuts.md](docs/shortcuts.md)。

维护本仓库、希望 `git push` 到 `main` 就更新这一份线上 Relay 时，在 GitHub 仓库 Secrets 里设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。`.github/workflows/deploy-cloudflare.yml` 会在推送到 `main` 时执行 `wrangler deploy`。按钮克隆出去的副本不会自动跟上本仓库的新提交；对方把上游拉进自己的克隆再推送，Workers Builds 会重新部署。

## 自托管

Docker Compose 仍然可用。任意能跑 Docker 的机器，前面加一层公网 HTTPS 即可。客户端（Mac、快捷指令、Dashboard 浏览器）只使用该公网主机名，不要打局域网 IP。

1. 准备一台 Docker 主机，以及一个公网 HTTPS 主机名（Cloudflare Tunnel、Caddy、nginx 或其他反向代理均可）。
2. 克隆本仓库。
3. `cd deploy && cp .env.example .env`，把 `MOTE_PUBLIC_URL` 改成 `https://你的主机名`。
4. 在 `deploy/` 执行 `docker compose up -d --build`。
5. `docker compose exec -it relay node dist/cli.js admin create --username admin`。
6. Mac、配对和快捷指令与上面第 4–6 步相同，Relay URL 换成你的公网主机名。

已经在 Proxmox VE 宿主机上跑 Cloudflare Tunnel 时，可以把 Relay 放进 LXC，源站指到 LXC:3000。步骤见 [deploy/pve/README.md](deploy/pve/README.md) 和 [docs/deployment.md](docs/deployment.md)。

## 当前范围

- 自托管：一台 Relay，操作者自己的一台或多台 Mac。
- iPhone 用 Apple 快捷指令 + Siri；Dashboard 也可以发 `lock`。
- 快捷指令与之后的 iOS 客户端始终访问公网 HTTPS 基址（文档示例 `https://relay.example.com`；在家和外出同一主机名）。
- Mote for Mac 始终连接该基址上的 `wss://…/v1/ws/device`。未配置时走 `wss://…/v1/ws/pair`。
- 在家和外出都走同一条公网主机名。当前不使用 Split DNS。
- 生产配对：Mac 填 Relay URL，点 **Pair**，Dashboard **Allow**，凭据写入钥匙串后立刻连接。
- 唯一动作为 `lock`。
- 架构中永不包含任意 shell 执行。
- 原生 iOS 应用尚未实现。个人分发计划是付费 Apple Developer + Xcode 直装，不上架 App Store。

## 基础设施

推荐部署是 Cloudflare Worker：HTTPS 在 `*.workers.dev`（或你自己的域名）上终止，SQLite 和 Mac 的 WebSocket 在同一个 Durable Object 里。

自托管时，Relay 是单个 Docker 容器。公网 HTTPS 终止在你自己的 Tunnel 或反向代理上；Compose 栈里没有 Caddy、Nginx 或 `cloudflared`。

```text
Public hostname
→ your HTTPS front (Tunnel / reverse proxy)
→ Docker host :3000
→ mote-relay
```

```text
Docker host
└── Docker
     └── mote-relay :3000
          └── SQLite volume mote_data
```

若你已经在 Proxmox VE 宿主机上跑 Cloudflare Tunnel，可以把 Relay 放进 LXC，源站指到 LXC:3000。这是可选拓扑，步骤见 [deploy/pve/README.md](deploy/pve/README.md)。

```text
可选：PVE Host
│
├── existing cloudflared
│
└── CT: mote-relay
     IP: 192.0.2.10
     │
     └── Docker
          └── Relay :3000
```

快捷指令和 Mac 都不要使用 `http://192.0.2.10:3000`。该地址只是源站配置，不是客户端 URL。

## 架构摘要

```text
relay.example.com
│
├── /                    Dashboard
├── /admin/api/*         Admin API
├── /admin/api/events    Dashboard SSE（只推 topic）
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
relay.example.com
Browser / Dashboard
      │
      │ HTTPS
      ▼
relay.example.com
Mote for Mac
      │
      │ WSS
      ▼
relay.example.com
      │
      ▼
Your HTTPS front
      │
      ▼
Docker host :3000
      │
      ▼
Mote Relay
      │
      ├── Dashboard + Admin API + SSE
      └── 持久、已认证的 WebSocket
            ▼
         Mote Agent
            ▼
         macOS 锁屏
```

命令协议与 Relay HTTP API 保持传输无关，以便以后增加原生 iOS 和本地直连时不必重写后端。见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
mote/
├── docs/          架构、协议、安全、部署、开发、快捷指令、iOS
├── design.md      视觉与文案规范
├── macos/         Mote for Mac（Xcode 工程、应用、测试）
├── dashboard/     Mote Relay Dashboard（React + Vite）
├── relay/         Mote Relay（Node.js + TypeScript）
├── deploy/        Docker Compose；PVE 为可选说明
├── scripts/       辅助脚本
└── .github/       后续 CI 工作流
```

仓库里还没有 `ios/` 目录。

## 技术栈

| 区域         | 技术                                                                                                         | 状态              |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Mote for Mac | Swift 6、SwiftUI、菜单栏、ServiceManagement、URLSession WebSocket、Network.framework、Keychain、CoreGraphics | 已实现（1.5.6）   |
| Mote Relay   | Node.js、TypeScript、Fastify、WebSocket、SQLite；Cloudflare Worker + Durable Object 一键部署                 | 已实现            |
| Dashboard    | React、TypeScript、Vite、shadcn/ui；管理员 SSE 通知后再拉 REST                                                 | 由 Relay 静态托管 |
| 传输         | HTTPS + 持久、已认证的 WebSocket；配对另有 `/v1/ws/pair`                                                     | 已实现            |
| 家庭与远程   | 推荐：Cloudflare Worker。自托管：公网 HTTPS（Tunnel、反向代理等）→ Docker `:3000`                           | 已文档化          |
| 触发         | Apple 快捷指令 + Siri；Dashboard 也可发 `lock`                                                               | 配置步骤已文档化  |
| Mote iOS     | 计划：SwiftUI、同一条 `send_command` HTTPS API、付费开发者账号 + Xcode 直装                                  | 尚未实现          |

## 开发状态

**Phase 1 — 仓库基础** 已完成。

**Phase 2 — Mote for Mac** 已完成。原生 Mac 应用、菜单栏 Agent、钥匙串凭据、命令校验、锁屏动作和出站 WebSocket 均已实现。当前版本 `1.5.6`（build `14`）。Release 可填写并保存 Relay URL。

**Phase 3 — Mote Relay** 已完成。Fastify HTTP API、设备 WebSocket、配对、SQLite、CLI、Docker 镜像、Compose 栈均已实现。同一容器提供管理员 Dashboard。PVE 文档是可选路径。

**Phase 4 — Apple 快捷指令** 配置步骤已文档化。仓库不附带 `.shortcut` 文件。见 [docs/shortcuts.md](docs/shortcuts.md)。

**Phase 5 — Mote iOS** 尚未实现。个人用原生客户端，走现有命令 API，不上架 App Store。见 [docs/ios.md](docs/ios.md)。

**之后 — 本地直连** 未实现。Bonjour / 家庭直连属于 **Future / not implemented**。

## TODO

- [ ] 加入手机 App（Mote iOS）：原生客户端，走现有 `send_command` HTTPS API，Xcode 直装到自己的 iPhone，不上架。见 [docs/ios.md](docs/ios.md)。

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
| [协议](docs/protocol.md)         | WebSocket 线上格式、配对、快捷指令 HTTP、管理员 SSE |
| [快捷指令](docs/shortcuts.md)    | 当前 iPhone 配置、Siri、curl 验证           |
| [iOS](docs/ios.md)               | 个人分发、Xcode 直装、与现有 API 的衔接     |
| [安全](docs/security.md)         | 凭据角色、哈希、执行边界                    |
| [部署](docs/deployment.md)       | Cloudflare 一键部署、Compose、可选 PVE      |
| [开发](docs/development.md)      | 本地命令、质量约定、阶段状态                |
| [设计语言](design.md)            | 视觉与文案规范；窗口尺寸以已落地界面为准    |
| [Mote for Mac](macos/README.md)  | Mac 客户端构建、签名、配对、验证            |
| [Mote Relay](relay/README.md)    | Relay 开发、CLI、HTTP API                   |
| [Dashboard](dashboard/README.md) | 管理界面本地开发                            |
| [部署文件](deploy/README.md)     | Compose / Relay 发布端口                    |
| [PVE](deploy/pve/README.md)      | 可选：LXC、现有 Tunnel、第一台设备流程      |
